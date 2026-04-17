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

from jump_import import JumpCSVParser, JumpValidator, JumpCalculator
from jump_import.mappers import list_supported_manufacturers as list_jump_manufacturers
from jump_analysis import generate_report, compare_athletes, calculate_athlete_baseline
from identity_resolver import IdentityResolver, normalize_for_comparison

router = APIRouter(tags=["Jump Camera Import"])

# ============= JUMP DATA IMPORT ROUTES =============

@router.get("/jumps/providers")
async def get_jump_providers():
    """
    Get list of supported jump data providers/manufacturers.
    
    Returns list of supported contact mat and force plate systems.
    """
    return {
        "providers": list_jump_manufacturers(),
        "description": "Fabricantes de tapetes de contato e plataformas de força suportados"
    }


@router.post("/jumps/upload/preview")
async def preview_jump_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Preview jump data CSV before importing.
    
    Validates all rows and returns:
    - Valid records (preview, not saved)
    - Invalid rows with detailed error messages
    - Detected manufacturer
    - Metrics that will be auto-calculated
    - Athletes not found in system
    - Identity resolution status (resolved/unresolved athletes)
    
    Does NOT save anything to database.
    Import is BLOCKED if any athletes are unresolved.
    """
    # Read file content
    file_content = await file.read()
    
    if not file_content:
        raise HTTPException(status_code=400, detail="Arquivo CSV vazio")
    
    # Get existing athletes for this coach
    athletes = await db.athletes.find(
        {"coach_id": current_user["_id"]},
        {"_id": 1, "name": 1}
    ).to_list(1000)
    existing_athlete_ids = {str(a["_id"]) for a in athletes}
    
    # Get existing aliases
    aliases = await db.athlete_aliases.find(
        {"coach_id": current_user["_id"]}
    ).to_list(1000)
    
    # Parse CSV
    parser = JumpCSVParser()
    raw_rows, parse_errors = parser.parse(file_content, file.filename or "upload.csv")
    
    if not raw_rows and parse_errors:
        return {
            "success": False,
            "total_rows": 0,
            "valid_count": 0,
            "error_count": len(parse_errors),
            "errors": [e.model_dump() for e in parse_errors],
            "valid_records": [],
            "detected_manufacturer": parser.detected_manufacturer or "unknown",
            "calculated_metrics": [],
            "athletes_not_found": [],
            "jump_types_found": [],
            "identity_resolution": {
                "resolved": {},
                "unresolved": [],
                "can_import": False,
                "message": "Erro ao parsear CSV"
            }
        }
    
    # ========== IDENTITY RESOLUTION ==========
    # Extract unique athlete names/IDs from CSV
    athlete_names_from_csv = set()
    for raw_row in raw_rows:
        # Check for athlete_id or athlete_name columns
        # Also check inside raw_row['raw_row'] which contains original CSV values
        athlete_id = raw_row.get('athlete_id', '') or ''
        athlete_name = raw_row.get('athlete_name', '') or ''
        
        # Check in raw_row (original CSV data)
        inner_raw = raw_row.get('raw_row', {}) or {}
        if not athlete_name:
            athlete_name = inner_raw.get('athlete_name', '') or ''
        if not athlete_id:
            athlete_id = inner_raw.get('athlete_id', '') or ''
        
        athlete_id = str(athlete_id).strip()
        athlete_name = str(athlete_name).strip()
        
        if athlete_name:
            athlete_names_from_csv.add(athlete_name)
        elif athlete_id and athlete_id not in existing_athlete_ids:
            # athlete_id provided but not found - treat as name for resolution
            athlete_names_from_csv.add(athlete_id)
    
    # Run identity resolution
    identity_resolver = IdentityResolver()
    resolved_names, unresolved_athletes = await identity_resolver.resolve_names(
        names=list(athlete_names_from_csv),
        athletes=athletes,
        aliases=aliases,
        coach_id=current_user["_id"],
        source_system="jump_data"
    )
    
    can_import = len(unresolved_athletes) == 0
    
    # Build name -> athlete_id mapping (including resolved)
    name_to_athlete_id = dict(resolved_names)
    
    # Add existing athlete IDs that are direct matches
    for athlete in athletes:
        aid = str(athlete["_id"])
        name = athlete.get("name", "")
        normalized = normalize_for_comparison(name)
        if normalized:
            name_to_athlete_id[name] = aid
    
    # ========== VALIDATION ==========
    # Now validate with resolved athlete IDs
    valid_records = []
    all_errors = list(parse_errors)
    jump_types_found = set()
    all_calculated_metrics = set()
    
    # Expand existing_athlete_ids with resolved names
    resolved_ids = set(existing_athlete_ids)
    for name, aid in resolved_names.items():
        resolved_ids.add(aid)
    
    validator = JumpValidator(resolved_ids)
    calculator = JumpCalculator()
    
    for row_num, raw_row in enumerate(raw_rows, start=2):
        # Extract athlete_id and athlete_name from raw_row and inner raw_row
        athlete_id = raw_row.get('athlete_id', '') or ''
        athlete_name = raw_row.get('athlete_name', '') or ''
        inner_raw = raw_row.get('raw_row', {}) or {}
        
        if not athlete_name:
            athlete_name = inner_raw.get('athlete_name', '') or ''
        if not athlete_id:
            athlete_id = inner_raw.get('athlete_id', '') or ''
        
        athlete_id = str(athlete_id).strip()
        athlete_name = str(athlete_name).strip()
        
        # Try to resolve athlete name to ID
        resolved_athlete_id = None
        if athlete_name:
            if athlete_name in resolved_names:
                resolved_athlete_id = resolved_names[athlete_name]
            elif athlete_name in name_to_athlete_id:
                resolved_athlete_id = name_to_athlete_id[athlete_name]
        
        if not resolved_athlete_id and athlete_id:
            if athlete_id in existing_athlete_ids:
                resolved_athlete_id = athlete_id
            elif athlete_id in resolved_names:
                resolved_athlete_id = resolved_names[athlete_id]
        
        if resolved_athlete_id:
            raw_row['athlete_id'] = resolved_athlete_id
        
        # Calculate derived metrics
        calculator.reset_tracking()
        row_with_metrics = calculator.calculate(raw_row)
        all_calculated_metrics.update(calculator.calculated_fields)
        
        # Track jump types
        jt = row_with_metrics.get('jump_type')
        if jt:
            jump_types_found.add(str(jt).upper())
        
        # Validate
        is_valid, record_or_error = validator.validate(row_with_metrics, row_num)
        
        if is_valid:
            # Convert record to dict for JSON response
            record_dict = record_or_error.model_dump()
            # Convert datetime to string for JSON
            if record_dict.get('jump_date'):
                record_dict['jump_date'] = record_dict['jump_date'].isoformat()
            valid_records.append(record_dict)
        else:
            all_errors.append(record_or_error)
    
    return {
        "success": len(all_errors) == 0 and can_import,
        "total_rows": len(raw_rows),
        "valid_count": len(valid_records),
        "error_count": len(all_errors),
        "valid_records": valid_records,
        "errors": [e.model_dump() for e in all_errors],
        "detected_manufacturer": parser.detected_manufacturer or "generic",
        "calculated_metrics": list(all_calculated_metrics),
        "athletes_not_found": list(validator.athletes_not_found),
        "jump_types_found": list(jump_types_found),
        "identity_resolution": {
            "resolved": resolved_names,
            "resolved_count": len(resolved_names),
            "unresolved": [u.to_dict() for u in unresolved_athletes],
            "unresolved_count": len(unresolved_athletes),
            "can_import": can_import,
            "message": "Todos os atletas resolvidos" if can_import else f"{len(unresolved_athletes)} atleta(s) pendente(s) de confirmação"
        }
    }


@router.post("/jumps/upload/import")
async def import_jump_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Import validated jump data from CSV into database.
    
    Only imports valid records. Invalid rows are rejected with error messages.
    BLOCKED if any athletes are unresolved - use preview first to resolve identities.
    
    Returns:
    - Total imported count
    - Total rejected count
    - IDs of created records
    - Error details for rejected rows
    """
    # Read file content
    file_content = await file.read()
    
    if not file_content:
        raise HTTPException(status_code=400, detail="Arquivo CSV vazio")
    
    # Get existing athletes for this coach
    athletes = await db.athletes.find(
        {"coach_id": current_user["_id"]},
        {"_id": 1, "name": 1}
    ).to_list(1000)
    existing_athlete_ids = {str(a["_id"]) for a in athletes}
    
    # Get existing aliases
    aliases = await db.athlete_aliases.find(
        {"coach_id": current_user["_id"]}
    ).to_list(1000)
    
    # Parse CSV
    parser = JumpCSVParser()
    raw_rows, parse_errors = parser.parse(file_content, file.filename or "upload.csv")
    
    if not raw_rows:
        raise HTTPException(
            status_code=400,
            detail=f"Nenhum dado válido encontrado no CSV. Erros: {[e.message for e in parse_errors]}"
        )
    
    # ========== IDENTITY RESOLUTION CHECK ==========
    # Extract unique athlete names/IDs from CSV
    athlete_names_from_csv = set()
    for raw_row in raw_rows:
        # Check both raw_row and inner raw_row for athlete info
        athlete_id = raw_row.get('athlete_id', '') or ''
        athlete_name = raw_row.get('athlete_name', '') or ''
        inner_raw = raw_row.get('raw_row', {}) or {}
        
        if not athlete_name:
            athlete_name = inner_raw.get('athlete_name', '') or ''
        if not athlete_id:
            athlete_id = inner_raw.get('athlete_id', '') or ''
        
        athlete_id = str(athlete_id).strip()
        athlete_name = str(athlete_name).strip()
        
        if athlete_name:
            athlete_names_from_csv.add(athlete_name)
        elif athlete_id and athlete_id not in existing_athlete_ids:
            athlete_names_from_csv.add(athlete_id)
    
    # Run identity resolution
    identity_resolver = IdentityResolver()
    resolved_names, unresolved_athletes = await identity_resolver.resolve_names(
        names=list(athlete_names_from_csv),
        athletes=athletes,
        aliases=aliases,
        coach_id=current_user["_id"],
        source_system="jump_data"
    )
    
    # BLOCK import if there are unresolved athletes
    if unresolved_athletes:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"Importação bloqueada: {len(unresolved_athletes)} atleta(s) não resolvido(s)",
                "unresolved_count": len(unresolved_athletes),
                "unresolved": [u.to_dict() for u in unresolved_athletes],
                "action_required": "Use o endpoint /api/athletes/confirm-alias para confirmar as associações antes de importar"
            }
        )
    
    # ========== VALIDATION & IMPORT ==========
    # Expand existing_athlete_ids with resolved names
    resolved_ids = set(existing_athlete_ids)
    for name, aid in resolved_names.items():
        resolved_ids.add(aid)
    
    # Build name -> athlete_id mapping
    name_to_athlete_id = dict(resolved_names)
    for athlete in athletes:
        aid = str(athlete["_id"])
        name = athlete.get("name", "")
        if name:
            name_to_athlete_id[name] = aid
    
    validator = JumpValidator(resolved_ids)
    calculator = JumpCalculator()
    
    valid_records = []
    all_errors = list(parse_errors)
    
    for row_num, raw_row in enumerate(raw_rows, start=2):
        # Extract athlete_id and athlete_name from raw_row and inner raw_row
        athlete_id = raw_row.get('athlete_id', '') or ''
        athlete_name = raw_row.get('athlete_name', '') or ''
        inner_raw = raw_row.get('raw_row', {}) or {}
        
        if not athlete_name:
            athlete_name = inner_raw.get('athlete_name', '') or ''
        if not athlete_id:
            athlete_id = inner_raw.get('athlete_id', '') or ''
        
        athlete_id = str(athlete_id).strip()
        athlete_name = str(athlete_name).strip()
        
        # Try to resolve athlete name to ID
        resolved_athlete_id = None
        if athlete_name:
            if athlete_name in resolved_names:
                resolved_athlete_id = resolved_names[athlete_name]
            elif athlete_name in name_to_athlete_id:
                resolved_athlete_id = name_to_athlete_id[athlete_name]
        
        if not resolved_athlete_id and athlete_id:
            if athlete_id in existing_athlete_ids:
                resolved_athlete_id = athlete_id
            elif athlete_id in resolved_names:
                resolved_athlete_id = resolved_names[athlete_id]
        
        if resolved_athlete_id:
            raw_row['athlete_id'] = resolved_athlete_id
        
        # Calculate derived metrics
        row_with_metrics = calculator.calculate(raw_row)
        
        # Validate
        is_valid, record_or_error = validator.validate(row_with_metrics, row_num)
        
        if is_valid:
            valid_records.append(record_or_error)
        else:
            all_errors.append(record_or_error)
    
    if not valid_records:
        return {
            "success": False,
            "message": "Nenhum registro válido para importar",
            "imported_count": 0,
            "rejected_count": len(all_errors),
            "created_ids": [],
            "errors": [e.model_dump() for e in all_errors]
        }
    
    # Prepare documents for insertion
    documents = []
    for record in valid_records:
        doc = record.model_dump()
        doc['coach_id'] = current_user["_id"]
        doc['created_at'] = datetime.utcnow()
        # Convert jump_date if it's a datetime object
        if isinstance(doc.get('jump_date'), datetime):
            doc['jump_date_str'] = doc['jump_date'].strftime('%Y-%m-%d')
        documents.append(doc)
    
    # Insert into database
    result = await db.jump_data.insert_many(documents)
    created_ids = [str(id) for id in result.inserted_ids]
    
    # Update last_used_at for aliases used
    for name in resolved_names:
        normalized = normalize_for_comparison(name)
        await db.athlete_aliases.update_one(
            {"coach_id": current_user["_id"], "alias_normalized": normalized},
            {"$set": {"last_used_at": datetime.utcnow()}}
        )
    
    return {
        "success": True,
        "message": f"{len(created_ids)} registros de salto importados com sucesso",
        "imported_count": len(created_ids),
        "rejected_count": len(all_errors),
        "created_ids": created_ids,
        "resolved_athletes": resolved_names,
        "errors": [e.model_dump() for e in all_errors] if all_errors else []
    }


@router.get("/jumps/athlete/{athlete_id}")
async def get_athlete_jumps(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all jump data for a specific athlete.
    
    Returns jump records sorted by date (newest first).
    """
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta não encontrado")
    
    # Get jump records, excluding MongoDB _id from raw_row if present
    jump_records = await db.jump_data.find(
        {
            "athlete_id": athlete_id,
            "coach_id": current_user["_id"]
        },
        {"_id": 1, "athlete_id": 1, "jump_type": 1, "jump_height_cm": 1,
         "flight_time_s": 1, "contact_time_s": 1, "reactive_strength_index": 1,
         "peak_power_w": 1, "takeoff_velocity_m_s": 1, "load_kg": 1,
         "jump_date": 1, "jump_date_str": 1, "source_system": 1,
         "attempt_number": 1, "test_id": 1, "protocol": 1, "notes": 1,
         "created_at": 1}
    ).sort("jump_date", -1).to_list(1000)
    
    # Convert ObjectId to string
    for record in jump_records:
        record["id"] = str(record.pop("_id"))
        # Convert datetime to ISO string
        if isinstance(record.get("jump_date"), datetime):
            record["jump_date"] = record["jump_date"].isoformat()
        if isinstance(record.get("created_at"), datetime):
            record["created_at"] = record["created_at"].isoformat()
    
    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name", ""),
        "total_jumps": len(jump_records),
        "jumps": jump_records
    }


@router.delete("/jumps/{jump_id}")
async def delete_jump(
    jump_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a specific jump record.
    """
    result = await db.jump_data.delete_one({
        "_id": ObjectId(jump_id),
        "coach_id": current_user["_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registro de salto não encontrado")
    
    return {"message": "Registro de salto excluído com sucesso", "id": jump_id}


@router.get("/jumps/analysis/{athlete_id}")
async def get_jump_analysis(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get jump performance analysis for an athlete.
    
    Includes:
    - Best values by jump type
    - Recent trend analysis
    - RSI analysis (for DJ/RJ)
    """
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta não encontrado")
    
    # Get all jump records
    jump_records = await db.jump_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("jump_date", -1).to_list(1000)
    
    if not jump_records:
        return {
            "athlete_id": athlete_id,
            "athlete_name": athlete.get("name", ""),
            "total_jumps": 0,
            "analysis": None,
            "message": "Nenhum dado de salto encontrado para este atleta"
        }
    
    # Analyze by jump type
    by_type = {}
    for record in jump_records:
        jt = record.get("jump_type", "UNKNOWN")
        if jt not in by_type:
            by_type[jt] = {
                "count": 0,
                "best_height_cm": None,
                "avg_height_cm": None,
                "heights": [],
                "best_rsi": None,
                "avg_rsi": None,
                "rsis": [],
                "recent_heights": [],
            }
        
        by_type[jt]["count"] += 1
        
        height = record.get("jump_height_cm")
        if height is not None:
            by_type[jt]["heights"].append(height)
            if by_type[jt]["best_height_cm"] is None or height > by_type[jt]["best_height_cm"]:
                by_type[jt]["best_height_cm"] = height
        
        rsi = record.get("reactive_strength_index")
        if rsi is not None:
            by_type[jt]["rsis"].append(rsi)
            if by_type[jt]["best_rsi"] is None or rsi > by_type[jt]["best_rsi"]:
                by_type[jt]["best_rsi"] = rsi
    
    # Calculate averages
    for jt, data in by_type.items():
        if data["heights"]:
            data["avg_height_cm"] = round(sum(data["heights"]) / len(data["heights"]), 2)
            data["recent_heights"] = data["heights"][:10]  # Last 10
        if data["rsis"]:
            data["avg_rsi"] = round(sum(data["rsis"]) / len(data["rsis"]), 2)
        # Remove raw lists from response
        del data["heights"]
        del data["rsis"]
    
    # Overall best
    all_heights = [r.get("jump_height_cm") for r in jump_records if r.get("jump_height_cm")]
    overall_best = max(all_heights) if all_heights else None
    overall_avg = round(sum(all_heights) / len(all_heights), 2) if all_heights else None
    
    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name", ""),
        "total_jumps": len(jump_records),
        "analysis": {
            "overall": {
                "best_height_cm": overall_best,
                "avg_height_cm": overall_avg,
                "jump_count": len(jump_records)
            },
            "by_type": by_type
        }
    }


@router.get("/jumps/report/{athlete_id}")
async def get_jump_report(
    athlete_id: str,
    jump_type: str = "CMJ",
    window_days: int = 14,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a comprehensive jump performance report for an athlete.
    
    Returns:
    - Readiness status (optimal, good, moderate, low, poor)
    - Fatigue detection flag
    - Trend analysis (vs baseline, vs career)
    - Baseline metrics (best, rolling averages, CV%)
    - Actionable recommendations
    
    Query Parameters:
    - jump_type: Type of jump to analyze (CMJ, SJ, DJ, RJ). Default: CMJ
    - window_days: Analysis window in days. Default: 14
    """
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta não encontrado")
    
    # Get all jump records for athlete
    jump_records = await db.jump_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("jump_date", -1).to_list(1000)
    
    # Convert MongoDB records to dicts (handle ObjectId and datetime)
    jumps = []
    for record in jump_records:
        record_dict = dict(record)
        record_dict.pop("_id", None)
        record_dict.pop("coach_id", None)
        jumps.append(record_dict)
    
    # Generate report using jump_analysis module
    report = generate_report(
        jumps=jumps,
        athlete_id=athlete_id,
        athlete_name=athlete.get("name", ""),
        jump_type=jump_type.upper(),
        window_days=window_days
    )
    
    return report


@router.get("/jumps/compare")
async def compare_athletes_jumps(
    athlete_ids: str,
    jump_type: str = "CMJ",
    metric: str = "z_height",
    current_user: dict = Depends(get_current_user)
):
    """
    Compare jump performance across multiple athletes.
    
    Query Parameters:
    - athlete_ids: Comma-separated athlete IDs (e.g., "id1,id2,id3")
    - jump_type: Type of jump to compare (CMJ, SJ, DJ, RJ). Default: CMJ
    - metric: Comparison metric (z_height, pct_best_height, pct_career_height). Default: z_height
    
    Returns ranked list with group statistics.
    """
    from jump_analysis import calculate_athlete_baseline
    
    # Parse athlete IDs
    ids = [id.strip() for id in athlete_ids.split(",") if id.strip()]
    
    if len(ids) < 2:
        raise HTTPException(status_code=400, detail="Pelo menos 2 atletas são necessários para comparação")
    
    if len(ids) > 20:
        raise HTTPException(status_code=400, detail="Máximo de 20 atletas por comparação")
    
    # Collect data for all athletes
    athlete_data = []
    
    for aid in ids:
        # Verify athlete belongs to user
        try:
            athlete = await db.athletes.find_one({
                "_id": ObjectId(aid),
                "coach_id": current_user["_id"]
            })
        except Exception:
            continue
        
        if not athlete:
            continue
        
        # Get jump records
        jump_records = await db.jump_data.find({
            "athlete_id": aid,
            "coach_id": current_user["_id"]
        }).to_list(1000)
        
        if not jump_records:
            continue
        
        # Convert to list of dicts
        jumps = []
        for record in jump_records:
            record_dict = dict(record)
            record_dict.pop("_id", None)
            record_dict.pop("coach_id", None)
            jumps.append(record_dict)
        
        # Calculate baseline
        baseline = calculate_athlete_baseline(
            jumps=jumps,
            athlete_id=aid,
            jump_type=jump_type.upper()
        )
        
        athlete_data.append({
            "athlete_id": aid,
            "athlete_name": athlete.get("name", ""),
            "baseline": baseline.to_dict(),
            "jumps": jumps
        })
    
    if len(athlete_data) < 2:
        raise HTTPException(
            status_code=400, 
            detail="Dados insuficientes: pelo menos 2 atletas com dados de salto são necessários"
        )
    
    # Run comparison
    comparison = compare_athletes(
        athlete_data=athlete_data,
        metric=metric,
        jump_type=jump_type.upper()
    )
    
    # Add athlete names to results
    name_map = {d["athlete_id"]: d["athlete_name"] for d in athlete_data}
    for athlete in comparison.get("athletes", []):
        athlete["athlete_name"] = name_map.get(athlete["athlete_id"], "")
    
    return {
        "jump_type": jump_type.upper(),
        "metric": metric,
        "athlete_count": len(athlete_data),
        "comparison": comparison
    }

