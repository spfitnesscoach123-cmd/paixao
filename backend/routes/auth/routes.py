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


router = APIRouter(tags=["Auth"])

# ============= MODELS =============

class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate
    
    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return str(v)

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    platform: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    platform: Optional[str] = None

class RegisteredDevice(BaseModel):
    device_id: str
    device_name: str
    platform: str
    last_login: datetime

MAX_DEVICES_PER_USER = 3

# ============= ACCOUNT DELETION STATUS =============

class AccountDeletionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    DELETED = "DELETED"

class User(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email: EmailStr
    name: str
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str = "coach"  # Padrão é coach (quem faz login no app)
    pro_access_override: bool = False  # Override permanente de acesso PRO
    account_deletion_status: str = "ACTIVE"  # Status de exclusão da conta
    deletion_scheduled_for: Optional[str] = None  # Data agendada para exclusão
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class AthleteCreate(BaseModel):
    name: str
    birth_date: str
    position: str
    height: Optional[float] = None  # in cm
    weight: Optional[float] = None  # in kg
    photo_base64: Optional[str] = None

class AthleteUpdate(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[str] = None
    position: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    photo_base64: Optional[str] = None

class Athlete(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    coach_id: str
    name: str
    birth_date: str
    position: str
    height: Optional[float] = None
    weight: Optional[float] = None
    photo_base64: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class GPSDataCreate(BaseModel):
    athlete_id: str
    date: str
    session_id: Optional[str] = None  # Unique ID for each CSV upload/session
    session_name: Optional[str] = None  # Name of the session (e.g., "Match vs Team X")
    period_name: Optional[str] = None  # Period within session (1st Half, 2nd Half, Session)
    activity_type: Optional[str] = None  # "game" or "training"
    total_distance: float  # meters
    high_intensity_distance: float  # HID 14.4-19.8 km/h in meters
    high_speed_running: Optional[float] = None  # HSR 19.8-25.2 km/h in meters  
    sprint_distance: float  # 25.3+ km/h in meters
    number_of_sprints: int
    number_of_accelerations: int
    number_of_decelerations: int
    max_speed: Optional[float] = None  # km/h
    max_acceleration: Optional[float] = None
    max_deceleration: Optional[float] = None
    notes: Optional[str] = None

class GPSData(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str
    coach_id: str
    date: str
    session_id: Optional[str] = None
    session_name: Optional[str] = None
    period_name: Optional[str] = None
    activity_type: Optional[str] = None  # "game" or "training"
    total_distance: float
    high_intensity_distance: float = 0
    high_speed_running: Optional[float] = None
    sprint_distance: Optional[float] = 0
    number_of_sprints: int = 0
    number_of_accelerations: Optional[int] = 0
    number_of_decelerations: Optional[int] = 0
    max_speed: Optional[float] = None
    max_acceleration: Optional[float] = None
    max_deceleration: Optional[float] = None
    player_load: Optional[float] = None
    duration_minutes: Optional[float] = None
    distance_per_min: Optional[float] = None
    source: Optional[str] = None
    device: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class WellnessQuestionnaireCreate(BaseModel):
    athlete_id: str
    date: str
    fatigue: int  # 1-10 scale
    stress: int  # 1-10 scale
    mood: int  # 1-10 scale
    sleep_quality: int  # 1-10 scale
    sleep_hours: float
    muscle_soreness: int  # 1-10 scale
    hydration: int  # 1-10 scale
    notes: Optional[str] = None

class WellnessQuestionnaire(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str
    coach_id: str
    date: str
    fatigue: int
    stress: int
    mood: int
    sleep_quality: int
    sleep_hours: float
    muscle_soreness: int
    hydration: Optional[int] = 5  # Default to 5 if missing
    wellness_score: Optional[float] = None  # Calculated score
    readiness_score: Optional[float] = None  # Calculated score
    notes: Optional[str] = None
    submitted_via: Optional[str] = None  # Track submission source
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class PhysicalAssessmentCreate(BaseModel):
    athlete_id: str
    date: str
    assessment_type: str  # "strength", "aerobic", "body_composition"
    metrics: Dict[str, Any]  # Flexible structure for different assessment types
    notes: Optional[str] = None

class PhysicalAssessment(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str
    coach_id: str
    date: str
    assessment_type: str
    metrics: Dict[str, Any]
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# ============= BODY COMPOSITION MODELS =============

class BodyCompositionProtocol(str, Enum):
    GUEDES = "guedes"
    GUEDES_1985 = "guedes_1985"
    POLLOCK_JACKSON_7 = "pollock_jackson_7"
    JACKSON_POLLOCK_7 = "jackson_pollock_7"
    JACKSON_POLLOCK_3 = "jackson_pollock_3"
    POLLOCK_JACKSON_9 = "pollock_jackson_9"
    FAULKNER_4 = "faulkner_4"
    FAULKNER = "faulkner"
    DURNIN_WOMERSLEY = "durnin_womersley"

class BodyCompositionCreate(BaseModel):
    athlete_id: str
    date: str
    protocol: BodyCompositionProtocol
    weight: float  # kg
    height: float  # cm
    age: int
    gender: str  # "male" or "female"
    # Skinfold measurements in mm
    triceps: Optional[float] = None
    subscapular: Optional[float] = None
    suprailiac: Optional[float] = None
    abdominal: Optional[float] = None
    chest: Optional[float] = None
    midaxillary: Optional[float] = None
    thigh: Optional[float] = None
    calf: Optional[float] = None
    biceps: Optional[float] = None
    notes: Optional[str] = None

class BodyComposition(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str
    coach_id: str
    date: str
    protocol: str
    weight: float
    height: float
    age: int
    gender: str
    # Skinfold measurements
    triceps: Optional[float] = None
    subscapular: Optional[float] = None
    suprailiac: Optional[float] = None
    abdominal: Optional[float] = None
    chest: Optional[float] = None
    midaxillary: Optional[float] = None
    thigh: Optional[float] = None
    calf: Optional[float] = None
    biceps: Optional[float] = None
    # Calculated values
    body_fat_percentage: float
    lean_mass_kg: float  # Massa Isenta de Gordura
    fat_mass_kg: float  # Massa de Gordura
    bone_mass_kg: float  # Massa Óssea (estimated)
    bmi: float  # Body Mass Index
    bmi_classification: str
    body_density: Optional[float] = None
    fat_distribution: Optional[Dict[str, float]] = None  # For 3D visualization
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# ============= SUBSCRIPTION MODELS =============

class SubscriptionPlan(str, Enum):
    FREE_TRIAL = "free_trial"
    PRO = "pro"

class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    TRIAL = "trial"
    EXPIRED = "expired"
    CANCELLED = "cancelled"

# Plan limits configuration with regional pricing
PLAN_LIMITS = {
    "free_trial": {
        "name": "Trial Grátis",
        "name_en": "Free Trial",
        "price_brl": 0,
        "price_usd": 0,
        "max_athletes": 999,  # Unlimited during trial
        "history_months": -1,  # Unlimited
        "features": ["all"],  # All features during trial
        "trial_days": 7,
        "advanced_analytics": True,
        "ai_insights": True,
        "fatigue_alerts": True,
        "vbt_analysis": True,
        "body_composition": True,
        "body_3d_model": True,
        "multi_user": True,
        "max_users": 5,
        "description_pt": "Experimente todas as funcionalidades por 7 dias grátis",
        "description_en": "Try all features free for 7 days",
    },
    "pro": {
        "name": "Pro",
        "name_en": "Pro",
        "price_brl": 199.00,
        "price_usd": 39.99,
        "max_athletes": -1,  # Unlimited
        "history_months": -1,  # Unlimited
        "features": ["all"],
        "trial_days": 7,
        "billing_period_days": 30,  # Monthly auto-renewal
        "auto_renew": True,
        "advanced_analytics": True,
        "ai_insights": True,
        "fatigue_alerts": True,
        "vbt_analysis": True,
        "body_composition": True,
        "body_3d_model": True,
        "multi_user": True,
        "max_users": 5,
        "priority_support": True,
        "popular": True,
        "description_pt": "Acesso completo a todas as funcionalidades do Load Manager. Renovação automática mensal.",
        "description_en": "Full access to all Load Manager features. Auto-renews monthly.",
        "features_list_pt": [
            "Atletas ilimitados",
            "Histórico ilimitado",
            "VBT - Velocity Based Training",
            "Composição Corporal completa",
            "Modelo 3D do corpo humano",
            "Insights gerados por IA",
            "ACWR detalhado por métrica",
            "Comparação entre atletas",
            "Alertas de fadiga inteligentes",
            "Exportação PDF e CSV",
            "Até 5 usuários simultâneos",
            "Suporte prioritário",
            "Integração GPS - Catapult* (Playertek / Statsport) Em breve"
        ],
        "features_list_en": [
            "Unlimited athletes",
            "Unlimited history",
            "VBT - Velocity Based Training",
            "Full Body Composition",
            "3D human body model",
            "AI-generated insights",
            "Detailed ACWR by metric",
            "Athlete comparison",
            "Smart fatigue alerts",
            "PDF and CSV export",
            "Up to 5 simultaneous users",
            "Priority support",
            "GPS Integration - Catapult* (Playertek / Statsport) Coming soon"
        ],
        "limitations_pt": [],
        "limitations_en": []
    },
}

class SubscriptionCreate(BaseModel):
    plan: SubscriptionPlan
    payment_method: Optional[str] = None

class Subscription(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    plan: str
    status: str
    start_date: datetime
    trial_end_date: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

class SubscriptionResponse(BaseModel):
    plan: str
    plan_name: str
    status: str
    price: float
    max_athletes: int
    current_athletes: int
    history_months: int
    days_remaining: Optional[int] = None
    trial_end_date: Optional[str] = None
    features: dict
    limits_reached: dict

# ============= AUTH HELPERS =============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        user["_id"] = str(user["_id"])
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

# ============= AUTH ROUTES =============

@router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user with device info
    user_doc = {
        "email": user_data.email,
        "name": user_data.name,
        "hashed_password": hash_password(user_data.password),
        "created_at": datetime.utcnow(),
        "registered_devices": []
    }
    
    # Add first device if provided
    if user_data.device_id:
        user_doc["registered_devices"].append({
            "device_id": user_data.device_id,
            "device_name": user_data.device_name or "Unknown Device",
            "platform": user_data.platform or "Unknown",
            "last_login": datetime.utcnow()
        })
    
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create access token
    access_token = create_access_token(data={"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            name=user_data.name,
            role="coach",  # Novos usuários são sempre coach
            pro_access_override=False,  # Novos usuários não têm override
            created_at=user_doc["created_at"]
        )
    )

@router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    # Find user
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if account is deleted
    if user.get("account_deletion_status") == AccountDeletionStatus.DELETED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ACCOUNT_DELETED"
        )
    
    user_id = str(user["_id"])
    
    # Device limit enforcement
    if credentials.device_id:
        registered_devices = user.get("registered_devices", [])
        device_exists = False
        
        # Check if device already exists
        for i, device in enumerate(registered_devices):
            if device.get("device_id") == credentials.device_id:
                device_exists = True
                # Update last_login timestamp
                registered_devices[i]["last_login"] = datetime.utcnow()
                await db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {"registered_devices": registered_devices}}
                )
                break
        
        if not device_exists:
            # Check device limit (bypass for demo account)
            if user.get("email") == "contato@loadmanagerpro.com.br":
                # Demo account: bypass device limit completely
                pass
            elif len(registered_devices) >= MAX_DEVICES_PER_USER:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="DEVICE_LIMIT_REACHED"
                )
            
            # Add new device
            new_device = {
                "device_id": credentials.device_id,
                "device_name": credentials.device_name or "Unknown Device",
                "platform": credentials.platform or "Unknown",
                "last_login": datetime.utcnow()
            }
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$push": {"registered_devices": new_device}}
            )
    
    access_token = create_access_token(data={"sub": user_id})
    
    # Format deletion_scheduled_for if exists
    deletion_scheduled = user.get("deletion_scheduled_for")
    deletion_scheduled_str = deletion_scheduled.isoformat() if deletion_scheduled else None
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user["email"],
            name=user["name"],
            role=user.get("role", "coach"),
            pro_access_override=user.get("pro_access_override", False),
            account_deletion_status=user.get("account_deletion_status", "ACTIVE"),
            deletion_scheduled_for=deletion_scheduled_str,
            created_at=user["created_at"]
        )
    )

@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    deletion_scheduled = current_user.get("deletion_scheduled_for")
    deletion_scheduled_str = deletion_scheduled.isoformat() if deletion_scheduled else None
    
    return UserResponse(
        id=current_user["_id"],
        email=current_user["email"],
        name=current_user["name"],
        role=current_user.get("role", "coach"),
        pro_access_override=current_user.get("pro_access_override", False),
        account_deletion_status=current_user.get("account_deletion_status", "ACTIVE"),
        deletion_scheduled_for=deletion_scheduled_str,
        created_at=current_user["created_at"]
    )

# ============= DEVICE MANAGEMENT =============

@router.get("/auth/devices")
async def get_registered_devices(current_user: dict = Depends(get_current_user)):
    """Get list of registered devices for current user"""
    devices = current_user.get("registered_devices", [])
    return {
        "devices": [
            {
                "device_id": d.get("device_id"),
                "device_name": d.get("device_name"),
                "platform": d.get("platform"),
                "last_login": d.get("last_login").isoformat() if d.get("last_login") else None
            }
            for d in devices
        ],
        "count": len(devices),
        "max_devices": MAX_DEVICES_PER_USER
    }

@router.delete("/auth/devices/{device_id}")
async def remove_device(device_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a registered device from current user"""
    devices = current_user.get("registered_devices", [])
    
    # Find device
    device_exists = False
    for d in devices:
        if d.get("device_id") == device_id:
            device_exists = True
            break
    
    if not device_exists:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Remove device
    await db.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$pull": {"registered_devices": {"device_id": device_id}}}
    )
    
    return {"message": "Device removed successfully", "device_id": device_id}

class UpdateProfileRequest(BaseModel):
    name: str

@router.put("/auth/profile", response_model=UserResponse)
async def update_profile(request: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    """Update user profile"""
    await db.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$set": {"name": request.name}}
    )
    
    updated_user = await db.users.find_one({"_id": ObjectId(current_user["_id"])})
    return UserResponse(
        id=str(updated_user["_id"]),
        email=updated_user["email"],
        name=updated_user["name"],
        created_at=updated_user["created_at"]
    )

# ============= PASSWORD RECOVERY =============

class VerifyEmailRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str

@router.post("/auth/verify-email")
async def verify_email(request: VerifyEmailRequest):
    """Check if email exists in the system"""
    user = await db.users.find_one({"email": request.email})
    return {"exists": user is not None}

@router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset user password"""
    user = await db.users.find_one({"email": request.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found"
        )
    
    # Update password
    new_hashed_password = hash_password(request.new_password)
    await db.users.update_one(
        {"email": request.email},
        {"$set": {"hashed_password": new_hashed_password}}
    )
    
    return {"message": "Password reset successfully"}

