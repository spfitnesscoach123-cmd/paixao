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

from identity_resolver import IdentityResolver, normalize_for_comparison

router = APIRouter(tags=["Athletes"])

# ============= ATHLETE ROUTES =============

@router.post("/athletes", response_model=Athlete)
async def create_athlete(
    athlete_data: AthleteCreate,
    current_user: dict = Depends(get_current_user)
):
    athlete = Athlete(
        coach_id=current_user["_id"],
        **athlete_data.model_dump()
    )
    
    result = await db.athletes.insert_one(athlete.model_dump(by_alias=True, exclude=["id"]))
    athlete.id = str(result.inserted_id)
    return athlete

@router.get("/athletes", response_model=List[Athlete])
async def get_athletes(current_user: dict = Depends(get_current_user)):
    athletes = await db.athletes.find({"coach_id": current_user["_id"]}).to_list(1000)
    for athlete in athletes:
        athlete["_id"] = str(athlete["_id"])
    return [Athlete(**athlete) for athlete in athletes]

@router.get("/athletes/{athlete_id}", response_model=Athlete)
async def get_athlete(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    athlete["_id"] = str(athlete["_id"])
    return Athlete(**athlete)

@router.put("/athletes/{athlete_id}", response_model=Athlete)
async def update_athlete(
    athlete_id: str,
    athlete_data: AthleteUpdate,
    current_user: dict = Depends(get_current_user)
):
    # Check if athlete exists and belongs to current user
    existing_athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not existing_athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Update only provided fields
    update_data = {k: v for k, v in athlete_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.athletes.update_one(
        {"_id": ObjectId(athlete_id)},
        {"$set": update_data}
    )
    
    updated_athlete = await db.athletes.find_one({"_id": ObjectId(athlete_id)})
    updated_athlete["_id"] = str(updated_athlete["_id"])
    return Athlete(**updated_athlete)

@router.delete("/athletes/{athlete_id}")
async def delete_athlete(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    result = await db.athletes.delete_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Cascade cleanup: remove derived/related data for the deleted athlete
    coach_id_str = str(current_user["_id"])
    cleanup = {}
    r = await db.athlete_load_metrics.delete_many({"athlete_id": athlete_id})
    cleanup["athlete_load_metrics"] = r.deleted_count
    r = await db.gps_data.delete_many({"athlete_id": athlete_id, "coach_id": coach_id_str})
    cleanup["gps_data"] = r.deleted_count
    r = await db.wellness.delete_many({"athlete_id": athlete_id, "coach_id": coach_id_str})
    cleanup["wellness"] = r.deleted_count
    r = await db.jump_assessments.delete_many({"athlete_id": athlete_id, "coach_id": current_user["_id"]})
    cleanup["jump_assessments"] = r.deleted_count
    r = await db.body_compositions.delete_many({"athlete_id": athlete_id, "coach_id": current_user["_id"]})
    cleanup["body_compositions"] = r.deleted_count
    try:
        r = await db.vbt_data.delete_many({"athlete_id": athlete_id, "coach_id": coach_id_str})
        cleanup["vbt_data"] = r.deleted_count
    except Exception:
        pass
    try:
        r = await db.assessments.delete_many({"athlete_id": athlete_id, "coach_id": current_user["_id"]})
        cleanup["assessments"] = r.deleted_count
    except Exception:
        pass
    
    return {"message": "Athlete deleted successfully", "related_data_cleaned": cleanup}


# ============= ATHLETE IDENTITY RESOLUTION =============

@router.post("/athletes/resolve-name")
async def resolve_athlete_name_endpoint(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Resolve a name to an athlete_id.
    
    Request body:
    - name: The name to resolve (required)
    - source_system: Origin system, e.g., "gps", "jump_data" (optional)
    
    Returns:
    - status: resolved, needs_confirmation, not_found, error
    - athlete_id: If resolved
    - candidates: If needs confirmation
    """
    name = request.get("name", "").strip()
    source_system = request.get("source_system", "manual")
    
    if not name:
        raise HTTPException(status_code=400, detail="Nome é obrigatório")
    
    # Get coach's athletes
    athletes = await db.athletes.find({"coach_id": current_user["_id"]}).to_list(1000)
    
    # Get existing aliases
    aliases = await db.athlete_aliases.find({"coach_id": current_user["_id"]}).to_list(1000)
    
    # Create resolver
    resolver = IdentityResolver()
    resolved, unresolved = await resolver.resolve_names(
        names=[name],
        athletes=athletes,
        aliases=aliases,
        coach_id=current_user["_id"],
        source_system=source_system,
    )
    
    if name in resolved:
        athlete = await db.athletes.find_one({"_id": ObjectId(resolved[name])})
        return {
            "status": "resolved",
            "original_name": name,
            "normalized_name": normalize_for_comparison(name),
            "athlete_id": resolved[name],
            "athlete_name": athlete.get("name", "") if athlete else "",
            "message": "Resolvido com sucesso",
        }
    
    if unresolved:
        u = unresolved[0]
        return {
            "status": "needs_confirmation",
            "original_name": u.original_name,
            "normalized_name": u.normalized_name,
            "candidates": [
                {
                    "athlete_id": c.athlete_id,
                    "athlete_name": c.athlete_name,
                    "similarity_score": c.similarity_score,
                    "match_reason": c.match_reason,
                    "existing_aliases": c.existing_aliases,
                }
                for c in u.candidates
            ],
            "suggested_action": u.suggested_action,
            "message": "Confirmação necessária",
        }
    
    return {
        "status": "not_found",
        "original_name": name,
        "normalized_name": normalize_for_comparison(name),
        "candidates": [],
        "message": "Nenhum atleta encontrado. Deseja criar um novo?",
    }


@router.post("/athletes/resolve-bulk")
async def resolve_athlete_names_bulk(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Resolve multiple names at once.
    
    Request body:
    - names: List of names to resolve (required)
    - source_system: Origin system (optional)
    
    Returns:
    - resolved: Dict of name -> athlete_id for resolved names
    - unresolved: List of names needing confirmation with candidates
    - can_import: False if any names are unresolved
    """
    names = request.get("names", [])
    source_system = request.get("source_system", "csv")
    
    if not names:
        raise HTTPException(status_code=400, detail="Lista de nomes é obrigatória")
    
    # Get coach's athletes
    athletes = await db.athletes.find({"coach_id": current_user["_id"]}).to_list(1000)
    
    # Get existing aliases
    aliases = await db.athlete_aliases.find({"coach_id": current_user["_id"]}).to_list(1000)
    
    # Create resolver
    resolver = IdentityResolver()
    resolved, unresolved = await resolver.resolve_names(
        names=names,
        athletes=athletes,
        aliases=aliases,
        coach_id=current_user["_id"],
        source_system=source_system,
    )
    
    return {
        "resolved": resolved,
        "resolved_count": len(resolved),
        "unresolved": [u.to_dict() for u in unresolved],
        "unresolved_count": len(unresolved),
        "total_names": len(set(names)),
        "can_import": len(unresolved) == 0,
        "message": "Todos os nomes resolvidos" if not unresolved else f"{len(unresolved)} nome(s) pendente(s) de confirmação",
    }


@router.post("/athletes/confirm-alias")
async def confirm_athlete_alias(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Confirm a name -> athlete mapping and persist the alias.
    
    Request body:
    - original_name: Name as found in CSV (required)
    - athlete_id: Confirmed athlete ID (required)
    - source_system: Origin system (optional)
    
    Returns the created alias document.
    """
    original_name = request.get("original_name", "").strip()
    athlete_id = request.get("athlete_id", "").strip()
    source_system = request.get("source_system", "manual")
    
    if not original_name:
        raise HTTPException(status_code=400, detail="Nome original é obrigatório")
    if not athlete_id:
        raise HTTPException(status_code=400, detail="ID do atleta é obrigatório")
    
    # Verify athlete exists and belongs to coach
    try:
        athlete = await db.athletes.find_one({
            "_id": ObjectId(athlete_id),
            "coach_id": current_user["_id"]
        })
    except Exception:
        raise HTTPException(status_code=400, detail="ID de atleta inválido")
    
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta não encontrado")
    
    normalized = normalize_for_comparison(original_name)
    
    # Check if alias already exists
    existing = await db.athlete_aliases.find_one({
        "coach_id": current_user["_id"],
        "alias_normalized": normalized,
    })
    
    if existing:
        # Update last_used_at if same athlete
        if existing.get("athlete_id") == athlete_id:
            await db.athlete_aliases.update_one(
                {"_id": existing["_id"]},
                {"$set": {"last_used_at": datetime.utcnow()}}
            )
            return {
                "message": "Alias já existe e foi atualizado",
                "alias_id": str(existing["_id"]),
                "athlete_id": athlete_id,
                "athlete_name": athlete.get("name", ""),
                "original_name": original_name,
                "normalized_name": normalized,
            }
        else:
            # Conflict! Different athlete
            conflicting_athlete = await db.athletes.find_one({"_id": ObjectId(existing.get("athlete_id"))})
            raise HTTPException(
                status_code=409,
                detail=f"Este nome já está associado ao atleta '{conflicting_athlete.get('name', '')}'. "
                       f"Não é possível sobrescrever associações existentes."
            )
    
    # Create new alias
    alias_doc = {
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "alias_normalized": normalized,
        "alias_original": original_name,
        "source_system": source_system,
        "created_at": datetime.utcnow(),
        "last_used_at": datetime.utcnow(),
        "created_by": current_user["_id"],
    }
    
    result = await db.athlete_aliases.insert_one(alias_doc)
    
    return {
        "message": "Alias criado com sucesso",
        "alias_id": str(result.inserted_id),
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name", ""),
        "original_name": original_name,
        "normalized_name": normalized,
        "source_system": source_system,
    }


@router.get("/athletes/{athlete_id}/aliases")
async def get_athlete_aliases(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all aliases for an athlete."""
    # Verify athlete exists
    try:
        athlete = await db.athletes.find_one({
            "_id": ObjectId(athlete_id),
            "coach_id": current_user["_id"]
        })
    except Exception:
        raise HTTPException(status_code=400, detail="ID de atleta inválido")
    
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta não encontrado")
    
    aliases = await db.athlete_aliases.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).to_list(100)
    
    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name", ""),
        "aliases": [
            {
                "id": str(a["_id"]),
                "original_name": a.get("alias_original", ""),
                "normalized_name": a.get("alias_normalized", ""),
                "source_system": a.get("source_system", ""),
                "created_at": a.get("created_at"),
                "last_used_at": a.get("last_used_at"),
            }
            for a in aliases
        ],
        "alias_count": len(aliases),
    }


@router.delete("/athletes/aliases/{alias_id}")
async def delete_athlete_alias(
    alias_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an athlete alias."""
    try:
        result = await db.athlete_aliases.delete_one({
            "_id": ObjectId(alias_id),
            "coach_id": current_user["_id"]
        })
    except Exception:
        raise HTTPException(status_code=400, detail="ID de alias inválido")
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alias não encontrado")
    
    return {"message": "Alias removido com sucesso"}


