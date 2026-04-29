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


router = APIRouter(tags=["Wellness"])

# ============= WELLNESS ROUTES =============

def calculate_wellness_scores(data: WellnessQuestionnaireCreate) -> tuple:
    # Wellness Score: Higher is better
    # Invert fatigue, stress, muscle_soreness (lower is better)
    wellness_score = (
        (10 - data.fatigue) * 0.2 +
        (10 - data.stress) * 0.15 +
        data.mood * 0.15 +
        data.sleep_quality * 0.2 +
        (10 - data.muscle_soreness) * 0.15 +
        data.hydration * 0.15
    )
    
    # Readiness Score: Consider sleep hours as well
    sleep_score = min(data.sleep_hours / 8.0 * 10, 10)  # Normalize to 10
    readiness_score = (
        (10 - data.fatigue) * 0.3 +
        sleep_score * 0.3 +
        (10 - data.muscle_soreness) * 0.2 +
        data.mood * 0.2
    )
    
    return round(wellness_score, 2), round(readiness_score, 2)

@router.post("/wellness", response_model=WellnessQuestionnaire)
async def create_wellness_questionnaire(
    wellness_data: WellnessQuestionnaireCreate,
    current_user: dict = Depends(get_current_user)
):
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(wellness_data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    wellness_score, readiness_score = calculate_wellness_scores(wellness_data)
    
    wellness = WellnessQuestionnaire(
        coach_id=current_user["_id"],
        wellness_score=wellness_score,
        readiness_score=readiness_score,
        **wellness_data.model_dump()
    )
    
    result = await db.wellness.insert_one(wellness.model_dump(by_alias=True, exclude=["id"]))
    wellness.id = str(result.inserted_id)
    return wellness

@router.get("/wellness/athlete/{athlete_id}", response_model=List[WellnessQuestionnaire])
async def get_athlete_wellness(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    wellness_records = await db.wellness.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(1000)
    
    result = []
    for record in wellness_records:
        record["_id"] = str(record["_id"])
        # Handle legacy data with missing fields
        if record.get("hydration") is None:
            record["hydration"] = 5
        if "wellness_score" not in record or record.get("wellness_score") is None:
            # Calculate wellness score if missing
            record["wellness_score"] = (
                (10 - record.get("fatigue", 5)) * 0.2 +
                record.get("sleep_quality", 5) * 0.2 +
                (record.get("sleep_hours", 7) / 8) * 10 * 0.15 +
                record.get("mood", 5) * 0.15 +
                (10 - record.get("muscle_soreness", 5)) * 0.15 +
                (10 - record.get("stress", 5)) * 0.15
            )
        if "readiness_score" not in record or record.get("readiness_score") is None:
            record["readiness_score"] = record.get("wellness_score", 5) * 0.8 + (10 - record.get("fatigue", 5)) * 0.2
        result.append(WellnessQuestionnaire(**record))
    return result

# ============= WELLNESS TOKEN SYSTEM (NEW - replaces link system) =============

class WellnessTokenExpiry(str, Enum):
    THIRTY_MIN = "30min"
    ONE_HOUR = "1h"
    TWO_HOURS = "2h"
    EIGHT_HOURS = "8h"
    TWENTY_FOUR_HOURS = "24h"

EXPIRY_TO_MINUTES = {
    "30min": 30,
    "1h": 60,
    "2h": 120,
    "8h": 480,
    "24h": 1440,
}

class WellnessTokenCreate(BaseModel):
    max_uses: int = Field(ge=1, le=100, default=30)
    expires_in: str = "24h"  # 30min, 1h, 2h, 8h, 24h

class WellnessTokenStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    EXPIRED = "expired"

class WellnessToken(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    token_id: str  # Alphanumeric token to share
    coach_id: str
    max_uses: int
    current_uses: int = 0
    expires_at: datetime
    status: str = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class TokenUsage(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    token_id: str
    athlete_id: str
    used_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class TokenValidateRequest(BaseModel):
    token: str

class TokenWellnessSubmit(BaseModel):
    token: str
    athlete_id: str
    date: str
    sleep_hours: float
    sleep_quality: int  # 1-10
    fatigue: int  # 1-10
    muscle_soreness: int  # 1-10
    stress: int  # 1-10
    mood: int  # 1-10
    hydration: Optional[int] = None  # 1-10
    notes: Optional[str] = None

def generate_token_code() -> str:
    """Generate a 6-character alphanumeric token (uppercase letters + digits)"""
    import random
    import string
    chars = string.ascii_uppercase + string.digits
    # Avoid confusing characters: O, 0, I, 1, L
    chars = chars.replace('O', '').replace('0', '').replace('I', '').replace('1', '').replace('L', '')
    return ''.join(random.choice(chars) for _ in range(6))

@router.post("/wellness/token")
async def create_wellness_token(
    data: WellnessTokenCreate,
    current_user: dict = Depends(get_current_user)
):
    """Generate a new wellness token for coach to share with athletes"""
    # Validate expiry
    if data.expires_in not in EXPIRY_TO_MINUTES:
        raise HTTPException(status_code=400, detail="Tempo de expiração inválido")
    
    # Generate unique token
    token_code = generate_token_code()
    
    # Ensure uniqueness
    while await db.wellness_tokens.find_one({"token_id": token_code, "status": "active"}):
        token_code = generate_token_code()
    
    expires_minutes = EXPIRY_TO_MINUTES[data.expires_in]
    expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
    
    token_doc = {
        "token_id": token_code,
        "coach_id": str(current_user["_id"]),
        "max_uses": data.max_uses,
        "current_uses": 0,
        "expires_at": expires_at,
        "status": "active",
        "created_at": datetime.utcnow(),
    }
    
    result = await db.wellness_tokens.insert_one(token_doc)
    
    return {
        "token_id": token_code,
        "max_uses": data.max_uses,
        "current_uses": 0,
        "expires_at": expires_at.isoformat(),
        "status": "active",
    }

@router.post("/wellness/token/validate")
async def validate_wellness_token(data: TokenValidateRequest):
    """Validate a token entered by an athlete (public, no auth required)"""
    token_code = data.token.upper().strip()
    
    # === APPLE REVIEW TOKEN - Bypass isolado para App Review ===
    if token_code == "APPS26":
        # Buscar coach demo pelo email fixo
        demo_coach = await db.users.find_one({"email": "contato@loadmanagerpro.com.br"})
        if demo_coach:
            return {
                "valid": True,
                "token_id": token_code,
                "coach_id": str(demo_coach["_id"]),
            }
    # === FIM APPLE REVIEW TOKEN ===
    
    # Find token
    token = await db.wellness_tokens.find_one({"token_id": token_code})
    
    if not token:
        raise HTTPException(status_code=404, detail="Token não encontrado")
    
    # Check status
    if token.get("status") != "active":
        raise HTTPException(status_code=400, detail="Token inativo")
    
    # Check expiration
    if datetime.utcnow() > token.get("expires_at"):
        # Auto-update status to expired
        await db.wellness_tokens.update_one(
            {"_id": token["_id"]},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=400, detail="Token expirado")
    
    # Check max uses
    if token.get("current_uses", 0) >= token.get("max_uses", 1):
        # Auto-update status to inactive
        await db.wellness_tokens.update_one(
            {"_id": token["_id"]},
            {"$set": {"status": "inactive"}}
        )
        raise HTTPException(status_code=400, detail="Token atingiu limite de uso")
    
    return {
        "valid": True,
        "token_id": token_code,
        "coach_id": token["coach_id"],
    }

@router.get("/wellness/token/{token_id}/athletes")
async def get_athletes_for_token(token_id: str):
    """Get list of athletes for a valid token (public, no auth required)"""
    token_code = token_id.upper().strip()
    
    # === APPLE REVIEW TOKEN - Bypass isolado para App Review ===
    if token_code == "APPS26":
        demo_coach = await db.users.find_one({"email": "contato@loadmanagerpro.com.br"})
        if demo_coach:
            athletes = await db.athletes.find({
                "coach_id": str(demo_coach["_id"])
            }).to_list(1000)
            return [{"id": str(a["_id"]), "name": a["name"]} for a in athletes]
    # === FIM APPLE REVIEW TOKEN ===
    
    # Find and validate token
    token = await db.wellness_tokens.find_one({"token_id": token_code})
    
    if not token:
        raise HTTPException(status_code=404, detail="Token não encontrado")
    
    if token.get("status") != "active":
        raise HTTPException(status_code=400, detail="Token inativo")
    
    if datetime.utcnow() > token.get("expires_at"):
        raise HTTPException(status_code=400, detail="Token expirado")
    
    if token.get("current_uses", 0) >= token.get("max_uses", 1):
        raise HTTPException(status_code=400, detail="Token atingiu limite de uso")
    
    # Get athletes for this coach
    athletes = await db.athletes.find({
        "coach_id": token["coach_id"]
    }).to_list(1000)
    
    # Return only names and IDs
    return [{"id": str(a["_id"]), "name": a["name"]} for a in athletes]

@router.get("/wellness/token/{token_id}/check-athlete/{athlete_id}")
async def check_athlete_token_usage(token_id: str, athlete_id: str):
    """Check if an athlete has already used this token (public, no auth required)"""
    token_code = token_id.upper().strip()
    
    # === APPLE REVIEW TOKEN - Sempre permite uso para App Review ===
    if token_code == "APPS26":
        return {
            "already_used": False,
            "message": "OK"
        }
    # === FIM APPLE REVIEW TOKEN ===
    
    # Check if usage already exists
    existing_usage = await db.token_usage.find_one({
        "token_id": token_code,
        "athlete_id": athlete_id
    })
    
    if existing_usage:
        return {
            "already_used": True,
            "message": "Você já respondeu este questionário."
        }
    
    return {
        "already_used": False,
        "message": "OK"
    }

@router.post("/wellness/token/submit")
async def submit_wellness_via_token(data: TokenWellnessSubmit):
    """Submit wellness questionnaire via token (public, no auth required)"""
    token_code = data.token.upper().strip()
    
    # === APPLE REVIEW TOKEN - Bypass isolado para App Review ===
    coach_id_for_record = None
    if token_code == "APPS26":
        demo_coach = await db.users.find_one({"email": "contato@loadmanagerpro.com.br"})
        if demo_coach:
            coach_id_for_record = str(demo_coach["_id"])
            # Verificar se atleta pertence a este coach
            athlete = await db.athletes.find_one({
                "_id": ObjectId(data.athlete_id),
                "coach_id": coach_id_for_record
            })
            if not athlete:
                raise HTTPException(status_code=404, detail="Atleta não encontrado")
            
            # Verificar se já usou (permitir múltiplos usos para review)
            # Não bloquear por uso anterior para Apple Review
            
            # Calculate readiness score
            readiness_score = round(
                (data.sleep_quality * 2 +
                 (10 - data.fatigue) * 2 +
                 (10 - data.muscle_soreness) * 1.5 +
                 (10 - data.stress) * 1 +
                 data.mood * 1.5) / 8, 1
            )
            
            # Create wellness record
            wellness_record = {
                "athlete_id": data.athlete_id,
                "coach_id": coach_id_for_record,
                "date": data.date,
                "sleep_hours": data.sleep_hours,
                "sleep_quality": data.sleep_quality,
                "fatigue": data.fatigue,
                "muscle_soreness": data.muscle_soreness,
                "stress": data.stress,
                "mood": data.mood,
                "hydration": data.hydration or 5,
                "readiness_score": readiness_score,
                "notes": data.notes,
                "created_at": datetime.utcnow(),
                "submitted_via": "apple_review_token",
                "token_id": token_code,
            }
            
            await db.wellness.insert_one(wellness_record)
            
            # Generate feedback
            feedback = {
                "athlete_name": athlete["name"],
                "date": data.date,
                "readiness_score": readiness_score,
                "status": "optimal" if readiness_score >= 7 else "moderate" if readiness_score >= 5 else "low",
                "recommendations": []
            }
            
            if data.sleep_hours < 7:
                feedback["recommendations"].append("Tente dormir pelo menos 7-8 horas por noite")
            if data.sleep_quality < 6:
                feedback["recommendations"].append("Considere melhorar sua higiene do sono")
            if data.fatigue > 7:
                feedback["recommendations"].append("Nível de fadiga elevado - considere descanso extra")
            if data.muscle_soreness > 7:
                feedback["recommendations"].append("Dor muscular alta - considere recuperação ativa")
            if data.stress > 7:
                feedback["recommendations"].append("Nível de estresse alto - pratique técnicas de relaxamento")
            
            if not feedback["recommendations"]:
                feedback["recommendations"].append("Ótimo! Você está em boas condições!")
            
            return {
                "success": True,
                "message": "Questionário enviado com sucesso!",
                "feedback": feedback
            }
    # === FIM APPLE REVIEW TOKEN ===
    
    # Validate token
    token = await db.wellness_tokens.find_one({"token_id": token_code})
    
    if not token:
        raise HTTPException(status_code=404, detail="Token não encontrado")
    
    if token.get("status") != "active":
        raise HTTPException(status_code=400, detail="Token inativo")
    
    if datetime.utcnow() > token.get("expires_at"):
        await db.wellness_tokens.update_one(
            {"_id": token["_id"]},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=400, detail="Token expirado")
    
    if token.get("current_uses", 0) >= token.get("max_uses", 1):
        await db.wellness_tokens.update_one(
            {"_id": token["_id"]},
            {"$set": {"status": "inactive"}}
        )
        raise HTTPException(status_code=400, detail="Token atingiu limite de uso")
    
    # CRITICAL: Check if athlete already used this token
    existing_usage = await db.token_usage.find_one({
        "token_id": token_code,
        "athlete_id": data.athlete_id
    })
    
    if existing_usage:
        raise HTTPException(
            status_code=400, 
            detail="Você já respondeu este questionário."
        )
    
    # Verify athlete belongs to this coach
    athlete = await db.athletes.find_one({
        "_id": ObjectId(data.athlete_id),
        "coach_id": token["coach_id"]
    })
    
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta não encontrado")
    
    # Calculate readiness score
    readiness_score = round(
        (data.sleep_quality * 2 +
         (10 - data.fatigue) * 2 +
         (10 - data.muscle_soreness) * 1.5 +
         (10 - data.stress) * 1 +
         data.mood * 1.5) / 8, 1
    )
    
    # Create wellness record
    wellness_record = {
        "athlete_id": data.athlete_id,
        "coach_id": token["coach_id"],
        "date": data.date,
        "sleep_hours": data.sleep_hours,
        "sleep_quality": data.sleep_quality,
        "fatigue": data.fatigue,
        "muscle_soreness": data.muscle_soreness,
        "stress": data.stress,
        "mood": data.mood,
        "hydration": data.hydration or 5,
        "readiness_score": readiness_score,
        "notes": data.notes,
        "created_at": datetime.utcnow(),
        "submitted_via": "wellness_token",
        "token_id": token_code,
    }
    
    await db.wellness.insert_one(wellness_record)
    
    # Record usage in token_usage collection
    await db.token_usage.insert_one({
        "token_id": token_code,
        "athlete_id": data.athlete_id,
        "used_at": datetime.utcnow(),
    })
    
    # Increment current_uses
    new_uses = token.get("current_uses", 0) + 1
    update_data = {"current_uses": new_uses}
    
    # If max_uses reached, set status to inactive
    if new_uses >= token.get("max_uses", 1):
        update_data["status"] = "inactive"
    
    await db.wellness_tokens.update_one(
        {"_id": token["_id"]},
        {"$set": update_data}
    )
    
    # Generate feedback
    feedback = {
        "athlete_name": athlete["name"],
        "date": data.date,
        "readiness_score": readiness_score,
        "status": "optimal" if readiness_score >= 7 else "moderate" if readiness_score >= 5 else "low",
        "recommendations": []
    }
    
    if data.sleep_hours < 7:
        feedback["recommendations"].append("Tente dormir pelo menos 7-8 horas por noite")
    if data.sleep_quality < 6:
        feedback["recommendations"].append("Considere melhorar sua higiene do sono")
    if data.fatigue > 7:
        feedback["recommendations"].append("Nível de fadiga elevado - considere descanso extra")
    if data.muscle_soreness > 7:
        feedback["recommendations"].append("Dor muscular alta - considere recuperação ativa")
    if data.stress > 7:
        feedback["recommendations"].append("Nível de estresse alto - pratique técnicas de relaxamento")
    
    if not feedback["recommendations"]:
        feedback["recommendations"].append("Ótimo! Você está em boas condições!")
    
    return {
        "success": True,
        "message": "Questionário enviado com sucesso!",
        "feedback": feedback
    }

@router.get("/wellness/tokens")
async def get_coach_tokens(current_user: dict = Depends(get_current_user)):
    """Get all tokens for the current coach"""
    tokens = await db.wellness_tokens.find({
        "coach_id": str(current_user["_id"])
    }).sort("created_at", -1).to_list(100)
    
    result = []
    now = datetime.utcnow()
    
    for token in tokens:
        # Auto-update expired tokens
        if token.get("status") == "active" and now > token.get("expires_at"):
            await db.wellness_tokens.update_one(
                {"_id": token["_id"]},
                {"$set": {"status": "expired"}}
            )
            token["status"] = "expired"
        
        result.append({
            "token_id": token["token_id"],
            "max_uses": token["max_uses"],
            "current_uses": token.get("current_uses", 0),
            "expires_at": token["expires_at"].isoformat(),
            "status": token["status"],
            "created_at": token["created_at"].isoformat(),
        })
    
    return result

# ============= LEGACY PUBLIC WELLNESS ROUTES (keeping for backwards compatibility) =============

class WellnessLinkCreate(BaseModel):
    coach_id: str
    expires_days: int = 7

class WellnessLink(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    coach_id: str
    link_token: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    is_active: bool = True
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class PublicWellnessSubmit(BaseModel):
    athlete_id: str
    date: str
    sleep_hours: float
    sleep_quality: int  # 1-10
    fatigue: int  # 1-10
    muscle_soreness: int  # 1-10
    stress: int  # 1-10
    mood: int  # 1-10
    hydration: Optional[int] = None  # 1-10
    nutrition: Optional[int] = None  # 1-10
    notes: Optional[str] = None

@router.post("/wellness/generate-link")
async def generate_wellness_link(
    expires_hours: float = 24,
    current_user: dict = Depends(get_current_user)
):
    """Generate a shareable link for athletes to submit wellness questionnaires
    
    expires_hours: Duration in hours (0.5 = 30min, 2, 8, 24)
    """
    import secrets
    
    link_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=expires_hours)
    
    wellness_link = WellnessLink(
        coach_id=current_user["_id"],
        link_token=link_token,
        expires_at=expires_at
    )
    
    result = await db.wellness_links.insert_one(wellness_link.model_dump(by_alias=True, exclude=["id"]))
    wellness_link.id = str(result.inserted_id)
    
    return {
        "link_token": link_token,
        "expires_at": expires_at.isoformat(),
        "share_url": f"/wellness-form/{link_token}"
    }

@router.get("/wellness/public/{link_token}/athletes")
async def get_athletes_for_wellness_link(link_token: str):
    """Get list of athletes for a wellness link (public, no auth required)"""
    # Verify link is valid
    link = await db.wellness_links.find_one({
        "link_token": link_token,
        "is_active": True,
        "expires_at": {"$gte": datetime.utcnow()}
    })
    
    if not link:
        raise HTTPException(status_code=404, detail="Link inválido ou expirado")
    
    # Get athletes for this coach
    athletes = await db.athletes.find({
        "coach_id": link["coach_id"]
    }).to_list(1000)
    
    # Return only names and IDs
    return [{"id": str(a["_id"]), "name": a["name"]} for a in athletes]

@router.post("/wellness/public/{link_token}/submit")
async def submit_public_wellness(
    link_token: str,
    wellness_data: PublicWellnessSubmit
):
    """Submit wellness questionnaire via public link (no auth required)"""
    # Verify link is valid
    link = await db.wellness_links.find_one({
        "link_token": link_token,
        "is_active": True,
        "expires_at": {"$gte": datetime.utcnow()}
    })
    
    if not link:
        raise HTTPException(status_code=404, detail="Link inválido ou expirado")
    
    # Verify athlete belongs to this coach
    athlete = await db.athletes.find_one({
        "_id": ObjectId(wellness_data.athlete_id),
        "coach_id": link["coach_id"]
    })
    
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta não encontrado")
    
    # Calculate readiness score
    readiness_score = round(
        (wellness_data.sleep_quality * 2 +
         (10 - wellness_data.fatigue) * 2 +
         (10 - wellness_data.muscle_soreness) * 1.5 +
         (10 - wellness_data.stress) * 1 +
         wellness_data.mood * 1.5) / 8, 1
    )
    
    # Create wellness record
    wellness_record = {
        "athlete_id": wellness_data.athlete_id,
        "coach_id": link["coach_id"],
        "date": wellness_data.date,
        "sleep_hours": wellness_data.sleep_hours,
        "sleep_quality": wellness_data.sleep_quality,
        "fatigue": wellness_data.fatigue,
        "muscle_soreness": wellness_data.muscle_soreness,
        "stress": wellness_data.stress,
        "mood": wellness_data.mood,
        "hydration": wellness_data.hydration,
        "nutrition": wellness_data.nutrition,
        "readiness_score": readiness_score,
        "notes": wellness_data.notes,
        "created_at": datetime.utcnow(),
        "submitted_via": "public_link"
    }
    
    result = await db.wellness.insert_one(wellness_record)
    
    # Generate feedback report for the athlete
    feedback = {
        "athlete_name": athlete["name"],
        "date": wellness_data.date,
        "readiness_score": readiness_score,
        "status": "optimal" if readiness_score >= 7 else "moderate" if readiness_score >= 5 else "low",
        "recommendations": []
    }
    
    if wellness_data.sleep_hours < 7:
        feedback["recommendations"].append("Tente dormir pelo menos 7-8 horas por noite")
    if wellness_data.sleep_quality < 6:
        feedback["recommendations"].append("Considere melhorar sua higiene do sono")
    if wellness_data.fatigue > 7:
        feedback["recommendations"].append("Nível de fadiga elevado - considere descanso extra")
    if wellness_data.muscle_soreness > 7:
        feedback["recommendations"].append("Dor muscular alta - considere recuperação ativa")
    if wellness_data.stress > 7:
        feedback["recommendations"].append("Nível de estresse alto - pratique técnicas de relaxamento")
    
    if not feedback["recommendations"]:
        feedback["recommendations"].append("Ótimo! Você está em boas condições!")
    
    return {
        "success": True,
        "message": "Questionário enviado com sucesso!",
        "feedback": feedback
    }

