from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
import bcrypt
import jwt
from bson import ObjectId
import uuid
from io import BytesIO
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

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

class UserLogin(BaseModel):
    email: EmailStr
    password: str

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
    POLLOCK_JACKSON_7 = "pollock_jackson_7"
    POLLOCK_JACKSON_9 = "pollock_jackson_9"  # 9 skinfolds
    FAULKNER_4 = "faulkner_4"

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

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    user = User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=hash_password(user_data.password)
    )
    
    result = await db.users.insert_one(user.model_dump(by_alias=True, exclude=["id"]))
    user_id = str(result.inserted_id)
    
    # Create access token
    access_token = create_access_token(data={"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user.email,
            name=user.name,
            created_at=user.created_at
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    # Find user
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    user_id = str(user["_id"])
    access_token = create_access_token(data={"sub": user_id})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user["email"],
            name=user["name"],
            created_at=user["created_at"]
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["_id"],
        email=current_user["email"],
        name=current_user["name"],
        created_at=current_user["created_at"]
    )

# ============= PASSWORD RECOVERY =============

class VerifyEmailRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str

@api_router.post("/auth/verify-email")
async def verify_email(request: VerifyEmailRequest):
    """Check if email exists in the system"""
    user = await db.users.find_one({"email": request.email})
    return {"exists": user is not None}

@api_router.post("/auth/reset-password")
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

# ============= ATHLETE ROUTES =============

@api_router.post("/athletes", response_model=Athlete)
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

@api_router.get("/athletes", response_model=List[Athlete])
async def get_athletes(current_user: dict = Depends(get_current_user)):
    athletes = await db.athletes.find({"coach_id": current_user["_id"]}).to_list(1000)
    for athlete in athletes:
        athlete["_id"] = str(athlete["_id"])
    return [Athlete(**athlete) for athlete in athletes]

@api_router.get("/athletes/{athlete_id}", response_model=Athlete)
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

@api_router.put("/athletes/{athlete_id}", response_model=Athlete)
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

@api_router.delete("/athletes/{athlete_id}")
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
    return {"message": "Athlete deleted successfully"}

# ============= GPS DATA ROUTES =============

@api_router.post("/gps-data", response_model=GPSData)
async def create_gps_data(
    gps_data: GPSDataCreate,
    current_user: dict = Depends(get_current_user)
):
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(gps_data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    gps = GPSData(
        coach_id=current_user["_id"],
        **gps_data.model_dump()
    )
    
    result = await db.gps_data.insert_one(gps.model_dump(by_alias=True, exclude=["id"]))
    gps.id = str(result.inserted_id)
    return gps

@api_router.get("/gps-data/athlete/{athlete_id}", response_model=List[GPSData])
async def get_athlete_gps_data(
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
    
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(1000)
    
    for record in gps_records:
        record["_id"] = str(record["_id"])
    return [GPSData(**record) for record in gps_records]

@api_router.get("/gps-data/athlete/{athlete_id}/sessions")
async def get_athlete_sessions(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get GPS data grouped by sessions (aggregated from periods)"""
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(1000)
    
    # Group by session_id or by date if no session_id
    sessions = {}
    for record in gps_records:
        session_key = record.get("session_id") or record.get("date", "unknown")
        
        if session_key not in sessions:
            sessions[session_key] = {
                "session_id": session_key,
                "session_name": record.get("session_name", f"Sessão {record.get('date', 'N/A')}"),
                "date": record.get("date"),
                "periods": [],
                "totals": {
                    "total_distance": 0,
                    "high_intensity_distance": 0,
                    "high_speed_running": 0,
                    "sprint_distance": 0,
                    "number_of_sprints": 0,
                    "number_of_accelerations": 0,
                    "number_of_decelerations": 0,
                },
                "max_speed": 0,
                "max_acceleration": 0,
                "max_deceleration": 0,
            }
        
        period_name = record.get("period_name") or record.get("notes", "").replace("Período: ", "") or "Full Session"
        sessions[session_key]["periods"].append({
            "period_name": period_name,
            "total_distance": record.get("total_distance", 0),
            "high_intensity_distance": record.get("high_intensity_distance", 0),
            "high_speed_running": record.get("high_speed_running", 0),
            "sprint_distance": record.get("sprint_distance", 0),
            "number_of_sprints": record.get("number_of_sprints", 0),
            "number_of_accelerations": record.get("number_of_accelerations", 0),
            "number_of_decelerations": record.get("number_of_decelerations", 0),
            "max_speed": record.get("max_speed", 0),
        })
        
        # Sum totals (for periods that are not "Session" to avoid double counting)
        period_lower = period_name.lower()
        if "session" not in period_lower and "total" not in period_lower:
            sessions[session_key]["totals"]["total_distance"] += record.get("total_distance", 0)
            sessions[session_key]["totals"]["high_intensity_distance"] += record.get("high_intensity_distance", 0)
            sessions[session_key]["totals"]["high_speed_running"] += record.get("high_speed_running", 0) or 0
            sessions[session_key]["totals"]["sprint_distance"] += record.get("sprint_distance", 0)
            sessions[session_key]["totals"]["number_of_sprints"] += record.get("number_of_sprints", 0)
            sessions[session_key]["totals"]["number_of_accelerations"] += record.get("number_of_accelerations", 0)
            sessions[session_key]["totals"]["number_of_decelerations"] += record.get("number_of_decelerations", 0)
        elif len(sessions[session_key]["periods"]) == 1:
            # If this is the only period (Session/Total), use its values
            sessions[session_key]["totals"]["total_distance"] = record.get("total_distance", 0)
            sessions[session_key]["totals"]["high_intensity_distance"] = record.get("high_intensity_distance", 0)
            sessions[session_key]["totals"]["high_speed_running"] = record.get("high_speed_running", 0) or 0
            sessions[session_key]["totals"]["sprint_distance"] = record.get("sprint_distance", 0)
            sessions[session_key]["totals"]["number_of_sprints"] = record.get("number_of_sprints", 0)
            sessions[session_key]["totals"]["number_of_accelerations"] = record.get("number_of_accelerations", 0)
            sessions[session_key]["totals"]["number_of_decelerations"] = record.get("number_of_decelerations", 0)
        
        # Track max values
        if record.get("max_speed", 0) > sessions[session_key]["max_speed"]:
            sessions[session_key]["max_speed"] = record.get("max_speed", 0)
        if record.get("max_acceleration", 0) > sessions[session_key]["max_acceleration"]:
            sessions[session_key]["max_acceleration"] = record.get("max_acceleration", 0)
        if record.get("max_deceleration", 0) > sessions[session_key]["max_deceleration"]:
            sessions[session_key]["max_deceleration"] = record.get("max_deceleration", 0)
    
    return list(sessions.values())


class ActivityTypeUpdate(BaseModel):
    activity_type: str  # "game" or "training"


@api_router.put("/gps-data/session/{session_id}/activity-type")
async def update_session_activity_type(
    session_id: str,
    data: ActivityTypeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update the activity type (game/training) for all periods in a session"""
    if data.activity_type not in ["game", "training"]:
        raise HTTPException(status_code=400, detail="activity_type must be 'game' or 'training'")
    
    # Update all GPS records with this session_id
    result = await db.gps_data.update_many(
        {
            "session_id": session_id,
            "coach_id": current_user["_id"]
        },
        {"$set": {"activity_type": data.activity_type}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Session not found or no records updated")
    
    return {
        "message": "Activity type updated successfully",
        "session_id": session_id,
        "activity_type": data.activity_type,
        "records_updated": result.modified_count
    }


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

@api_router.post("/wellness", response_model=WellnessQuestionnaire)
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

@api_router.get("/wellness/athlete/{athlete_id}", response_model=List[WellnessQuestionnaire])
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
    }).sort("date", -1).to_list(1000)
    
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

# ============= PUBLIC WELLNESS ROUTES (for athletes without login) =============

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

@api_router.post("/wellness/generate-link")
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

@api_router.get("/wellness/public/{link_token}/athletes")
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

@api_router.post("/wellness/public/{link_token}/submit")
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

# ============= PHYSICAL ASSESSMENT ROUTES =============

@api_router.post("/assessments", response_model=PhysicalAssessment)
async def create_assessment(
    assessment_data: PhysicalAssessmentCreate,
    current_user: dict = Depends(get_current_user)
):
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(assessment_data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    assessment = PhysicalAssessment(
        coach_id=current_user["_id"],
        **assessment_data.model_dump()
    )
    
    result = await db.assessments.insert_one(assessment.model_dump(by_alias=True, exclude=["id"]))
    assessment.id = str(result.inserted_id)
    return assessment

@api_router.get("/assessments/athlete/{athlete_id}", response_model=List[PhysicalAssessment])
async def get_athlete_assessments(
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
    
    assessments = await db.assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(1000)
    
    for record in assessments:
        record["_id"] = str(record["_id"])
    return [PhysicalAssessment(**record) for record in assessments]

# ============= BODY COMPOSITION CALCULATIONS =============

def calculate_body_density_pollock_jackson_7(gender: str, age: int, skinfolds: dict) -> float:
    """
    Pollock & Jackson 7 Skinfold Protocol
    Males: chest, midaxillary, triceps, subscapular, abdominal, suprailiac, thigh
    Females: triceps, thigh, suprailiac, abdominal, chest, midaxillary, subscapular
    """
    sum_7 = (
        skinfolds.get('chest', 0) +
        skinfolds.get('midaxillary', 0) +
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('abdominal', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('thigh', 0)
    )
    
    if gender.lower() == 'male':
        # Jackson & Pollock (1978) equation for men
        density = 1.112 - (0.00043499 * sum_7) + (0.00000055 * sum_7**2) - (0.00028826 * age)
    else:
        # Jackson, Pollock & Ward (1980) equation for women
        density = 1.097 - (0.00046971 * sum_7) + (0.00000056 * sum_7**2) - (0.00012828 * age)
    
    return density

def calculate_body_density_pollock_jackson_9(gender: str, age: int, skinfolds: dict) -> float:
    """
    Pollock & Jackson 9 Skinfold Protocol (more comprehensive)
    All 9 sites: chest, midaxillary, triceps, subscapular, abdominal, suprailiac, thigh, biceps, calf
    """
    sum_9 = (
        skinfolds.get('chest', 0) +
        skinfolds.get('midaxillary', 0) +
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('abdominal', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('thigh', 0) +
        skinfolds.get('biceps', 0) +
        skinfolds.get('calf', 0)
    )
    
    if gender.lower() == 'male':
        # Extended equation for 9 sites - males
        density = 1.1125 - (0.0004 * sum_9) + (0.0000005 * sum_9**2) - (0.00029 * age)
    else:
        # Extended equation for 9 sites - females
        density = 1.099 - (0.00043 * sum_9) + (0.00000054 * sum_9**2) - (0.00013 * age)
    
    return density

def calculate_body_density_guedes(gender: str, skinfolds: dict) -> float:
    """
    Guedes Protocol (1985) - Brazilian validated protocol
    Males: triceps, suprailiac, abdominal
    Females: triceps, suprailiac, thigh
    
    Uses log10 transformation for better accuracy
    Reference: Guedes, D.P. (1985). Estudo da gordura corporal através da mensuração dos valores de densidade corporal e da espessura de dobras cutâneas em universitários.
    """
    import math
    
    if gender.lower() == 'male':
        sum_3 = (
            skinfolds.get('triceps', 0) +
            skinfolds.get('suprailiac', 0) +
            skinfolds.get('abdominal', 0)
        )
        # Guedes male equation using log transformation
        # BD = 1.1714 - 0.0671 * log10(sum_3)
        if sum_3 > 0:
            density = 1.1714 - (0.0671 * math.log10(sum_3))
        else:
            density = 1.0
    else:
        sum_3 = (
            skinfolds.get('triceps', 0) +
            skinfolds.get('suprailiac', 0) +
            skinfolds.get('thigh', 0)
        )
        # Guedes female equation using log transformation
        # BD = 1.1665 - 0.0706 * log10(sum_3)
        if sum_3 > 0:
            density = 1.1665 - (0.0706 * math.log10(sum_3))
        else:
            density = 1.0
    
    return density

def calculate_body_fat_faulkner(skinfolds: dict) -> float:
    """
    Faulkner 4 Skinfold Protocol (1968)
    Used for athletes, especially swimmers
    Sites: triceps, subscapular, suprailiac, abdominal
    """
    sum_4 = (
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('abdominal', 0)
    )
    
    # Faulkner equation (direct %BF calculation)
    body_fat = (sum_4 * 0.153) + 5.783
    return body_fat

def siri_equation(density: float) -> float:
    """Convert body density to body fat percentage using Siri equation (1961)"""
    return (495 / density) - 450

def calculate_bmi(weight_kg: float, height_cm: float) -> tuple:
    """Calculate BMI and return classification"""
    height_m = height_cm / 100
    bmi = weight_kg / (height_m ** 2)
    
    if bmi < 18.5:
        classification = "underweight"
    elif bmi < 25:
        classification = "normal"
    elif bmi < 30:
        classification = "overweight"
    elif bmi < 35:
        classification = "obese_class_1"
    elif bmi < 40:
        classification = "obese_class_2"
    else:
        classification = "obese_class_3"
    
    return round(bmi, 2), classification

def estimate_bone_mass(weight_kg: float, height_cm: float, gender: str) -> float:
    """Estimate bone mass using Martin formula approximation"""
    # Simplified bone mass estimation (approx 15% of lean mass, which is ~12-15% of body weight for athletes)
    base_factor = 0.035 if gender.lower() == 'male' else 0.030
    bone_mass = weight_kg * base_factor * (height_cm / 170)
    return round(bone_mass, 2)

def calculate_fat_distribution(skinfolds: dict) -> dict:
    """
    Calculate fat distribution for 3D body visualization
    Returns normalized percentages for different body regions
    """
    total = sum(v for v in skinfolds.values() if v)
    if total == 0:
        return {}
    
    distribution = {}
    regions = {
        'upper_arm': ['triceps', 'biceps'],
        'trunk_front': ['chest', 'abdominal'],
        'trunk_back': ['subscapular', 'midaxillary'],
        'hip_waist': ['suprailiac'],
        'lower_body': ['thigh', 'calf']
    }
    
    for region, sites in regions.items():
        region_sum = sum(skinfolds.get(site, 0) for site in sites)
        distribution[region] = round((region_sum / total) * 100, 1) if total > 0 else 0
    
    return distribution

def get_bmi_classification_text(classification: str, lang: str = 'pt') -> str:
    """Get BMI classification text in specified language"""
    classifications = {
        'pt': {
            'underweight': 'Abaixo do peso',
            'normal': 'Peso normal',
            'overweight': 'Sobrepeso',
            'obese_class_1': 'Obesidade Grau I',
            'obese_class_2': 'Obesidade Grau II',
            'obese_class_3': 'Obesidade Grau III'
        },
        'en': {
            'underweight': 'Underweight',
            'normal': 'Normal weight',
            'overweight': 'Overweight',
            'obese_class_1': 'Obesity Class I',
            'obese_class_2': 'Obesity Class II',
            'obese_class_3': 'Obesity Class III'
        }
    }
    return classifications.get(lang, classifications['pt']).get(classification, classification)

# ============= BODY COMPOSITION ENDPOINTS =============

@api_router.get("/body-composition/protocols")
async def get_body_composition_protocols(lang: str = "pt"):
    """Get available body composition protocols with descriptions"""
    protocols = {
        "guedes": {
            "name": "Guedes (1985)",
            "name_en": "Guedes (1985)",
            "description_pt": "Protocolo validado para população brasileira. Usa 3 dobras cutâneas.",
            "description_en": "Protocol validated for Brazilian population. Uses 3 skinfolds.",
            "sites_male": ["triceps", "suprailiac", "abdominal"],
            "sites_female": ["triceps", "suprailiac", "thigh"],
            "sites_count": 3
        },
        "pollock_jackson_7": {
            "name": "Pollock & Jackson 7 Dobras",
            "name_en": "Pollock & Jackson 7 Skinfolds",
            "description_pt": "Protocolo de 7 dobras, altamente preciso para atletas.",
            "description_en": "7 skinfold protocol, highly accurate for athletes.",
            "sites": ["chest", "midaxillary", "triceps", "subscapular", "abdominal", "suprailiac", "thigh"],
            "sites_count": 7
        },
        "pollock_jackson_9": {
            "name": "Pollock & Jackson 9 Dobras",
            "name_en": "Pollock & Jackson 9 Skinfolds",
            "description_pt": "Protocolo mais completo com 9 dobras cutâneas.",
            "description_en": "Most comprehensive protocol with 9 skinfolds.",
            "sites": ["chest", "midaxillary", "triceps", "subscapular", "abdominal", "suprailiac", "thigh", "biceps", "calf"],
            "sites_count": 9
        },
        "faulkner_4": {
            "name": "Faulkner 4 Dobras",
            "name_en": "Faulkner 4 Skinfolds",
            "description_pt": "Protocolo simplificado para atletas, especialmente nadadores.",
            "description_en": "Simplified protocol for athletes, especially swimmers.",
            "sites": ["triceps", "subscapular", "suprailiac", "abdominal"],
            "sites_count": 4
        }
    }
    return protocols

@api_router.post("/body-composition", response_model=BodyComposition)
async def create_body_composition(
    data: BodyCompositionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new body composition assessment"""
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Collect skinfolds
    skinfolds = {
        'triceps': data.triceps or 0,
        'subscapular': data.subscapular or 0,
        'suprailiac': data.suprailiac or 0,
        'abdominal': data.abdominal or 0,
        'chest': data.chest or 0,
        'midaxillary': data.midaxillary or 0,
        'thigh': data.thigh or 0,
        'calf': data.calf or 0,
        'biceps': data.biceps or 0,
    }
    
    # Calculate based on protocol
    protocol = data.protocol.value
    body_density = None
    body_fat_percentage = None
    
    if protocol == "guedes":
        body_density = calculate_body_density_guedes(data.gender, skinfolds)
        body_fat_percentage = siri_equation(body_density)
    elif protocol == "pollock_jackson_7":
        body_density = calculate_body_density_pollock_jackson_7(data.gender, data.age, skinfolds)
        body_fat_percentage = siri_equation(body_density)
    elif protocol == "pollock_jackson_9":
        body_density = calculate_body_density_pollock_jackson_9(data.gender, data.age, skinfolds)
        body_fat_percentage = siri_equation(body_density)
    elif protocol == "faulkner_4":
        body_fat_percentage = calculate_body_fat_faulkner(skinfolds)
        body_density = None  # Faulkner calculates %BF directly
    
    # Ensure body fat percentage is within reasonable range
    body_fat_percentage = max(3, min(60, body_fat_percentage))
    
    # Calculate other metrics
    fat_mass_kg = round(data.weight * (body_fat_percentage / 100), 2)
    lean_mass_kg = round(data.weight - fat_mass_kg, 2)
    bone_mass_kg = estimate_bone_mass(data.weight, data.height, data.gender)
    bmi, bmi_classification = calculate_bmi(data.weight, data.height)
    fat_distribution = calculate_fat_distribution(skinfolds)
    
    # Create body composition record
    body_comp = BodyComposition(
        athlete_id=data.athlete_id,
        coach_id=current_user["_id"],
        date=data.date,
        protocol=protocol,
        weight=data.weight,
        height=data.height,
        age=data.age,
        gender=data.gender,
        triceps=data.triceps,
        subscapular=data.subscapular,
        suprailiac=data.suprailiac,
        abdominal=data.abdominal,
        chest=data.chest,
        midaxillary=data.midaxillary,
        thigh=data.thigh,
        calf=data.calf,
        biceps=data.biceps,
        body_fat_percentage=round(body_fat_percentage, 2),
        lean_mass_kg=lean_mass_kg,
        fat_mass_kg=fat_mass_kg,
        bone_mass_kg=bone_mass_kg,
        bmi=bmi,
        bmi_classification=bmi_classification,
        body_density=round(body_density, 5) if body_density else None,
        fat_distribution=fat_distribution,
        notes=data.notes
    )
    
    result = await db.body_compositions.insert_one(body_comp.model_dump(by_alias=True, exclude=["id"]))
    body_comp.id = str(result.inserted_id)
    
    return body_comp

@api_router.get("/body-composition/athlete/{athlete_id}", response_model=List[BodyComposition])
async def get_athlete_body_compositions(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all body composition assessments for an athlete"""
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    records = await db.body_compositions.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(1000)
    
    result = []
    for record in records:
        record["_id"] = str(record["_id"])
        result.append(BodyComposition(**record))
    
    return result

@api_router.get("/body-composition/{composition_id}", response_model=BodyComposition)
async def get_body_composition(
    composition_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific body composition assessment"""
    record = await db.body_compositions.find_one({
        "_id": ObjectId(composition_id),
        "coach_id": current_user["_id"]
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Body composition not found")
    
    record["_id"] = str(record["_id"])
    return BodyComposition(**record)

@api_router.delete("/body-composition/{composition_id}")
async def delete_body_composition(
    composition_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a body composition assessment"""
    result = await db.body_compositions.delete_one({
        "_id": ObjectId(composition_id),
        "coach_id": current_user["_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Body composition not found")
    
    return {"message": "Body composition deleted successfully"}

@api_router.get("/analysis/body-composition/{athlete_id}")
async def get_body_composition_analysis(
    athlete_id: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Get AI-powered body composition analysis with insights"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get body composition history
    compositions = await db.body_compositions.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(20)
    
    if not compositions:
        raise HTTPException(status_code=400, detail="No body composition data available")
    
    latest = compositions[0]
    
    # Calculate trends if we have history
    trends = {}
    if len(compositions) >= 2:
        prev = compositions[1]
        trends = {
            "body_fat_change": round(latest.get("body_fat_percentage", 0) - prev.get("body_fat_percentage", 0), 2),
            "lean_mass_change": round(latest.get("lean_mass_kg", 0) - prev.get("lean_mass_kg", 0), 2),
            "weight_change": round(latest.get("weight", 0) - prev.get("weight", 0), 2),
            "bmi_change": round(latest.get("bmi", 0) - prev.get("bmi", 0), 2)
        }
    
    # Generate AI insights
    try:
        llm_client = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"))
        
        composition_summary = f"""
        Athlete: {athlete.get('name')}
        Position: {athlete.get('position', 'N/A')}
        
        Latest Body Composition ({latest.get('date')}):
        - Protocol: {latest.get('protocol')}
        - Weight: {latest.get('weight')} kg
        - Height: {latest.get('height')} cm
        - Body Fat: {latest.get('body_fat_percentage')}%
        - Lean Mass: {latest.get('lean_mass_kg')} kg
        - Fat Mass: {latest.get('fat_mass_kg')} kg
        - BMI: {latest.get('bmi')} ({get_bmi_classification_text(latest.get('bmi_classification', ''), lang)})
        
        Fat Distribution: {latest.get('fat_distribution', {})}
        
        {"Trends (vs previous): " + str(trends) if trends else "First assessment"}
        """
        
        prompt = f"""You are an expert sports scientist analyzing body composition data for an athlete.
        
        {composition_summary}
        
        Provide a comprehensive analysis in {"Portuguese" if lang == 'pt' else "English"} including:
        1. Summary of current body composition status
        2. Risk assessment for the athlete's sport position
        3. Areas requiring attention (highlight regions with high fat accumulation)
        4. Specific recommendations for body composition optimization
        5. Training and nutrition suggestions
        
        Be specific and actionable. Format your response clearly with sections."""
        
        response = await llm_client.send_message([UserMessage(content=prompt)])
        ai_analysis = response.content
    except Exception as e:
        logging.error(f"AI analysis error: {e}")
        ai_analysis = "AI analysis unavailable" if lang == 'en' else "Análise de IA indisponível"
    
    # Prepare response
    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name"),
        "latest_assessment": {
            "id": str(latest["_id"]),
            "date": latest.get("date"),
            "protocol": latest.get("protocol"),
            "weight": latest.get("weight"),
            "height": latest.get("height"),
            "body_fat_percentage": latest.get("body_fat_percentage"),
            "lean_mass_kg": latest.get("lean_mass_kg"),
            "fat_mass_kg": latest.get("fat_mass_kg"),
            "bone_mass_kg": latest.get("bone_mass_kg"),
            "bmi": latest.get("bmi"),
            "bmi_classification": latest.get("bmi_classification"),
            "bmi_classification_text": get_bmi_classification_text(latest.get("bmi_classification", ""), lang),
            "fat_distribution": latest.get("fat_distribution", {})
        },
        "trends": trends,
        "history": [
            {
                "date": c.get("date"),
                "body_fat_percentage": c.get("body_fat_percentage"),
                "lean_mass_kg": c.get("lean_mass_kg"),
                "weight": c.get("weight"),
                "bmi": c.get("bmi")
            } for c in compositions[:10]
        ],
        "ai_analysis": ai_analysis,
        "risk_zones": {
            "body_fat": "high" if latest.get("body_fat_percentage", 0) > 25 else "moderate" if latest.get("body_fat_percentage", 0) > 18 else "optimal",
            "bmi": "high" if latest.get("bmi", 0) > 30 else "moderate" if latest.get("bmi", 0) > 25 else "optimal"
        }
    }

# ============= AI ANALYSIS ROUTES =============

from emergentintegrations.llm.chat import LlmChat, UserMessage
import statistics

class ACWRAnalysis(BaseModel):
    acute_load: float
    chronic_load: float
    acwr_ratio: float
    risk_level: str  # "low", "optimal", "moderate", "high"
    recommendation: str

class FatigueAnalysis(BaseModel):
    fatigue_level: str  # "low", "moderate", "high", "critical"
    fatigue_score: float
    contributing_factors: List[str]
    recommendation: str

class AIInsights(BaseModel):
    summary: str
    strengths: List[str]
    concerns: List[str]
    recommendations: List[str]
    training_zones: Dict[str, Any]

class ComprehensiveAnalysis(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    acwr: Optional[ACWRAnalysis] = None
    fatigue: Optional[FatigueAnalysis] = None
    ai_insights: Optional[AIInsights] = None

def calculate_training_load(gps_data: GPSData) -> float:
    """Calculate training load from GPS data using a weighted formula"""
    # Weighted formula considering multiple factors
    load = (
        gps_data.total_distance * 0.001 +  # Distance component
        gps_data.high_intensity_distance * 0.003 +  # High intensity weight
        gps_data.sprint_distance * 0.005 +  # Sprint weight
        gps_data.number_of_sprints * 2 +  # Sprint count
        gps_data.number_of_accelerations * 1 +  # Accelerations
        gps_data.number_of_decelerations * 1  # Decelerations
    )
    return round(load, 2)

# ============= ANALYSIS TRANSLATIONS - EARLY DEFINITION =============
# This section defines translations used by analysis functions

ANALYSIS_TRANSLATIONS = {
    "en": {
        "acwr_low": "Training load below optimal. Consider gradually increasing intensity to maintain fitness.",
        "acwr_optimal": "Optimal training load! Continue maintaining this balance between training and recovery.",
        "acwr_moderate": "Moderately high training load. Monitor fatigue signs and consider reducing volume in coming days.",
        "acwr_high": "⚠️ ATTENTION: Training load very high! High injury risk. Immediate load reduction recommended.",
        "acwr_detail_high": "⚠️ ATTENTION: One or more parameters are in high risk zone. Immediate training load reduction recommended.",
        "acwr_detail_moderate": "Some parameters are elevated. Monitor fatigue and consider adjusting training volume.",
        "acwr_detail_optimal": "Balanced training load! Continue maintaining this pattern.",
        "acwr_detail_low": "Low training load. Consider progressively increasing intensity.",
        "fatigue_low": "Low fatigue level. Athlete is well recovered and ready for intense training.",
        "fatigue_moderate": "Moderate fatigue. Athlete can train normally, but monitor for overload signs.",
        "fatigue_high": "High fatigue detected. Reduce volume/intensity and prioritize active recovery.",
        "fatigue_critical": "⚠️ CRITICAL FATIGUE! Complete rest or light regenerative training recommended. Overtraining risk.",
        "poor_sleep": "Poor sleep quality affecting recovery",
        "insufficient_sleep": "Insufficient sleep hours",
        "high_muscle_soreness": "Elevated muscle soreness",
        "high_fatigue_perception": "High fatigue perception",
        "elevated_stress": "Elevated stress level",
        "low_mood": "Low mood",
        "compromised_readiness": "Compromised readiness",
        "sleep_hours_tip": "Try to sleep at least 7-8 hours per night",
        "sleep_quality_tip": "Consider improving your sleep hygiene",
        "fatigue_tip": "High fatigue level - consider extra rest",
        "muscle_soreness_tip": "High muscle soreness - consider active recovery",
        "stress_tip": "High stress level - practice relaxation techniques",
        "all_good": "Great! You are in good condition!",
        "ai_default_rec": "Maintain current monitoring routine",
        "ai_no_data": "Insufficient data for analysis",
        "metric_total_distance": "Total Distance",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acc/Dec",
    },
    "pt": {
        "acwr_low": "Carga de treino abaixo do ideal. Considere aumentar gradualmente a intensidade.",
        "acwr_optimal": "Carga de treino ótima! Continue mantendo este equilíbrio entre treino e recuperação.",
        "acwr_moderate": "Carga de treino moderadamente elevada. Monitore sinais de fadiga e considere reduzir volume.",
        "acwr_high": "⚠️ ATENÇÃO: Carga de treino muito elevada! Alto risco de lesão. Recomenda-se redução imediata.",
        "acwr_detail_high": "⚠️ ATENÇÃO: Um ou mais parâmetros estão em zona de alto risco. Recomenda-se redução imediata.",
        "acwr_detail_moderate": "Alguns parâmetros estão elevados. Monitore a fadiga e considere ajustar o volume.",
        "acwr_detail_optimal": "Carga de treino equilibrada! Continue mantendo este padrão.",
        "acwr_detail_low": "Carga de treino baixa. Considere aumentar progressivamente a intensidade.",
        "fatigue_low": "Baixo nível de fadiga. Atleta está bem recuperado e pronto para treinos intensos.",
        "fatigue_moderate": "Fadiga moderada. Atleta pode treinar normalmente, mas monitore sinais de sobrecarga.",
        "fatigue_high": "Alta fadiga detectada. Reduza volume/intensidade e priorize recuperação ativa.",
        "fatigue_critical": "⚠️ FADIGA CRÍTICA! Recomenda-se descanso completo ou treino regenerativo leve. Risco de overtraining.",
        "poor_sleep": "Qualidade do sono ruim afetando recuperação",
        "insufficient_sleep": "Horas de sono insuficientes",
        "high_muscle_soreness": "Dor muscular elevada",
        "high_fatigue_perception": "Alta percepção de fadiga",
        "elevated_stress": "Nível de estresse elevado",
        "low_mood": "Humor baixo",
        "compromised_readiness": "Prontidão comprometida",
        "sleep_hours_tip": "Tente dormir pelo menos 7-8 horas por noite",
        "sleep_quality_tip": "Considere melhorar sua higiene do sono",
        "fatigue_tip": "Nível de fadiga elevado - considere descanso extra",
        "muscle_soreness_tip": "Dor muscular alta - considere recuperação ativa",
        "stress_tip": "Nível de estresse alto - pratique técnicas de relaxamento",
        "all_good": "Ótimo! Você está em boas condições!",
        "ai_default_rec": "Manter rotina atual de monitoramento",
        "ai_no_data": "Dados insuficientes para análise",
        "metric_total_distance": "Distância Total",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acel/Desac",
    },
    "es": {
        "acwr_low": "Carga de entrenamiento por debajo del óptimo. Considere aumentar gradualmente la intensidad.",
        "acwr_optimal": "¡Carga de entrenamiento óptima! Continúe manteniendo este equilibrio.",
        "acwr_moderate": "Carga de entrenamiento moderadamente alta. Monitoree signos de fatiga.",
        "acwr_high": "⚠️ ATENCIÓN: ¡Carga muy alta! Alto riesgo de lesión. Se recomienda reducción inmediata.",
        "acwr_detail_high": "⚠️ ATENCIÓN: Uno o más parámetros en zona de alto riesgo.",
        "acwr_detail_moderate": "Algunos parámetros elevados. Monitoree la fatiga.",
        "acwr_detail_optimal": "¡Carga equilibrada! Continúe así.",
        "acwr_detail_low": "Carga baja. Considere aumentar progresivamente.",
        "fatigue_low": "Bajo nivel de fatiga. Atleta bien recuperado.",
        "fatigue_moderate": "Fatiga moderada. Puede entrenar normalmente.",
        "fatigue_high": "Alta fatiga. Reduzca volumen y priorice recuperación.",
        "fatigue_critical": "⚠️ ¡FATIGA CRÍTICA! Se recomienda descanso completo.",
        "poor_sleep": "Calidad de sueño deficiente",
        "insufficient_sleep": "Horas de sueño insuficientes",
        "high_muscle_soreness": "Dolor muscular elevado",
        "high_fatigue_perception": "Alta percepción de fatiga",
        "elevated_stress": "Nivel de estrés elevado",
        "low_mood": "Estado de ánimo bajo",
        "compromised_readiness": "Preparación comprometida",
        "sleep_hours_tip": "Intente dormir al menos 7-8 horas",
        "sleep_quality_tip": "Mejore su higiene del sueño",
        "fatigue_tip": "Fatiga alta - considere descanso extra",
        "muscle_soreness_tip": "Dolor muscular alto - recuperación activa",
        "stress_tip": "Estrés alto - practique relajación",
        "all_good": "¡Excelente! Está en buenas condiciones.",
        "ai_default_rec": "Mantener rutina actual de monitoreo",
        "ai_no_data": "Datos insuficientes para análisis",
        "metric_total_distance": "Distancia Total",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acel/Desac",
    },
    "fr": {
        "acwr_low": "Charge d'entraînement en dessous de l'optimal. Augmentez progressivement l'intensité.",
        "acwr_optimal": "Charge d'entraînement optimale ! Continuez à maintenir cet équilibre.",
        "acwr_moderate": "Charge modérément élevée. Surveillez les signes de fatigue.",
        "acwr_high": "⚠️ ATTENTION: Charge très élevée ! Risque de blessure. Réduction immédiate recommandée.",
        "acwr_detail_high": "⚠️ ATTENTION: Un ou plusieurs paramètres en zone à haut risque.",
        "acwr_detail_moderate": "Certains paramètres sont élevés. Surveillez la fatigue.",
        "acwr_detail_optimal": "Charge équilibrée ! Continuez ainsi.",
        "acwr_detail_low": "Charge faible. Augmentez progressivement.",
        "fatigue_low": "Faible niveau de fatigue. Athlète bien récupéré.",
        "fatigue_moderate": "Fatigue modérée. Peut s'entraîner normalement.",
        "fatigue_high": "Fatigue élevée. Réduisez le volume.",
        "fatigue_critical": "⚠️ FATIGUE CRITIQUE ! Repos complet recommandé.",
        "poor_sleep": "Mauvaise qualité de sommeil",
        "insufficient_sleep": "Heures de sommeil insuffisantes",
        "high_muscle_soreness": "Douleur musculaire élevée",
        "high_fatigue_perception": "Perception élevée de fatigue",
        "elevated_stress": "Niveau de stress élevé",
        "low_mood": "Humeur basse",
        "compromised_readiness": "Préparation compromise",
        "sleep_hours_tip": "Dormez au moins 7-8 heures",
        "sleep_quality_tip": "Améliorez votre hygiène de sommeil",
        "fatigue_tip": "Fatigue élevée - repos supplémentaire",
        "muscle_soreness_tip": "Douleur musculaire - récupération active",
        "stress_tip": "Stress élevé - relaxation",
        "all_good": "Excellent ! Vous êtes en bonne condition.",
        "ai_default_rec": "Maintenir la routine de surveillance",
        "ai_no_data": "Données insuffisantes pour l'analyse",
        "metric_total_distance": "Distance Totale",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acc/Déc",
    },
}

def get_analysis_text(lang: str, key: str) -> str:
    """Get translated analysis text"""
    translations = ANALYSIS_TRANSLATIONS.get(lang, ANALYSIS_TRANSLATIONS["en"])
    return translations.get(key, ANALYSIS_TRANSLATIONS["en"].get(key, key))

@api_router.get("/analysis/acwr/{athlete_id}")
async def get_acwr_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    t = lambda key: get_analysis_text(lang, key)
    
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get GPS data from last 28 days
    today = datetime.utcnow()
    date_28_days_ago = (today - timedelta(days=28)).strftime("%Y-%m-%d")
    date_7_days_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "date": {"$gte": date_28_days_ago}
    }).to_list(1000)
    
    if len(gps_records) < 7:
        raise HTTPException(
            status_code=400, 
            detail=t("ai_no_data")
        )
    
    # Convert to GPSData objects and calculate loads
    gps_data_list = [GPSData(**{**record, "_id": str(record["_id"])}) for record in gps_records]
    
    # Separate acute (last 7 days) and chronic (last 28 days) loads
    acute_loads = []
    chronic_loads = []
    
    for gps in gps_data_list:
        load = calculate_training_load(gps)
        chronic_loads.append(load)
        if gps.date >= date_7_days_ago:
            acute_loads.append(load)
    
    if not acute_loads or not chronic_loads:
        raise HTTPException(status_code=400, detail=t("ai_no_data"))
    
    acute_load = sum(acute_loads)
    chronic_load = sum(chronic_loads) / 4  # Average per week over 4 weeks
    
    # Calculate ACWR ratio
    acwr_ratio = round(acute_load / chronic_load if chronic_load > 0 else 0, 2)
    
    # Determine risk level and recommendation
    if acwr_ratio < 0.8:
        risk_level = "low"
        recommendation = t("acwr_low")
    elif 0.8 <= acwr_ratio <= 1.3:
        risk_level = "optimal"
        recommendation = t("acwr_optimal")
    elif 1.3 < acwr_ratio <= 1.5:
        risk_level = "moderate"
        recommendation = t("acwr_moderate")
    else:
        risk_level = "high"
        recommendation = t("acwr_high")
    
    return ACWRAnalysis(
        acute_load=round(acute_load, 2),
        chronic_load=round(chronic_load, 2),
        acwr_ratio=acwr_ratio,
        risk_level=risk_level,
        recommendation=recommendation
    )

# ============= ACWR DETAILED ANALYSIS =============

class ACWRDetailedMetric(BaseModel):
    name: str
    acute_load: float
    chronic_load: float
    acwr_ratio: float
    risk_level: str
    unit: str

class ACWRDetailedAnalysis(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    metrics: List[ACWRDetailedMetric]
    overall_risk: str
    recommendation: str

def calculate_metric_acwr(acute_values: List[float], chronic_values: List[float]) -> tuple:
    """Calculate ACWR for a specific metric"""
    if not acute_values or not chronic_values:
        return 0, 0, 0, "unknown"
    
    acute_load = sum(acute_values)
    chronic_load = sum(chronic_values) / 4 if chronic_values else 0
    
    if chronic_load > 0:
        acwr_ratio = round(acute_load / chronic_load, 2)
    else:
        acwr_ratio = 0
    
    # Determine risk level
    if acwr_ratio < 0.8:
        risk_level = "low"
    elif 0.8 <= acwr_ratio <= 1.3:
        risk_level = "optimal"
    elif 1.3 < acwr_ratio <= 1.5:
        risk_level = "moderate"
    else:
        risk_level = "high"
    
    return round(acute_load, 2), round(chronic_load, 2), acwr_ratio, risk_level

@api_router.get("/analysis/acwr-detailed/{athlete_id}", response_model=ACWRDetailedAnalysis)
async def get_acwr_detailed_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """Get detailed ACWR analysis for multiple metrics:
    - Total Distance
    - HSR (High Speed Running: 20-25 km/h)
    - HID (High Intensity Distance: 15-20 km/h)  
    - Sprint Distance (+25 km/h)
    - Acc/Dec (Accelerations + Decelerations)
    """
    t = lambda key: get_analysis_text(lang, key)
    
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get GPS data from last 28 days
    today = datetime.utcnow()
    date_28_days_ago = (today - timedelta(days=28)).strftime("%Y-%m-%d")
    date_7_days_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "date": {"$gte": date_28_days_ago}
    }).to_list(1000)
    
    if len(gps_records) < 7:
        raise HTTPException(
            status_code=400,
            detail=t("ai_no_data")
        )
    
    # Group data by session to avoid counting periods multiple times
    sessions = {}
    for record in gps_records:
        session_key = record.get("session_id") or record.get("date", "unknown")
        period_name = (record.get("period_name") or record.get("notes", "").replace("Período: ", "") or "").lower()
        
        # Only use "session" or "total" periods, or if there's only one record per session
        if session_key not in sessions:
            sessions[session_key] = {
                "date": record.get("date"),
                "total_distance": 0,
                "high_speed_running": 0,
                "high_intensity_distance": 0,
                "sprint_distance": 0,
                "acc_dec": 0,
                "has_session_total": False
            }
        
        # If this is a session/total period, use it
        if "session" in period_name or "total" in period_name:
            sessions[session_key]["total_distance"] = record.get("total_distance", 0)
            sessions[session_key]["high_speed_running"] = record.get("high_speed_running", 0) or record.get("high_intensity_distance", 0) * 0.3
            sessions[session_key]["high_intensity_distance"] = record.get("high_intensity_distance", 0)
            sessions[session_key]["sprint_distance"] = record.get("sprint_distance", 0)
            sessions[session_key]["acc_dec"] = record.get("number_of_accelerations", 0) + record.get("number_of_decelerations", 0)
            sessions[session_key]["has_session_total"] = True
        elif not sessions[session_key]["has_session_total"]:
            # Sum periods if no session total
            sessions[session_key]["total_distance"] += record.get("total_distance", 0)
            sessions[session_key]["high_speed_running"] += record.get("high_speed_running", 0) or 0
            sessions[session_key]["high_intensity_distance"] += record.get("high_intensity_distance", 0)
            sessions[session_key]["sprint_distance"] += record.get("sprint_distance", 0)
            sessions[session_key]["acc_dec"] += record.get("number_of_accelerations", 0) + record.get("number_of_decelerations", 0)
    
    # Separate acute (last 7 days) and chronic (last 28 days) data
    acute_data = {"td": [], "hsr": [], "hid": [], "sprint": [], "acc_dec": []}
    chronic_data = {"td": [], "hsr": [], "hid": [], "sprint": [], "acc_dec": []}
    
    for session in sessions.values():
        session_date = session.get("date", "")
        
        chronic_data["td"].append(session["total_distance"])
        chronic_data["hsr"].append(session["high_speed_running"])
        chronic_data["hid"].append(session["high_intensity_distance"])
        chronic_data["sprint"].append(session["sprint_distance"])
        chronic_data["acc_dec"].append(session["acc_dec"])
        
        if session_date >= date_7_days_ago:
            acute_data["td"].append(session["total_distance"])
            acute_data["hsr"].append(session["high_speed_running"])
            acute_data["hid"].append(session["high_intensity_distance"])
            acute_data["sprint"].append(session["sprint_distance"])
            acute_data["acc_dec"].append(session["acc_dec"])
    
    # Calculate ACWR for each metric
    metrics = []
    risk_levels = []
    
    # Total Distance
    acute, chronic, ratio, risk = calculate_metric_acwr(acute_data["td"], chronic_data["td"])
    metrics.append(ACWRDetailedMetric(
        name=t("metric_total_distance"),
        acute_load=acute,
        chronic_load=chronic,
        acwr_ratio=ratio,
        risk_level=risk,
        unit="m"
    ))
    risk_levels.append(risk)
    
    # HSR (20-25 km/h)
    acute, chronic, ratio, risk = calculate_metric_acwr(acute_data["hsr"], chronic_data["hsr"])
    metrics.append(ACWRDetailedMetric(
        name=t("metric_hsr"),
        acute_load=acute,
        chronic_load=chronic,
        acwr_ratio=ratio,
        risk_level=risk,
        unit="m"
    ))
    risk_levels.append(risk)
    
    # HID (15-20 km/h)
    acute, chronic, ratio, risk = calculate_metric_acwr(acute_data["hid"], chronic_data["hid"])
    metrics.append(ACWRDetailedMetric(
        name=t("metric_hid"),
        acute_load=acute,
        chronic_load=chronic,
        acwr_ratio=ratio,
        risk_level=risk,
        unit="m"
    ))
    risk_levels.append(risk)
    
    # Sprint (+25 km/h)
    acute, chronic, ratio, risk = calculate_metric_acwr(acute_data["sprint"], chronic_data["sprint"])
    metrics.append(ACWRDetailedMetric(
        name=t("metric_sprint"),
        acute_load=acute,
        chronic_load=chronic,
        acwr_ratio=ratio,
        risk_level=risk,
        unit="m"
    ))
    risk_levels.append(risk)
    
    # Acc/Dec
    acute, chronic, ratio, risk = calculate_metric_acwr(acute_data["acc_dec"], chronic_data["acc_dec"])
    metrics.append(ACWRDetailedMetric(
        name=t("metric_acc_dec"),
        acute_load=acute,
        chronic_load=chronic,
        acwr_ratio=ratio,
        risk_level=risk,
        unit="count"
    ))
    risk_levels.append(risk)
    
    # Determine overall risk
    if "high" in risk_levels:
        overall_risk = "high"
        recommendation = t("acwr_detail_high")
    elif risk_levels.count("moderate") >= 2:
        overall_risk = "moderate"
        recommendation = t("acwr_detail_moderate")
    elif "optimal" in risk_levels and risk_levels.count("optimal") >= 3:
        overall_risk = "optimal"
        recommendation = t("acwr_detail_optimal")
    else:
        overall_risk = "low"
        recommendation = t("acwr_detail_low")
    
    return ACWRDetailedAnalysis(
        athlete_id=athlete_id,
        athlete_name=athlete["name"],
        analysis_date=today.strftime("%Y-%m-%d"),
        metrics=metrics,
        overall_risk=overall_risk,
        recommendation=recommendation
    )

# ============= ACWR HISTORY FOR CHARTS =============

class ACWRHistoryPoint(BaseModel):
    date: str
    acwr: float
    acute: float
    chronic: float
    risk_level: str

class ACWRHistoryResponse(BaseModel):
    athlete_id: str
    athlete_name: str
    metric: str
    history: List[ACWRHistoryPoint]

@api_router.get("/analysis/acwr-history/{athlete_id}")
async def get_acwr_history(
    athlete_id: str,
    metric: str = "total_distance",
    days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Get ACWR history for charts. 
    Metrics: total_distance, hsr, hid, sprint, acc_dec
    Returns daily ACWR values for the specified period.
    """
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get GPS data from extended period (days + 28 for chronic calculation)
    today = datetime.utcnow()
    start_date = (today - timedelta(days=days + 28)).strftime("%Y-%m-%d")
    
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "date": {"$gte": start_date}
    }).sort("date", 1).to_list(1000)
    
    if len(gps_records) < 7:
        return ACWRHistoryResponse(
            athlete_id=athlete_id,
            athlete_name=athlete["name"],
            metric=metric,
            history=[]
        )
    
    # Group data by date
    daily_data = {}
    for record in gps_records:
        date = record.get("date", "")
        if not date:
            continue
            
        if date not in daily_data:
            daily_data[date] = {
                "total_distance": 0,
                "hsr": 0,
                "hid": 0,
                "sprint": 0,
                "acc_dec": 0
            }
        
        daily_data[date]["total_distance"] += record.get("total_distance", 0)
        daily_data[date]["hsr"] += record.get("high_speed_running", 0) or record.get("high_intensity_distance", 0) * 0.3
        daily_data[date]["hid"] += record.get("high_intensity_distance", 0)
        daily_data[date]["sprint"] += record.get("sprint_distance", 0)
        daily_data[date]["acc_dec"] += record.get("number_of_accelerations", 0) + record.get("number_of_decelerations", 0)
    
    # Sort dates
    sorted_dates = sorted(daily_data.keys())
    
    # Calculate rolling ACWR for each day
    history = []
    
    for i, current_date in enumerate(sorted_dates):
        # Need at least 7 days of data before this date for acute
        if i < 6:
            continue
        
        # Get dates for acute (7 days) and chronic (28 days) periods
        current_dt = datetime.strptime(current_date, "%Y-%m-%d")
        target_start = (today - timedelta(days=days)).strftime("%Y-%m-%d")
        
        # Only include dates within the requested range
        if current_date < target_start:
            continue
        
        acute_start = (current_dt - timedelta(days=7)).strftime("%Y-%m-%d")
        chronic_start = (current_dt - timedelta(days=28)).strftime("%Y-%m-%d")
        
        # Calculate acute load (last 7 days)
        acute_values = []
        chronic_values = []
        
        for d in sorted_dates:
            if d > current_date:
                continue
            if d >= acute_start and d <= current_date:
                acute_values.append(daily_data[d].get(metric, 0))
            if d >= chronic_start and d <= current_date:
                chronic_values.append(daily_data[d].get(metric, 0))
        
        if len(acute_values) < 3 or len(chronic_values) < 7:
            continue
        
        acute_load = sum(acute_values) / len(acute_values) if acute_values else 0
        chronic_load = sum(chronic_values) / len(chronic_values) if chronic_values else 0
        
        if chronic_load > 0:
            acwr = acute_load / chronic_load
        else:
            acwr = 0
        
        # Determine risk level
        if acwr >= 1.5:
            risk = "high"
        elif acwr >= 1.3:
            risk = "moderate"
        elif acwr >= 0.8:
            risk = "optimal"
        else:
            risk = "low"
        
        history.append(ACWRHistoryPoint(
            date=current_date,
            acwr=round(acwr, 2),
            acute=round(acute_load, 0),
            chronic=round(chronic_load, 0),
            risk_level=risk
        ))
    
    return ACWRHistoryResponse(
        athlete_id=athlete_id,
        athlete_name=athlete["name"],
        metric=metric,
        history=history
    )

@api_router.get("/analysis/fatigue/{athlete_id}")
async def get_fatigue_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    t = lambda key: get_analysis_text(lang, key)
    
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get recent wellness data (last 7 days)
    today = datetime.utcnow()
    date_7_days_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    
    wellness_records = await db.wellness.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "date": {"$gte": date_7_days_ago}
    }).sort("date", -1).to_list(7)
    
    if not wellness_records:
        raise HTTPException(
            status_code=400,
            detail=t("ai_no_data")
        )
    
    # Get recent GPS data for workload context
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "date": {"$gte": date_7_days_ago}
    }).to_list(7)
    
    # Calculate average wellness metrics
    avg_fatigue = statistics.mean([w["fatigue"] for w in wellness_records])
    avg_sleep_quality = statistics.mean([w["sleep_quality"] for w in wellness_records])
    avg_sleep_hours = statistics.mean([w["sleep_hours"] for w in wellness_records])
    avg_muscle_soreness = statistics.mean([w["muscle_soreness"] for w in wellness_records])
    avg_stress = statistics.mean([w["stress"] for w in wellness_records])
    avg_readiness = statistics.mean([w["readiness_score"] for w in wellness_records])
    
    # Calculate fatigue score (0-100, higher is more fatigued)
    fatigue_score = (
        avg_fatigue * 8 +  # Fatigue is primary indicator
        (10 - avg_sleep_quality) * 5 +  # Poor sleep increases fatigue
        avg_muscle_soreness * 6 +  # Soreness indicates fatigue
        avg_stress * 4 +  # Stress contributes to fatigue
        (10 - min(avg_sleep_hours / 8 * 10, 10)) * 3  # Insufficient sleep
    ) / 2.6  # Normalize to 0-100
    
    fatigue_score = round(fatigue_score, 1)
    
    # Determine fatigue level
    if fatigue_score < 30:
        fatigue_level = "low"
        recommendation = t("fatigue_low")
    elif fatigue_score < 50:
        fatigue_level = "moderate"
        recommendation = t("fatigue_moderate")
    elif fatigue_score < 70:
        fatigue_level = "high"
        recommendation = t("fatigue_high")
    else:
        fatigue_level = "critical"
        recommendation = t("fatigue_critical")
    
    # Identify contributing factors (using translations)
    contributing_factors = []
    if avg_fatigue >= 7:
        contributing_factors.append(t("high_fatigue_perception"))
    if avg_sleep_quality <= 5:
        contributing_factors.append(t("poor_sleep"))
    if avg_sleep_hours < 7:
        contributing_factors.append(t("insufficient_sleep"))
    if avg_muscle_soreness >= 7:
        contributing_factors.append(t("high_muscle_soreness"))
    if avg_stress >= 7:
        contributing_factors.append(t("elevated_stress"))
    if avg_readiness < 6:
        contributing_factors.append(t("compromised_readiness"))
    
    if not contributing_factors:
        contributing_factors.append(t("all_good"))
    
    return FatigueAnalysis(
        fatigue_level=fatigue_level,
        fatigue_score=fatigue_score,
        contributing_factors=contributing_factors,
        recommendation=recommendation
    )

@api_router.get("/analysis/ai-insights/{athlete_id}")
async def get_ai_insights(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    t = lambda key: get_analysis_text(lang, key)
    
    # Language-specific prompts
    lang_prompts = {
        "en": {
            "system": "You are a sports science and football training expert. Analyze the provided data and provide professional, practical and actionable insights. Respond in clear and objective English.",
            "analysis_prompt": """Based on this data, provide a complete professional analysis including:

1. EXECUTIVE SUMMARY (2-3 lines about the athlete's current state)

2. STRENGTHS (2-3 positive aspects identified in the data)

3. AREAS OF CONCERN (2-3 areas that require monitoring or adjustment)

4. SPECIFIC RECOMMENDATIONS (3-4 concrete actions to optimize training)

5. RECOMMENDED TRAINING ZONES:
   - Recovery Zone: distance and characteristics
   - Aerobic Zone: distance and characteristics
   - Anaerobic Zone: distance and characteristics
   - Maximum Zone: distance and characteristics

Format your response in a structured and professional manner.""",
            "data_labels": {
                "analysis": "Athlete Analysis",
                "position": "Position",
                "gps_data": "GPS DATA (last 30 records)",
                "total_sessions": "Total sessions",
                "avg_distance": "Average distance",
                "avg_hi_distance": "Average high intensity distance",
                "avg_sprints": "Average sprints per session",
                "avg_max_speed": "Average max speed",
                "wellness": "WELLNESS (last 30 records)",
                "total_questionnaires": "Total questionnaires",
                "avg_wellness": "Average wellness score",
                "avg_readiness": "Average readiness score",
                "avg_fatigue": "Average fatigue",
                "avg_sleep_quality": "Average sleep quality",
                "avg_sleep_hours": "Average sleep hours",
                "assessments": "PHYSICAL ASSESSMENTS",
                "total_assessments": "Total assessments"
            },
            "defaults": {
                "summary": "Athlete data analysis completed successfully.",
                "strength": "Consistent training data",
                "concern": "Continue monitoring regularly",
                "recommendation": "Maintain current monitoring routine"
            },
            "zones": {
                "recovery": "Zone 1: <60% v.max (Recovery, light jogging)",
                "aerobic": "Zone 2: 60-75% v.max (Aerobic base, steady state)",
                "anaerobic": "Zone 3: 75-90% v.max (Tempo runs, threshold)",
                "maximum": "Zone 4: >90% v.max (Sprints, max speed)"
            }
        },
        "pt": {
            "system": "Você é um especialista em ciência do esporte e treinamento de futebol. Analise os dados fornecidos e forneça insights profissionais, práticos e acionáveis. Responda em português brasileiro de forma clara e objetiva.",
            "analysis_prompt": """Com base nesses dados, forneça uma análise profissional completa incluindo:

1. RESUMO EXECUTIVO (2-3 linhas sobre o estado atual do atleta)

2. PONTOS FORTES (2-3 aspectos positivos identificados nos dados)

3. PONTOS DE ATENÇÃO (2-3 áreas que requerem monitoramento ou ajuste)

4. RECOMENDAÇÕES ESPECÍFICAS (3-4 ações concretas para otimizar o treinamento)

5. ZONAS DE TREINAMENTO RECOMENDADAS:
   - Zona de Recuperação: distância e características
   - Zona Aeróbica: distância e características
   - Zona Anaeróbica: distância e características
   - Zona Máxima: distância e características

Formate sua resposta de forma estruturada e profissional.""",
            "data_labels": {
                "analysis": "Análise do Atleta",
                "position": "Posição",
                "gps_data": "DADOS GPS (últimos 30 registros)",
                "total_sessions": "Total de sessões",
                "avg_distance": "Distância média",
                "avg_hi_distance": "Distância alta intensidade média",
                "avg_sprints": "Sprints médios por sessão",
                "avg_max_speed": "Velocidade máxima média",
                "wellness": "WELLNESS (últimos 30 registros)",
                "total_questionnaires": "Total de questionários",
                "avg_wellness": "Wellness score médio",
                "avg_readiness": "Readiness score médio",
                "avg_fatigue": "Fadiga média",
                "avg_sleep_quality": "Qualidade sono média",
                "avg_sleep_hours": "Horas de sono média",
                "assessments": "AVALIAÇÕES FÍSICAS",
                "total_assessments": "Total de avaliações"
            },
            "defaults": {
                "summary": "Análise dos dados do atleta concluída com sucesso.",
                "strength": "Dados consistentes de treinamento",
                "concern": "Continue monitorando regularmente",
                "recommendation": "Manter rotina atual de monitoramento"
            },
            "zones": {
                "recovery": "Zona 1: <60% v.max (Recuperação, trote leve)",
                "aerobic": "Zona 2: 60-75% v.max (Base aeróbica, ritmo estável)",
                "anaerobic": "Zona 3: 75-90% v.max (Corridas de tempo, limiar)",
                "maximum": "Zona 4: >90% v.max (Sprints, velocidade máxima)"
            }
        }
    }
    
    # Default to English if language not supported
    lp = lang_prompts.get(lang, lang_prompts["en"])
    labels = lp["data_labels"]
    
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get all data for comprehensive analysis
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).limit(30).to_list(30)
    
    wellness_records = await db.wellness.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).limit(30).to_list(30)
    
    assessments = await db.assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).limit(5).to_list(5)
    
    if not gps_records and not wellness_records:
        raise HTTPException(
            status_code=400,
            detail=t("ai_no_data")
        )
    
    # Prepare data summary for AI using translated labels
    avg_gps_distance = statistics.mean([g['total_distance'] for g in gps_records]) if gps_records else 0
    avg_hi_distance = statistics.mean([g['high_intensity_distance'] for g in gps_records]) if gps_records else 0
    avg_sprints = statistics.mean([g['number_of_sprints'] for g in gps_records]) if gps_records else 0
    max_speeds = [g.get('max_speed', 0) for g in gps_records if g.get('max_speed')]
    avg_max_speed = statistics.mean(max_speeds) if max_speeds else 0
    
    avg_wellness = statistics.mean([w['wellness_score'] for w in wellness_records]) if wellness_records else 0
    avg_readiness = statistics.mean([w['readiness_score'] for w in wellness_records]) if wellness_records else 0
    avg_fatigue = statistics.mean([w['fatigue'] for w in wellness_records]) if wellness_records else 0
    avg_sleep_quality = statistics.mean([w['sleep_quality'] for w in wellness_records]) if wellness_records else 0
    avg_sleep_hours = statistics.mean([w['sleep_hours'] for w in wellness_records]) if wellness_records else 0
    
    data_summary = f"""
{labels['analysis']}: {athlete['name']}
{labels['position']}: {athlete['position']}

{labels['gps_data']}:
- {labels['total_sessions']}: {len(gps_records)}
- {labels['avg_distance']}: {avg_gps_distance:.0f}m
- {labels['avg_hi_distance']}: {avg_hi_distance:.0f}m
- {labels['avg_sprints']}: {avg_sprints:.1f}
- {labels['avg_max_speed']}: {avg_max_speed:.1f} km/h

{labels['wellness']}:
- {labels['total_questionnaires']}: {len(wellness_records)}
- {labels['avg_wellness']}: {avg_wellness:.1f}/10
- {labels['avg_readiness']}: {avg_readiness:.1f}/10
- {labels['avg_fatigue']}: {avg_fatigue:.1f}/10
- {labels['avg_sleep_quality']}: {avg_sleep_quality:.1f}/10
- {labels['avg_sleep_hours']}: {avg_sleep_hours:.1f}h

{labels['assessments']}:
- {labels['total_assessments']}: {len(assessments)}
"""
    
    if assessments:
        for assessment in assessments[:2]:  # Last 2 assessments
            data_summary += f"- {assessment['assessment_type']}: {assessment['date']}\n"
    
    # Use Emergent LLM for insights
    try:
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"analysis_{athlete_id}_{datetime.utcnow().timestamp()}",
            system_message=lp["system"]
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(
            text=f"{data_summary}\n\n{lp['analysis_prompt']}"
        )
        
        response = await chat.send_message(user_message)
        
        # Parse AI response (basic parsing, can be improved)
        lines = response.split('\n')
        
        summary = ""
        strengths = []
        concerns = []
        recommendations = []
        training_zones = {}
        
        current_section = None
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Detect sections based on common keywords in multiple languages
            line_upper = line.upper()
            if "RESUMO" in line_upper or "SUMMARY" in line_upper or "EXECUTIVO" in line_upper:
                current_section = "summary"
            elif "FORTE" in line_upper or "STRENGTH" in line_upper or "POSITIVO" in line_upper:
                current_section = "strengths"
            elif "ATENÇÃO" in line_upper or "CONCERN" in line_upper or "ATTENTION" in line_upper or "PREOCUP" in line_upper:
                current_section = "concerns"
            elif "RECOMENDA" in line_upper or "RECOMMENDATION" in line_upper:
                current_section = "recommendations"
            elif "ZONA" in line_upper or "ZONE" in line_upper:
                current_section = "zones"
            elif line.startswith('-') or line.startswith('•') or (len(line) > 0 and line[0].isdigit()):
                content = line.lstrip('-•0123456789. ')
                if current_section == "strengths":
                    strengths.append(content)
                elif current_section == "concerns":
                    concerns.append(content)
                elif current_section == "recommendations":
                    recommendations.append(content)
            elif current_section == "summary" and len(line) > 20:
                summary += line + " "
        
        # Default zones using translated values
        training_zones = lp["zones"]
        
        defaults = lp["defaults"]
        return AIInsights(
            summary=summary.strip() if summary else defaults["summary"],
            strengths=strengths if strengths else [defaults["strength"]],
            concerns=concerns if concerns else [defaults["concern"]],
            recommendations=recommendations if recommendations else [defaults["recommendation"]],
            training_zones=training_zones
        )
        
    except Exception as e:
        logger.error(f"AI Analysis error: {str(e)}")
        # Fallback to rule-based insights using translated text
        defaults = lp["defaults"]
        zones = lp["zones"]
        
        return AIInsights(
            summary=defaults["summary"],
            strengths=[defaults["strength"]],
            concerns=[defaults["concern"]],
            recommendations=[defaults["recommendation"]],
            training_zones=zones
        )

@api_router.get("/analysis/comprehensive/{athlete_id}")
async def get_comprehensive_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """Get all analyses in one endpoint"""
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    result = ComprehensiveAnalysis(
        athlete_id=athlete_id,
        athlete_name=athlete["name"],
        analysis_date=datetime.utcnow().strftime("%Y-%m-%d")
    )
    
    # Try to get each analysis (non-blocking)
    try:
        acwr = await get_acwr_analysis(athlete_id, lang, current_user)
        result.acwr = acwr
    except:
        pass
    
    try:
        fatigue = await get_fatigue_analysis(athlete_id, lang, current_user)
        result.fatigue = fatigue
    except:
        pass
    
    try:
        insights = await get_ai_insights(athlete_id, lang, current_user)
        result.ai_insights = insights
    except:
        pass
    
    return result

# ============= STRENGTH ANALYSIS =============

class StrengthMetric(BaseModel):
    name: str
    value: float
    unit: str
    classification: str  # "excellent", "good", "average", "below_average", "poor"
    percentile: float  # Position compared to normative data
    variation_from_peak: Optional[float] = None  # % change from personal best
    variation_from_previous: Optional[float] = None  # % change from previous assessment
    previous_value: Optional[float] = None  # Value from previous assessment

class StrengthAnalysisResult(BaseModel):
    athlete_id: str
    assessment_date: str
    previous_assessment_date: Optional[str] = None
    metrics: List[StrengthMetric]
    fatigue_index: float
    fatigue_alert: bool
    peripheral_fatigue_detected: bool
    overall_strength_classification: str
    ai_insights: Optional[str] = None
    recommendations: List[str]
    historical_trend: Optional[Dict[str, Any]] = None
    comparison_with_previous: Optional[Dict[str, Any]] = None

# Normative data for football players (based on literature)
STRENGTH_NORMATIVES = {
    "mean_power": {"excellent": 2500, "good": 2200, "average": 1900, "below_average": 1600, "unit": "W"},
    "peak_power": {"excellent": 4000, "good": 3500, "average": 3000, "below_average": 2500, "unit": "W"},
    "mean_speed": {"excellent": 1.5, "good": 1.3, "average": 1.1, "below_average": 0.9, "unit": "m/s"},
    "peak_speed": {"excellent": 3.0, "good": 2.6, "average": 2.2, "below_average": 1.8, "unit": "m/s"},
    "rsi": {"excellent": 2.5, "good": 2.0, "average": 1.5, "below_average": 1.0, "unit": ""},
    "fatigue_index": {"low": 30, "moderate": 50, "high": 70, "critical": 85, "unit": "%"}
}

# ============= JUMP ASSESSMENT MODELS (CMJ, SL-CMJ, DJ) =============

import math

class JumpProtocol(str, Enum):
    CMJ = "cmj"  # Counter Movement Jump
    SL_CMJ_RIGHT = "sl_cmj_right"  # Single Leg CMJ - Right
    SL_CMJ_LEFT = "sl_cmj_left"  # Single Leg CMJ - Left
    DJ = "dj"  # Drop Jump

class JumpAssessmentCreate(BaseModel):
    athlete_id: str
    date: str
    protocol: JumpProtocol
    flight_time_ms: float  # Tempo de Voo em milissegundos
    contact_time_ms: float  # Tempo de Contato em milissegundos
    jump_height_cm: Optional[float] = None  # Altura do salto (pode ser calculada)
    box_height_cm: Optional[float] = None  # Altura da caixa (apenas para DJ)
    notes: Optional[str] = None

class JumpAssessment(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str
    coach_id: str
    date: str
    protocol: str
    flight_time_ms: float
    contact_time_ms: float
    jump_height_cm: float
    box_height_cm: Optional[float] = None
    # Calculated metrics
    rsi: float  # Reactive Strength Index
    rsi_modified: Optional[float] = None  # RSI modificado (Jump Height / Contact Time)
    peak_power_w: float  # Pico de Potência (Sayers Equation)
    peak_velocity_ms: float  # Pico de Velocidade
    relative_power_wkg: float  # Potência Relativa (W/kg)
    # Classification
    rsi_classification: str
    fatigue_status: str
    fatigue_percentage: float
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# RSI Reference Values (based on sports science literature)
RSI_REFERENCES = {
    "excellent": {"min": 2.8, "label_pt": "Excelente", "label_en": "Excellent"},
    "very_good": {"min": 2.4, "label_pt": "Muito Bom", "label_en": "Very Good"},
    "good": {"min": 2.0, "label_pt": "Bom", "label_en": "Good"},
    "average": {"min": 1.5, "label_pt": "Médio", "label_en": "Average"},
    "below_average": {"min": 1.0, "label_pt": "Abaixo da Média", "label_en": "Below Average"},
    "poor": {"min": 0, "label_pt": "Fraco", "label_en": "Poor"}
}

# Fatigue Index based on RSI variation (CNS Fatigue Detection)
FATIGUE_RSI_THRESHOLDS = {
    "green": {"min": -5, "max": 100, "status_pt": "Treino Normal", "status_en": "Normal Training", "color": "#10b981"},
    "yellow": {"min": -12, "max": -5.01, "status_pt": "Monitorar Volume/Carga de Sprints", "status_en": "Monitor Volume/Sprint Load", "color": "#f59e0b"},
    "red": {"min": -100, "max": -12.01, "status_pt": "Alto Risco de Lesão - Reduzir Carga", "status_en": "High Injury Risk - Reduce Load", "color": "#ef4444"}
}

def calculate_jump_height_from_flight_time(flight_time_ms: float) -> float:
    """
    Calculate jump height from flight time using kinematic equation
    h = (g * t²) / 8
    where t is flight time in seconds and g = 9.81 m/s²
    """
    flight_time_s = flight_time_ms / 1000
    g = 9.81
    height_m = (g * (flight_time_s ** 2)) / 8
    return round(height_m * 100, 2)  # Convert to cm

def calculate_rsi(jump_height_cm: float, contact_time_ms: float) -> float:
    """
    Calculate Reactive Strength Index
    RSI = Jump Height (m) / Contact Time (s)
    """
    if contact_time_ms <= 0:
        return 0
    jump_height_m = jump_height_cm / 100
    contact_time_s = contact_time_ms / 1000
    rsi = jump_height_m / contact_time_s
    return round(rsi, 2)

def calculate_rsi_modified(flight_time_ms: float, contact_time_ms: float) -> float:
    """
    Calculate Modified RSI (for Drop Jump)
    RSI-mod = Flight Time / Contact Time
    """
    if contact_time_ms <= 0:
        return 0
    return round(flight_time_ms / contact_time_ms, 2)

def calculate_peak_power_sayers(jump_height_cm: float, body_mass_kg: float) -> float:
    """
    Calculate Peak Power using Sayers Equation (1999)
    PP (Watts) = 60.7 × jump height (cm) + 45.3 × body mass (kg) - 2055
    
    Reference: Sayers SP, Harackiewicz DV, Harman EA, Frykman PN, Rosenstein MT.
    Cross-validation of three jump power equations.
    Med Sci Sports Exerc. 1999;31(4):572-577.
    """
    peak_power = (60.7 * jump_height_cm) + (45.3 * body_mass_kg) - 2055
    return round(max(0, peak_power), 1)

def calculate_peak_velocity(jump_height_cm: float) -> float:
    """
    Calculate Peak Velocity using kinematic equation
    v = √(2 × g × h)
    """
    g = 9.81
    height_m = jump_height_cm / 100
    velocity = math.sqrt(2 * g * height_m)
    return round(velocity, 2)

def classify_rsi(rsi: float) -> str:
    """Classify RSI based on reference values"""
    for classification, values in RSI_REFERENCES.items():
        if rsi >= values["min"]:
            return classification
    return "poor"

def get_fatigue_status(rsi_variation_percent: float) -> dict:
    """Get fatigue status based on RSI variation from baseline"""
    for status, thresholds in FATIGUE_RSI_THRESHOLDS.items():
        if thresholds["min"] <= rsi_variation_percent <= thresholds["max"]:
            return {
                "status": status,
                "status_pt": thresholds["status_pt"],
                "status_en": thresholds["status_en"],
                "color": thresholds["color"]
            }
    return {
        "status": "green",
        "status_pt": FATIGUE_RSI_THRESHOLDS["green"]["status_pt"],
        "status_en": FATIGUE_RSI_THRESHOLDS["green"]["status_en"],
        "color": FATIGUE_RSI_THRESHOLDS["green"]["color"]
    }

def calculate_z_score(current_value: float, historical_values: List[float]) -> float:
    """
    Calculate Z-Score comparing current value with historical mean
    Z = (X - μ) / σ
    """
    if len(historical_values) < 2:
        return 0
    mean = sum(historical_values) / len(historical_values)
    variance = sum((x - mean) ** 2 for x in historical_values) / len(historical_values)
    std_dev = math.sqrt(variance)
    if std_dev == 0:
        return 0
    z_score = (current_value - mean) / std_dev
    return round(z_score, 2)

def calculate_limb_asymmetry(right_value: float, left_value: float) -> dict:
    """
    Calculate limb asymmetry percentage
    Asymmetry > 10% is considered a Red Flag
    """
    if right_value == 0 and left_value == 0:
        return {"asymmetry_percent": 0, "dominant_leg": "equal", "red_flag": False}
    
    max_val = max(right_value, left_value)
    min_val = min(right_value, left_value)
    
    asymmetry = ((max_val - min_val) / max_val) * 100 if max_val > 0 else 0
    dominant = "right" if right_value > left_value else "left" if left_value > right_value else "equal"
    
    return {
        "asymmetry_percent": round(asymmetry, 1),
        "dominant_leg": dominant,
        "red_flag": asymmetry > 10
    }

# ============= JUMP ASSESSMENT ENDPOINTS =============

@api_router.get("/jump/protocols")
async def get_jump_protocols(lang: str = "pt"):
    """Get available jump assessment protocols"""
    protocols = {
        "cmj": {
            "id": "cmj",
            "name": "CMJ" if lang == "en" else "CMJ",
            "full_name": "Counter Movement Jump" if lang == "en" else "Counter Movement Jump",
            "description": "Standard bilateral countermovement jump test" if lang == "en" else "Teste de salto bilateral com contra-movimento padrão",
            "required_fields": ["flight_time_ms", "contact_time_ms"],
            "optional_fields": ["jump_height_cm"],
            "icon": "trending-up"
        },
        "sl_cmj_right": {
            "id": "sl_cmj_right",
            "name": "SL-CMJ (D)" if lang == "pt" else "SL-CMJ (R)",
            "full_name": "Single Leg CMJ - Right" if lang == "en" else "Single Leg CMJ - Direita",
            "description": "Single leg jump test for right leg" if lang == "en" else "Teste de salto unilateral para perna direita",
            "required_fields": ["flight_time_ms", "contact_time_ms"],
            "optional_fields": ["jump_height_cm"],
            "icon": "fitness"
        },
        "sl_cmj_left": {
            "id": "sl_cmj_left",
            "name": "SL-CMJ (E)" if lang == "pt" else "SL-CMJ (L)",
            "full_name": "Single Leg CMJ - Left" if lang == "en" else "Single Leg CMJ - Esquerda",
            "description": "Single leg jump test for left leg" if lang == "en" else "Teste de salto unilateral para perna esquerda",
            "required_fields": ["flight_time_ms", "contact_time_ms"],
            "optional_fields": ["jump_height_cm"],
            "icon": "fitness"
        },
        "dj": {
            "id": "dj",
            "name": "DJ" if lang == "en" else "DJ",
            "full_name": "Drop Jump" if lang == "en" else "Drop Jump",
            "description": "Drop jump from a box to assess reactive strength" if lang == "en" else "Salto de queda de uma caixa para avaliar força reativa",
            "required_fields": ["flight_time_ms", "contact_time_ms", "box_height_cm"],
            "optional_fields": ["jump_height_cm"],
            "icon": "arrow-down"
        }
    }
    return protocols

@api_router.post("/jump/assessment")
async def create_jump_assessment(
    data: JumpAssessmentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new jump assessment with automatic calculations"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get athlete weight for power calculations
    body_mass_kg = athlete.get("weight", 70)  # Default 70kg if not set
    
    # Calculate jump height if not provided
    jump_height_cm = data.jump_height_cm
    if not jump_height_cm or jump_height_cm <= 0:
        jump_height_cm = calculate_jump_height_from_flight_time(data.flight_time_ms)
    
    # Calculate RSI
    rsi = calculate_rsi(jump_height_cm, data.contact_time_ms)
    rsi_modified = calculate_rsi_modified(data.flight_time_ms, data.contact_time_ms)
    
    # Calculate Peak Power (Sayers Equation)
    peak_power = calculate_peak_power_sayers(jump_height_cm, body_mass_kg)
    
    # Calculate Peak Velocity
    peak_velocity = calculate_peak_velocity(jump_height_cm)
    
    # Calculate Relative Power
    relative_power = round(peak_power / body_mass_kg, 2) if body_mass_kg > 0 else 0
    
    # Classify RSI
    rsi_classification = classify_rsi(rsi)
    
    # Get historical RSI for fatigue calculation
    historical_assessments = await db.jump_assessments.find({
        "athlete_id": data.athlete_id,
        "coach_id": current_user["_id"],
        "protocol": data.protocol.value
    }).sort("date", -1).to_list(30)
    
    # Calculate fatigue based on RSI variation from baseline (average of last 5)
    fatigue_percentage = 0
    fatigue_status = "green"
    
    if historical_assessments:
        historical_rsi = [a.get("rsi", 0) for a in historical_assessments[:5] if a.get("rsi", 0) > 0]
        if historical_rsi:
            baseline_rsi = sum(historical_rsi) / len(historical_rsi)
            if baseline_rsi > 0:
                fatigue_percentage = ((rsi - baseline_rsi) / baseline_rsi) * 100
    
    fatigue_info = get_fatigue_status(fatigue_percentage)
    fatigue_status = fatigue_info["status"]
    
    # Create assessment record
    assessment = JumpAssessment(
        athlete_id=data.athlete_id,
        coach_id=current_user["_id"],
        date=data.date,
        protocol=data.protocol.value,
        flight_time_ms=data.flight_time_ms,
        contact_time_ms=data.contact_time_ms,
        jump_height_cm=jump_height_cm,
        box_height_cm=data.box_height_cm,
        rsi=rsi,
        rsi_modified=rsi_modified,
        peak_power_w=peak_power,
        peak_velocity_ms=peak_velocity,
        relative_power_wkg=relative_power,
        rsi_classification=rsi_classification,
        fatigue_status=fatigue_status,
        fatigue_percentage=round(fatigue_percentage, 1),
        notes=data.notes
    )
    
    result = await db.jump_assessments.insert_one(assessment.model_dump(by_alias=True, exclude=["id"]))
    assessment.id = str(result.inserted_id)
    
    return {
        "assessment": assessment.model_dump(by_alias=True),
        "calculations": {
            "jump_height_cm": jump_height_cm,
            "rsi": rsi,
            "rsi_modified": rsi_modified,
            "peak_power_w": peak_power,
            "peak_velocity_ms": peak_velocity,
            "relative_power_wkg": relative_power,
            "rsi_classification": rsi_classification,
            "fatigue_status": fatigue_status,
            "fatigue_percentage": round(fatigue_percentage, 1)
        }
    }

@api_router.get("/jump/assessments/{athlete_id}")
async def get_jump_assessments(
    athlete_id: str,
    protocol: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all jump assessments for an athlete"""
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    query = {
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }
    if protocol:
        query["protocol"] = protocol
    
    assessments = await db.jump_assessments.find(query).sort("date", -1).to_list(100)
    
    for a in assessments:
        a["_id"] = str(a["_id"])
    
    return assessments

@api_router.get("/jump/analysis/{athlete_id}")
async def get_jump_analysis(
    athlete_id: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """
    Complete jump analysis with RSI, fatigue index, asymmetry, power/velocity insights, and Z-score
    """
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    body_mass_kg = athlete.get("weight", 70)
    
    # Get all jump assessments
    all_assessments = await db.jump_assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(100)
    
    if not all_assessments:
        raise HTTPException(
            status_code=400, 
            detail="No jump assessment data available" if lang == "en" else "Nenhuma avaliação de salto disponível"
        )
    
    # Separate by protocol
    cmj_assessments = [a for a in all_assessments if a.get("protocol") == "cmj"]
    sl_right_assessments = [a for a in all_assessments if a.get("protocol") == "sl_cmj_right"]
    sl_left_assessments = [a for a in all_assessments if a.get("protocol") == "sl_cmj_left"]
    dj_assessments = [a for a in all_assessments if a.get("protocol") == "dj"]
    
    # Get latest assessment for each protocol
    latest_cmj = cmj_assessments[0] if cmj_assessments else None
    latest_sl_right = sl_right_assessments[0] if sl_right_assessments else None
    latest_sl_left = sl_left_assessments[0] if sl_left_assessments else None
    latest_dj = dj_assessments[0] if dj_assessments else None
    
    # Build analysis response
    analysis = {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name"),
        "body_mass_kg": body_mass_kg,
        "analysis_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "protocols": {},
        "asymmetry": None,
        "fatigue_analysis": None,
        "power_velocity_insights": None,
        "z_score": None,
        "ai_feedback": None,
        "recommendations": []
    }
    
    # Process CMJ data
    if latest_cmj:
        historical_rsi = [a.get("rsi", 0) for a in cmj_assessments if a.get("rsi", 0) > 0]
        historical_heights = [a.get("jump_height_cm", 0) for a in cmj_assessments if a.get("jump_height_cm", 0) > 0]
        
        baseline_rsi = sum(historical_rsi[:5]) / len(historical_rsi[:5]) if len(historical_rsi) >= 5 else (historical_rsi[0] if historical_rsi else latest_cmj.get("rsi", 0))
        current_rsi = latest_cmj.get("rsi", 0)
        rsi_variation = ((current_rsi - baseline_rsi) / baseline_rsi * 100) if baseline_rsi > 0 else 0
        
        fatigue_info = get_fatigue_status(rsi_variation)
        
        # Calculate Z-Score for jump height
        z_score_height = calculate_z_score(latest_cmj.get("jump_height_cm", 0), historical_heights)
        
        analysis["protocols"]["cmj"] = {
            "latest": {
                "date": latest_cmj.get("date"),
                "jump_height_cm": latest_cmj.get("jump_height_cm"),
                "flight_time_ms": latest_cmj.get("flight_time_ms"),
                "contact_time_ms": latest_cmj.get("contact_time_ms"),
                "rsi": latest_cmj.get("rsi"),
                "rsi_classification": latest_cmj.get("rsi_classification"),
                "peak_power_w": latest_cmj.get("peak_power_w"),
                "peak_velocity_ms": latest_cmj.get("peak_velocity_ms"),
                "relative_power_wkg": latest_cmj.get("relative_power_wkg")
            },
            "baseline_rsi": round(baseline_rsi, 2),
            "rsi_variation_percent": round(rsi_variation, 1),
            "fatigue_status": fatigue_info,
            "z_score_height": z_score_height,
            "history": [
                {
                    "date": a.get("date"),
                    "rsi": a.get("rsi"),
                    "jump_height_cm": a.get("jump_height_cm"),
                    "peak_power_w": a.get("peak_power_w")
                } for a in cmj_assessments[:10]
            ]
        }
        
        # Set main fatigue analysis from CMJ
        analysis["fatigue_analysis"] = {
            "status": fatigue_info["status"],
            "status_label": fatigue_info["status_pt"] if lang == "pt" else fatigue_info["status_en"],
            "color": fatigue_info["color"],
            "rsi_variation_percent": round(rsi_variation, 1),
            "baseline_rsi": round(baseline_rsi, 2),
            "current_rsi": round(current_rsi, 2),
            "interpretation": get_fatigue_interpretation(rsi_variation, lang)
        }
        
        analysis["z_score"] = {
            "jump_height": z_score_height,
            "interpretation": get_z_score_interpretation(z_score_height, lang)
        }
    
    # Process SL-CMJ data for Asymmetry
    if latest_sl_right and latest_sl_left:
        right_rsi = latest_sl_right.get("rsi", 0)
        left_rsi = latest_sl_left.get("rsi", 0)
        right_height = latest_sl_right.get("jump_height_cm", 0)
        left_height = latest_sl_left.get("jump_height_cm", 0)
        
        asymmetry_rsi = calculate_limb_asymmetry(right_rsi, left_rsi)
        asymmetry_height = calculate_limb_asymmetry(right_height, left_height)
        
        analysis["protocols"]["sl_cmj"] = {
            "right": {
                "date": latest_sl_right.get("date"),
                "jump_height_cm": right_height,
                "rsi": right_rsi,
                "peak_power_w": latest_sl_right.get("peak_power_w")
            },
            "left": {
                "date": latest_sl_left.get("date"),
                "jump_height_cm": left_height,
                "rsi": left_rsi,
                "peak_power_w": latest_sl_left.get("peak_power_w")
            }
        }
        
        analysis["asymmetry"] = {
            "rsi": asymmetry_rsi,
            "jump_height": asymmetry_height,
            "red_flag": asymmetry_rsi["red_flag"] or asymmetry_height["red_flag"],
            "interpretation": get_asymmetry_interpretation(asymmetry_rsi, lang)
        }
    
    # Process DJ data
    if latest_dj:
        analysis["protocols"]["dj"] = {
            "latest": {
                "date": latest_dj.get("date"),
                "box_height_cm": latest_dj.get("box_height_cm"),
                "jump_height_cm": latest_dj.get("jump_height_cm"),
                "contact_time_ms": latest_dj.get("contact_time_ms"),
                "rsi": latest_dj.get("rsi"),
                "rsi_modified": latest_dj.get("rsi_modified")
            },
            "history": [
                {
                    "date": a.get("date"),
                    "rsi": a.get("rsi"),
                    "box_height_cm": a.get("box_height_cm")
                } for a in dj_assessments[:10]
            ]
        }
    
    # Power-Velocity Insights (using CMJ or DJ data)
    primary_assessment = latest_cmj or latest_dj
    if primary_assessment:
        peak_power = primary_assessment.get("peak_power_w", 0)
        peak_velocity = primary_assessment.get("peak_velocity_ms", 0)
        relative_power = primary_assessment.get("relative_power_wkg", 0)
        
        # Compare with team/population averages (simplified)
        # These would ideally come from actual team data
        avg_power = 3000  # Watts
        avg_velocity = 2.8  # m/s
        
        power_vs_avg = ((peak_power - avg_power) / avg_power * 100) if avg_power > 0 else 0
        velocity_vs_avg = ((peak_velocity - avg_velocity) / avg_velocity * 100) if avg_velocity > 0 else 0
        
        analysis["power_velocity_insights"] = {
            "peak_power_w": peak_power,
            "peak_velocity_ms": peak_velocity,
            "relative_power_wkg": relative_power,
            "power_vs_average_percent": round(power_vs_avg, 1),
            "velocity_vs_average_percent": round(velocity_vs_avg, 1),
            "profile": get_power_velocity_profile(power_vs_avg, velocity_vs_avg, lang)
        }
    
    # Generate AI-powered feedback
    try:
        ai_feedback = await generate_jump_ai_feedback(analysis, athlete, lang)
        analysis["ai_feedback"] = ai_feedback
    except Exception as e:
        logging.error(f"AI feedback generation error: {e}")
        analysis["ai_feedback"] = None
    
    # Generate recommendations
    analysis["recommendations"] = generate_jump_recommendations(analysis, lang)
    
    return analysis

def get_fatigue_interpretation(rsi_variation: float, lang: str) -> str:
    """Get interpretation text for fatigue based on RSI variation"""
    if rsi_variation >= -5:
        return "Sistema nervoso central recuperado. Treino normal permitido." if lang == "pt" else "Central nervous system recovered. Normal training permitted."
    elif rsi_variation >= -12:
        return "Possível fadiga do SNC detectada. Monitorar volume de sprints e exercícios de alta velocidade." if lang == "pt" else "Possible CNS fatigue detected. Monitor sprint volume and high-speed exercises."
    else:
        return "⚠️ Fadiga significativa do SNC. Alto risco de lesão. Reduzir carga ou individualizar treino." if lang == "pt" else "⚠️ Significant CNS fatigue. High injury risk. Reduce load or individualize training."

def get_z_score_interpretation(z_score: float, lang: str) -> str:
    """Get interpretation text for Z-Score"""
    if z_score >= 1.5:
        return "Performance significativamente acima da média histórica!" if lang == "pt" else "Performance significantly above historical average!"
    elif z_score >= 0.5:
        return "Performance acima da média histórica." if lang == "pt" else "Performance above historical average."
    elif z_score >= -0.5:
        return "Performance dentro da média histórica." if lang == "pt" else "Performance within historical average."
    elif z_score >= -1.5:
        return "Performance abaixo da média histórica. Monitorar recuperação." if lang == "pt" else "Performance below historical average. Monitor recovery."
    else:
        return "⚠️ Performance significativamente abaixo da média. Investigar causas." if lang == "pt" else "⚠️ Performance significantly below average. Investigate causes."

def get_asymmetry_interpretation(asymmetry: dict, lang: str) -> str:
    """Get interpretation text for limb asymmetry"""
    if not asymmetry["red_flag"]:
        return "Simetria entre membros dentro dos limites aceitáveis." if lang == "pt" else "Limb symmetry within acceptable limits."
    else:
        dominant = "direita" if asymmetry["dominant_leg"] == "right" else "esquerda"
        dominant_en = asymmetry["dominant_leg"]
        if lang == "pt":
            return f"🚩 RED FLAG: Assimetria de {asymmetry['asymmetry_percent']:.1f}% detectada. Perna {dominant} dominante. Risco aumentado de lesão. Recomenda-se trabalho de correção."
        else:
            return f"🚩 RED FLAG: {asymmetry['asymmetry_percent']:.1f}% asymmetry detected. {dominant_en.capitalize()} leg dominant. Increased injury risk. Corrective work recommended."

def get_power_velocity_profile(power_vs_avg: float, velocity_vs_avg: float, lang: str) -> dict:
    """Determine training profile based on power-velocity relationship"""
    if power_vs_avg < -10 and velocity_vs_avg >= 0:
        # High velocity, low power -> needs max strength training
        return {
            "type": "velocity_dominant",
            "label": "Dominante em Velocidade" if lang == "pt" else "Velocity Dominant",
            "recommendation": "Priorizar treino de Força Máxima (cargas >85% 1RM)" if lang == "pt" else "Prioritize Maximum Strength training (loads >85% 1RM)",
            "color": "#3b82f6"
        }
    elif power_vs_avg >= 0 and velocity_vs_avg < -10:
        # High power, low velocity -> needs power/velocity training
        return {
            "type": "power_dominant",
            "label": "Dominante em Potência" if lang == "pt" else "Power Dominant",
            "recommendation": "Priorizar treino de Potência/Velocidade (Pliométricos, Sprints)" if lang == "pt" else "Prioritize Power/Velocity training (Plyometrics, Sprints)",
            "color": "#f59e0b"
        }
    elif power_vs_avg >= 0 and velocity_vs_avg >= 0:
        # Both high -> balanced/elite
        return {
            "type": "balanced",
            "label": "Perfil Equilibrado" if lang == "pt" else "Balanced Profile",
            "recommendation": "Manter equilíbrio entre força, potência e velocidade" if lang == "pt" else "Maintain balance between strength, power and velocity",
            "color": "#10b981"
        }
    else:
        # Both low -> general improvement needed
        return {
            "type": "development",
            "label": "Em Desenvolvimento" if lang == "pt" else "In Development",
            "recommendation": "Programa completo de força e condicionamento recomendado" if lang == "pt" else "Complete strength and conditioning program recommended",
            "color": "#6366f1"
        }

async def generate_jump_ai_feedback(analysis: dict, athlete: dict, lang: str) -> str:
    """Generate AI-powered scientific feedback based on jump analysis"""
    try:
        system_message = """You are an expert sports scientist specializing in neuromuscular assessment and jump testing.
        You provide concise, scientific analysis based on sports science literature.
        Use proper terminology and be direct with recommendations."""
        
        llm_client = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            system_message=system_message,
            session_id=f"jump_analysis_{analysis['athlete_id']}_{datetime.utcnow().strftime('%Y%m%d')}"
        )
        llm_client = llm_client.with_model("openai", "gpt-4o")
        
        # Build context for AI
        context = f"""
        Analyze the following jump test data and provide scientific feedback in {"Portuguese" if lang == "pt" else "English"}.
        
        Athlete: {athlete.get('name')}
        Position: {athlete.get('position', 'N/A')}
        Body Mass: {analysis.get('body_mass_kg', 70)} kg
        
        CMJ Data: {analysis.get('protocols', {}).get('cmj', {}).get('latest', 'No data')}
        RSI Classification: {analysis.get('protocols', {}).get('cmj', {}).get('latest', {}).get('rsi_classification', 'N/A')}
        RSI Baseline: {analysis.get('protocols', {}).get('cmj', {}).get('baseline_rsi', 'N/A')}
        RSI Variation: {analysis.get('protocols', {}).get('cmj', {}).get('rsi_variation_percent', 'N/A')}%
        
        Fatigue Status: {analysis.get('fatigue_analysis', {}).get('status_label', 'N/A')}
        
        Asymmetry: {analysis.get('asymmetry', 'Not assessed')}
        
        Power-Velocity Profile: {analysis.get('power_velocity_insights', {}).get('profile', {}).get('label', 'N/A')}
        Peak Power: {analysis.get('power_velocity_insights', {}).get('peak_power_w', 'N/A')} W
        Relative Power: {analysis.get('power_velocity_insights', {}).get('relative_power_wkg', 'N/A')} W/kg
        
        Z-Score (Jump Height): {analysis.get('z_score', {}).get('jump_height', 'N/A')}
        
        Based on this data and current sports science literature:
        1. Provide a brief assessment of the athlete's neuromuscular status
        2. If RSI is low (<1.5), explain why explosive exercises, COD, plyometrics with concentric emphasis, sprints should be limited
        3. If fatigue is detected (yellow or red), provide specific recovery recommendations
        4. If asymmetry is detected, explain the injury risk implications
        5. Based on the power-velocity profile, suggest specific training focus
        
        Be concise but scientific. Use proper terminology. Keep response under 300 words.
        """
        
        response = await llm_client.send_message(UserMessage(text=context))
        return response
        
    except Exception as e:
        logging.error(f"AI feedback generation error: {e}")
        return None

def generate_jump_recommendations(analysis: dict, lang: str) -> List[str]:
    """Generate actionable recommendations based on jump analysis"""
    recommendations = []
    
    # RSI-based recommendations
    cmj_data = analysis.get("protocols", {}).get("cmj", {})
    if cmj_data:
        latest = cmj_data.get("latest", {})
        rsi = latest.get("rsi", 0)
        rsi_class = latest.get("rsi_classification", "")
        
        if rsi < 1.0:
            if lang == "pt":
                recommendations.append("⚠️ RSI muito baixo (<1.0). Evitar: exercícios explosivos, COD (mudanças de direção), pliométricos com ênfase concêntrica, sprints e trabalhos de velocidade máxima.")
            else:
                recommendations.append("⚠️ Very low RSI (<1.0). Avoid: explosive exercises, COD, concentric-emphasis plyometrics, sprints and max velocity work.")
        elif rsi < 1.5:
            if lang == "pt":
                recommendations.append("RSI abaixo da média. Limitar volume de exercícios de alta intensidade e focar em força base.")
            else:
                recommendations.append("Below average RSI. Limit high-intensity exercise volume and focus on base strength.")
    
    # Fatigue-based recommendations
    fatigue = analysis.get("fatigue_analysis", {})
    if fatigue:
        status = fatigue.get("status", "green")
        if status == "red":
            if lang == "pt":
                recommendations.append("🔴 ALERTA: Fadiga do SNC detectada (variação >13%). Reduzir carga de treino imediatamente. Priorizar sono e recuperação. Considerar treino individualizado.")
            else:
                recommendations.append("🔴 ALERT: CNS fatigue detected (>13% variation). Reduce training load immediately. Prioritize sleep and recovery. Consider individualized training.")
        elif status == "yellow":
            if lang == "pt":
                recommendations.append("🟡 MONITORAR: Sinais de fadiga. Reduzir volume de sprints e exercícios de alta velocidade nos próximos dias.")
            else:
                recommendations.append("🟡 MONITOR: Fatigue signs detected. Reduce sprint volume and high-speed exercises in coming days.")
    
    # Asymmetry-based recommendations
    asymmetry = analysis.get("asymmetry", {})
    if asymmetry and asymmetry.get("red_flag"):
        dominant = asymmetry.get("rsi", {}).get("dominant_leg", "")
        percent = asymmetry.get("rsi", {}).get("asymmetry_percent", 0)
        if lang == "pt":
            recommendations.append(f"🚩 Assimetria significativa ({percent:.1f}%) detectada. Incluir exercícios unilaterais corretivos focando no membro não-dominante.")
        else:
            recommendations.append(f"🚩 Significant asymmetry ({percent:.1f}%) detected. Include corrective unilateral exercises focusing on non-dominant limb.")
    
    # Power-velocity profile recommendations
    pv_profile = analysis.get("power_velocity_insights", {}).get("profile", {})
    if pv_profile:
        rec = pv_profile.get("recommendation", "")
        if rec:
            recommendations.append(f"💪 {rec}")
    
    # Z-score recommendations
    z_score = analysis.get("z_score", {})
    if z_score and z_score.get("jump_height", 0) < -1.5:
        if lang == "pt":
            recommendations.append("📉 Performance significativamente abaixo da média histórica. Investigar: qualidade do sono, estresse, nutrição, sobrecarga de treino.")
        else:
            recommendations.append("📉 Performance significantly below historical average. Investigate: sleep quality, stress, nutrition, training overload.")
    
    if not recommendations:
        if lang == "pt":
            recommendations.append("✅ Atleta em boas condições. Continuar com protocolo de treino atual.")
        else:
            recommendations.append("✅ Athlete in good condition. Continue with current training protocol.")
    
    return recommendations

@api_router.delete("/jump/assessment/{assessment_id}")
async def delete_jump_assessment(
    assessment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a jump assessment"""
    result = await db.jump_assessments.delete_one({
        "_id": ObjectId(assessment_id),
        "coach_id": current_user["_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    return {"message": "Assessment deleted successfully"}

@api_router.get("/analysis/strength/{athlete_id}", response_model=StrengthAnalysisResult)
async def get_strength_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """Analyze strength assessment data with normative comparisons and fatigue detection"""
    
    t = lambda key: get_analysis_text(lang, key)
    
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get all strength assessments for this athlete (ordered by date and created_at)
    assessments = await db.assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "assessment_type": "strength"
    }).sort([("date", -1), ("created_at", -1)]).to_list(100)
    
    if not assessments:
        raise HTTPException(status_code=400, detail=t("ai_no_data"))
    
    latest = assessments[0]
    previous = assessments[1] if len(assessments) > 1 else None
    metrics_data = latest.get("metrics", {})
    previous_metrics = previous.get("metrics", {}) if previous else {}
    
    # Calculate historical peaks
    historical_peaks = {}
    for a in assessments:
        m = a.get("metrics", {})
        for key in ["mean_power", "peak_power", "mean_speed", "peak_speed", "rsi"]:
            if key in m and m[key] is not None:
                if key not in historical_peaks or m[key] > historical_peaks[key]:
                    historical_peaks[key] = m[key]
    
    # Analyze each metric
    analyzed_metrics = []
    normatives = STRENGTH_NORMATIVES
    
    def classify_metric(value, metric_name):
        if metric_name not in normatives:
            return "average", 50.0
        
        norm = normatives[metric_name]
        if value >= norm["excellent"]:
            return "excellent", 95.0
        elif value >= norm["good"]:
            return "good", 75.0
        elif value >= norm["average"]:
            return "average", 50.0
        elif value >= norm["below_average"]:
            return "below_average", 25.0
        else:
            return "poor", 10.0
    
    # Process each metric
    for metric_key, display_name in [
        ("mean_power", "Mean Power"),
        ("peak_power", "Peak Power"),
        ("mean_speed", "Mean Speed"),
        ("peak_speed", "Peak Speed"),
        ("rsi", "RSI")
    ]:
        value = metrics_data.get(metric_key)
        if value is not None:
            classification, percentile = classify_metric(value, metric_key)
            
            # Calculate variation from personal peak
            variation = None
            if metric_key in historical_peaks and historical_peaks[metric_key] > 0:
                variation = ((value - historical_peaks[metric_key]) / historical_peaks[metric_key]) * 100
            
            # Calculate variation from previous assessment
            variation_from_previous = None
            previous_value = previous_metrics.get(metric_key) if previous_metrics else None
            if previous_value is not None and previous_value > 0:
                variation_from_previous = ((value - previous_value) / previous_value) * 100
            
            analyzed_metrics.append(StrengthMetric(
                name=display_name,
                value=value,
                unit=normatives.get(metric_key, {}).get("unit", ""),
                classification=classification,
                percentile=percentile,
                variation_from_peak=round(variation, 1) if variation else None,
                variation_from_previous=round(variation_from_previous, 1) if variation_from_previous is not None else None,
                previous_value=previous_value
            ))
    
    # Detect peripheral fatigue
    # Peripheral fatigue = RSI decrease + Peak Power decrease
    rsi_current = metrics_data.get("rsi", 0)
    peak_power_current = metrics_data.get("peak_power", 0)
    rsi_peak = historical_peaks.get("rsi", rsi_current)
    peak_power_peak = historical_peaks.get("peak_power", peak_power_current)
    
    rsi_drop = (rsi_peak - rsi_current) / rsi_peak * 100 if rsi_peak > 0 else 0
    power_drop = (peak_power_peak - peak_power_current) / peak_power_peak * 100 if peak_power_peak > 0 else 0
    
    # Calculate fatigue index automatically based on power drop from historical peak
    # Formula: 
    # - power_drop > 30% => fatigue_index < 70% (low recovery)
    # - power_drop 15-30% => fatigue_index 70-85% (moderate recovery)
    # - power_drop < 15% => fatigue_index 85-100% (good recovery)
    # We invert the logic: higher fatigue_index = more recovered = lower fatigue
    # But the user wants to show "fatigue level" so we calculate actual fatigue percentage
    
    # Calculate fatigue based on power drop and RSI drop
    # If power drops > 30%, fatigue is HIGH (>70%)
    # If power drops 15-30%, fatigue is MODERATE (50-70%)
    # If power drops < 15%, fatigue is LOW (<50%)
    
    manual_fatigue = metrics_data.get("fatigue_index", None)
    if manual_fatigue is not None and manual_fatigue > 0:
        # Use manual input if provided
        fatigue_index = manual_fatigue
    else:
        # Calculate fatigue from power drop
        # power_drop > 30% => fatigue_index = 80-100% (very fatigued)
        # power_drop 20-30% => fatigue_index = 70-80% (high fatigue)
        # power_drop 10-20% => fatigue_index = 50-70% (moderate fatigue)
        # power_drop < 10% => fatigue_index = 0-50% (low fatigue/well recovered)
        
        if power_drop >= 30:
            # Very high fatigue - scales from 80-100% based on how much above 30%
            fatigue_index = min(100, 80 + (power_drop - 30) * 0.5)
        elif power_drop >= 20:
            # High fatigue - scales from 70-80%
            fatigue_index = 70 + (power_drop - 20)
        elif power_drop >= 10:
            # Moderate fatigue - scales from 50-70%
            fatigue_index = 50 + (power_drop - 10) * 2
        elif power_drop >= 5:
            # Low fatigue - scales from 30-50%
            fatigue_index = 30 + (power_drop - 5) * 4
        else:
            # Well recovered - scales from 0-30%
            fatigue_index = power_drop * 6
        
        # Also factor in RSI drop
        if rsi_drop > 20:
            fatigue_index = min(100, fatigue_index + 10)
        elif rsi_drop > 10:
            fatigue_index = min(100, fatigue_index + 5)
        
        fatigue_index = round(fatigue_index, 1)
    
    fatigue_alert = fatigue_index > 70
    peripheral_fatigue = (rsi_drop > 10 and power_drop > 10) or fatigue_index > 70
    
    # Overall classification
    avg_percentile = sum(m.percentile for m in analyzed_metrics) / len(analyzed_metrics) if analyzed_metrics else 50
    if avg_percentile >= 80:
        overall_class = "excellent"
    elif avg_percentile >= 60:
        overall_class = "good"
    elif avg_percentile >= 40:
        overall_class = "average"
    else:
        overall_class = "below_average"
    
    # Generate recommendations
    recommendations = []
    
    if peripheral_fatigue:
        if lang == "pt":
            recommendations.append("⚠️ FADIGA PERIFÉRICA DETECTADA: Redução significativa no RSI e Pico de Potência indica acúmulo de fadiga muscular.")
            recommendations.append("Recomenda-se período de recuperação ativa e redução do volume de treino.")
            recommendations.append("Risco aumentado de lesão se os esforços intensos persistirem.")
        else:
            recommendations.append("⚠️ PERIPHERAL FATIGUE DETECTED: Significant RSI and Peak Power reduction indicates accumulated muscle fatigue.")
            recommendations.append("Active recovery period and reduced training volume recommended.")
            recommendations.append("Increased injury risk if intense efforts persist.")
    
    if fatigue_alert:
        if lang == "pt":
            recommendations.append(f"Índice de Fadiga em {fatigue_index}% - acima do limiar de 70%. Monitorar recuperação.")
        else:
            recommendations.append(f"Fatigue Index at {fatigue_index}% - above 70% threshold. Monitor recovery.")
    
    if not recommendations:
        if lang == "pt":
            recommendations.append("Níveis de força dentro dos parâmetros normais. Manter rotina de treino.")
        else:
            recommendations.append("Strength levels within normal parameters. Maintain training routine.")
    
    # Generate AI insights
    ai_insights = None
    try:
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        if emergent_key and len(analyzed_metrics) > 0:
            system_msg = "You are a sports science expert specializing in strength and conditioning for football players." if lang == "en" else "Você é um especialista em ciência do esporte, especializado em força e condicionamento para jogadores de futebol."
            
            metrics_summary = "\n".join([f"- {m.name}: {m.value}{m.unit} ({m.classification}, {m.percentile}th percentile)" for m in analyzed_metrics])
            
            prompt = f"""Analyze this football player's strength assessment:
{metrics_summary}
Fatigue Index: {fatigue_index}%
Peripheral Fatigue: {'Yes' if peripheral_fatigue else 'No'}
RSI Drop from Peak: {rsi_drop:.1f}%
Peak Power Drop from Peak: {power_drop:.1f}%

Provide a brief (2-3 sentences) professional insight about this athlete's strength profile and any concerns."""
            
            if lang == "pt":
                prompt = f"""Analise esta avaliação de força de um jogador de futebol:
{metrics_summary}
Índice de Fadiga: {fatigue_index}%
Fadiga Periférica: {'Sim' if peripheral_fatigue else 'Não'}
Queda do RSI do Pico: {rsi_drop:.1f}%
Queda do Pico de Potência do Pico: {power_drop:.1f}%

Forneça um insight profissional breve (2-3 frases) sobre o perfil de força deste atleta e quaisquer preocupações."""
            
            chat = LlmChat(
                api_key=emergent_key,
                session_id=f"strength_{athlete_id}_{datetime.utcnow().timestamp()}",
                system_message=system_msg
            ).with_model("openai", "gpt-4o")
            
            response = await chat.send_message(UserMessage(text=prompt))
            ai_insights = response
    except Exception as e:
        logger.error(f"AI strength analysis error: {str(e)}")
    
    # Build comparison with previous
    comparison_with_previous = None
    if previous:
        comparison_with_previous = {
            "date": previous.get("date"),
            "metrics": {}
        }
        for metric in analyzed_metrics:
            if metric.previous_value is not None:
                comparison_with_previous["metrics"][metric.name] = {
                    "current": metric.value,
                    "previous": metric.previous_value,
                    "change_percent": metric.variation_from_previous
                }
    
    return StrengthAnalysisResult(
        athlete_id=athlete_id,
        assessment_date=latest.get("date", ""),
        previous_assessment_date=previous.get("date") if previous else None,
        metrics=analyzed_metrics,
        fatigue_index=fatigue_index,
        fatigue_alert=fatigue_alert,
        peripheral_fatigue_detected=peripheral_fatigue,
        overall_strength_classification=overall_class,
        ai_insights=ai_insights,
        recommendations=recommendations,
        historical_trend={
            "rsi_peak": rsi_peak,
            "rsi_current": rsi_current,
            "rsi_drop_percent": round(rsi_drop, 1),
            "peak_power_peak": peak_power_peak,
            "peak_power_current": peak_power_current,
            "power_drop_percent": round(power_drop, 1)
        },
        comparison_with_previous=comparison_with_previous
    )


# ============= SCIENTIFIC ANALYSIS - COMPLETE INSIGHTS =============

class ScientificInsightsResponse(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    
    # GPS Metrics
    gps_summary: Optional[Dict[str, Any]] = None
    
    # ACWR Analysis
    acwr_analysis: Optional[Dict[str, Any]] = None
    
    # Wellness Metrics
    wellness_summary: Optional[Dict[str, Any]] = None
    
    # Jump Assessment (CMJ, RSI, Fatigue)
    jump_analysis: Optional[Dict[str, Any]] = None
    
    # VBT Analysis (Load-Velocity Profile)
    vbt_analysis: Optional[Dict[str, Any]] = None
    
    # Body Composition
    body_composition: Optional[Dict[str, Any]] = None
    
    # AI Scientific Insights
    scientific_insights: Optional[str] = None
    
    # Risk Assessment
    overall_risk_level: str = "unknown"
    injury_risk_factors: List[str] = []
    
    # Recommendations
    training_recommendations: List[str] = []
    recovery_recommendations: List[str] = []


@api_router.get("/analysis/scientific/{athlete_id}")
async def get_scientific_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """
    Complete scientific analysis consolidating GPS, ACWR, Wellness, Jump Assessment, 
    VBT (Load-Velocity Profile), Body Composition with AI-powered insights based on 
    sports science literature.
    """
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    response = ScientificInsightsResponse(
        athlete_id=athlete_id,
        athlete_name=athlete["name"],
        analysis_date=datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    )
    
    injury_risk_factors = []
    
    # 1. GPS Data Summary (últimos 30 dias)
    try:
        gps_data = await db.gps_data.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(30).to_list(30)
        
        if gps_data:
            total_distance = sum(g.get("total_distance", 0) for g in gps_data)
            avg_distance = total_distance / len(gps_data) if gps_data else 0
            avg_hi_distance = sum(g.get("high_intensity_distance", 0) for g in gps_data) / len(gps_data)
            avg_sprints = sum(g.get("sprint_count", 0) for g in gps_data) / len(gps_data)
            max_speed = max((g.get("max_speed", 0) for g in gps_data), default=0)
            avg_max_speed = sum(g.get("max_speed", 0) for g in gps_data) / len(gps_data)
            
            response.gps_summary = {
                "sessions_count": len(gps_data),
                "total_distance_m": round(total_distance, 0),
                "avg_distance_m": round(avg_distance, 0),
                "avg_high_intensity_m": round(avg_hi_distance, 0),
                "avg_sprints": round(avg_sprints, 1),
                "max_speed_kmh": round(max_speed, 1),
                "avg_max_speed_kmh": round(avg_max_speed, 1),
                "last_session_date": gps_data[0].get("date", "") if gps_data else None,
                "latest_session": {
                    "distance": gps_data[0].get("total_distance", 0),
                    "high_intensity": gps_data[0].get("high_intensity_distance", 0),
                    "sprints": gps_data[0].get("sprint_count", 0),
                    "max_speed": gps_data[0].get("max_speed", 0)
                } if gps_data else None
            }
    except Exception as e:
        print(f"GPS Error: {e}")
    
    # 2. ACWR Analysis
    try:
        acwr_result = await get_acwr_detailed_analysis(athlete_id, lang, current_user)
        response.acwr_analysis = {
            "overall_risk": acwr_result.overall_risk,
            "recommendation": acwr_result.recommendation,
            "metrics": [
                {
                    "name": m.name,
                    "acwr_ratio": m.acwr_ratio,
                    "acute_load": m.acute_load,
                    "chronic_load": m.chronic_load,
                    "risk_level": m.risk_level
                } for m in acwr_result.metrics
            ]
        }
        if acwr_result.overall_risk in ["high", "moderate"]:
            injury_risk_factors.append(f"ACWR em nível {acwr_result.overall_risk}" if lang == "pt" else f"ACWR at {acwr_result.overall_risk} level")
    except:
        pass
    
    # 3. Wellness Summary
    try:
        wellness_data = await db.wellness_questionnaires.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(14).to_list(14)
        
        if wellness_data:
            avg_wellness = sum(w.get("wellness_score", 0) for w in wellness_data) / len(wellness_data)
            avg_readiness = sum(w.get("readiness_score", 0) for w in wellness_data) / len(wellness_data)
            avg_sleep = sum(w.get("sleep_hours", 0) for w in wellness_data) / len(wellness_data)
            avg_fatigue = sum(w.get("fatigue", 0) for w in wellness_data) / len(wellness_data)
            avg_stress = sum(w.get("stress", 0) for w in wellness_data) / len(wellness_data)
            avg_soreness = sum(w.get("muscle_soreness", 0) for w in wellness_data) / len(wellness_data)
            
            latest = wellness_data[0]
            response.wellness_summary = {
                "records_count": len(wellness_data),
                "avg_wellness_score": round(avg_wellness, 1),
                "avg_readiness_score": round(avg_readiness, 1),
                "avg_sleep_hours": round(avg_sleep, 1),
                "avg_fatigue": round(avg_fatigue, 1),
                "avg_stress": round(avg_stress, 1),
                "avg_soreness": round(avg_soreness, 1),
                "latest": {
                    "date": latest.get("date", ""),
                    "wellness_score": latest.get("wellness_score", 0),
                    "readiness_score": latest.get("readiness_score", 0),
                    "sleep_hours": latest.get("sleep_hours", 0),
                    "sleep_quality": latest.get("sleep_quality", 0),
                    "fatigue": latest.get("fatigue", 0),
                    "stress": latest.get("stress", 0),
                    "muscle_soreness": latest.get("muscle_soreness", 0),
                    "mood": latest.get("mood", 0)
                }
            }
            
            if avg_fatigue >= 7:
                injury_risk_factors.append("Fadiga percebida elevada (RPE ≥ 7)" if lang == "pt" else "High perceived fatigue (RPE ≥ 7)")
            if avg_sleep < 7:
                injury_risk_factors.append("Déficit de sono crônico (<7h)" if lang == "pt" else "Chronic sleep deficit (<7h)")
            if avg_soreness >= 7:
                injury_risk_factors.append("Dor muscular elevada persistente" if lang == "pt" else "Persistent high muscle soreness")
    except Exception as e:
        print(f"Wellness Error: {e}")
    
    # 4. Jump Assessment (CMJ, RSI, Fatigue Index)
    try:
        jump_data = await db.jump_assessments.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(10).to_list(10)
        
        if jump_data:
            latest = jump_data[0]
            
            # Calculate Z-Score against athlete's history
            rsi_values = [j.get("rsi", 0) for j in jump_data]
            avg_rsi = sum(rsi_values) / len(rsi_values) if rsi_values else 0
            std_rsi = (sum((x - avg_rsi) ** 2 for x in rsi_values) / len(rsi_values)) ** 0.5 if len(rsi_values) > 1 else 0
            z_score = (latest.get("rsi", 0) - avg_rsi) / std_rsi if std_rsi > 0 else 0
            
            # Fatigue detection based on RSI variation
            if len(jump_data) >= 2:
                baseline_rsi = sum(rsi_values[1:min(5, len(rsi_values))]) / min(4, len(rsi_values) - 1)
                rsi_variation = ((latest.get("rsi", 0) - baseline_rsi) / baseline_rsi * 100) if baseline_rsi > 0 else 0
            else:
                rsi_variation = 0
            
            response.jump_analysis = {
                "assessments_count": len(jump_data),
                "latest": {
                    "date": latest.get("date", ""),
                    "protocol": latest.get("protocol", ""),
                    "jump_height_cm": latest.get("jump_height_cm", 0),
                    "flight_time_ms": latest.get("flight_time_ms", 0),
                    "contact_time_ms": latest.get("contact_time_ms", 0),
                    "rsi": round(latest.get("rsi", 0), 2),
                    "rsi_classification": latest.get("rsi_classification", ""),
                    "peak_power_w": round(latest.get("peak_power_w", 0), 0),
                    "peak_velocity_ms": round(latest.get("peak_velocity_ms", 0), 2),
                    "relative_power_wkg": round(latest.get("relative_power_wkg", 0), 1),
                    "fatigue_status": latest.get("fatigue_status", ""),
                    "fatigue_percentage": round(latest.get("fatigue_percentage", 0), 1)
                },
                "historical": {
                    "avg_rsi": round(avg_rsi, 2),
                    "std_rsi": round(std_rsi, 2),
                    "z_score": round(z_score, 2),
                    "rsi_variation_percent": round(rsi_variation, 1),
                    "trend": "declining" if rsi_variation < -5 else "stable" if rsi_variation < 5 else "improving"
                },
                "fatigue_alert": latest.get("fatigue_status", "") in ["yellow", "red"],
                "history": [
                    {
                        "date": j.get("date", ""),
                        "rsi": round(j.get("rsi", 0), 2),
                        "jump_height_cm": j.get("jump_height_cm", 0),
                        "protocol": j.get("protocol", "")
                    } for j in jump_data[:7]
                ]
            }
            
            if latest.get("fatigue_status", "") == "red":
                injury_risk_factors.append("RSI indica fadiga neuromuscular severa (>12% abaixo do baseline)" if lang == "pt" else "RSI indicates severe neuromuscular fatigue (>12% below baseline)")
            elif latest.get("fatigue_status", "") == "yellow":
                injury_risk_factors.append("RSI indica fadiga moderada (5-12% abaixo do baseline)" if lang == "pt" else "RSI indicates moderate fatigue (5-12% below baseline)")
    except Exception as e:
        print(f"Jump Error: {e}")
    
    # 5. VBT Analysis (Load-Velocity Profile)
    try:
        vbt_data = await db.vbt_data.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(20).to_list(20)
        
        if vbt_data:
            # Group by exercise and get latest for primary exercise
            exercises = {}
            for v in vbt_data:
                ex = v.get("exercise", "Back Squat")
                if ex not in exercises:
                    exercises[ex] = []
                exercises[ex].append(v)
            
            primary_exercise = max(exercises.keys(), key=lambda x: len(exercises[x]))
            primary_data = exercises[primary_exercise]
            
            # Calculate load-velocity profile
            all_sets = []
            for session in primary_data:
                for s in session.get("sets", []):
                    if s.get("load_kg", 0) > 0 and s.get("mean_velocity", 0) > 0:
                        all_sets.append({
                            "load": s.get("load_kg"),
                            "velocity": s.get("mean_velocity")
                        })
            
            # Linear regression for load-velocity
            slope, intercept, estimated_1rm, optimal_load = None, None, None, None
            if len(all_sets) >= 2:
                loads = [s["load"] for s in all_sets]
                velocities = [s["velocity"] for s in all_sets]
                n = len(loads)
                sum_x = sum(loads)
                sum_y = sum(velocities)
                sum_xy = sum(l * v for l, v in zip(loads, velocities))
                sum_x2 = sum(l * l for l in loads)
                
                denom = n * sum_x2 - sum_x * sum_x
                if denom != 0:
                    slope = (n * sum_xy - sum_x * sum_y) / denom
                    intercept = (sum_y - slope * sum_x) / n
                    
                    # MVT (Minimum Velocity Threshold) typically 0.3 m/s for squat
                    mvt = 0.3
                    if slope != 0:
                        estimated_1rm = (mvt - intercept) / slope
                        # Optimal load for power (typically around 50-60% 1RM)
                        optimal_load = estimated_1rm * 0.55
            
            # Latest session velocity loss
            latest_session = primary_data[0]
            sets = latest_session.get("sets", [])
            velocity_loss = []
            if len(sets) >= 2:
                first_velocity = sets[0].get("mean_velocity", 0)
                for i, s in enumerate(sets):
                    loss = ((first_velocity - s.get("mean_velocity", 0)) / first_velocity * 100) if first_velocity > 0 else 0
                    velocity_loss.append({
                        "set": i + 1,
                        "velocity": s.get("mean_velocity", 0),
                        "loss_percent": round(loss, 1)
                    })
            
            response.vbt_analysis = {
                "sessions_count": len(vbt_data),
                "primary_exercise": primary_exercise,
                "load_velocity_profile": {
                    "slope": round(slope, 4) if slope else None,
                    "intercept": round(intercept, 2) if intercept else None,
                    "estimated_1rm_kg": round(estimated_1rm, 1) if estimated_1rm else None,
                    "optimal_load_kg": round(optimal_load, 1) if optimal_load else None,
                    "mvt": 0.3,
                    "data_points": len(all_sets)
                },
                "latest_session": {
                    "date": latest_session.get("date", ""),
                    "exercise": latest_session.get("exercise", ""),
                    "sets_count": len(sets),
                    "avg_velocity": round(sum(s.get("mean_velocity", 0) for s in sets) / len(sets), 2) if sets else 0,
                    "max_velocity": round(max((s.get("peak_velocity", 0) for s in sets), default=0), 2),
                    "max_load": max((s.get("load_kg", 0) for s in sets), default=0),
                    "max_power": max((s.get("power_watts", 0) for s in sets), default=0)
                },
                "velocity_loss_analysis": velocity_loss,
                "fatigue_detected": any(v["loss_percent"] >= 20 for v in velocity_loss) if velocity_loss else False
            }
            
            if response.vbt_analysis.get("fatigue_detected"):
                injury_risk_factors.append("Perda de velocidade ≥20% detectada na última sessão VBT (fadiga periférica)" if lang == "pt" else "Velocity loss ≥20% detected in last VBT session (peripheral fatigue)")
    except Exception as e:
        print(f"VBT Error: {e}")
    
    # 6. Body Composition
    try:
        body_comp = await db.body_compositions.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(5).to_list(5)
        
        if body_comp:
            latest = body_comp[0]
            response.body_composition = {
                "records_count": len(body_comp),
                "latest": {
                    "date": latest.get("date", ""),
                    "protocol": latest.get("protocol", ""),
                    "body_fat_percent": latest.get("body_fat_percent", 0),
                    "lean_mass_kg": latest.get("lean_mass_kg", 0),
                    "fat_mass_kg": latest.get("fat_mass_kg", 0),
                    "weight_kg": latest.get("weight", 0),
                    "classification": latest.get("classification", "")
                },
                "trend": None
            }
            
            if len(body_comp) >= 2:
                prev = body_comp[1]
                fat_change = latest.get("body_fat_percent", 0) - prev.get("body_fat_percent", 0)
                lean_change = latest.get("lean_mass_kg", 0) - prev.get("lean_mass_kg", 0)
                response.body_composition["trend"] = {
                    "fat_percent_change": round(fat_change, 1),
                    "lean_mass_change_kg": round(lean_change, 1),
                    "direction": "improving" if fat_change < 0 and lean_change >= 0 else "declining" if fat_change > 0 else "stable"
                }
    except Exception as e:
        print(f"Body Comp Error: {e}")
    
    # 7. Determine Overall Risk Level
    response.injury_risk_factors = injury_risk_factors
    if len(injury_risk_factors) >= 3:
        response.overall_risk_level = "high"
    elif len(injury_risk_factors) >= 1:
        response.overall_risk_level = "moderate"
    else:
        response.overall_risk_level = "low"
    
    # 8. Generate AI Scientific Insights
    try:
        insights_text = await generate_scientific_ai_insights(response, athlete, lang)
        response.scientific_insights = insights_text
    except Exception as e:
        print(f"AI Insights Error: {e}")
        response.scientific_insights = None
    
    return response


async def generate_scientific_ai_insights(data: ScientificInsightsResponse, athlete: dict, lang: str) -> str:
    """
    Generate AI-powered scientific insights based on comprehensive athlete data.
    Uses sports science terminology and evidence-based recommendations.
    """
    from emergentintegrations.llm import LlmChat
    
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        return None
    
    # Build comprehensive data context
    context_parts = []
    
    # Athlete info
    athlete_info = f"Atleta: {athlete['name']}, Posição: {athlete.get('position', 'N/A')}"
    if athlete.get('weight'):
        athlete_info += f", Peso: {athlete['weight']}kg"
    if athlete.get('height'):
        athlete_info += f", Altura: {athlete['height']}cm"
    context_parts.append(athlete_info)
    
    # GPS Data
    if data.gps_summary:
        gps = data.gps_summary
        context_parts.append(f"""
DADOS GPS (últimas {gps['sessions_count']} sessões):
- Distância média: {gps['avg_distance_m']}m
- Distância alta intensidade média: {gps['avg_high_intensity_m']}m
- Sprints médios: {gps['avg_sprints']}
- Velocidade máxima: {gps['max_speed_kmh']} km/h
- Última sessão: {gps.get('latest_session', {})}
""")
    
    # ACWR
    if data.acwr_analysis:
        acwr = data.acwr_analysis
        context_parts.append(f"""
ANÁLISE ACWR (Acute:Chronic Workload Ratio):
- Risco geral: {acwr['overall_risk']}
- Métricas: {acwr['metrics']}
""")
    
    # Wellness
    if data.wellness_summary:
        w = data.wellness_summary
        context_parts.append(f"""
WELLNESS (últimos {w['records_count']} registros):
- Wellness Score médio: {w['avg_wellness_score']}/10
- Readiness médio: {w['avg_readiness_score']}/10
- Sono médio: {w['avg_sleep_hours']}h
- Fadiga média: {w['avg_fatigue']}/10
- Dor muscular média: {w['avg_soreness']}/10
- Último registro: {w.get('latest', {})}
""")
    
    # Jump Assessment
    if data.jump_analysis:
        j = data.jump_analysis
        latest = j.get('latest', {})
        hist = j.get('historical', {})
        context_parts.append(f"""
AVALIAÇÃO DE SALTO (CMJ/DJ):
- RSI atual: {latest.get('rsi', 0)} ({latest.get('rsi_classification', '')})
- Altura do salto: {latest.get('jump_height_cm', 0)} cm
- Pico de potência: {latest.get('peak_power_w', 0)} W
- Potência relativa: {latest.get('relative_power_wkg', 0)} W/kg
- Status de fadiga: {latest.get('fatigue_status', '')}
- Z-Score RSI: {hist.get('z_score', 0)} (variação: {hist.get('rsi_variation_percent', 0)}%)
- Tendência: {hist.get('trend', '')}
""")
    
    # VBT
    if data.vbt_analysis:
        v = data.vbt_analysis
        lvp = v.get('load_velocity_profile', {})
        context_parts.append(f"""
PERFIL CARGA-VELOCIDADE (VBT):
- Exercício principal: {v['primary_exercise']}
- 1RM estimado: {lvp.get('estimated_1rm_kg', 'N/A')} kg
- Carga ótima (potência máx): {lvp.get('optimal_load_kg', 'N/A')} kg
- Slope: {lvp.get('slope', 'N/A')}
- Intercept: {lvp.get('intercept', 'N/A')}
- Perda de velocidade: {v.get('velocity_loss_analysis', [])}
- Fadiga periférica detectada: {v.get('fatigue_detected', False)}
""")
    
    # Body Composition
    if data.body_composition:
        bc = data.body_composition
        latest = bc.get('latest', {})
        context_parts.append(f"""
COMPOSIÇÃO CORPORAL:
- Gordura corporal: {latest.get('body_fat_percent', 0)}%
- Massa magra: {latest.get('lean_mass_kg', 0)} kg
- Massa gorda: {latest.get('fat_mass_kg', 0)} kg
- Classificação: {latest.get('classification', '')}
- Tendência: {bc.get('trend', {})}
""")
    
    # Risk factors
    if data.injury_risk_factors:
        context_parts.append(f"""
FATORES DE RISCO IDENTIFICADOS:
{chr(10).join('- ' + f for f in data.injury_risk_factors)}
Nível de risco geral: {data.overall_risk_level}
""")
    
    full_context = "\n".join(context_parts)
    
    # Determine language
    if lang == "pt":
        system_prompt = """Você é um cientista do esporte especializado em fisiologia do exercício, biomecânica e 
periodização do treinamento. Analise os dados fornecidos usando terminologia científica específica e forneça 
insights baseados em evidências da literatura científica atual.

IMPORTANTE: Use termos científicos específicos como:
- Fadiga neuromuscular central vs periférica
- Capacidade contrátil muscular
- Potencialização pós-ativação (PAP)
- Supercompensação e adaptação
- Índice de Força Reativa (RSI)
- Perfil força-velocidade
- Déficit bilateral
- Assimetria funcional
- Monotonia e strain da carga
- Readiness neuromuscular

Cite referências científicas quando apropriado (ex: "Segundo Gabbett (2016)...")."""

        user_prompt = f"""Com base nos seguintes dados científicos do atleta, forneça uma análise técnica completa:

{full_context}

Forneça sua análise no seguinte formato estruturado:

## SÍNTESE FISIOLÓGICA
Breve avaliação do estado neuromuscular e metabólico atual do atleta (3-4 linhas).

## ANÁLISE DE CARGA DE TREINAMENTO
Interpretação do ACWR e métricas de carga com base na literatura de monitoramento de carga.

## ESTADO NEUROMUSCULAR
Análise do RSI, perfil carga-velocidade e indicadores de fadiga central/periférica.

## ESTADO DE RECUPERAÇÃO
Avaliação baseada nos dados de wellness, sono e fatores psicométricos.

## COMPOSIÇÃO CORPORAL E POTÊNCIA
Relação entre composição corporal e métricas de potência/força.

## FATORES DE RISCO E PREVENÇÃO
Análise dos fatores de risco identificados com recomendações baseadas em evidências.

## RECOMENDAÇÕES DE TREINAMENTO
Prescrições específicas baseadas nos dados para otimização da performance e redução de risco de lesão.

## RECOMENDAÇÕES DE RECUPERAÇÃO
Estratégias de recuperação baseadas no perfil atual do atleta.

Seja específico, use terminologia científica e fundamente em evidências quando possível."""

    else:
        system_prompt = """You are a sports scientist specialized in exercise physiology, biomechanics and 
training periodization. Analyze the provided data using specific scientific terminology and provide 
evidence-based insights from current scientific literature.

IMPORTANT: Use specific scientific terms such as:
- Central vs peripheral neuromuscular fatigue
- Muscle contractile capacity
- Post-activation potentiation (PAP)
- Supercompensation and adaptation
- Reactive Strength Index (RSI)
- Force-velocity profile
- Bilateral deficit
- Functional asymmetry
- Load monotony and strain
- Neuromuscular readiness

Cite scientific references when appropriate (e.g., "According to Gabbett (2016)...")."""

        user_prompt = f"""Based on the following scientific data from the athlete, provide a complete technical analysis:

{full_context}

Provide your analysis in the following structured format:

## PHYSIOLOGICAL SYNTHESIS
Brief assessment of the athlete's current neuromuscular and metabolic state (3-4 lines).

## TRAINING LOAD ANALYSIS
Interpretation of ACWR and load metrics based on load monitoring literature.

## NEUROMUSCULAR STATE
Analysis of RSI, load-velocity profile and central/peripheral fatigue indicators.

## RECOVERY STATE
Assessment based on wellness data, sleep and psychometric factors.

## BODY COMPOSITION AND POWER
Relationship between body composition and power/strength metrics.

## RISK FACTORS AND PREVENTION
Analysis of identified risk factors with evidence-based recommendations.

## TRAINING RECOMMENDATIONS
Specific prescriptions based on data for performance optimization and injury risk reduction.

## RECOVERY RECOMMENDATIONS
Recovery strategies based on the athlete's current profile.

Be specific, use scientific terminology and base on evidence when possible."""
    
    try:
        chat = LlmChat(
            api_key=llm_key,
            model="gpt-4o",
            system_message=system_prompt
        )
        response = chat.send_message(user_prompt)
        return response
    except Exception as e:
        print(f"LLM Error: {e}")
        return None


@api_router.get("/report/scientific/{athlete_id}")
async def get_scientific_report_pdf(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a printable scientific report in HTML format with all charts.
    The browser can print this page to PDF.
    """
    # Get all scientific analysis data
    analysis = await get_scientific_analysis(athlete_id, lang, current_user)
    
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get additional data for charts
    # GPS historical data
    gps_history = await db.gps_data.find({
        "athlete_id": athlete_id
    }).sort("date", -1).limit(10).to_list(10)
    gps_history.reverse()
    
    # Wellness historical data
    wellness_history = await db.wellness_questionnaires.find({
        "athlete_id": athlete_id
    }).sort("date", -1).limit(14).to_list(14)
    wellness_history.reverse()
    
    # Jump history for RSI evolution
    jump_history = await db.jump_assessments.find({
        "athlete_id": athlete_id
    }).sort("date", -1).limit(10).to_list(10)
    jump_history.reverse()
    
    # VBT data for load-velocity chart
    vbt_data = await db.vbt_data.find({
        "athlete_id": athlete_id
    }).sort("date", -1).limit(20).to_list(20)
    
    is_pt = lang == "pt"
    
    def risk_color(level):
        return {
            "low": "#10b981",
            "moderate": "#f59e0b", 
            "high": "#ef4444"
        }.get(level, "#6b7280")
    
    def risk_label(level):
        if is_pt:
            return {"low": "Baixo", "moderate": "Moderado", "high": "Alto"}.get(level, "Desconhecido")
        return level.title() if level else "Unknown"
    
    # Calculate IMC
    weight = athlete.get('weight', 0)
    height_cm = athlete.get('height', 0)
    imc = (weight / ((height_cm/100) ** 2)) if height_cm > 0 and weight > 0 else 0
    imc_class = ""
    if imc > 0:
        if imc < 18.5:
            imc_class = "Abaixo do peso" if is_pt else "Underweight"
        elif imc < 25:
            imc_class = "Normal" if is_pt else "Normal"
        elif imc < 30:
            imc_class = "Sobrepeso" if is_pt else "Overweight"
        else:
            imc_class = "Obesidade" if is_pt else "Obese"
    
    html_content = f"""
<!DOCTYPE html>
<html lang="{lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{'Relatório Científico' if is_pt else 'Scientific Report'} - {athlete['name']}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            padding: 20px;
            line-height: 1.5;
        }}
        .container {{ max-width: 900px; margin: 0 auto; }}
        .header {{ 
            text-align: center; 
            padding: 30px 0;
            border-bottom: 2px solid #334155;
            margin-bottom: 30px;
        }}
        .header h1 {{ font-size: 24px; color: #f8fafc; margin-bottom: 8px; }}
        .header p {{ color: #94a3b8; font-size: 14px; }}
        .section {{ 
            background: #1e293b;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid #334155;
            page-break-inside: avoid;
        }}
        .section-title {{ 
            font-size: 16px;
            font-weight: 600;
            color: #f8fafc;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .section-title span {{ font-size: 20px; }}
        .risk-badge {{
            display: inline-block;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 600;
            color: white;
        }}
        .grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }}
        .grid-3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }}
        .grid-4 {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }}
        .stat-card {{
            background: rgba(255,255,255,0.05);
            padding: 12px;
            border-radius: 8px;
            text-align: center;
        }}
        .stat-value {{ font-size: 20px; font-weight: bold; color: #f8fafc; }}
        .stat-label {{ font-size: 11px; color: #94a3b8; margin-top: 4px; }}
        .chart-container {{
            margin: 16px 0;
            text-align: center;
        }}
        .chart-title {{
            font-size: 13px;
            font-weight: 600;
            color: #94a3b8;
            margin-bottom: 8px;
            text-align: left;
        }}
        .alert {{
            background: rgba(239, 68, 68, 0.1);
            border-left: 4px solid #ef4444;
            padding: 12px;
            margin: 12px 0;
            border-radius: 0 8px 8px 0;
        }}
        .alert p {{ color: #fca5a5; font-size: 13px; }}
        .alert.warning {{
            background: rgba(245, 158, 11, 0.1);
            border-left-color: #f59e0b;
        }}
        .alert.warning p {{ color: #fcd34d; }}
        .insights {{
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1));
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
            page-break-inside: avoid;
        }}
        .insights-title {{ font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #f8fafc; }}
        .insights-text {{ 
            white-space: pre-wrap;
            font-size: 12px;
            line-height: 1.7;
            color: #cbd5e1;
        }}
        .legend {{
            display: flex;
            justify-content: center;
            gap: 16px;
            margin-top: 8px;
            flex-wrap: wrap;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: #94a3b8;
        }}
        .legend-dot {{
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }}
        .print-btn {{
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #8b5cf6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 100;
        }}
        .print-btn:hover {{ background: #7c3aed; }}
        .factor-item {{ 
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
            font-size: 13px;
            color: #94a3b8;
        }}
        .factor-item::before {{ content: '⚠️'; }}
        .two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
        @media print {{
            body {{ background: white; color: #1e293b; padding: 10px; font-size: 11px; }}
            .section {{ border: 1px solid #e2e8f0; background: #f8fafc; padding: 15px; margin-bottom: 15px; }}
            .print-btn {{ display: none; }}
            .stat-card {{ background: #f1f5f9; }}
            .stat-value, .section-title {{ color: #1e293b; }}
            .stat-label {{ color: #64748b; }}
            .insights {{ background: #f8fafc; border: 1px solid #e2e8f0; }}
            .insights-text {{ color: #475569; }}
            .chart-title {{ color: #475569; }}
            .legend-item {{ color: #64748b; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{'📊 Relatório Científico Completo' if is_pt else '📊 Complete Scientific Report'}</h1>
            <p><strong>{athlete['name']}</strong> • {analysis.analysis_date}</p>
            <p>{'Posição' if is_pt else 'Position'}: {athlete.get('position', 'N/A')} | {'Peso' if is_pt else 'Weight'}: {weight} kg | {'Altura' if is_pt else 'Height'}: {height_cm} cm | IMC: {imc:.1f} ({imc_class})</p>
        </div>
        
        <!-- Risk Level -->
        <div class="section">
            <div class="section-title"><span>🎯</span> {'Nível de Risco de Lesão' if is_pt else 'Injury Risk Level'}</div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
                <div class="risk-badge" style="background: {risk_color(analysis.overall_risk_level)}">
                    {risk_label(analysis.overall_risk_level)}
                </div>
            </div>
            {''.join(f'<div class="factor-item">{f}</div>' for f in analysis.injury_risk_factors) if analysis.injury_risk_factors else f'<p style="color: #10b981;">{"✅ Nenhum fator de risco identificado" if is_pt else "✅ No risk factors identified"}</p>'}
        </div>
"""

    # ============= GPS SECTION WITH CHARTS =============
    if analysis.gps_summary and gps_history:
        gps = analysis.gps_summary
        
        # Generate GPS charts SVG
        chart_width = 380
        chart_height = 120
        padding = 40
        
        # Prepare data for charts
        distances = [g.get('total_distance', 0) for g in gps_history]
        hi_distances = [g.get('high_intensity_distance', 0) for g in gps_history]
        sprint_distances = [g.get('sprint_distance', 0) for g in gps_history]
        sprints = [g.get('sprint_count', 0) for g in gps_history]
        dates = [g.get('date', '')[:5] for g in gps_history]
        
        def make_line_chart(values, color, title, unit, width=chart_width, height=chart_height):
            if not values or all(v == 0 for v in values):
                return ""
            max_val = max(values) * 1.1 if max(values) > 0 else 1
            min_val = 0
            inner_w = width - padding * 2
            inner_h = height - 40
            
            points = []
            for i, v in enumerate(values):
                x = padding + (i / max(len(values)-1, 1)) * inner_w
                y = height - 20 - ((v - min_val) / (max_val - min_val)) * inner_h if max_val > min_val else height - 20
                points.append(f"{x},{y}")
            
            polyline = " ".join(points)
            
            # Grid lines
            grid_lines = ""
            for i in range(4):
                y = height - 20 - (i / 3) * inner_h
                val = min_val + (i / 3) * (max_val - min_val)
                grid_lines += f'<line x1="{padding}" y1="{y}" x2="{width-padding}" y2="{y}" stroke="#334155" stroke-dasharray="4"/>'
                grid_lines += f'<text x="{padding-5}" y="{y+4}" text-anchor="end" fill="#64748b" font-size="9">{val:.0f}</text>'
            
            # Date labels
            date_labels = ""
            for i, d in enumerate(dates):
                if i == 0 or i == len(dates) - 1:
                    x = padding + (i / max(len(dates)-1, 1)) * inner_w
                    date_labels += f'<text x="{x}" y="{height-5}" text-anchor="middle" fill="#64748b" font-size="8">{d}</text>'
            
            # Points
            point_circles = ""
            for i, v in enumerate(values):
                x = padding + (i / max(len(values)-1, 1)) * inner_w
                y = height - 20 - ((v - min_val) / (max_val - min_val)) * inner_h if max_val > min_val else height - 20
                point_circles += f'<circle cx="{x}" cy="{y}" r="4" fill="{color}"/>'
            
            return f'''
            <div class="chart-container">
                <div class="chart-title">{title} ({unit})</div>
                <svg width="{width}" height="{height}" viewBox="0 0 {width} {height}">
                    {grid_lines}
                    <polyline points="{polyline}" fill="none" stroke="{color}" stroke-width="2"/>
                    {point_circles}
                    {date_labels}
                </svg>
            </div>
            '''
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>📍</span> {'Dados GPS' if is_pt else 'GPS Data'} ({gps['sessions_count']} {'sessões' if is_pt else 'sessions'})</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value">{gps['avg_distance_m'] / 1000:.1f}</div>
                    <div class="stat-label">{'Dist. Média (km)' if is_pt else 'Avg Dist (km)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{gps['avg_high_intensity_m']:.0f}</div>
                    <div class="stat-label">{'Alta Int. (m)' if is_pt else 'High Int (m)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{gps['avg_sprints']:.1f}</div>
                    <div class="stat-label">{'Sprints/Sessão' if is_pt else 'Sprints/Sess'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{gps['max_speed_kmh']:.1f}</div>
                    <div class="stat-label">{'Vel. Máx (km/h)' if is_pt else 'Max Speed'}</div>
                </div>
            </div>
            <div class="two-col">
                {make_line_chart(distances, '#3b82f6', 'Distância Total' if is_pt else 'Total Distance', 'm')}
                {make_line_chart(hi_distances, '#f59e0b', 'Alta Intensidade' if is_pt else 'High Intensity', 'm')}
            </div>
            <div class="two-col">
                {make_line_chart(sprint_distances, '#ef4444', 'Distância Sprints' if is_pt else 'Sprint Distance', 'm')}
                {make_line_chart(sprints, '#8b5cf6', 'Número de Sprints' if is_pt else 'Number of Sprints', '')}
            </div>
        </div>
"""

    # ============= WELLNESS SECTION WITH CHART =============
    if analysis.wellness_summary and wellness_history:
        w = analysis.wellness_summary
        
        # Wellness evolution chart
        wellness_scores = [wh.get('wellness_score', 0) for wh in wellness_history]
        readiness_scores = [wh.get('readiness_score', 0) for wh in wellness_history]
        wellness_dates = [wh.get('date', '')[:5] for wh in wellness_history]
        
        chart_width = 760
        chart_height = 140
        padding = 50
        
        def make_dual_line_chart(values1, values2, color1, color2, label1, label2):
            if not values1:
                return ""
            max_val = 10
            min_val = 0
            inner_w = chart_width - padding * 2
            inner_h = chart_height - 40
            
            def get_points(values):
                pts = []
                for i, v in enumerate(values):
                    x = padding + (i / max(len(values)-1, 1)) * inner_w
                    y = chart_height - 20 - ((v - min_val) / (max_val - min_val)) * inner_h
                    pts.append(f"{x},{y}")
                return " ".join(pts)
            
            # Grid
            grid = ""
            for i in range(5):
                y = chart_height - 20 - (i / 4) * inner_h
                val = min_val + (i / 4) * (max_val - min_val)
                grid += f'<line x1="{padding}" y1="{y}" x2="{chart_width-padding}" y2="{y}" stroke="#334155" stroke-dasharray="4"/>'
                grid += f'<text x="{padding-5}" y="{y+4}" text-anchor="end" fill="#64748b" font-size="9">{int(val)}</text>'
            
            return f'''
            <div class="chart-container">
                <div class="chart-title">{'Evolução Wellness & Prontidão' if is_pt else 'Wellness & Readiness Evolution'}</div>
                <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}">
                    {grid}
                    <polyline points="{get_points(values1)}" fill="none" stroke="{color1}" stroke-width="2"/>
                    <polyline points="{get_points(values2)}" fill="none" stroke="{color2}" stroke-width="2"/>
                </svg>
                <div class="legend">
                    <div class="legend-item"><div class="legend-dot" style="background:{color1}"></div>{label1}</div>
                    <div class="legend-item"><div class="legend-dot" style="background:{color2}"></div>{label2}</div>
                </div>
            </div>
            '''
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>💚</span> Wellness & {'Prontidão' if is_pt else 'Readiness'}</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value">{w['avg_wellness_score']:.1f}</div>
                    <div class="stat-label">Wellness Médio</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{w['avg_readiness_score']:.1f}</div>
                    <div class="stat-label">{'Prontidão Média' if is_pt else 'Avg Readiness'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{w['avg_sleep_hours']:.1f}h</div>
                    <div class="stat-label">{'Sono Médio' if is_pt else 'Avg Sleep'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{w['avg_fatigue']:.1f}</div>
                    <div class="stat-label">{'Fadiga Média' if is_pt else 'Avg Fatigue'}</div>
                </div>
            </div>
            {make_dual_line_chart(wellness_scores, readiness_scores, '#10b981', '#3b82f6', 'Wellness', 'Prontidão' if is_pt else 'Readiness')}
        </div>
"""

    # ============= JUMP ASSESSMENT SECTION WITH CHARTS =============
    if analysis.jump_analysis and jump_history:
        j = analysis.jump_analysis
        latest = j.get('latest', {})
        hist = j.get('historical', {})
        
        # RSI evolution chart
        rsi_values = [jh.get('rsi', 0) for jh in jump_history]
        jump_dates = [jh.get('date', '')[:5] for jh in jump_history]
        
        chart_width = 380
        chart_height = 120
        
        def make_rsi_chart():
            if not rsi_values or all(v == 0 for v in rsi_values):
                return ""
            max_val = max(rsi_values) * 1.2 if max(rsi_values) > 0 else 2
            min_val = min(rsi_values) * 0.8 if min(rsi_values) > 0 else 0
            inner_w = chart_width - 80
            inner_h = chart_height - 40
            
            points = []
            circles = ""
            for i, v in enumerate(rsi_values):
                x = 50 + (i / max(len(rsi_values)-1, 1)) * inner_w
                y = chart_height - 20 - ((v - min_val) / (max_val - min_val)) * inner_h if max_val > min_val else chart_height - 20
                points.append(f"{x},{y}")
                circles += f'<circle cx="{x}" cy="{y}" r="4" fill="#10b981"/>'
            
            # Baseline line
            avg_rsi = sum(rsi_values) / len(rsi_values)
            baseline_y = chart_height - 20 - ((avg_rsi - min_val) / (max_val - min_val)) * inner_h if max_val > min_val else chart_height / 2
            
            return f'''
            <div class="chart-container">
                <div class="chart-title">{'Evolução RSI' if is_pt else 'RSI Evolution'}</div>
                <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}">
                    <line x1="50" y1="{baseline_y}" x2="{chart_width-30}" y2="{baseline_y}" stroke="#f59e0b" stroke-dasharray="6 3"/>
                    <text x="{chart_width-25}" y="{baseline_y-5}" fill="#f59e0b" font-size="9">Baseline</text>
                    <polyline points="{' '.join(points)}" fill="none" stroke="#10b981" stroke-width="2"/>
                    {circles}
                    <text x="45" y="{chart_height - 20 - inner_h + 4}" text-anchor="end" fill="#64748b" font-size="9">{max_val:.2f}</text>
                    <text x="45" y="{chart_height - 16}" text-anchor="end" fill="#64748b" font-size="9">{min_val:.2f}</text>
                </svg>
            </div>
            '''
        
        # Z-Score gauge
        z_score = hist.get('z_score', 0)
        z_color = "#ef4444" if z_score < -1.5 else "#f59e0b" if z_score < -0.5 else "#10b981" if z_score < 0.5 else "#3b82f6"
        
        # Fatigue index visualization
        fatigue_pct = abs(hist.get('rsi_variation_percent', 0))
        fatigue_status = latest.get('fatigue_status', 'green')
        fatigue_color = "#ef4444" if fatigue_status == 'red' else "#f59e0b" if fatigue_status == 'yellow' else "#10b981"
        
        # Check for asymmetry
        asymmetry_alert = ""
        if latest.get('protocol', '').startswith('SL-CMJ'):
            # Would need additional data - for now just show if available in analysis
            pass
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>🦘</span> {'Avaliação de Salto' if is_pt else 'Jump Assessment'} - {latest.get('protocol', 'CMJ')}</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value" style="color: {fatigue_color}">{latest.get('rsi', 0):.2f}</div>
                    <div class="stat-label">RSI</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{latest.get('jump_height_cm', 0):.1f}</div>
                    <div class="stat-label">{'Altura (cm)' if is_pt else 'Height (cm)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{latest.get('peak_power_w', 0):.0f}</div>
                    <div class="stat-label">{'Potência (W)' if is_pt else 'Power (W)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{latest.get('relative_power_wkg', 0):.1f}</div>
                    <div class="stat-label">W/kg</div>
                </div>
            </div>
            <div class="grid-3">
                <div class="stat-card">
                    <div class="stat-value" style="color: {z_color}">{z_score:.2f}</div>
                    <div class="stat-label">Z-Score</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: {fatigue_color}">{fatigue_pct:.1f}%</div>
                    <div class="stat-label">{'Índice de Fadiga' if is_pt else 'Fatigue Index'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{latest.get('peak_velocity_ms', 0):.2f}</div>
                    <div class="stat-label">{'Vel. Pico (m/s)' if is_pt else 'Peak Vel (m/s)'}</div>
                </div>
            </div>
            {make_rsi_chart()}
            {f'<div class="alert"><p>⚠️ {"RSI indica fadiga neuromuscular" if is_pt else "RSI indicates neuromuscular fatigue"} ({hist.get("rsi_variation_percent", 0):.1f}% {"abaixo do baseline" if is_pt else "below baseline"})</p></div>' if j.get('fatigue_alert') else ''}
        </div>
"""

    # ============= VBT SECTION WITH LOAD-VELOCITY CHART =============
    if analysis.vbt_analysis and vbt_data:
        v = analysis.vbt_analysis
        lvp = v.get('load_velocity_profile', {})
        
        # Collect all data points for load-velocity chart
        all_points = []
        for session in vbt_data:
            for s in session.get('sets', []):
                if s.get('load_kg', 0) > 0 and s.get('mean_velocity', 0) > 0:
                    all_points.append({'load': s['load_kg'], 'velocity': s['mean_velocity']})
        
        # Load-Velocity Chart
        lv_chart = ""
        if lvp.get('slope') and lvp.get('intercept') and all_points:
            chart_width = 380
            chart_height = 160
            max_load = lvp.get('estimated_1rm_kg', 150) * 1.1
            max_vel = 1.5
            slope = lvp['slope']
            intercept = lvp['intercept']
            
            # Points
            points_svg = ""
            for p in all_points:
                x = 50 + (p['load'] / max_load) * (chart_width - 80)
                y = chart_height - 30 - (p['velocity'] / max_vel) * (chart_height - 50)
                points_svg += f'<circle cx="{x}" cy="{y}" r="4" fill="#8b5cf6" opacity="0.6"/>'
            
            # Regression line
            x1 = 50
            y1 = chart_height - 30 - (intercept / max_vel) * (chart_height - 50)
            x2 = 50 + (max_load / max_load) * (chart_width - 80)
            y2_vel = intercept + slope * max_load
            y2 = chart_height - 30 - (y2_vel / max_vel) * (chart_height - 50)
            
            # MVT line
            mvt = 0.3
            mvt_y = chart_height - 30 - (mvt / max_vel) * (chart_height - 50)
            
            # 1RM point
            est_1rm = lvp.get('estimated_1rm_kg', 0)
            rm_x = 50 + (est_1rm / max_load) * (chart_width - 80) if est_1rm else 0
            
            # Optimal load point
            opt_load = lvp.get('optimal_load_kg', 0)
            opt_vel = intercept + slope * opt_load if opt_load else 0
            opt_x = 50 + (opt_load / max_load) * (chart_width - 80) if opt_load else 0
            opt_y = chart_height - 30 - (opt_vel / max_vel) * (chart_height - 50) if opt_vel > 0 else 0
            
            lv_chart = f'''
            <div class="chart-container">
                <div class="chart-title">{'Perfil Carga-Velocidade' if is_pt else 'Load-Velocity Profile'}</div>
                <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}">
                    <!-- Grid -->
                    <line x1="50" y1="{chart_height - 30}" x2="{chart_width - 30}" y2="{chart_height - 30}" stroke="#334155"/>
                    <line x1="50" y1="20" x2="50" y2="{chart_height - 30}" stroke="#334155"/>
                    
                    <!-- MVT Line -->
                    <line x1="50" y1="{mvt_y}" x2="{chart_width - 30}" y2="{mvt_y}" stroke="#ef4444" stroke-dasharray="6 3"/>
                    <text x="{chart_width - 25}" y="{mvt_y - 5}" fill="#ef4444" font-size="9">MVT</text>
                    
                    <!-- Data points -->
                    {points_svg}
                    
                    <!-- Regression line -->
                    <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#8b5cf6" stroke-width="2"/>
                    
                    <!-- 1RM point -->
                    {f'<circle cx="{rm_x}" cy="{mvt_y}" r="6" fill="#10b981"/><text x="{rm_x}" y="{mvt_y + 15}" text-anchor="middle" fill="#10b981" font-size="9" font-weight="bold">1RM</text>' if est_1rm else ''}
                    
                    <!-- Optimal load point -->
                    {f'<circle cx="{opt_x}" cy="{opt_y}" r="6" fill="#f59e0b"/>' if opt_load else ''}
                    
                    <!-- Axis labels -->
                    <text x="{chart_width / 2}" y="{chart_height - 5}" text-anchor="middle" fill="#64748b" font-size="9">{'Carga (kg)' if is_pt else 'Load (kg)'}</text>
                    <text x="15" y="{chart_height / 2}" text-anchor="middle" fill="#64748b" font-size="9" transform="rotate(-90, 15, {chart_height / 2})">m/s</text>
                </svg>
                <div class="legend">
                    <div class="legend-item"><div class="legend-dot" style="background:#10b981"></div>1RM: {est_1rm:.0f}kg</div>
                    <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>{'Carga Ótima' if is_pt else 'Optimal'}: {opt_load:.0f}kg</div>
                </div>
            </div>
            '''
        
        # Velocity Loss Chart
        vl_data = v.get('velocity_loss_analysis', [])
        vl_chart = ""
        if vl_data:
            chart_width = 380
            chart_height = 120
            max_loss = max(30, max(d['loss_percent'] for d in vl_data) * 1.2)
            bar_width = min(35, (chart_width - 80) / len(vl_data) - 8)
            
            bars = ""
            for i, d in enumerate(vl_data):
                x = 50 + i * (bar_width + 8)
                bar_h = (d['loss_percent'] / max_loss) * (chart_height - 50)
                y = chart_height - 30 - bar_h
                color = "#ef4444" if d['loss_percent'] >= 20 else "#f59e0b" if d['loss_percent'] >= 10 else "#10b981"
                bars += f'''
                    <rect x="{x}" y="{y}" width="{bar_width}" height="{bar_h}" fill="{color}" rx="4"/>
                    <text x="{x + bar_width/2}" y="{y - 5}" text-anchor="middle" fill="{color}" font-size="9" font-weight="bold">{d['loss_percent']:.0f}%</text>
                    <text x="{x + bar_width/2}" y="{chart_height - 15}" text-anchor="middle" fill="#64748b" font-size="9">S{d['set']}</text>
                '''
            
            # Fatigue zone line
            fatigue_y = chart_height - 30 - (20 / max_loss) * (chart_height - 50)
            
            vl_chart = f'''
            <div class="chart-container">
                <div class="chart-title">{'Perda de Velocidade por Série' if is_pt else 'Velocity Loss by Set'}</div>
                <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}">
                    <line x1="50" y1="{fatigue_y}" x2="{chart_width - 30}" y2="{fatigue_y}" stroke="#ef4444" stroke-dasharray="4"/>
                    <text x="{chart_width - 25}" y="{fatigue_y - 5}" fill="#ef4444" font-size="8">{"Zona Fadiga" if is_pt else "Fatigue"}</text>
                    {bars}
                </svg>
            </div>
            '''
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>⚡</span> VBT - {'Perfil Força-Velocidade' if is_pt else 'Force-Velocity Profile'}</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value">{lvp.get('estimated_1rm_kg', 0):.0f}</div>
                    <div class="stat-label">1RM Est. (kg)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{lvp.get('optimal_load_kg', 0):.0f}</div>
                    <div class="stat-label">{'Carga Ótima (kg)' if is_pt else 'Optimal (kg)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{abs(lvp.get('slope', 0)) * 1000:.2f}</div>
                    <div class="stat-label">Slope (mm/s/kg)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{lvp.get('intercept', 0):.2f}</div>
                    <div class="stat-label">V0 (m/s)</div>
                </div>
            </div>
            <div class="two-col">
                {lv_chart}
                {vl_chart}
            </div>
            {f'<div class="alert"><p>⚠️ {"Perda de velocidade ≥20% detectada - Indica fadiga periférica" if is_pt else "Velocity loss ≥20% detected - Indicates peripheral fatigue"}</p></div>' if v.get("fatigue_detected") else ""}
        </div>
"""

    # ============= BODY COMPOSITION SECTION =============
    if analysis.body_composition:
        bc = analysis.body_composition
        latest = bc.get('latest', {})
        
        body_fat = latest.get('body_fat_percent', 0)
        lean_mass = latest.get('lean_mass_kg', 0)
        fat_mass = latest.get('fat_mass_kg', 0)
        
        # Donut chart for body composition
        donut_chart = ""
        if lean_mass > 0 or fat_mass > 0:
            total = lean_mass + fat_mass
            lean_pct = (lean_mass / total) * 100 if total > 0 else 0
            
            # SVG donut
            size = 120
            stroke_width = 14
            radius = (size - stroke_width) / 2
            circumference = 2 * 3.14159 * radius
            fat_offset = circumference * (1 - body_fat / 100)
            
            donut_chart = f'''
            <div style="display: flex; align-items: center; gap: 20px; justify-content: center; margin: 16px 0;">
                <svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">
                    <circle cx="{size/2}" cy="{size/2}" r="{radius}" stroke="#10b981" stroke-width="{stroke_width}" fill="none"/>
                    <circle cx="{size/2}" cy="{size/2}" r="{radius}" stroke="#f59e0b" stroke-width="{stroke_width}" fill="none"
                            stroke-dasharray="{circumference}" stroke-dashoffset="{fat_offset}" stroke-linecap="round"
                            transform="rotate(-90 {size/2} {size/2})"/>
                    <text x="{size/2}" y="{size/2 - 8}" text-anchor="middle" fill="#f8fafc" font-size="18" font-weight="bold">{body_fat:.1f}%</text>
                    <text x="{size/2}" y="{size/2 + 10}" text-anchor="middle" fill="#94a3b8" font-size="10">{"Gordura" if is_pt else "Body Fat"}</text>
                </svg>
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981;"></div>
                        <span style="color: #f8fafc; font-weight: bold;">{lean_mass:.1f} kg</span>
                        <span style="color: #94a3b8; font-size: 12px;">{"Massa Magra" if is_pt else "Lean Mass"}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b;"></div>
                        <span style="color: #f8fafc; font-weight: bold;">{fat_mass:.1f} kg</span>
                        <span style="color: #94a3b8; font-size: 12px;">{"Massa Gorda" if is_pt else "Fat Mass"}</span>
                    </div>
                </div>
            </div>
            '''
        
        trend = bc.get('trend', {})
        trend_html = ""
        if trend:
            fat_change = trend.get('fat_percent_change', 0)
            lean_change = trend.get('lean_mass_change_kg', 0)
            trend_color = "#10b981" if fat_change <= 0 and lean_change >= 0 else "#ef4444"
            trend_icon = "📈" if trend.get('direction') == 'improving' else "📉" if trend.get('direction') == 'declining' else "➡️"
            trend_html = f'''
            <div class="alert {'warning' if trend.get('direction') != 'improving' else ''}" style="background: rgba(16, 185, 129, 0.1); border-left-color: {trend_color};">
                <p style="color: {trend_color};">{trend_icon} {"Tendência" if is_pt else "Trend"}: {'+' if fat_change > 0 else ''}{fat_change:.1f}% {"gordura" if is_pt else "fat"}, {'+' if lean_change > 0 else ''}{lean_change:.1f}kg {"massa magra" if is_pt else "lean"}</p>
            </div>
            '''
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>🏋️</span> {'Composição Corporal' if is_pt else 'Body Composition'}</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value">{body_fat:.1f}%</div>
                    <div class="stat-label">{'Gordura' if is_pt else 'Body Fat'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{lean_mass:.1f}</div>
                    <div class="stat-label">{'Massa Magra (kg)' if is_pt else 'Lean (kg)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{fat_mass:.1f}</div>
                    <div class="stat-label">{'Massa Gorda (kg)' if is_pt else 'Fat (kg)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{imc:.1f}</div>
                    <div class="stat-label">IMC</div>
                </div>
            </div>
            {donut_chart}
            {trend_html}
        </div>
"""

    # AI Insights Section
    if analysis.scientific_insights:
        html_content += f"""
        <div class="insights">
            <div class="insights-title">🧠 {'Insights Científicos (IA)' if is_pt else 'Scientific Insights (AI)'}</div>
            <div class="insights-text">{analysis.scientific_insights}</div>
        </div>
"""

    html_content += """
        <button class="print-btn" onclick="window.print()">
            🖨️ Imprimir PDF
        </button>
    </div>
</body>
</html>
"""

    return HTMLResponse(content=html_content, status_code=200)


# ============= TEAM DASHBOARD =============

class TeamDashboardAthlete(BaseModel):
    id: str
    name: str
    position: str
    acwr: Optional[float] = None
    risk_level: str = "unknown"
    fatigue_score: Optional[float] = None
    last_gps_date: Optional[str] = None
    last_wellness_date: Optional[str] = None
    wellness_score: Optional[float] = None
    total_sessions_7d: int = 0
    avg_distance_7d: float = 0
    injury_risk: bool = False
    peripheral_fatigue: bool = False

class TeamDashboardStats(BaseModel):
    total_athletes: int
    athletes_high_risk: int
    athletes_optimal: int
    athletes_fatigued: int
    team_avg_acwr: float
    team_avg_wellness: float
    team_avg_fatigue: float
    sessions_this_week: int
    total_distance_this_week: float
    team_avg_power: Optional[float] = None
    team_avg_body_fat: Optional[float] = None
    team_avg_hid: Optional[float] = None  # High Intensity Distance
    team_avg_rsi: Optional[float] = None  # Reactive Strength Index
    rsi_trend: Optional[str] = None  # up, down, stable
    rsi_percentile: Optional[float] = None
    avg_distance_per_session: Optional[float] = None

class TeamDashboardResponse(BaseModel):
    stats: TeamDashboardStats
    athletes: List[TeamDashboardAthlete]
    risk_distribution: Dict[str, int]
    position_summary: Dict[str, Dict[str, Any]]
    alerts: List[str]

@api_router.get("/dashboard/team", response_model=TeamDashboardResponse)
async def get_team_dashboard(
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Get aggregated team statistics and individual athlete status for team-wide overview"""
    
    user_id = current_user["_id"]
    
    # Get all athletes for this coach
    athletes_cursor = db.athletes.find({"coach_id": user_id})
    athletes = await athletes_cursor.to_list(100)
    
    if not athletes:
        return TeamDashboardResponse(
            stats=TeamDashboardStats(
                total_athletes=0,
                athletes_high_risk=0,
                athletes_optimal=0,
                athletes_fatigued=0,
                team_avg_acwr=0,
                team_avg_wellness=0,
                team_avg_fatigue=0,
                sessions_this_week=0,
                total_distance_this_week=0
            ),
            athletes=[],
            risk_distribution={"low": 0, "optimal": 0, "moderate": 0, "high": 0, "unknown": 0},
            position_summary={},
            alerts=[]
        )
    
    # Date ranges
    today = datetime.utcnow()
    seven_days_ago = today - timedelta(days=7)
    twenty_eight_days_ago = today - timedelta(days=28)
    
    # First, get ALL GPS data to count global sessions (1 CSV = 1 session for the team)
    all_gps_data = await db.gps_data.find({"coach_id": user_id}).to_list(10000)
    global_sessions_7d = set()
    global_sessions_total = set()
    
    for record in all_gps_data:
        try:
            record_date = datetime.strptime(record.get("date", ""), "%Y-%m-%d")
            session_key = f"{record.get('date')}_{record.get('session_name', 'default')}"
            global_sessions_total.add(session_key)
            if record_date >= seven_days_ago:
                global_sessions_7d.add(session_key)
        except:
            continue
    
    # Total sessions count is now global (1 CSV = 1 session)
    total_sessions = len(global_sessions_total)
    total_sessions_7d_global = len(global_sessions_7d)
    
    athlete_data = []
    total_acwr = 0
    acwr_count = 0
    total_wellness = 0
    wellness_count = 0
    total_fatigue = 0
    fatigue_count = 0
    total_distance = 0
    total_power = 0
    power_count = 0
    total_body_fat = 0
    body_fat_count = 0
    total_hid = 0
    hid_count = 0
    all_rsi_values = []  # To calculate percentile and trend
    
    risk_distribution = {"low": 0, "optimal": 0, "moderate": 0, "high": 0, "unknown": 0}
    position_summary: Dict[str, Dict[str, Any]] = {}
    alerts = []
    
    # Get all assessments to calculate RSI
    all_assessments = await db.assessments.find({"coach_id": user_id}).sort("date", -1).to_list(1000)
    
    for athlete in athletes:
        athlete_id = str(athlete["_id"])
        position = athlete.get("position", "")
        if not position or position == "Unknown":
            position = "Não especificado" if lang == "pt" else "Not specified"
        
        # Initialize position summary with all metrics for group averaging
        if position not in position_summary:
            position_summary[position] = {
                "count": 0,
                "avg_acwr": 0,
                "avg_wellness": 0,
                "avg_fatigue": 0,
                "avg_distance": 0,
                "avg_sprints": 0,
                "avg_max_speed": 0,
                "high_risk_count": 0,
                # Accumulators for calculating averages
                "_total_acwr": 0,
                "_total_wellness": 0,
                "_total_fatigue": 0,
                "_total_distance": 0,
                "_total_sprints": 0,
                "_total_max_speed": 0,
                "_acwr_count": 0,
                "_wellness_count": 0,
                "_fatigue_count": 0,
                "_gps_count": 0
            }
        position_summary[position]["count"] += 1
        
        # Get recent GPS data
        gps_data = await db.gps_data.find({
            "athlete_id": athlete_id,
            "coach_id": user_id
        }).sort("date", -1).to_list(100)
        
        # Calculate ACWR
        acwr = None
        risk_level = "unknown"
        sessions_7d = 0
        distance_7d = 0
        last_gps_date = None
        
        if gps_data:
            last_gps_date = gps_data[0].get("date")
            
            acute_load = 0
            chronic_load = 0
            
            # Track unique sessions by date+session_name
            unique_sessions_7d = set()
            unique_sessions_total = set()
            
            for record in gps_data:
                try:
                    record_date = datetime.strptime(record["date"], "%Y-%m-%d")
                except:
                    continue
                    
                dist = record.get("total_distance", 0)
                hid = record.get("high_intensity_distance", 0)
                session_key = f"{record.get('date')}_{record.get('session_name', 'default')}"
                
                if record_date >= seven_days_ago:
                    acute_load += dist
                    distance_7d += dist
                    unique_sessions_7d.add(session_key)
                    unique_sessions_total.add(session_key)
                    # Accumulate HID
                    total_hid += hid
                    hid_count += 1
                    
                if record_date >= twenty_eight_days_ago:
                    chronic_load += dist
            
            # Count unique sessions (1 CSV = 1 session) - for athlete's own distance calculation
            sessions_7d = len(unique_sessions_7d)
            # Note: total_sessions is now calculated globally at the start
            total_distance += distance_7d
            
            # Collect RSI values from new jump_assessments system (preferred) or legacy assessments
            athlete_jump_assessments = await db.jump_assessments.find({
                "athlete_id": athlete_id,
                "coach_id": user_id,
                "protocol": "cmj"
            }).sort("date", -1).to_list(10)
            
            if athlete_jump_assessments:
                # Use new jump assessment system
                for jump_assessment in athlete_jump_assessments:
                    rsi = jump_assessment.get("rsi")
                    if rsi and rsi > 0:
                        all_rsi_values.append({
                            "value": rsi,
                            "date": jump_assessment.get("date"),
                            "athlete_id": athlete_id
                        })
            else:
                # Fallback to legacy assessments
                athlete_assessments = [a for a in all_assessments if a.get("athlete_id") == athlete_id]
                for assessment in athlete_assessments:
                    # RSI is stored inside metrics, not at root level
                    metrics = assessment.get("metrics", {})
                    rsi = metrics.get("rsi") if isinstance(metrics, dict) else None
                    if rsi and rsi > 0:
                        all_rsi_values.append({
                            "value": rsi,
                            "date": assessment.get("date"),
                            "athlete_id": athlete_id
                        })
            
            # Calculate ACWR
            acute_weekly = acute_load / 7
            chronic_weekly = chronic_load / 28 if chronic_load > 0 else 1
            
            if chronic_weekly > 0:
                acwr = round(acute_weekly / chronic_weekly, 2)
                total_acwr += acwr
                acwr_count += 1
                
                # Determine risk level
                if acwr < 0.8:
                    risk_level = "low"
                elif acwr <= 1.3:
                    risk_level = "optimal"
                elif acwr <= 1.5:
                    risk_level = "moderate"
                else:
                    risk_level = "high"
                
                risk_distribution[risk_level] += 1
                
                if risk_level == "high":
                    position_summary[position]["high_risk_count"] += 1
                    alert_msg = f"⚠️ {athlete['name']} ({position}): ACWR alto ({acwr})" if lang == "pt" else f"⚠️ {athlete['name']} ({position}): High ACWR ({acwr})"
                    alerts.append(alert_msg)
        else:
            risk_distribution["unknown"] += 1
        
        # Get recent wellness data
        wellness_data = await db.wellness.find({
            "athlete_id": athlete_id,
            "coach_id": user_id
        }).sort("date", -1).to_list(7)
        
        wellness_score = None
        fatigue_score = None
        last_wellness_date = None
        
        if wellness_data:
            latest_wellness = wellness_data[0]
            last_wellness_date = latest_wellness.get("date")
            wellness_score = latest_wellness.get("wellness_score")
            fatigue = latest_wellness.get("fatigue", 5)
            
            # Convert fatigue (1-10 where 10=very fatigued) to fatigue score percentage
            fatigue_score = fatigue * 10  # 0-100%
            
            if wellness_score:
                total_wellness += wellness_score
                wellness_count += 1
            
            total_fatigue += fatigue_score
            fatigue_count += 1
            
            if fatigue_score > 70:
                alert_msg = f"🔴 {athlete['name']}: Fadiga alta ({fatigue_score}%)" if lang == "pt" else f"🔴 {athlete['name']}: High fatigue ({fatigue_score}%)"
                alerts.append(alert_msg)
        
        # Check for peripheral fatigue from strength assessments
        peripheral_fatigue = False
        strength_assessments = await db.assessments.find({
            "athlete_id": athlete_id,
            "coach_id": user_id,
            "assessment_type": "strength"
        }).sort("date", -1).to_list(10)
        
        if len(strength_assessments) >= 2:
            latest = strength_assessments[0].get("metrics", {})
            historical_peak_power = max([a.get("metrics", {}).get("peak_power", 0) for a in strength_assessments])
            current_peak_power = latest.get("peak_power", 0)
            
            if historical_peak_power > 0:
                power_drop = (historical_peak_power - current_peak_power) / historical_peak_power * 100
                if power_drop > 20:
                    peripheral_fatigue = True
                    if power_drop > 30:
                        alert_msg = f"⚡ {athlete['name']}: Queda de potência de {power_drop:.0f}%" if lang == "pt" else f"⚡ {athlete['name']}: Power drop of {power_drop:.0f}%"
                        alerts.append(alert_msg)
        
        # Get latest strength data for team averages
        if strength_assessments:
            latest_strength = strength_assessments[0].get("metrics", {})
            mean_power = latest_strength.get("mean_power")
            if mean_power:
                total_power += mean_power
                power_count += 1
        
        # Get latest body composition for team averages
        latest_body_comp = await db.body_compositions.find_one(
            {"athlete_id": athlete_id, "coach_id": user_id},
            sort=[("date", -1)]
        )
        if latest_body_comp and latest_body_comp.get("body_fat_percentage"):
            total_body_fat += latest_body_comp["body_fat_percentage"]
            body_fat_count += 1
        
        athlete_data.append(TeamDashboardAthlete(
            id=athlete_id,
            name=athlete["name"],
            position=position,
            acwr=acwr,
            risk_level=risk_level,
            fatigue_score=fatigue_score,
            last_gps_date=last_gps_date,
            last_wellness_date=last_wellness_date,
            wellness_score=wellness_score,
            total_sessions_7d=sessions_7d,
            avg_distance_7d=round(distance_7d / sessions_7d, 0) if sessions_7d > 0 else 0,
            injury_risk=risk_level == "high" or (fatigue_score is not None and fatigue_score > 70),
            peripheral_fatigue=peripheral_fatigue
        ))
        
        # Update position averages - collect all metrics for group averaging
        if acwr:
            position_summary[position]["_total_acwr"] += acwr
            position_summary[position]["_acwr_count"] += 1
        
        if wellness_score:
            position_summary[position]["_total_wellness"] += wellness_score
            position_summary[position]["_wellness_count"] += 1
        
        if fatigue_score:
            position_summary[position]["_total_fatigue"] += fatigue_score
            position_summary[position]["_fatigue_count"] += 1
        
        # Aggregate GPS metrics for position group
        if gps_data:
            # Calculate average metrics from this athlete's recent GPS data
            recent_gps = [g for g in gps_data[:7]]  # Last 7 records
            if recent_gps:
                avg_dist = sum(g.get("total_distance", 0) for g in recent_gps) / len(recent_gps)
                avg_sprints = sum(g.get("number_of_sprints", 0) for g in recent_gps) / len(recent_gps)
                max_speeds = [g.get("max_speed", 0) for g in recent_gps if g.get("max_speed")]
                avg_max_speed = sum(max_speeds) / len(max_speeds) if max_speeds else 0
                
                position_summary[position]["_total_distance"] += avg_dist
                position_summary[position]["_total_sprints"] += avg_sprints
                position_summary[position]["_total_max_speed"] += avg_max_speed
                position_summary[position]["_gps_count"] += 1
    
    # Calculate averages for positions and clean up accumulators
    for pos in position_summary:
        ps = position_summary[pos]
        
        # Calculate ACWR average
        if ps["_acwr_count"] > 0:
            ps["avg_acwr"] = round(ps["_total_acwr"] / ps["_acwr_count"], 2)
        
        # Calculate wellness average
        if ps["_wellness_count"] > 0:
            ps["avg_wellness"] = round(ps["_total_wellness"] / ps["_wellness_count"], 1)
        
        # Calculate fatigue average
        if ps["_fatigue_count"] > 0:
            ps["avg_fatigue"] = round(ps["_total_fatigue"] / ps["_fatigue_count"], 1)
        
        # Calculate GPS metrics averages (group averages)
        if ps["_gps_count"] > 0:
            ps["avg_distance"] = round(ps["_total_distance"] / ps["_gps_count"], 0)
            ps["avg_sprints"] = round(ps["_total_sprints"] / ps["_gps_count"], 1)
            ps["avg_max_speed"] = round(ps["_total_max_speed"] / ps["_gps_count"], 1)
        
        # Remove accumulator fields from response
        for key in list(ps.keys()):
            if key.startswith("_"):
                del ps[key]
    
    # Sort alerts by severity (⚠️ warnings last, 🔴 critical first)
    alerts.sort(key=lambda x: (0 if "🔴" in x else (1 if "⚡" in x else 2)))
    
    # Sort athletes by risk (high risk first)
    risk_order = {"high": 0, "moderate": 1, "optimal": 2, "low": 3, "unknown": 4}
    athlete_data.sort(key=lambda x: risk_order.get(x.risk_level, 4))
    
    # Calculate RSI stats
    team_avg_rsi = None
    rsi_trend = None
    rsi_percentile = None
    
    if all_rsi_values:
        # Sort by date to calculate trend
        sorted_rsi = sorted(all_rsi_values, key=lambda x: x.get("date", ""))
        rsi_values_only = [r["value"] for r in sorted_rsi]
        team_avg_rsi = round(sum(rsi_values_only) / len(rsi_values_only), 2)
        
        # Calculate trend (compare last 3 vs previous 3)
        if len(rsi_values_only) >= 6:
            recent_avg = sum(rsi_values_only[-3:]) / 3
            previous_avg = sum(rsi_values_only[-6:-3]) / 3
            if recent_avg > previous_avg * 1.05:
                rsi_trend = "up"
            elif recent_avg < previous_avg * 0.95:
                rsi_trend = "down"
            else:
                rsi_trend = "stable"
        elif len(rsi_values_only) >= 2:
            if rsi_values_only[-1] > rsi_values_only[-2] * 1.05:
                rsi_trend = "up"
            elif rsi_values_only[-1] < rsi_values_only[-2] * 0.95:
                rsi_trend = "down"
            else:
                rsi_trend = "stable"
        
        # Calculate percentile (simple percentile based on RSI classification)
        if team_avg_rsi < 1.0:
            rsi_percentile = 25.0
        elif team_avg_rsi < 2.0:
            rsi_percentile = 50.0
        elif team_avg_rsi < 3.0:
            rsi_percentile = 75.0
        else:
            rsi_percentile = 95.0
    
    # Calculate average distance per session
    avg_distance_per_session = None
    if total_sessions_7d_global > 0 and total_distance > 0:
        avg_distance_per_session = round(total_distance / total_sessions_7d_global, 0)
    
    return TeamDashboardResponse(
        stats=TeamDashboardStats(
            total_athletes=len(athletes),
            athletes_high_risk=risk_distribution["high"],
            athletes_optimal=risk_distribution["optimal"],
            athletes_fatigued=sum(1 for a in athlete_data if a.fatigue_score and a.fatigue_score > 70),
            team_avg_acwr=round(total_acwr / acwr_count, 2) if acwr_count > 0 else 0,
            team_avg_wellness=round(total_wellness / wellness_count, 1) if wellness_count > 0 else 0,
            team_avg_fatigue=round(total_fatigue / fatigue_count, 1) if fatigue_count > 0 else 0,
            sessions_this_week=total_sessions_7d_global,
            total_distance_this_week=round(total_distance, 0),
            team_avg_power=round(total_power / power_count, 0) if power_count > 0 else None,
            team_avg_body_fat=round(total_body_fat / body_fat_count, 1) if body_fat_count > 0 else None,
            team_avg_hid=round(total_hid / hid_count, 0) if hid_count > 0 else None,
            team_avg_rsi=team_avg_rsi,
            rsi_trend=rsi_trend,
            rsi_percentile=rsi_percentile,
            avg_distance_per_session=avg_distance_per_session
        ),
        athletes=athlete_data,
        risk_distribution=risk_distribution,
        position_summary=position_summary,
        alerts=alerts[:10]
    )

# ============= SUBSCRIPTION ENDPOINTS =============

# ============= WEARABLE IMPORT ENDPOINTS =============

@api_router.get("/wearables/supported")
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

# ============= CSV FORMAT DETECTION AND MAPPING =============

# Column mappings for different GPS providers
GPS_PROVIDER_MAPPINGS = {
    "catapult": {
        "identifiers": ["Player Name", "Drill Title", "Player Load", "Total Distance", "High Speed Running"],
        "columns": {
            "date": ["Date", "date", "Session Date", "Activity Date", "Start Time"],
            "player_name": ["Player Name", "Player", "Name", "Athlete"],
            "session_name": ["Drill Title", "Session", "Activity", "Session Name", "Drill Name"],
            "total_distance": ["Total Distance", "Total Distance (m)", "Distance", "Distance (m)", "Dist (m)"],
            "high_intensity_distance": ["High Speed Running", "HSR", "HSR Distance", "High Speed Running (m)", "HSR (m)", "High Intensity Distance", "HID", "Sprint Distance", "High Speed Running Distance"],
            "sprints": ["Sprints", "Sprint Count", "Number of Sprints", "Sprint Efforts", "Total Sprints", "High Speed Efforts"],
            "max_speed": ["Max Velocity", "Max Speed", "Maximum Speed", "Top Speed", "Peak Speed", "Max Velocity (m/s)", "Max Speed (m/s)", "Vmax"],
            "player_load": ["Player Load", "PlayerLoad", "Total Player Load", "Load"],
            "duration": ["Duration", "Total Duration", "Time", "Session Duration"],
            "max_acceleration": ["Max Acceleration", "Peak Acceleration", "Max Accel"],
            "distance_per_min": ["Distance Per Min", "m/min", "Meters Per Minute"],
        }
    },
    "playertek": {
        "identifiers": ["PlayerTek", "Player Load", "Total Distance", "High Speed Running Distance"],
        "columns": {
            "date": ["Date", "date", "Session Date", "Activity Date"],
            "player_name": ["Player Name", "Player", "Name", "First Name", "Athlete Name"],
            "session_name": ["Session", "Activity", "Session Name", "Drill", "Activity Name"],
            "total_distance": ["Total Distance", "Total Distance (m)", "Distance", "Distance (m)", "Total Dist"],
            "high_intensity_distance": ["High Speed Running Distance", "HSR Distance", "HSR", "High Speed Running", "High Intensity Distance", "Sprint Distance", "High Speed Distance"],
            "sprints": ["Sprints", "Sprint Count", "Number of Sprints", "Sprint Efforts", "No. Sprints", "High Speed Runs"],
            "max_speed": ["Max Speed", "Top Speed", "Maximum Speed", "Peak Speed", "Max Velocity", "Vmax", "Max Speed (km/h)", "Max Speed (m/s)"],
            "player_load": ["Player Load", "PlayerLoad", "Total Load", "Load", "Body Load"],
            "duration": ["Duration", "Session Duration", "Time", "Total Time", "Playing Time"],
            "max_acceleration": ["Max Acceleration", "Peak Acceleration", "Top Acceleration"],
            "distance_per_min": ["Distance Per Min", "m/min", "Dist/min"],
        }
    },
    "statsports": {
        "identifiers": ["STATSports", "Apex", "HML Efforts", "High Intensity Bursts", "Collisions"],
        "columns": {
            "date": ["Date", "date", "Session Date", "Activity Date", "Start Date"],
            "player_name": ["Player", "Player Name", "Name", "Athlete", "First Name"],
            "session_name": ["Session", "Session Name", "Activity", "Drill", "Training"],
            "total_distance": ["Total Distance", "Distance", "Total Distance (m)", "Distance (m)", "Total Dist"],
            "high_intensity_distance": ["High Speed Running", "HSR", "HSR Distance", "High Intensity Distance", "High Speed Distance", "HML Distance", "Sprint Distance"],
            "sprints": ["Sprints", "Sprint Count", "Sprint Efforts", "High Intensity Bursts", "HML Efforts", "Number of Sprints", "No. Sprints"],
            "max_speed": ["Max Speed", "Top Speed", "Peak Speed", "Maximum Speed", "Max Velocity", "Vmax"],
            "player_load": ["Dynamic Stress Load", "DSL", "Player Load", "Load", "Total Load"],
            "duration": ["Duration", "Session Duration", "Time", "Total Duration"],
            "max_acceleration": ["Max Acceleration", "Peak Acceleration", "Max Accel"],
            "distance_per_min": ["Distance Per Min", "m/min", "Meters/min"],
            "accelerations": ["Accelerations", "Accel Count", "Total Accelerations"],
            "decelerations": ["Decelerations", "Decel Count", "Total Decelerations"],
        }
    },
    "gpexe": {
        "identifiers": ["GPexe", "Equivalent Distance", "Metabolic Power"],
        "columns": {
            "date": ["Date", "Session Date", "Activity Date"],
            "player_name": ["Player", "Player Name", "Athlete"],
            "session_name": ["Session", "Drill", "Activity"],
            "total_distance": ["Total Distance", "Distance", "Distance (m)"],
            "high_intensity_distance": ["High Speed Running", "HSR", "High Intensity Distance", "Speed Zone 5", "Speed Zone 6"],
            "sprints": ["Sprints", "Sprint Count", "High Speed Efforts"],
            "max_speed": ["Max Speed", "Vmax", "Peak Speed", "Top Speed"],
            "metabolic_power": ["Metabolic Power", "Avg Metabolic Power", "Mean Metabolic Power"],
            "equivalent_distance": ["Equivalent Distance", "Equiv Distance", "ED"],
        }
    },
    "polar": {
        "identifiers": ["Polar", "Training Load", "Recovery Time"],
        "columns": {
            "date": ["Date", "Start time", "Session Date"],
            "player_name": ["Name", "Player", "Athlete"],
            "session_name": ["Sport", "Activity", "Session"],
            "total_distance": ["Distance", "Total distance", "Distance (km)", "Distance (m)"],
            "high_intensity_distance": ["Distance in zone 5", "High intensity distance", "Speed zone 5"],
            "max_speed": ["Max speed", "Top speed", "Maximum speed"],
            "avg_heart_rate": ["Average heart rate", "Avg HR", "Mean HR"],
            "max_heart_rate": ["Maximum heart rate", "Max HR", "Peak HR"],
            "duration": ["Duration", "Total time", "Exercise time"],
            "calories": ["Calories", "Energy", "kcal"],
        }
    },
    "garmin": {
        "identifiers": ["Garmin", "Training Effect", "VO2 Max"],
        "columns": {
            "date": ["Date", "Start Time", "Activity Date"],
            "player_name": ["Name", "Title", "Activity Name"],
            "session_name": ["Activity Type", "Sport", "Activity"],
            "total_distance": ["Distance", "Total Distance", "Distance (m)", "Distance (km)"],
            "max_speed": ["Max Speed", "Max Pace", "Best Speed"],
            "avg_heart_rate": ["Avg HR", "Average Heart Rate", "Mean HR"],
            "max_heart_rate": ["Max HR", "Maximum Heart Rate", "Peak HR"],
            "duration": ["Time", "Duration", "Moving Time", "Elapsed Time"],
            "calories": ["Calories", "Cal"],
            "elevation": ["Elevation Gain", "Total Ascent", "Ascent"],
        }
    },
    "generic": {
        "identifiers": [],  # Fallback for unknown formats
        "columns": {
            "date": ["date", "Date", "DATA", "Fecha", "Datum", "session_date", "activity_date"],
            "player_name": ["player", "name", "athlete", "Player", "Name", "Athlete", "player_name", "athlete_name"],
            "session_name": ["session", "activity", "drill", "Session", "Activity", "Drill", "session_name"],
            "total_distance": ["total_distance", "distance", "Total Distance", "Distance", "dist", "DISTANCE", "distancia"],
            "high_intensity_distance": ["high_intensity_distance", "hsr", "high_speed_running", "HSR", "High Speed Running", "sprint_distance", "hid"],
            "sprints": ["sprints", "sprint_count", "Sprints", "Sprint Count", "num_sprints", "sprint_efforts"],
            "max_speed": ["max_speed", "top_speed", "Max Speed", "Top Speed", "vmax", "peak_speed", "maximum_speed"],
            "player_load": ["player_load", "load", "Player Load", "Load", "body_load"],
            "duration": ["duration", "time", "Duration", "Time", "session_duration"],
        }
    }
}

def detect_csv_provider(headers: list) -> tuple:
    """
    Detect the GPS provider based on CSV headers.
    Returns (provider_name, confidence_score)
    """
    headers_lower = [h.lower().strip() for h in headers]
    headers_set = set(headers_lower)
    
    best_match = ("generic", 0)
    
    for provider, config in GPS_PROVIDER_MAPPINGS.items():
        if provider == "generic":
            continue
            
        # Check for identifier columns
        identifier_matches = 0
        for identifier in config["identifiers"]:
            if identifier.lower() in headers_lower or any(identifier.lower() in h for h in headers_lower):
                identifier_matches += 1
        
        # Check for column matches
        column_matches = 0
        for field, possible_names in config["columns"].items():
            for name in possible_names:
                if name.lower() in headers_lower:
                    column_matches += 1
                    break
        
        # Calculate score (identifiers weighted more heavily)
        score = (identifier_matches * 3) + column_matches
        
        if score > best_match[1]:
            best_match = (provider, score)
    
    # If no good match found, use generic
    if best_match[1] < 3:
        return ("generic", 0)
    
    return best_match

def find_column_value(row: dict, field: str, provider: str) -> any:
    """
    Find a value in a row using the provider's column mappings.
    Tries multiple possible column names.
    """
    config = GPS_PROVIDER_MAPPINGS.get(provider, GPS_PROVIDER_MAPPINGS["generic"])
    possible_names = config["columns"].get(field, [])
    
    # Also check generic mappings as fallback
    if provider != "generic":
        generic_names = GPS_PROVIDER_MAPPINGS["generic"]["columns"].get(field, [])
        possible_names = list(possible_names) + list(generic_names)
    
    for name in possible_names:
        # Try exact match
        if name in row:
            return row[name]
        # Try case-insensitive match
        for key in row.keys():
            if key.lower().strip() == name.lower().strip():
                return row[key]
    
    return None

def parse_numeric(value: any, default: float = 0) -> float:
    """Parse a numeric value from various formats."""
    if value is None or value == "":
        return default
    try:
        # Handle string values
        if isinstance(value, str):
            # Remove common units and whitespace
            value = value.strip().replace(",", ".").replace(" ", "")
            # Remove units like 'm', 'km', 'm/s', etc.
            for unit in ["m/s", "km/h", "km", "m", "s", "min", "W", "bpm"]:
                value = value.replace(unit, "")
            value = value.strip()
        return float(value) if value else default
    except (ValueError, TypeError):
        return default

def parse_date(value: any) -> str:
    """Parse date from various formats and return YYYY-MM-DD."""
    if value is None or value == "":
        return datetime.utcnow().strftime("%Y-%m-%d")
    
    try:
        value_str = str(value).strip()
        
        # Try common date formats
        date_formats = [
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%m/%d/%Y",
            "%d-%m-%Y",
            "%Y/%m/%d",
            "%d.%m.%Y",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
        ]
        
        for fmt in date_formats:
            try:
                parsed = datetime.strptime(value_str, fmt)
                return parsed.strftime("%Y-%m-%d")
            except ValueError:
                continue
        
        # If nothing works, return the original value or today's date
        return value_str if len(value_str) >= 8 else datetime.utcnow().strftime("%Y-%m-%d")
    except:
        return datetime.utcnow().strftime("%Y-%m-%d")


@api_router.post("/wearables/import/csv")
async def import_wearable_csv(
    athlete_id: str,
    file: UploadFile = File(...),
    data_type: str = "gps",  # gps, heart_rate, training
    provider: Optional[str] = None,  # Optional: force specific provider
    current_user: dict = Depends(get_current_user)
):
    """
    Import wearable data from CSV file with automatic format detection.
    
    Supports multiple GPS providers:
    - Catapult (OpenField)
    - PlayerTek
    - STATSports (Apex)
    - GPexe
    - Polar
    - Garmin
    - Generic CSV format
    
    The system automatically detects the provider based on column headers.
    """
    import csv
    
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Read CSV content
    content = await file.read()
    
    # Try different encodings
    decoded = None
    for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']:
        try:
            decoded = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    
    if decoded is None:
        raise HTTPException(status_code=400, detail="Could not decode CSV file. Please ensure it's a valid CSV.")
    
    # Parse CSV
    lines = decoded.splitlines()
    if not lines:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    
    reader = csv.DictReader(lines)
    headers = reader.fieldnames or []
    
    if not headers:
        raise HTTPException(status_code=400, detail="CSV file has no headers")
    
    # Detect provider if not specified
    if provider:
        detected_provider = provider
        confidence = 100
    else:
        detected_provider, confidence = detect_csv_provider(headers)
    
    imported_records = []
    skipped_records = []
    errors = []
    
    # Generate a unique session ID for this import
    session_id = f"import_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{athlete_id[:8]}"
    
    for row_num, row in enumerate(reader, start=2):  # Start at 2 because row 1 is headers
        try:
            if data_type == "gps":
                # Extract values using provider-specific mappings
                date_val = find_column_value(row, "date", detected_provider)
                total_dist = find_column_value(row, "total_distance", detected_provider)
                hid = find_column_value(row, "high_intensity_distance", detected_provider)
                sprints = find_column_value(row, "sprints", detected_provider)
                max_spd = find_column_value(row, "max_speed", detected_provider)
                player_load = find_column_value(row, "player_load", detected_provider)
                duration = find_column_value(row, "duration", detected_provider)
                session_name = find_column_value(row, "session_name", detected_provider)
                player_name = find_column_value(row, "player_name", detected_provider)
                max_accel = find_column_value(row, "max_acceleration", detected_provider)
                dist_per_min = find_column_value(row, "distance_per_min", detected_provider)
                
                # Parse values
                total_distance = parse_numeric(total_dist)
                high_intensity_distance = parse_numeric(hid)
                number_of_sprints = int(parse_numeric(sprints))
                max_speed = parse_numeric(max_spd)
                
                # Convert km to m if values seem too small (likely in km)
                if total_distance > 0 and total_distance < 100:
                    total_distance = total_distance * 1000
                if high_intensity_distance > 0 and high_intensity_distance < 50:
                    high_intensity_distance = high_intensity_distance * 1000
                
                # Convert km/h to m/s if max_speed seems too high (likely in km/h)
                if max_speed > 15:  # Probably km/h
                    max_speed = max_speed / 3.6
                
                # Skip rows with no meaningful data
                if total_distance == 0 and high_intensity_distance == 0 and number_of_sprints == 0:
                    skipped_records.append({"row": row_num, "reason": "No data"})
                    continue
                
                gps_record = {
                    "athlete_id": athlete_id,
                    "coach_id": current_user["_id"],
                    "date": parse_date(date_val),
                    "session_id": session_id,
                    "session_name": str(session_name) if session_name else file.filename,
                    "total_distance": round(total_distance, 2),
                    "high_intensity_distance": round(high_intensity_distance, 2),
                    "high_speed_running": round(high_intensity_distance, 2),  # Alias
                    "number_of_sprints": number_of_sprints,
                    "max_speed": round(max_speed, 2),
                    "player_load": round(parse_numeric(player_load), 2) if player_load else None,
                    "duration_minutes": parse_numeric(duration) if duration else None,
                    "max_acceleration": round(parse_numeric(max_accel), 2) if max_accel else None,
                    "distance_per_min": round(parse_numeric(dist_per_min), 2) if dist_per_min else None,
                    "source": f"csv_import_{detected_provider}",
                    "device": detected_provider.title(),
                    "original_player_name": str(player_name) if player_name else None,
                    "imported_at": datetime.utcnow(),
                    "import_session_id": session_id
                }
                
                # Remove None values
                gps_record = {k: v for k, v in gps_record.items() if v is not None}
                
                await db.gps_data.insert_one(gps_record)
                imported_records.append({
                    "row": row_num,
                    "date": gps_record["date"],
                    "total_distance": gps_record["total_distance"],
                    "hid": gps_record.get("high_intensity_distance", 0),
                    "sprints": gps_record["number_of_sprints"]
                })
                
            elif data_type == "heart_rate":
                date_val = find_column_value(row, "date", detected_provider)
                avg_hr = find_column_value(row, "avg_heart_rate", detected_provider)
                max_hr = find_column_value(row, "max_heart_rate", detected_provider)
                
                if avg_hr is None and max_hr is None:
                    skipped_records.append({"row": row_num, "reason": "No heart rate data"})
                    continue
                
                hr_record = {
                    "athlete_id": athlete_id,
                    "coach_id": current_user["_id"],
                    "date": parse_date(date_val),
                    "average_heart_rate": int(parse_numeric(avg_hr)),
                    "max_heart_rate": int(parse_numeric(max_hr)),
                    "source": f"csv_import_{detected_provider}",
                    "imported_at": datetime.utcnow()
                }
                await db.heart_rate_data.insert_one(hr_record)
                imported_records.append({"row": row_num, "date": hr_record["date"]})
                
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})
    
    return {
        "success": True,
        "provider_detected": detected_provider,
        "confidence": f"{min(100, confidence * 10)}%",
        "records_imported": len(imported_records),
        "records_skipped": len(skipped_records),
        "errors": len(errors),
        "data_type": data_type,
        "athlete_id": athlete_id,
        "session_id": session_id,
        "headers_found": headers[:10],  # First 10 headers for debugging
        "import_details": {
            "imported": imported_records[:5],  # First 5 for preview
            "skipped": skipped_records[:5],
            "errors": errors[:5]
        }
    }


@api_router.get("/wearables/csv/supported-providers")
async def get_supported_csv_providers():
    """Get list of supported CSV providers and their expected columns."""
    providers = []
    for name, config in GPS_PROVIDER_MAPPINGS.items():
        if name == "generic":
            continue
        providers.append({
            "id": name,
            "name": name.title().replace("_", " "),
            "identifier_columns": config["identifiers"],
            "supported_fields": list(config["columns"].keys()),
            "example_columns": {
                field: names[:3] for field, names in config["columns"].items()
            }
        })
    
    return {
        "providers": providers,
        "generic_fallback": {
            "description": "If no provider is detected, the system will try to match columns using common naming patterns",
            "supported_fields": list(GPS_PROVIDER_MAPPINGS["generic"]["columns"].keys())
        },
        "tips": [
            "The system automatically detects the CSV format based on column headers",
            "Make sure your CSV has a header row with column names",
            "Date formats supported: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, and more",
            "Distance values are automatically converted from km to meters if needed",
            "Speed values are automatically converted from km/h to m/s if needed"
        ]
    }


@api_router.post("/wearables/csv/preview")
async def preview_csv_import(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Preview CSV file before importing.
    Shows detected provider, mapped columns, and sample data.
    """
    import csv
    
    content = await file.read()
    
    # Try different encodings
    decoded = None
    for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']:
        try:
            decoded = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    
    if decoded is None:
        raise HTTPException(status_code=400, detail="Could not decode CSV file")
    
    lines = decoded.splitlines()
    if not lines:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    
    reader = csv.DictReader(lines)
    headers = reader.fieldnames or []
    
    # Detect provider
    detected_provider, confidence = detect_csv_provider(headers)
    
    # Get sample rows with mapped values
    sample_rows = []
    for i, row in enumerate(reader):
        if i >= 5:  # Only first 5 rows
            break
        
        mapped = {
            "date": find_column_value(row, "date", detected_provider),
            "total_distance": find_column_value(row, "total_distance", detected_provider),
            "high_intensity_distance": find_column_value(row, "high_intensity_distance", detected_provider),
            "sprints": find_column_value(row, "sprints", detected_provider),
            "max_speed": find_column_value(row, "max_speed", detected_provider),
            "player_name": find_column_value(row, "player_name", detected_provider),
            "session_name": find_column_value(row, "session_name", detected_provider),
        }
        sample_rows.append({
            "original": dict(row),
            "mapped": mapped
        })
    
    # Show which columns were matched
    column_mapping = {}
    config = GPS_PROVIDER_MAPPINGS.get(detected_provider, GPS_PROVIDER_MAPPINGS["generic"])
    for field, possible_names in config["columns"].items():
        for name in possible_names:
            if name in headers or name.lower() in [h.lower() for h in headers]:
                column_mapping[field] = name
                break
    
    return {
        "filename": file.filename,
        "total_rows": len(lines) - 1,  # Minus header
        "headers": headers,
        "detected_provider": detected_provider,
        "confidence": f"{min(100, confidence * 10)}%",
        "column_mapping": column_mapping,
        "unmapped_headers": [h for h in headers if h not in column_mapping.values()],
        "sample_data": sample_rows,
        "ready_to_import": len(column_mapping) >= 2  # At least date and one metric
    }


# ============= VBT (VELOCITY BASED TRAINING) INTEGRATION =============

class VBTProvider(str, Enum):
    PUSH_BAND = "push_band"
    BEAST = "beast"
    VITRUVE = "vitruve"
    MANUAL = "manual"

class VBTDataCreate(BaseModel):
    athlete_id: str
    date: str
    provider: VBTProvider
    exercise: str
    sets: List[dict]  # [{reps: int, mean_velocity: float, peak_velocity: float, load_kg: float, power_watts: float, rom_cm: float}]
    notes: Optional[str] = None

@api_router.get("/vbt/providers")
async def get_vbt_providers():
    """Get supported VBT providers with Bluetooth connectivity"""
    return {
        "providers": [
            {
                "id": "push_band",
                "name": "PUSH Band 2.0",
                "description_pt": "Sensor vestível Bluetooth para VBT",
                "description_en": "Bluetooth wearable sensor for VBT",
                "metrics": ["mean_velocity", "peak_velocity", "power"],
                "connection": "bluetooth",
                "icon": "fitness",
                "color": "#FF6B35",
                "website": "https://www.trainwithpush.com"
            },
            {
                "id": "vitruve",
                "name": "Vitruve",
                "description_pt": "Encoder VBT compacto com Bluetooth",
                "description_en": "Compact VBT encoder with Bluetooth",
                "metrics": ["mean_velocity", "peak_velocity", "power", "rom"],
                "connection": "bluetooth",
                "icon": "speedometer",
                "color": "#00D4AA",
                "website": "https://vitruve.fit"
            },
            {
                "id": "beast",
                "name": "Beast Sensor",
                "description_pt": "Sensor IMU Bluetooth para VBT",
                "description_en": "Bluetooth IMU sensor for VBT",
                "metrics": ["mean_velocity", "peak_velocity", "power"],
                "connection": "bluetooth",
                "icon": "flash",
                "color": "#FFD700"
            },
            {
                "id": "manual",
                "name": "Manual Entry",
                "description_pt": "Entrada manual de dados VBT",
                "description_en": "Manual VBT data entry",
                "metrics": ["mean_velocity", "peak_velocity", "power", "rom"],
                "import_format": "form"
            }
        ],
        "exercises": [
            "Back Squat", "Front Squat", "Bench Press", "Deadlift", 
            "Power Clean", "Hang Clean", "Snatch", "Push Press",
            "Overhead Press", "Hip Thrust", "Romanian Deadlift",
            "Jump Squat", "Trap Bar Deadlift"
        ]
    }

@api_router.post("/vbt/data")
async def create_vbt_data(
    data: VBTDataCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create VBT (Velocity Based Training) data entry"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Calculate summary metrics
    all_velocities = [s.get("mean_velocity", 0) for s in data.sets if s.get("mean_velocity")]
    all_powers = [s.get("power_watts", 0) for s in data.sets if s.get("power_watts")]
    all_loads = [s.get("load_kg", 0) for s in data.sets if s.get("load_kg")]
    
    vbt_record = {
        "athlete_id": data.athlete_id,
        "coach_id": current_user["_id"],
        "date": data.date,
        "provider": data.provider.value,
        "exercise": data.exercise,
        "sets": data.sets,
        "summary": {
            "total_sets": len(data.sets),
            "total_reps": sum(s.get("reps", 0) for s in data.sets),
            "avg_velocity": sum(all_velocities) / len(all_velocities) if all_velocities else 0,
            "max_velocity": max(all_velocities) if all_velocities else 0,
            "avg_power": sum(all_powers) / len(all_powers) if all_powers else 0,
            "max_power": max(all_powers) if all_powers else 0,
            "max_load": max(all_loads) if all_loads else 0
        },
        "notes": data.notes,
        "created_at": datetime.utcnow()
    }
    
    result = await db.vbt_data.insert_one(vbt_record)
    vbt_record["_id"] = str(result.inserted_id)
    
    return vbt_record

@api_router.get("/vbt/athlete/{athlete_id}")
async def get_athlete_vbt_data(
    athlete_id: str,
    exercise: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get VBT data for an athlete"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    query = {
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }
    
    if exercise:
        query["exercise"] = exercise
    
    records = await db.vbt_data.find(query).sort("date", -1).to_list(100)
    
    for record in records:
        record["_id"] = str(record["_id"])
    
    return records

@api_router.post("/vbt/import/csv")
async def import_vbt_csv(
    athlete_id: str,
    provider: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Import VBT data from CSV file (PUSH Band, Vitruve, Beast formats)"""
    import csv
    
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(decoded.splitlines())
    
    # Group by exercise and date
    exercises_data = {}
    
    for row in reader:
        date = row.get("date", row.get("Date", ""))
        exercise = row.get("exercise", row.get("Exercise", row.get("Movement", "")))
        
        key = f"{date}_{exercise}"
        if key not in exercises_data:
            exercises_data[key] = {
                "date": date,
                "exercise": exercise,
                "sets": []
            }
        
        set_data = {
            "reps": int(row.get("reps", row.get("Reps", 1)) or 1),
            "mean_velocity": float(row.get("mean_velocity", row.get("Mean Velocity", row.get("Avg Velocity", 0))) or 0),
            "peak_velocity": float(row.get("peak_velocity", row.get("Peak Velocity", row.get("Max Velocity", 0))) or 0),
            "load_kg": float(row.get("load_kg", row.get("Load", row.get("Weight", 0))) or 0),
            "power_watts": float(row.get("power_watts", row.get("Power", row.get("Avg Power", 0))) or 0),
            "rom_cm": float(row.get("rom_cm", row.get("ROM", row.get("Range of Motion", 0))) or 0)
        }
        exercises_data[key]["sets"].append(set_data)
    
    # Store each exercise session
    imported_count = 0
    for key, exercise_data in exercises_data.items():
        all_velocities = [s["mean_velocity"] for s in exercise_data["sets"] if s["mean_velocity"]]
        all_powers = [s["power_watts"] for s in exercise_data["sets"] if s["power_watts"]]
        all_loads = [s["load_kg"] for s in exercise_data["sets"] if s["load_kg"]]
        
        vbt_record = {
            "athlete_id": athlete_id,
            "coach_id": current_user["_id"],
            "date": exercise_data["date"],
            "provider": provider,
            "exercise": exercise_data["exercise"],
            "sets": exercise_data["sets"],
            "summary": {
                "total_sets": len(exercise_data["sets"]),
                "total_reps": sum(s["reps"] for s in exercise_data["sets"]),
                "avg_velocity": sum(all_velocities) / len(all_velocities) if all_velocities else 0,
                "max_velocity": max(all_velocities) if all_velocities else 0,
                "avg_power": sum(all_powers) / len(all_powers) if all_powers else 0,
                "max_power": max(all_powers) if all_powers else 0,
                "max_load": max(all_loads) if all_loads else 0
            },
            "source": "csv_import",
            "created_at": datetime.utcnow()
        }
        
        await db.vbt_data.insert_one(vbt_record)
        imported_count += 1
    
    return {
        "success": True,
        "exercises_imported": imported_count,
        "provider": provider,
        "athlete_id": athlete_id
    }

@api_router.get("/vbt/analysis/{athlete_id}")
async def get_vbt_analysis(
    athlete_id: str,
    exercise: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Get VBT analysis with velocity-load profiling and fatigue detection"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get VBT data for this exercise
    records = await db.vbt_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "exercise": exercise
    }).sort("date", -1).to_list(50)
    
    if not records:
        raise HTTPException(status_code=400, detail="No VBT data available for this exercise")
    
    # Calculate Load-Velocity Profile (LVP)
    load_velocity_points = []
    for record in records:
        for set_data in record.get("sets", []):
            if set_data.get("load_kg") and set_data.get("mean_velocity"):
                load_velocity_points.append({
                    "load": set_data["load_kg"],
                    "velocity": set_data["mean_velocity"],
                    "date": record["date"]
                })
    
    # Calculate estimated 1RM based on load-velocity relationship
    # Using Bazuelo-Ruiz et al. formula: 1RM velocity ≈ 0.17 m/s for most exercises
    mvt_velocity = 0.17  # Minimum Velocity Threshold
    
    if len(load_velocity_points) >= 2:
        # Simple linear regression for load-velocity
        loads = [p["load"] for p in load_velocity_points]
        velocities = [p["velocity"] for p in load_velocity_points]
        
        n = len(loads)
        sum_x = sum(loads)
        sum_y = sum(velocities)
        sum_xy = sum(l * v for l, v in zip(loads, velocities))
        sum_x2 = sum(l ** 2 for l in loads)
        
        if (n * sum_x2 - sum_x ** 2) != 0:
            slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x ** 2)
            intercept = (sum_y - slope * sum_x) / n
            
            # Estimated 1RM where velocity = MVT
            if slope != 0:
                estimated_1rm = (mvt_velocity - intercept) / slope
            else:
                estimated_1rm = None
        else:
            slope = 0
            intercept = 0
            estimated_1rm = None
    else:
        slope = 0
        intercept = 0
        estimated_1rm = None
    
    # Calculate OPTIMAL LOAD (where power is maximized)
    # Power = Load × Velocity
    # Using the linear regression: velocity = intercept + slope × load
    # Power = load × (intercept + slope × load) = intercept×load + slope×load²
    # To maximize: dP/dLoad = intercept + 2×slope×load = 0
    # optimal_load = -intercept / (2 × slope)
    optimal_load = None
    optimal_velocity = None
    optimal_power = None
    
    if slope and slope < 0 and intercept:  # slope should be negative for valid profile
        optimal_load = -intercept / (2 * slope)
        if optimal_load > 0:
            optimal_velocity = intercept + slope * optimal_load
            optimal_power = optimal_load * optimal_velocity
            optimal_load = round(optimal_load, 1)
            optimal_velocity = round(optimal_velocity, 3)
            optimal_power = round(optimal_power, 0)
        else:
            optimal_load = None
    
    # Track optimal load evolution over time
    optimal_load_history = []
    if len(records) >= 2:
        for record in records[:10]:
            record_loads = []
            record_velocities = []
            for set_data in record.get("sets", []):
                if set_data.get("load_kg") and set_data.get("mean_velocity"):
                    record_loads.append(set_data["load_kg"])
                    record_velocities.append(set_data["mean_velocity"])
            
            if len(record_loads) >= 2:
                # Calculate slope and intercept for this session
                n = len(record_loads)
                sum_x = sum(record_loads)
                sum_y = sum(record_velocities)
                sum_xy = sum(l * v for l, v in zip(record_loads, record_velocities))
                sum_x2 = sum(l ** 2 for l in record_loads)
                
                denom = n * sum_x2 - sum_x ** 2
                if denom != 0:
                    rec_slope = (n * sum_xy - sum_x * sum_y) / denom
                    rec_intercept = (sum_y - rec_slope * sum_x) / n
                    
                    if rec_slope < 0 and rec_intercept > 0:
                        rec_optimal_load = -rec_intercept / (2 * rec_slope)
                        if rec_optimal_load > 0:
                            rec_optimal_velocity = rec_intercept + rec_slope * rec_optimal_load
                            rec_optimal_power = rec_optimal_load * rec_optimal_velocity
                            optimal_load_history.append({
                                "date": record["date"],
                                "optimal_load": round(rec_optimal_load, 1),
                                "optimal_velocity": round(rec_optimal_velocity, 3),
                                "optimal_power": round(rec_optimal_power, 0)
                            })
    
    # Velocity loss analysis (fatigue indicator)
    latest_record = records[0]
    velocity_loss_data = []
    if len(latest_record.get("sets", [])) >= 2:
        first_set_velocity = latest_record["sets"][0].get("mean_velocity", 0)
        for i, set_data in enumerate(latest_record["sets"]):
            velocity = set_data.get("mean_velocity", 0)
            if first_set_velocity > 0:
                loss_percent = ((first_set_velocity - velocity) / first_set_velocity) * 100
                velocity_loss_data.append({
                    "set": i + 1,
                    "velocity": velocity,
                    "loss_percent": round(loss_percent, 1)
                })
    
    # Calculate trend
    trend = "stable"
    if len(records) >= 3:
        recent_avg = sum(r["summary"]["avg_velocity"] for r in records[:3]) / 3
        older_avg = sum(r["summary"]["avg_velocity"] for r in records[-3:]) / 3
        if recent_avg > older_avg * 1.05:
            trend = "improving"
        elif recent_avg < older_avg * 0.95:
            trend = "declining"
    
    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name"),
        "exercise": exercise,
        "latest_session": {
            "date": latest_record["date"],
            "sets": len(latest_record.get("sets", [])),
            "avg_velocity": latest_record["summary"]["avg_velocity"],
            "max_velocity": latest_record["summary"]["max_velocity"],
            "max_power": latest_record["summary"]["max_power"],
            "max_load": latest_record["summary"]["max_load"]
        },
        "load_velocity_profile": {
            "slope": round(slope, 4) if slope else None,
            "intercept": round(intercept, 2) if intercept else None,
            "estimated_1rm": round(estimated_1rm, 1) if estimated_1rm else None,
            "mvt_velocity": mvt_velocity,
            "data_points": len(load_velocity_points),
            "optimal_load": optimal_load,
            "optimal_velocity": optimal_velocity,
            "optimal_power": optimal_power
        },
        "optimal_load_evolution": optimal_load_history,
        "velocity_loss_analysis": velocity_loss_data,
        "trend": trend,
        "history": [
            {
                "date": r["date"],
                "avg_velocity": r["summary"]["avg_velocity"],
                "max_velocity": r["summary"]["max_velocity"],
                "max_load": r["summary"]["max_load"]
            } for r in records[:10]
        ],
        "recommendations": {
            "pt": get_vbt_recommendations_pt(velocity_loss_data, trend, estimated_1rm),
            "en": get_vbt_recommendations_en(velocity_loss_data, trend, estimated_1rm)
        }.get(lang, get_vbt_recommendations_en(velocity_loss_data, trend, estimated_1rm))
    }

def get_vbt_recommendations_pt(velocity_loss, trend, estimated_1rm):
    recs = []
    if velocity_loss and len(velocity_loss) > 1:
        max_loss = max(vl["loss_percent"] for vl in velocity_loss)
        if max_loss > 20:
            recs.append("⚠️ Perda de velocidade alta (>20%) indica fadiga significativa. Considere reduzir volume.")
        elif max_loss < 10:
            recs.append("✅ Baixa perda de velocidade. Pode aumentar intensidade ou volume.")
    
    if trend == "improving":
        recs.append("📈 Tendência de melhora na velocidade. Continue progredindo gradualmente.")
    elif trend == "declining":
        recs.append("📉 Tendência de queda. Considere período de recuperação ou deload.")
    
    if estimated_1rm:
        recs.append(f"💪 1RM estimado: {estimated_1rm:.1f} kg baseado no perfil carga-velocidade.")
    
    return recs

def get_vbt_recommendations_en(velocity_loss, trend, estimated_1rm):
    recs = []
    if velocity_loss and len(velocity_loss) > 1:
        max_loss = max(vl["loss_percent"] for vl in velocity_loss)
        if max_loss > 20:
            recs.append("⚠️ High velocity loss (>20%) indicates significant fatigue. Consider reducing volume.")
        elif max_loss < 10:
            recs.append("✅ Low velocity loss. Can increase intensity or volume.")
    
    if trend == "improving":
        recs.append("📈 Improving velocity trend. Continue progressing gradually.")
    elif trend == "declining":
        recs.append("📉 Declining trend. Consider recovery period or deload.")
    
    if estimated_1rm:
        recs.append(f"💪 Estimated 1RM: {estimated_1rm:.1f} kg based on load-velocity profile.")
    
    return recs

@api_router.get("/subscription/plans")
async def get_subscription_plans(lang: str = "pt", region: str = "BR"):
    """Get all available subscription plans with regional pricing"""
    plans = []
    is_brazil = region.upper() == "BR"
    is_portuguese = lang.lower() in ["pt", "pt-br"]
    
    for plan_id, plan_data in PLAN_LIMITS.items():
        if plan_id != "free_trial":  # Don't show trial as a purchasable plan
            price = plan_data.get("price_brl", 0) if is_brazil else plan_data.get("price_usd", 0)
            currency = "BRL" if is_brazil else "USD"
            currency_symbol = "R$" if is_brazil else "$"
            
            plans.append({
                "id": plan_id,
                "name": plan_data["name"] if is_portuguese else plan_data.get("name_en", plan_data["name"]),
                "price": price,
                "price_formatted": f"{currency_symbol} {price:.2f}".replace(".", ",") if is_brazil else f"{currency_symbol}{price:.2f}",
                "currency": currency,
                "max_athletes": plan_data["max_athletes"],
                "history_months": plan_data["history_months"],
                "advanced_analytics": plan_data.get("advanced_analytics", False),
                "ai_insights": plan_data.get("ai_insights", False),
                "fatigue_alerts": plan_data.get("fatigue_alerts", False),
                "multi_user": plan_data.get("multi_user", False),
                "max_users": plan_data.get("max_users", 1),
                "features": plan_data.get("features", []),
                "trial_days": plan_data.get("trial_days", 7),
                "billing_period_days": plan_data.get("billing_period_days", 30),
                "auto_renew": plan_data.get("auto_renew", True),
                "description": plan_data.get("description_pt" if is_portuguese else "description_en", ""),
                "features_list": plan_data.get("features_list_pt" if is_portuguese else "features_list_en", []),
                "limitations": plan_data.get("limitations_pt" if is_portuguese else "limitations_en", []),
                "popular": plan_data.get("popular", False),
            })
    return plans

@api_router.get("/subscription/current", response_model=SubscriptionResponse)
async def get_current_subscription(
    lang: str = "pt", 
    region: str = "BR",
    current_user: dict = Depends(get_current_user)
):
    """Get current user's subscription status"""
    user_id = current_user["_id"]
    is_brazil = region.upper() == "BR"
    
    # Get subscription from database
    subscription = await db.subscriptions.find_one({
        "user_id": user_id,
        "status": {"$in": ["active", "trial"]}
    })
    
    # Count current athletes
    athlete_count = await db.athletes.count_documents({"coach_id": user_id})
    
    if not subscription:
        # Create default trial subscription
        trial_end = datetime.utcnow() + timedelta(days=7)
        new_subscription = {
            "user_id": user_id,
            "plan": "free_trial",
            "status": "trial",
            "start_date": datetime.utcnow(),
            "trial_end_date": trial_end,
            "current_period_end": trial_end,
            "created_at": datetime.utcnow(),
        }
        await db.subscriptions.insert_one(new_subscription)
        subscription = new_subscription
    
    plan = subscription.get("plan", "free_trial")
    plan_limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free_trial"])
    status = subscription.get("status", "trial")
    
    # Get price based on region
    price = plan_limits.get("price_brl", 0) if is_brazil else plan_limits.get("price_usd", 0)
    
    # Calculate days remaining
    days_remaining = None
    trial_end_str = None
    if subscription.get("trial_end_date"):
        trial_end = subscription["trial_end_date"]
        if isinstance(trial_end, str):
            trial_end = datetime.fromisoformat(trial_end)
        days_remaining = max(0, (trial_end - datetime.utcnow()).days)
        trial_end_str = trial_end.strftime("%Y-%m-%d")
        
        # Check if trial expired
        if days_remaining == 0 and status == "trial":
            await db.subscriptions.update_one(
                {"_id": subscription.get("_id")},
                {"$set": {"status": "expired"}}
            )
            status = "expired"
    
    # Calculate limits reached
    max_athletes = plan_limits.get("max_athletes", 25)
    limits_reached = {
        "athletes": athlete_count >= max_athletes if max_athletes > 0 else False,
        "advanced_analytics": not plan_limits.get("advanced_analytics", False),
        "ai_insights": not plan_limits.get("ai_insights", False),
    }
    
    return SubscriptionResponse(
        plan=plan,
        plan_name=plan_limits.get("name", "Trial"),
        status=status,
        price=price,
        max_athletes=max_athletes,
        current_athletes=athlete_count,
        history_months=plan_limits.get("history_months", 3),
        days_remaining=days_remaining,
        trial_end_date=trial_end_str,
        features={
            "advanced_analytics": plan_limits.get("advanced_analytics", False),
            "ai_insights": plan_limits.get("ai_insights", False),
            "fatigue_alerts": plan_limits.get("fatigue_alerts", False),
            "multi_user": plan_limits.get("multi_user", False),
            "priority_support": plan_limits.get("priority_support", False),
        },
        limits_reached=limits_reached
    )

@api_router.post("/subscription/subscribe")
async def subscribe_to_plan(
    subscription_data: SubscriptionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Subscribe to a plan (simulated - no real payment)"""
    user_id = current_user["_id"]
    plan = subscription_data.plan.value
    
    if plan not in PLAN_LIMITS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    plan_limits = PLAN_LIMITS[plan]
    
    # Cancel any existing subscription
    await db.subscriptions.update_many(
        {"user_id": user_id, "status": {"$in": ["active", "trial"]}},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.utcnow()}}
    )
    
    # Create new subscription
    trial_end = datetime.utcnow() + timedelta(days=plan_limits.get("trial_days", 7))
    period_end = datetime.utcnow() + timedelta(days=30)  # Monthly billing
    
    new_subscription = {
        "user_id": user_id,
        "plan": plan,
        "status": "trial",  # Start with trial
        "start_date": datetime.utcnow(),
        "trial_end_date": trial_end,
        "current_period_end": period_end,
        "created_at": datetime.utcnow(),
    }
    
    result = await db.subscriptions.insert_one(new_subscription)
    
    return {
        "message": "Subscription created successfully",
        "subscription_id": str(result.inserted_id),
        "plan": plan,
        "trial_end_date": trial_end.strftime("%Y-%m-%d"),
        "status": "trial"
    }

@api_router.post("/subscription/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    """Cancel current subscription"""
    user_id = current_user["_id"]
    
    result = await db.subscriptions.update_one(
        {"user_id": user_id, "status": {"$in": ["active", "trial"]}},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No active subscription found")
    
    return {"message": "Subscription cancelled successfully"}

@api_router.post("/subscription/restore")
async def restore_subscription(current_user: dict = Depends(get_current_user)):
    """Restore a previously cancelled subscription (simulates App Store/Google Play restore)"""
    user_id = current_user["_id"]
    
    # Find any cancelled subscription for this user
    cancelled_sub = await db.subscriptions.find_one({
        "user_id": user_id,
        "status": "cancelled"
    }, sort=[("cancelled_at", -1)])  # Get most recently cancelled
    
    if not cancelled_sub:
        raise HTTPException(status_code=404, detail="No previous subscription found to restore")
    
    # Reactivate the subscription
    # In a real app, this would verify with App Store/Google Play
    new_period_end = datetime.utcnow() + timedelta(days=30)
    
    result = await db.subscriptions.update_one(
        {"_id": cancelled_sub["_id"]},
        {
            "$set": {
                "status": "active",
                "cancelled_at": None,
                "current_period_end": new_period_end,
                "restored_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Failed to restore subscription")
    
    return {"message": "Subscription restored successfully", "plan": cancelled_sub.get("plan", "pro")}

@api_router.get("/subscription/check-feature/{feature}")
async def check_feature_access(
    feature: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if user has access to a specific feature"""
    user_id = current_user["_id"]
    
    subscription = await db.subscriptions.find_one({
        "user_id": user_id,
        "status": {"$in": ["active", "trial"]}
    })
    
    if not subscription:
        return {"has_access": False, "reason": "no_subscription"}
    
    plan = subscription.get("plan", "free_trial")
    plan_limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free_trial"])
    
    # Check trial expiration
    if subscription.get("status") == "trial":
        trial_end = subscription.get("trial_end_date")
        if trial_end:
            if isinstance(trial_end, str):
                trial_end = datetime.fromisoformat(trial_end)
            if datetime.utcnow() > trial_end:
                return {"has_access": False, "reason": "trial_expired"}
    
    # Check feature access
    feature_map = {
        "advanced_analytics": plan_limits.get("advanced_analytics", False),
        "ai_insights": plan_limits.get("ai_insights", False),
        "fatigue_alerts": plan_limits.get("fatigue_alerts", False),
        "athlete_comparison": "athlete_comparison" in plan_limits.get("features", []) or "all" in plan_limits.get("features", []),
    }
    
    has_access = feature_map.get(feature, False)
    
    return {
        "has_access": has_access,
        "feature": feature,
        "plan": plan,
        "upgrade_required": not has_access
    }

# ============= UNIVERSAL LINKS / DEEP LINKS CONFIGURATION =============
# These routes serve the verification files needed for iOS Universal Links and Android App Links
# Note: In production, these files should be served from the root domain (.well-known/)
# For now, we provide them via /api/well-known for testing purposes

@api_router.get("/well-known/apple-app-site-association")
async def apple_app_site_association():
    """Serve Apple App Site Association file for iOS Universal Links"""
    return JSONResponse(
        content={
            "applinks": {
                "apps": [],
                "details": [
                    {
                        "appID": "TEAM_ID.com.loadmanager.app",
                        "paths": [
                            "/wellness-form/*",
                            "/wellness/*"
                        ]
                    }
                ]
            },
            "webcredentials": {
                "apps": [
                    "TEAM_ID.com.loadmanager.app"
                ]
            }
        },
        headers={
            "Content-Type": "application/json"
        }
    )

@api_router.get("/well-known/assetlinks.json")
async def android_asset_links():
    """Serve Asset Links file for Android App Links"""
    return JSONResponse(
        content=[
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": "com.loadmanager.app",
                    "sha256_cert_fingerprints": [
                        "SHA256_FINGERPRINT_PLACEHOLDER"
                    ]
                }
            }
        ],
        headers={
            "Content-Type": "application/json"
        }
    )

# ============= REVENUECAT WEBHOOK INTEGRATION =============
# These endpoints handle webhook events from RevenueCat for subscription management

REVENUECAT_WEBHOOK_SECRET = os.environ.get('REVENUECAT_WEBHOOK_SECRET', '')

class RevenueCatEventData(BaseModel):
    """RevenueCat webhook event data"""
    event_timestamp_ms: Optional[int] = None
    product_id: Optional[str] = None
    purchased_at_ms: Optional[int] = None
    expiration_at_ms: Optional[int] = None
    environment: Optional[str] = None  # SANDBOX or PRODUCTION
    entitlement_ids: Optional[List[str]] = None
    app_user_id: str
    original_app_user_id: Optional[str] = None
    currency: Optional[str] = None
    price: Optional[float] = None
    cancel_reason: Optional[str] = None
    store: Optional[str] = None  # APP_STORE, PLAY_STORE

class RevenueCatWebhookPayload(BaseModel):
    """RevenueCat webhook payload"""
    event: RevenueCatEventData
    api_version: str
    type: str  # Event type: INITIAL_PURCHASE, RENEWAL, CANCELLATION, etc.
    id: str  # Unique event ID

async def verify_revenuecat_webhook(authorization: Optional[str]) -> bool:
    """Verify webhook authenticity using authorization header"""
    if not REVENUECAT_WEBHOOK_SECRET:
        logging.warning("RevenueCat webhook secret not configured")
        return True  # Allow in development if not configured
    
    if not authorization:
        return False
    
    expected = f"Bearer {REVENUECAT_WEBHOOK_SECRET}"
    return authorization == expected

@api_router.post("/webhooks/revenuecat")
async def handle_revenuecat_webhook(
    payload: RevenueCatWebhookPayload,
    authorization: Optional[str] = Header(None)
):
    """
    Handle RevenueCat webhooks for subscription events.
    
    Event types handled:
    - INITIAL_PURCHASE: First-time subscription
    - RENEWAL: Subscription renewed
    - CANCELLATION: User cancelled
    - EXPIRATION: Subscription expired
    - BILLING_ISSUE: Payment failed
    - UNCANCELLATION: User resubscribed
    - PRODUCT_CHANGE: User changed plan
    """
    # Verify webhook authenticity
    if REVENUECAT_WEBHOOK_SECRET and not await verify_revenuecat_webhook(authorization):
        logging.warning(f"RevenueCat webhook: Invalid authorization")
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    event = payload.event
    event_type = payload.type
    event_id = payload.id
    
    logging.info(f"RevenueCat webhook received: type={event_type}, user={event.app_user_id}, id={event_id}")
    
    # Check for duplicate events (idempotency)
    existing_event = await db.webhook_events.find_one({"event_id": event_id})
    if existing_event:
        logging.info(f"RevenueCat webhook: Duplicate event {event_id}, skipping")
        return {"status": "duplicate", "message": "Event already processed"}
    
    # Log the event for audit trail
    await db.webhook_events.insert_one({
        "event_id": event_id,
        "event_type": event_type,
        "app_user_id": event.app_user_id,
        "product_id": event.product_id,
        "raw_payload": payload.model_dump(),
        "processed": False,
        "received_at": datetime.utcnow()
    })
    
    try:
        # Find user by app_user_id (this should match your user's _id)
        user = await db.users.find_one({"_id": ObjectId(event.app_user_id)})
        if not user:
            # Try to find by email or other identifier
            logging.warning(f"RevenueCat webhook: User not found for app_user_id={event.app_user_id}")
            # Still process the event, user might register later
        
        user_id = event.app_user_id
        
        # Process based on event type
        if event_type == "INITIAL_PURCHASE":
            await handle_initial_purchase(user_id, event)
        elif event_type == "RENEWAL":
            await handle_renewal(user_id, event)
        elif event_type == "CANCELLATION":
            await handle_cancellation(user_id, event)
        elif event_type == "EXPIRATION":
            await handle_expiration(user_id, event)
        elif event_type == "BILLING_ISSUE":
            await handle_billing_issue(user_id, event)
        elif event_type == "UNCANCELLATION":
            await handle_uncancellation(user_id, event)
        elif event_type == "PRODUCT_CHANGE":
            await handle_product_change(user_id, event)
        elif event_type == "SUBSCRIBER_ALIAS":
            # User IDs were merged in RevenueCat
            logging.info(f"RevenueCat webhook: Subscriber alias event for {user_id}")
        else:
            logging.info(f"RevenueCat webhook: Unhandled event type {event_type}")
        
        # Mark event as processed
        await db.webhook_events.update_one(
            {"event_id": event_id},
            {"$set": {"processed": True, "processed_at": datetime.utcnow()}}
        )
        
        return {"status": "success", "message": f"Event {event_type} processed"}
        
    except Exception as e:
        logging.error(f"RevenueCat webhook error: {str(e)}")
        await db.webhook_events.update_one(
            {"event_id": event_id},
            {"$set": {"processed": False, "error": str(e)}}
        )
        raise HTTPException(status_code=500, detail="Internal server error")

async def handle_initial_purchase(user_id: str, event: RevenueCatEventData):
    """Handle initial purchase event from RevenueCat"""
    expires_at = None
    if event.expiration_at_ms:
        expires_at = datetime.fromtimestamp(event.expiration_at_ms / 1000)
    
    purchased_at = datetime.utcnow()
    if event.purchased_at_ms:
        purchased_at = datetime.fromtimestamp(event.purchased_at_ms / 1000)
    
    subscription_data = {
        "user_id": user_id,
        "plan": "pro",
        "status": "active",
        "source": "revenuecat",
        "store": event.store,
        "product_id": event.product_id,
        "entitlement_ids": event.entitlement_ids,
        "environment": event.environment,
        "currency": event.currency,
        "price": event.price,
        "start_date": purchased_at,
        "current_period_end": expires_at,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    # Upsert subscription
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {"$set": subscription_data},
        upsert=True
    )
    
    logging.info(f"RevenueCat: Initial purchase recorded for user {user_id}")

async def handle_renewal(user_id: str, event: RevenueCatEventData):
    """Handle subscription renewal event"""
    expires_at = None
    if event.expiration_at_ms:
        expires_at = datetime.fromtimestamp(event.expiration_at_ms / 1000)
    
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "status": "active",
                "current_period_end": expires_at,
                "cancel_reason": None,
                "updated_at": datetime.utcnow()
            },
            "$inc": {"renewal_count": 1}
        }
    )
    
    logging.info(f"RevenueCat: Subscription renewed for user {user_id}")

async def handle_cancellation(user_id: str, event: RevenueCatEventData):
    """Handle cancellation event"""
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "status": "cancelled",
                "cancel_reason": event.cancel_reason,
                "cancelled_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.info(f"RevenueCat: Subscription cancelled for user {user_id}, reason: {event.cancel_reason}")

async def handle_expiration(user_id: str, event: RevenueCatEventData):
    """Handle subscription expiration event"""
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "status": "expired",
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.info(f"RevenueCat: Subscription expired for user {user_id}")

async def handle_billing_issue(user_id: str, event: RevenueCatEventData):
    """Handle billing issue event"""
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "billing_issue": True,
                "billing_issue_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.warning(f"RevenueCat: Billing issue for user {user_id}")

async def handle_uncancellation(user_id: str, event: RevenueCatEventData):
    """Handle uncancellation (user resubscribed)"""
    expires_at = None
    if event.expiration_at_ms:
        expires_at = datetime.fromtimestamp(event.expiration_at_ms / 1000)
    
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "status": "active",
                "current_period_end": expires_at,
                "cancel_reason": None,
                "cancelled_at": None,
                "billing_issue": False,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.info(f"RevenueCat: Subscription reactivated for user {user_id}")

async def handle_product_change(user_id: str, event: RevenueCatEventData):
    """Handle product change event (user changed plan)"""
    expires_at = None
    if event.expiration_at_ms:
        expires_at = datetime.fromtimestamp(event.expiration_at_ms / 1000)
    
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "product_id": event.product_id,
                "current_period_end": expires_at,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.info(f"RevenueCat: Product changed for user {user_id} to {event.product_id}")

@api_router.get("/subscription/revenuecat-status/{app_user_id}")
async def get_revenuecat_subscription_status(
    app_user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get subscription status from local database (synced via RevenueCat webhooks).
    This is used to verify subscription status on the backend.
    """
    # Security: Only allow users to check their own subscription
    if current_user["_id"] != app_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this subscription")
    
    subscription = await db.subscriptions.find_one({
        "user_id": app_user_id,
        "source": "revenuecat"
    })
    
    if not subscription:
        return {
            "is_active": False,
            "status": "NO_SUBSCRIPTION",
            "message": "No RevenueCat subscription found"
        }
    
    # Check if expired
    is_expired = False
    if subscription.get("current_period_end"):
        is_expired = subscription["current_period_end"] < datetime.utcnow()
    
    return {
        "is_active": subscription.get("status") == "active" and not is_expired,
        "status": subscription.get("status", "unknown"),
        "product_id": subscription.get("product_id"),
        "store": subscription.get("store"),
        "expires_at": subscription.get("current_period_end").isoformat() if subscription.get("current_period_end") else None,
        "environment": subscription.get("environment"),
        "has_billing_issue": subscription.get("billing_issue", False)
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
