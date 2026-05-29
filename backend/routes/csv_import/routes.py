from pydantic import BaseModel, Field, EmailStr
from enum import Enum
from fastapi import APIRouter, HTTPException, Depends, status, File, UploadFile, Form, Header, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import HTMLResponse, JSONResponse
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
import os
import logging
import statistics
import math
import uuid
import asyncio
import json
import csv
import bcrypt
import jwt
import httpx

from config import (
    db, load_engine, client,
    SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES,
    ACWR_METRIC_TO_ENGINE_FIELD, ANALYSIS_METRIC_TO_ENGINE,
    EMERGENT_AVAILABLE, logger, MAX_DEVICES_PER_USER,
    REVENUECAT_WEBHOOK_SECRET, REVENUECAT_SECRET_KEY
)
from dependencies import get_current_user, security, hash_password, verify_password, create_access_token, PyObjectId
from models.shared import *

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None

from csv_analyzer import analyze_csv, apply_custom_mapping, INTERNAL_FIELDS
from gps_import import GPSCSVParser, GPSDataNormalizer, Manufacturer, parse_gps_csv, consolidate_session, METRIC_CATEGORIES
from identity_resolver import IdentityResolver
from collections import defaultdict

router = APIRouter(tags=["CSV Import"])

# ============= WEARABLE IMPORT ENDPOINTS =============

@router.get("/wearables/supported")
async def get_supported_wearables():
    """Get list of supported wearable integrations"""
    return {
        "import_methods": [
            {
                "id": "fit_file",
                "name": "FIT File Import",
                "description_pt": "Importe arquivos .FIT exportados de dispositivos Garmin, Polar, Suunto e outros",
                "description_en": "Import .FIT files exported from Garmin, Polar, Suunto and other devices",
                "supported_devices": ["Garmin", "Polar", "Suunto", "Wahoo", "Coros"],
                "file_types": [".fit"]
            },
            {
                "id": "csv_import",
                "name": "CSV Import",
                "description_pt": "Importe dados de GPS e treino via arquivo CSV",
                "description_en": "Import GPS and training data via CSV file",
                "supported_devices": ["Any device with CSV export"],
                "file_types": [".csv"]
            }
        ],
        "planned_integrations": [
            {
                "id": "garmin_connect",
                "name": "Garmin Connect",
                "status": "planned",
                "description": "Direct sync with Garmin Connect API (requires developer credentials)"
            },
            {
                "id": "polar_flow",
                "name": "Polar Flow",
                "status": "planned",
                "description": "Direct sync with Polar Flow API"
            }
        ]
    }


# ============= ENHANCED CSV IMPORT — Analyze, Map, Import =============

from csv_analyzer import analyze_csv, apply_custom_mapping, INTERNAL_FIELDS


@router.post("/csv/analyze")
async def csv_analyze(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Analyze CSV file structure and return auto-mappings + suggestions."""
    content = await file.read()
    analysis = analyze_csv(content, filename=file.filename or "upload.csv")

    # Attach athlete matching info
    athletes = await db.athletes.find(
        {"coach_id": current_user["_id"]}, {"_id": 0, "id": {"$toString": "$_id"}, "name": 1}
    ).to_list(1000)
    # MongoDB $toString may not work in all versions; fallback
    athlete_list = []
    async for a in db.athletes.find({"coach_id": current_user["_id"]}):
        athlete_list.append({"id": str(a["_id"]), "name": a["name"]})

    analysis["existing_athletes"] = athlete_list
    return analysis


class CSVImportMappedRequest(BaseModel):
    mapping: Dict[str, Optional[str]]
    create_missing_athletes: bool = True


@router.post("/csv/import-mapped")
async def csv_import_mapped(
    file: UploadFile = File(...),
    mapping_json: str = Form(...),
    create_missing: bool = Form(True),
    activity_name: Optional[str] = Form(None),
    session_total_period: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Import CSV with a custom field mapping.
    Preserves existing athlete auto-creation + GPS data pipeline.

    Optional additive parameters (backward compatible):
      - activity_name: User-friendly session name (overrides filename-based default)
      - session_total_period: If provided, rows whose period_name matches receive
        record_type="session_total"; all other rows receive record_type="period".
        When omitted, record_type is not persisted (legacy behavior preserved).
    """
    import json as _json

    content = await file.read()
    mapping = _json.loads(mapping_json)

    source_filename = file.filename or "upload.csv"
    records = apply_custom_mapping(content, mapping, filename=source_filename)

    if not records:
        raise HTTPException(status_code=400, detail="No valid records found after applying mapping")

    # Get existing athletes
    existing = {}
    async for a in db.athletes.find({"coach_id": current_user["_id"]}):
        existing[a["name"].lower().strip()] = str(a["_id"])

    # Group records by athlete
    from collections import defaultdict
    by_athlete: Dict[str, list] = defaultdict(list)
    for rec in records:
        name = rec.get("athlete_name", "").strip()
        if name:
            by_athlete[name].append(rec)

    session_id = f"csv_import_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    default_session_name = source_filename.replace(".csv", "")
    activity_name_clean = (activity_name or "").strip()
    final_session_name = activity_name_clean if activity_name_clean else default_session_name

    session_total_period_clean = (session_total_period or "").strip()
    session_total_period_key = session_total_period_clean.lower() if session_total_period_clean else None

    success_count = 0
    created_athletes = []
    errors_list = []
    imported_by_athlete = {}

    for athlete_name, recs in by_athlete.items():
        # Resolve athlete ID
        athlete_id = existing.get(athlete_name.lower().strip())

        if not athlete_id:
            # Partial match
            for ex_name, ex_id in existing.items():
                if ex_name in athlete_name.lower() or athlete_name.lower() in ex_name:
                    athlete_id = ex_id
                    break

        if not athlete_id and create_missing:
            # Auto-create athlete (preserves existing behavior)
            new_athlete = {
                "name": athlete_name,
                "coach_id": current_user["_id"],
                "birth_date": "2000-01-01",
                "position": "Não especificado",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            result = await db.athletes.insert_one(new_athlete)
            athlete_id = str(result.inserted_id)
            existing[athlete_name.lower().strip()] = athlete_id
            created_athletes.append(athlete_name)

        if not athlete_id:
            errors_list.append(f"Athlete not found: {athlete_name}")
            continue

        for rec in recs:
            try:
                period_value = (rec.get("period_name") or "").strip() or "Session"
                gps_doc = {
                    "athlete_id": athlete_id,
                    "coach_id": current_user["_id"],
                    "date": rec.get("session_date", datetime.now().strftime("%Y-%m-%d")),
                    "session_id": session_id,
                    "session_name": final_session_name,
                    "source_filename": source_filename,
                    "period_name": period_value,
                    "total_distance": float(rec.get("total_distance", 0) or 0),
                    "high_intensity_distance": float(rec.get("hid_distance", 0) or 0),
                    "high_speed_running": float(rec.get("hsr_distance", 0) or 0),
                    "sprint_distance": float(rec.get("sprint_distance", 0) or 0),
                    "number_of_sprints": int(float(rec.get("number_of_sprints", 0) or 0)),
                    "number_of_accelerations": int(float(rec.get("accelerations", 0) or 0)),
                    "number_of_decelerations": int(float(rec.get("decelerations", 0) or 0)),
                    "max_speed": float(rec.get("max_speed", 0) or 0) if rec.get("max_speed") else None,
                    "max_acceleration": float(rec.get("max_acceleration", 0) or 0) if rec.get("max_acceleration") else None,
                    "max_deceleration": float(rec.get("max_deceleration", 0) or 0) if rec.get("max_deceleration") else None,
                    "player_load": float(rec.get("player_load", 0) or 0) if rec.get("player_load") else None,
                    "player_load_per_minute": float(rec.get("player_load_per_minute", 0) or 0) if rec.get("player_load_per_minute") else None,
                    "high_metabolic_load": float(rec.get("high_metabolic_load", 0) or 0) if rec.get("high_metabolic_load") else None,
                    "max_velocity_percent": float(rec.get("max_velocity_percent", 0) or 0) if rec.get("max_velocity_percent") else None,
                    "duration_minutes": float(rec.get("duration_minutes", 0) or 0) if rec.get("duration_minutes") else None,
                    "source": "csv_import",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                # record_type is only persisted when the user explicitly chose
                # which period represents the total session. Otherwise the field
                # is omitted to preserve full backward compatibility.
                if session_total_period_key is not None:
                    gps_doc["record_type"] = (
                        "session_total"
                        if period_value.lower() == session_total_period_key
                        else "period"
                    )
                await db.gps_data.insert_one(gps_doc)
                success_count += 1
                imported_by_athlete[athlete_name] = imported_by_athlete.get(athlete_name, 0) + 1
            except Exception as e:
                errors_list.append(f"Error importing {athlete_name}: {str(e)}")

    # Build earliest_date per athlete from imported records
    earliest_date_by_athlete: Dict[str, str] = {}
    for athlete_name, recs in by_athlete.items():
        aid = existing.get(athlete_name.lower().strip())
        if not aid:
            continue
        for rec in recs:
            rec_date = rec.get("session_date", "")
            if rec_date and (aid not in earliest_date_by_athlete or rec_date < earliest_date_by_athlete[aid]):
                earliest_date_by_athlete[aid] = rec_date

    # Trigger recalculation from earliest_date for each affected athlete
    coach_id_str = str(current_user["_id"])
    for aid, earliest_date in earliest_date_by_athlete.items():
        try:
            await load_engine.recalculate_from_date(
                athlete_id=aid,
                coach_id=coach_id_str,
                start_date=earliest_date
            )
        except Exception as e:
            logging.error(f"[RC5] Recalculation failed for athlete {aid}: {e}")

    return {
        "success": True,
        "records_imported": success_count,
        "athletes_created": created_athletes,
        "imported_by_athlete": imported_by_athlete,
        "errors": errors_list,
        "session_id": session_id,
    }


# ─── Mapping Templates CRUD ──────────────────────────────────────────────────

class MappingTemplateCreate(BaseModel):
    name: str
    provider: Optional[str] = None
    mapping: Dict[str, Optional[str]]


@router.get("/csv/mapping-templates")
async def list_mapping_templates(current_user: dict = Depends(get_current_user)):
    templates = []
    async for t in db.csv_mapping_templates.find({"coach_id": current_user["_id"]}):
        templates.append({
            "id": str(t["_id"]),
            "name": t["name"],
            "provider": t.get("provider"),
            "mapping": t["mapping"],
            "created_at": t.get("created_at"),
        })
    return templates


@router.post("/csv/mapping-templates")
async def save_mapping_template(
    body: MappingTemplateCreate,
    current_user: dict = Depends(get_current_user),
):
    doc = {
        "coach_id": current_user["_id"],
        "name": body.name,
        "provider": body.provider,
        "mapping": body.mapping,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.csv_mapping_templates.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "Template saved"}


@router.delete("/csv/mapping-templates/{template_id}")
async def delete_mapping_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
):
    result = await db.csv_mapping_templates.delete_one({
        "_id": ObjectId(template_id),
        "coach_id": current_user["_id"],
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


# ============= CSV IMPORT (via gps_import module) =============

@router.post("/wearables/import/csv")
async def import_wearable_csv(
    athlete_id: str,
    file: UploadFile = File(...),
    provider: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Import GPS data from CSV with automatic manufacturer detection.
    Supported: Catapult, STATSports, PlayerTek, GPEXE (+ unknown fallback).
    
    BLOCKED if athlete_id is not resolved or if CSV contains unresolved athlete names.
    """
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    content = await file.read()

    # Force manufacturer if provided
    forced = None
    if provider:
        try:
            forced = Manufacturer(provider.lower())
        except ValueError:
            forced = None

    # Parse CSV through the new pipeline (tolerant mode)
    parser = GPSCSVParser(strict_validation=False)
    parse_result = parser.parse(content, filename=file.filename or "upload.csv")

    manufacturer = forced if forced else parse_result.manufacturer
    
    # ========== IDENTITY RESOLUTION CHECK ==========
    # Get existing athletes for alias checking
    athletes = await db.athletes.find(
        {"coach_id": current_user["_id"]},
        {"_id": 1, "name": 1}
    ).to_list(1000)
    existing_athlete_ids = {str(a["_id"]) for a in athletes}
    
    # Get existing aliases
    aliases = await db.athlete_aliases.find(
        {"coach_id": current_user["_id"]}
    ).to_list(1000)
    
    # Check if CSV contains multiple athlete names that need resolution
    athlete_names_from_csv = set()
    for rec in parse_result.records:
        athlete_name = (
            rec.get('athlete_name', '') or 
            rec.get('player_name', '') or
            rec.get('name', '') or
            rec.get('player', '')
        )
        if athlete_name and isinstance(athlete_name, str):
            athlete_name = athlete_name.strip()
            if athlete_name and athlete_name not in existing_athlete_ids:
                athlete_names_from_csv.add(athlete_name)
    
    # Run identity resolution if there are names in CSV
    if athlete_names_from_csv:
        identity_resolver = IdentityResolver()
        resolved_names, unresolved_athletes = await identity_resolver.resolve_names(
            names=list(athlete_names_from_csv),
            athletes=athletes,
            aliases=aliases,
            coach_id=current_user["_id"],
            source_system="gps"
        )
        
        # BLOCK import if there are unresolved athletes
        if unresolved_athletes:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": f"Importação bloqueada: {len(unresolved_athletes)} atleta(s) não resolvido(s) no CSV",
                    "unresolved_count": len(unresolved_athletes),
                    "unresolved": [u.to_dict() for u in unresolved_athletes],
                    "action_required": "Use o endpoint /api/athletes/confirm-alias para confirmar as associações antes de importar"
                }
            )

    # Normalize into GPSData documents
    normalizer = GPSDataNormalizer(
        athlete_id=athlete_id,
        coach_id=current_user["_id"],
        session_name=file.filename or "CSV Import",
        manufacturer=manufacturer,
    )
    normalized = normalizer.normalize_records(parse_result.records)

    # Consolidate all rows into ONE document per activity
    consolidated = consolidate_session(normalized)

    imported = []
    errors_list = []

    if consolidated:
        try:
            await db.gps_data.insert_one(consolidated)
            imported.append({
                "date": consolidated.get("date"),
                "total_distance": consolidated.get("total_distance", 0),
                "hid": consolidated.get("high_intensity_distance", 0),
                "sprints": consolidated.get("number_of_sprints", 0),
                "has_session_total": consolidated.get("has_session_total", False),
                "periods_count": len(consolidated.get("periods", [])),
            })
            
            # UPDATE ROLLING LOAD METRICS (EWMA, ACWR, etc.)
            try:
                await load_engine.update_athlete_metrics(
                    athlete_id=athlete_id,
                    coach_id=str(current_user["_id"]),
                    date=consolidated.get("date")
                )
            except Exception as e:
                logging.warning(f"[LoadEngine] Failed to update metrics after CSV import: {e}")
        except Exception as e:
            errors_list.append({"error": str(e)})

    return {
        "success": len(imported) > 0,
        "provider_detected": manufacturer.value,
        "records_imported": len(imported),
        "records_from_csv": parse_result.total_rows,
        "consolidated": True,
        "has_session_total": consolidated.get("has_session_total", False) if consolidated else False,
        "periods_count": len(consolidated.get("periods", [])) if consolidated else 0,
        "errors": len(errors_list) + len(parse_result.errors),
        "athlete_id": athlete_id,
        "session_id": normalizer.session_id,
        "column_mapping": parse_result.column_mapping,
        "unmapped_columns": parse_result.unmapped_columns,
        "parse_warnings": [w.to_dict() for w in parse_result.warnings[:10]],
        "parse_errors": [e.to_dict() for e in parse_result.errors[:10]],
        "import_details": {
            "imported": imported,
            "errors": errors_list[:5],
        },
    }


@router.get("/wearables/csv/supported-providers")
async def get_supported_csv_providers():
    """List supported CSV manufacturers and the canonical metrics they can map."""
    manufacturers = [m for m in Manufacturer if m != Manufacturer.UNKNOWN]
    providers = []
    for m in manufacturers:
        providers.append({
            "id": m.value,
            "name": m.value.title(),
        })

    return {
        "providers": providers,
        "canonical_metrics": {
            category: metrics for category, metrics in METRIC_CATEGORIES.items()
        },
        "tips": [
            "The system automatically detects the manufacturer based on column headers",
            "Supported delimiters: comma, semicolon, tab",
            "Supported encodings: UTF-8, Latin-1, CP1252",
            "Date formats supported: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY and more",
            "Decimal separators: both dot and comma are supported",
        ],
    }


@router.post("/wearables/csv/preview")
async def preview_csv_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Preview CSV before importing.
    Returns detected manufacturer, column mapping, sample normalized records.
    Includes identity resolution for athlete names found in CSV.
    Import is BLOCKED if any athletes are unresolved.
    """
    content = await file.read()

    parse_result = parse_gps_csv(content, filename=file.filename or "upload.csv", strict=False)

    # ========== IDENTITY RESOLUTION ==========
    # Get existing athletes
    athletes = await db.athletes.find(
        {"coach_id": current_user["_id"]},
        {"_id": 1, "name": 1}
    ).to_list(1000)
    existing_athlete_ids = {str(a["_id"]) for a in athletes}
    
    # Get existing aliases
    aliases = await db.athlete_aliases.find(
        {"coach_id": current_user["_id"]}
    ).to_list(1000)
    
    # Extract unique athlete names from GPS data
    athlete_names_from_csv = set()
    for rec in parse_result.records:
        # Check common GPS CSV columns for athlete name
        athlete_name = (
            rec.get('athlete_name', '') or 
            rec.get('player_name', '') or
            rec.get('name', '') or
            rec.get('player', '')
        )
        if athlete_name and isinstance(athlete_name, str):
            athlete_name = athlete_name.strip()
            if athlete_name and athlete_name not in existing_athlete_ids:
                athlete_names_from_csv.add(athlete_name)
    
    # Run identity resolution if there are names to resolve
    identity_resolution = {
        "resolved": {},
        "resolved_count": 0,
        "unresolved": [],
        "unresolved_count": 0,
        "can_import": True,
        "message": "Nenhum nome de atleta encontrado no CSV ou todos já resolvidos"
    }
    
    if athlete_names_from_csv:
        identity_resolver = IdentityResolver()
        resolved_names, unresolved_athletes = await identity_resolver.resolve_names(
            names=list(athlete_names_from_csv),
            athletes=athletes,
            aliases=aliases,
            coach_id=current_user["_id"],
            source_system="gps"
        )
        
        can_import = len(unresolved_athletes) == 0
        identity_resolution = {
            "resolved": resolved_names,
            "resolved_count": len(resolved_names),
            "unresolved": [u.to_dict() for u in unresolved_athletes],
            "unresolved_count": len(unresolved_athletes),
            "can_import": can_import,
            "message": "Todos os atletas resolvidos" if can_import else f"{len(unresolved_athletes)} atleta(s) pendente(s) de confirmação"
        }

    # Build sample preview (first 5 parsed records)
    sample = []
    for rec in parse_result.records[:5]:
        preview = {k: v for k, v in rec.items() if not k.startswith("_")}
        sample.append(preview)

    return {
        "filename": file.filename,
        "total_rows": parse_result.total_rows,
        "valid_rows": parse_result.valid_rows,
        "detected_manufacturer": parse_result.manufacturer.value,
        "column_mapping": parse_result.column_mapping,
        "unmapped_columns": parse_result.unmapped_columns,
        "sample_data": sample,
        "errors": [e.to_dict() for e in parse_result.errors[:10]],
        "warnings": [w.to_dict() for w in parse_result.warnings[:10]],
        "ready_to_import": parse_result.valid_rows > 0 and identity_resolution["can_import"],
        "identity_resolution": identity_resolution,
    }

