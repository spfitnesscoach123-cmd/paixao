from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
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
    ESSENCIAL = "essencial"
    PROFISSIONAL = "profissional"
    ELITE = "elite"

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
        "history_months": 12,
        "features": ["all"],  # All features during trial
        "trial_days": 7,
        "export_pdf": True,
        "export_csv": True,
        "advanced_analytics": True,
        "ai_insights": True,
        "fatigue_alerts": True,
        "vbt_analysis": True,
        "body_composition": True,
        "body_3d_model": True,
        "multi_user": False,
        "max_users": 1,
        "description_pt": "Experimente todas as funcionalidades por 7 dias grátis",
        "description_en": "Try all features free for 7 days",
    },
    "essencial": {
        "name": "Essencial",
        "name_en": "Essential",
        "price_brl": 39.90,
        "price_usd": 7.99,
        "max_athletes": 20,  # Reduced from 25 to 20
        "history_months": 3,
        "features": ["basic_reports", "weekly_view", "quick_registration"],
        "trial_days": 7,
        "export_pdf": False,
        "export_csv": False,
        "advanced_analytics": False,
        "ai_insights": False,
        "fatigue_alerts": False,
        "vbt_analysis": False,
        "body_composition": False,
        "body_3d_model": False,
        "multi_user": False,
        "max_users": 1,
        "description_pt": "Ideal para treinadores individuais ou pequenas equipes iniciando no monitoramento de atletas",
        "description_en": "Ideal for individual coaches or small teams starting athlete monitoring",
        "features_list_pt": [
            "Até 20 atletas cadastrados",
            "Registro rápido de GPS e Wellness",
            "Visualização semanal de carga",
            "Histórico de 3 meses",
            "Relatórios básicos de desempenho",
            "ACWR básico"
        ],
        "features_list_en": [
            "Up to 20 registered athletes",
            "Quick GPS and Wellness registration",
            "Weekly load visualization",
            "3 months history",
            "Basic performance reports",
            "Basic ACWR"
        ],
        "limitations_pt": [
            "Sem VBT (Velocity Based Training)",
            "Sem Composição Corporal",
            "Sem alertas de fadiga",
            "Sem exportação PDF/CSV",
            "Sem insights de IA"
        ],
        "limitations_en": [
            "No VBT (Velocity Based Training)",
            "No Body Composition",
            "No fatigue alerts",
            "No PDF/CSV export",
            "No AI insights"
        ]
    },
    "profissional": {
        "name": "Profissional",
        "name_en": "Professional",
        "price_brl": 89.90,
        "price_usd": 17.99,
        "max_athletes": 50,
        "history_months": -1,  # Unlimited
        "features": ["basic_reports", "weekly_view", "monthly_reports", "athlete_comparison", "context_alerts", "export_pdf", "export_csv", "advanced_analytics", "fatigue_alerts", "vbt_analysis", "body_composition"],
        "trial_days": 7,
        "export_pdf": True,
        "export_csv": True,
        "advanced_analytics": True,
        "ai_insights": False,
        "fatigue_alerts": True,
        "vbt_analysis": True,
        "body_composition": True,
        "body_3d_model": False,
        "multi_user": False,
        "max_users": 1,
        "description_pt": "Para preparadores físicos e clubes que precisam de análises avançadas e comparações",
        "description_en": "For fitness coaches and clubs needing advanced analytics and comparisons",
        "features_list_pt": [
            "Até 50 atletas cadastrados",
            "Tudo do plano Essencial",
            "VBT - Velocity Based Training",
            "Composição Corporal (protocolos científicos)",
            "ACWR detalhado por métrica",
            "Comparação entre atletas",
            "Alertas de fadiga (>30%)",
            "Exportação PDF e CSV",
            "Histórico ilimitado"
        ],
        "features_list_en": [
            "Up to 50 registered athletes",
            "Everything in Essential plan",
            "VBT - Velocity Based Training",
            "Body Composition (scientific protocols)",
            "Detailed ACWR by metric",
            "Athlete comparison",
            "Fatigue alerts (>30%)",
            "PDF and CSV export",
            "Unlimited history"
        ],
        "limitations_pt": [
            "Sem modelo 3D do corpo",
            "Sem insights de IA",
            "Sem múltiplos usuários"
        ],
        "limitations_en": [
            "No 3D body model",
            "No AI insights",
            "No multiple users"
        ],
        "popular": True
    },
    "elite": {
        "name": "Elite",
        "name_en": "Elite",
        "price_brl": 159.90,
        "price_usd": 29.99,
        "max_athletes": -1,  # Unlimited
        "history_months": -1,  # Unlimited
        "features": ["all"],
        "trial_days": 7,
        "export_pdf": True,
        "export_csv": True,
        "advanced_analytics": True,
        "ai_insights": True,
        "fatigue_alerts": True,
        "vbt_analysis": True,
        "body_composition": True,
        "body_3d_model": True,
        "multi_user": True,
        "max_users": 2,
        "priority_support": True,
        "custom_branding": True,
        "description_pt": "Solução completa para clubes profissionais e departamentos de performance",
        "description_en": "Complete solution for professional clubs and performance departments",
        "features_list_pt": [
            "Atletas ilimitados",
            "Tudo do plano Profissional",
            "Modelo 3D do corpo humano",
            "Insights gerados por IA",
            "Detecção de fadiga periférica",
            "Até 2 usuários simultâneos",
            "Suporte prioritário",
            "Relatórios personalizados",
            "API de integração (em breve)"
        ],
        "features_list_en": [
            "Unlimited athletes",
            "Everything in Professional plan",
            "3D human body model",
            "AI-generated insights",
            "Peripheral fatigue detection",
            "Up to 2 simultaneous users",
            "Priority support",
            "Custom reports",
            "Integration API (coming soon)"
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
            
            # Collect RSI values from assessments for this athlete
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
        latest_body_comp = await db.body_composition_assessments.find_one(
            {"athlete_id": athlete_id},
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


# ============= PDF REPORT GENERATION =============

# Translations for PDF reports
PDF_TRANSLATIONS = {
    "en": {
        "athlete_report": "Athlete Report",
        "generated_on": "Generated on",
        "personal_info": "Personal Information",
        "name": "Name",
        "position": "Position",
        "age": "Age",
        "years": "years",
        "gps_summary": "GPS Data Summary",
        "total_sessions": "Total Sessions",
        "avg_distance": "Average Distance",
        "avg_high_intensity": "Avg High Intensity",
        "avg_sprints": "Avg Sprints",
        "max_speed_recorded": "Max Speed Recorded",
        "acwr_analysis": "ACWR Analysis",
        "metric": "Metric",
        "acute_load": "Acute Load (7d)",
        "chronic_load": "Chronic Load (28d)",
        "acwr_ratio": "ACWR Ratio",
        "risk_level": "Risk Level",
        "overall_risk": "Overall Risk",
        "recommendation": "Recommendation",
        "recent_sessions": "Recent Sessions",
        "date": "Date",
        "distance": "Distance",
        "high_int": "High Int.",
        "sprints": "Sprints",
        "period": "Period",
        "no_data": "No data available",
        "risk_low": "Low Risk",
        "risk_optimal": "Optimal",
        "risk_moderate": "Moderate",
        "risk_high": "High Risk",
        "page": "Page",
        "strength_title": "Strength & Power Analysis",
        "metric": "Metric",
        "current_avg": "Current Avg",
        "peak": "Peak",
        "percentile": "Percentile",
        "trend": "Trend",
    },
    "pt": {
        "athlete_report": "Relatório do Atleta",
        "generated_on": "Gerado em",
        "personal_info": "Informações Pessoais",
        "name": "Nome",
        "position": "Posição",
        "age": "Idade",
        "years": "anos",
        "gps_summary": "Resumo dos Dados GPS",
        "total_sessions": "Total de Sessões",
        "avg_distance": "Distância Média",
        "avg_high_intensity": "Alta Intensidade Média",
        "avg_sprints": "Sprints Médios",
        "max_speed_recorded": "Velocidade Máxima Registrada",
        "acwr_analysis": "Análise ACWR",
        "metric": "Métrica",
        "acute_load": "Carga Aguda (7d)",
        "chronic_load": "Carga Crônica (28d)",
        "acwr_ratio": "Ratio ACWR",
        "risk_level": "Nível de Risco",
        "overall_risk": "Risco Geral",
        "recommendation": "Recomendação",
        "recent_sessions": "Sessões Recentes",
        "date": "Data",
        "distance": "Distância",
        "high_int": "Alta Int.",
        "sprints": "Sprints",
        "period": "Período",
        "no_data": "Sem dados disponíveis",
        "risk_low": "Baixo Risco",
        "risk_optimal": "Ótimo",
        "risk_moderate": "Moderado",
        "risk_high": "Alto Risco",
        "page": "Página",
        "strength_title": "Análise de Força e Potência",
        "metric": "Métrica",
        "current_avg": "Média Atual",
        "peak": "Pico",
        "percentile": "Percentil",
        "trend": "Tendência",
    },
    "es": {
        "athlete_report": "Informe del Atleta",
        "generated_on": "Generado el",
        "personal_info": "Información Personal",
        "name": "Nombre",
        "position": "Posición",
        "age": "Edad",
        "years": "años",
        "gps_summary": "Resumen de Datos GPS",
        "total_sessions": "Total de Sesiones",
        "avg_distance": "Distancia Promedio",
        "avg_high_intensity": "Alta Intensidad Promedio",
        "avg_sprints": "Sprints Promedio",
        "max_speed_recorded": "Velocidad Máxima Registrada",
        "acwr_analysis": "Análisis ACWR",
        "metric": "Métrica",
        "acute_load": "Carga Aguda (7d)",
        "chronic_load": "Carga Crónica (28d)",
        "acwr_ratio": "Ratio ACWR",
        "risk_level": "Nivel de Riesgo",
        "overall_risk": "Riesgo General",
        "recommendation": "Recomendación",
        "recent_sessions": "Sesiones Recientes",
        "date": "Fecha",
        "distance": "Distancia",
        "high_int": "Alta Int.",
        "sprints": "Sprints",
        "period": "Período",
        "no_data": "Sin datos disponibles",
        "risk_low": "Bajo Riesgo",
        "risk_optimal": "Óptimo",
        "risk_moderate": "Moderado",
        "risk_high": "Alto Riesgo",
        "page": "Página",
    },
    "fr": {
        "athlete_report": "Rapport de l'Athlète",
        "generated_on": "Généré le",
        "personal_info": "Informations Personnelles",
        "name": "Nom",
        "position": "Position",
        "age": "Âge",
        "years": "ans",
        "gps_summary": "Résumé des Données GPS",
        "total_sessions": "Total des Sessions",
        "avg_distance": "Distance Moyenne",
        "avg_high_intensity": "Haute Intensité Moyenne",
        "avg_sprints": "Sprints Moyens",
        "max_speed_recorded": "Vitesse Max Enregistrée",
        "acwr_analysis": "Analyse ACWR",
        "metric": "Métrique",
        "acute_load": "Charge Aiguë (7j)",
        "chronic_load": "Charge Chronique (28j)",
        "acwr_ratio": "Ratio ACWR",
        "risk_level": "Niveau de Risque",
        "overall_risk": "Risque Global",
        "recommendation": "Recommandation",
        "recent_sessions": "Sessions Récentes",
        "date": "Date",
        "distance": "Distance",
        "high_int": "Haute Int.",
        "sprints": "Sprints",
        "period": "Période",
        "no_data": "Aucune donnée disponible",
        "risk_low": "Risque Faible",
        "risk_optimal": "Optimal",
        "risk_moderate": "Modéré",
        "risk_high": "Risque Élevé",
        "page": "Page",
    },
}

def get_translation(lang: str, key: str) -> str:
    """Get translation for a key in the specified language"""
    translations = PDF_TRANSLATIONS.get(lang, PDF_TRANSLATIONS["en"])
    return translations.get(key, PDF_TRANSLATIONS["en"].get(key, key))

def get_risk_label(lang: str, risk_level: str) -> str:
    """Get translated risk level label"""
    risk_map = {
        "low": "risk_low",
        "optimal": "risk_optimal",
        "moderate": "risk_moderate",
        "high": "risk_high",
    }
    return get_translation(lang, risk_map.get(risk_level, "risk_moderate"))

# ============= REPORT PREVIEW ENDPOINTS =============

@api_router.get("/reports/athlete/{athlete_id}/preview")
async def get_athlete_report_preview(
    athlete_id: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Get a preview of athlete report data (for showing before download)"""
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get GPS data
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).to_list(1000)
    
    # Get wellness data
    wellness_records = await db.wellness.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).to_list(1000)
    
    # Get body composition
    body_compositions = await db.body_compositions.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(1)
    
    # Calculate summaries
    gps_summary = None
    if gps_records:
        gps_summary = {
            "avg_distance": sum(r.get("total_distance", 0) for r in gps_records) / len(gps_records),
            "max_speed": max((r.get("max_speed", 0) or 0) for r in gps_records),
            "total_sprints": sum(r.get("number_of_sprints", 0) for r in gps_records),
            "avg_hsr": sum((r.get("high_speed_running", 0) or 0) for r in gps_records) / len(gps_records),
        }
    
    wellness_summary = None
    if wellness_records:
        wellness_summary = {
            "avg_readiness": sum(r.get("readiness_score", 0) or r.get("wellness_score", 5) for r in wellness_records) / len(wellness_records),
            "avg_sleep_hours": sum(r.get("sleep_hours", 7) for r in wellness_records) / len(wellness_records),
            "avg_fatigue": sum(r.get("fatigue", 5) for r in wellness_records) / len(wellness_records),
            "avg_stress": sum(r.get("stress", 5) for r in wellness_records) / len(wellness_records),
        }
    
    body_composition = None
    if body_compositions:
        bc = body_compositions[0]
        body_composition = {
            "date": bc.get("date"),
            "body_fat_percentage": bc.get("body_fat_percentage", 0),
            "lean_mass_kg": bc.get("lean_mass_kg", 0),
            "fat_mass_kg": bc.get("fat_mass_kg", 0),
            "bmi": bc.get("bmi", 0),
            "bmi_classification": bc.get("bmi_classification", ""),
        }
    
    # Determine period
    all_dates = []
    all_dates.extend([r.get("date") for r in gps_records if r.get("date")])
    all_dates.extend([r.get("date") for r in wellness_records if r.get("date")])
    
    period = None
    if all_dates:
        sorted_dates = sorted([d for d in all_dates if d])
        if len(sorted_dates) >= 2:
            period = f"{sorted_dates[0]} - {sorted_dates[-1]}"
        elif sorted_dates:
            period = sorted_dates[0]
    
    return {
        "summary": {
            "athlete_name": athlete.get("name"),
            "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
            "total_sessions": len(gps_records),
            "total_wellness_records": len(wellness_records),
            "period": period,
        },
        "gps_summary": gps_summary,
        "wellness_summary": wellness_summary,
        "body_composition": body_composition,
    }

@api_router.get("/reports/athlete/{athlete_id}/csv-preview")
async def get_athlete_csv_preview(
    athlete_id: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Get a preview of CSV data (headers and sample rows)"""
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get GPS data
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(100)
    
    headers = [
        "Date",
        "Session",
        "Total Distance (m)",
        "HID (m)",
        "HSR (m)",
        "Sprint (m)",
        "Sprints",
        "Acc",
        "Dec",
        "Max Speed (km/h)"
    ]
    
    if lang == "pt":
        headers = [
            "Data",
            "Sessão",
            "Distância Total (m)",
            "HID (m)",
            "HSR (m)",
            "Sprint (m)",
            "Sprints",
            "Acc",
            "Dec",
            "Vel. Max (km/h)"
        ]
    
    sample_rows = []
    for record in gps_records[:5]:  # Show first 5 rows
        sample_rows.append([
            record.get("date", ""),
            record.get("session_name", record.get("period_name", "")),
            str(int(record.get("total_distance", 0))),
            str(int(record.get("high_intensity_distance", 0))),
            str(int(record.get("high_speed_running", 0) or 0)),
            str(int(record.get("sprint_distance", 0))),
            str(record.get("number_of_sprints", 0)),
            str(record.get("number_of_accelerations", 0)),
            str(record.get("number_of_decelerations", 0)),
            f"{record.get('max_speed', 0):.1f}" if record.get("max_speed") else "0",
        ])
    
    return {
        "summary": {
            "athlete_name": athlete.get("name"),
            "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        },
        "csv_preview": {
            "headers": headers,
            "sample_rows": sample_rows,
            "total_rows": len(gps_records),
        }
    }

@api_router.get("/reports/body-composition/{composition_id}/preview")
async def get_body_composition_preview(
    composition_id: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Get a preview of body composition report data"""
    # Find the composition
    composition = await db.body_compositions.find_one({
        "_id": ObjectId(composition_id),
        "coach_id": current_user["_id"]
    })
    
    if not composition:
        raise HTTPException(status_code=404, detail="Body composition not found")
    
    # Get athlete name
    athlete = await db.athletes.find_one({"_id": ObjectId(composition.get("athlete_id"))})
    athlete_name = athlete.get("name") if athlete else "Unknown"
    
    return {
        "summary": {
            "athlete_name": athlete_name,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        },
        "body_composition": {
            "date": composition.get("date"),
            "body_fat_percentage": composition.get("body_fat_percentage", 0),
            "lean_mass_kg": composition.get("lean_mass_kg", 0),
            "fat_mass_kg": composition.get("fat_mass_kg", 0),
            "bmi": composition.get("bmi", 0),
            "bmi_classification": composition.get("bmi_classification", ""),
        }
    }

@api_router.get("/reports/athlete/{athlete_id}/pdf")
async def generate_athlete_pdf_report(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """Generate a PDF report for an athlete in the specified language"""
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    
    t = lambda key: get_translation(lang, key)
    
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get GPS data
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(100)
    
    # Get ACWR data
    acwr_data = None
    try:
        acwr_response = await get_acwr_detailed_analysis(athlete_id, current_user)
        acwr_data = acwr_response
    except:
        pass
    
    # Create PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5*cm,
        leftMargin=1.5*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=rl_colors.HexColor('#8b5cf6')
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=15,
        spaceAfter=10,
        textColor=rl_colors.HexColor('#3b82f6')
    )
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=6
    )
    
    story = []
    
    # Title
    story.append(Paragraph(f"📊 {t('athlete_report')}", title_style))
    story.append(Paragraph(f"{t('generated_on')}: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}", normal_style))
    story.append(Spacer(1, 20))
    
    # Personal Info Section
    story.append(Paragraph(f"👤 {t('personal_info')}", heading_style))
    
    # Calculate age
    age = "-"
    if athlete.get("birth_date"):
        try:
            birth = datetime.strptime(str(athlete["birth_date"]), "%Y-%m-%d")
            age = (datetime.utcnow() - birth).days // 365
        except:
            pass
    
    info_data = [
        [t('name'), athlete.get("name", "-")],
        [t('position'), athlete.get("position", "-")],
        [t('age'), f"{age} {t('years')}" if age != "-" else "-"],
    ]
    
    info_table = Table(info_data, colWidths=[4*cm, 10*cm])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), rl_colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (0, -1), rl_colors.HexColor('#374151')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#e5e7eb')),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 20))
    
    # GPS Summary
    story.append(Paragraph(f"📍 {t('gps_summary')}", heading_style))
    
    if gps_records:
        total_sessions = len(set([r.get("session_id", r.get("date")) for r in gps_records]))
        avg_distance = sum([r.get("total_distance", 0) for r in gps_records]) / len(gps_records) if gps_records else 0
        avg_high_int = sum([r.get("high_intensity_distance", 0) for r in gps_records]) / len(gps_records) if gps_records else 0
        avg_sprints = sum([r.get("number_of_sprints", 0) for r in gps_records]) / len(gps_records) if gps_records else 0
        max_speed = max([r.get("max_speed", 0) or 0 for r in gps_records]) if gps_records else 0
        
        gps_summary_data = [
            [t('total_sessions'), str(total_sessions)],
            [t('avg_distance'), f"{avg_distance:.0f}m"],
            [t('avg_high_intensity'), f"{avg_high_int:.0f}m"],
            [t('avg_sprints'), f"{avg_sprints:.1f}"],
            [t('max_speed_recorded'), f"{max_speed:.1f} km/h"],
        ]
        
        gps_table = Table(gps_summary_data, colWidths=[6*cm, 8*cm])
        gps_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), rl_colors.HexColor('#ede9fe')),
            ('TEXTCOLOR', (0, 0), (0, -1), rl_colors.HexColor('#5b21b6')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#c4b5fd')),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(gps_table)
    else:
        story.append(Paragraph(t('no_data'), normal_style))
    
    story.append(Spacer(1, 20))
    
    # ACWR Analysis
    story.append(Paragraph(f"📈 {t('acwr_analysis')}", heading_style))
    
    if acwr_data and hasattr(acwr_data, 'metrics') and acwr_data.metrics:
        # Header row
        acwr_table_data = [
            [t('metric'), t('acute_load'), t('chronic_load'), t('acwr_ratio'), t('risk_level')]
        ]
        
        for metric in acwr_data.metrics:
            risk_label = get_risk_label(lang, metric.risk_level)
            acwr_table_data.append([
                metric.name,
                f"{metric.acute_load:.0f}",
                f"{metric.chronic_load:.0f}",
                f"{metric.acwr_ratio:.2f}",
                risk_label
            ])
        
        acwr_table = Table(acwr_table_data, colWidths=[4*cm, 2.5*cm, 3*cm, 2.5*cm, 2.5*cm])
        
        # Style based on risk levels
        table_style = [
            ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#8b5cf6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#c4b5fd')),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]
        
        # Color code risk levels
        for i, metric in enumerate(acwr_data.metrics, start=1):
            if metric.risk_level == "high":
                table_style.append(('BACKGROUND', (4, i), (4, i), rl_colors.HexColor('#fecaca')))
                table_style.append(('TEXTCOLOR', (4, i), (4, i), rl_colors.HexColor('#991b1b')))
            elif metric.risk_level == "moderate":
                table_style.append(('BACKGROUND', (4, i), (4, i), rl_colors.HexColor('#fef3c7')))
                table_style.append(('TEXTCOLOR', (4, i), (4, i), rl_colors.HexColor('#92400e')))
            elif metric.risk_level == "optimal":
                table_style.append(('BACKGROUND', (4, i), (4, i), rl_colors.HexColor('#d1fae5')))
                table_style.append(('TEXTCOLOR', (4, i), (4, i), rl_colors.HexColor('#065f46')))
            else:
                table_style.append(('BACKGROUND', (4, i), (4, i), rl_colors.HexColor('#dbeafe')))
                table_style.append(('TEXTCOLOR', (4, i), (4, i), rl_colors.HexColor('#1e40af')))
        
        acwr_table.setStyle(TableStyle(table_style))
        story.append(acwr_table)
        story.append(Spacer(1, 10))
        
        # Overall risk and recommendation
        overall_risk_label = get_risk_label(lang, acwr_data.overall_risk)
        story.append(Paragraph(f"<b>{t('overall_risk')}:</b> {overall_risk_label}", normal_style))
        story.append(Paragraph(f"<b>{t('recommendation')}:</b> {acwr_data.recommendation}", normal_style))
    else:
        story.append(Paragraph(t('no_data'), normal_style))
    
    story.append(Spacer(1, 20))
    
    # ============= STRENGTH / VBT SECTION =============
    story.append(Paragraph(f"💪 {t('strength_title')}", heading_style))
    
    # Get strength assessments (filter by type, order by date and created_at)
    strength_assessments = await db.assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "assessment_type": "strength"
    }).sort([("date", -1), ("created_at", -1)]).to_list(50)
    
    # Get VBT data
    vbt_records = await db.vbt_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(50)
    
    if strength_assessments or vbt_records:
        # Collect all strength metrics from assessments (metrics are stored inside 'metrics' dict)
        all_mean_power = []
        all_peak_power = []
        all_mean_speed = []
        all_peak_speed = []
        all_rsi = []
        
        # Traditional strength metrics
        traditional_metrics = {
            'bench_press_1rm': [],
            'squat_1rm': [],
            'deadlift_1rm': [],
            'vertical_jump': []
        }
        
        for assessment in strength_assessments:
            metrics = assessment.get("metrics", {})
            
            # VBT metrics
            if metrics.get("mean_power"):
                all_mean_power.append(metrics["mean_power"])
            if metrics.get("peak_power"):
                all_peak_power.append(metrics["peak_power"])
            if metrics.get("mean_speed"):
                all_mean_speed.append(metrics["mean_speed"])
            if metrics.get("peak_speed"):
                all_peak_speed.append(metrics["peak_speed"])
            if metrics.get("rsi") and metrics["rsi"] > 0:
                all_rsi.append({"value": metrics["rsi"], "date": assessment.get("date")})
            
            # Traditional strength metrics
            for key in traditional_metrics.keys():
                if metrics.get(key):
                    traditional_metrics[key].append(metrics[key])
        
        for vbt in vbt_records:
            sets = vbt.get("sets", [])
            for s in sets:
                if s.get("power_watts"):
                    all_mean_power.append(s["power_watts"])
                if s.get("mean_velocity"):
                    all_mean_speed.append(s["mean_velocity"])
        
        # Get most recent values (first assessment is the most recent due to sort)
        latest_assessment = strength_assessments[0] if strength_assessments else None
        latest_metrics = latest_assessment.get("metrics", {}) if latest_assessment else {}
        
        current_mean_power = latest_metrics.get("mean_power", 0) or (all_mean_power[0] if all_mean_power else 0)
        current_peak_power = latest_metrics.get("peak_power", 0) or 0
        current_mean_speed = latest_metrics.get("mean_speed", 0) or (all_mean_speed[0] if all_mean_speed else 0)
        current_peak_speed = latest_metrics.get("peak_speed", 0) or 0
        
        # Calculate peaks from all data
        max_peak_power = max(all_peak_power) if all_peak_power else current_peak_power
        max_peak_speed = max(all_peak_speed) if all_peak_speed else current_peak_speed
        
        # Calculate RSI stats
        current_rsi = all_rsi[0]["value"] if all_rsi else 0
        avg_rsi = sum(r["value"] for r in all_rsi) / len(all_rsi) if all_rsi else 0
        
        # RSI trend calculation
        rsi_trend = "stable"
        if len(all_rsi) >= 2:
            if all_rsi[0]["value"] > all_rsi[1]["value"] * 1.05:
                rsi_trend = "up"
            elif all_rsi[0]["value"] < all_rsi[1]["value"] * 0.95:
                rsi_trend = "down"
        
        # RSI Classification
        def get_rsi_classification(rsi_value, language):
            if rsi_value < 1.0:
                return ("low_performance", "#ef4444") if language == "en" else ("Baixo Desempenho", "#ef4444")
            elif rsi_value < 2.0:
                return ("medium_acceptable", "#f59e0b") if language == "en" else ("Médio / Aceitável", "#f59e0b")
            elif rsi_value < 3.0:
                return ("good", "#3b82f6") if language == "en" else ("Bom", "#3b82f6")
            else:
                return ("excellent", "#10b981") if language == "en" else ("Excelente", "#10b981")
        
        # RSI Percentile
        def get_rsi_percentile(rsi_value):
            if rsi_value < 1.0:
                return 25
            elif rsi_value < 2.0:
                return 50
            elif rsi_value < 3.0:
                return 75
            else:
                return 95
        
        rsi_class, rsi_color = get_rsi_classification(current_rsi, lang)
        rsi_percentile = get_rsi_percentile(current_rsi)
        
        # Build strength metrics table - showing current (latest) values
        strength_headers = [
            t('metric') if lang == "en" else "Métrica",
            t('current') if lang == "en" else "Atual",
            t('peak') if lang == "en" else "Pico",
            t('percentile') if lang == "en" else "Percentil",
            t('trend') if lang == "en" else "Tendência"
        ]
        
        trend_symbol = "↑" if rsi_trend == "up" else ("↓" if rsi_trend == "down" else "→")
        
        strength_data = [strength_headers]
        
        # Use current (most recent) values instead of averages
        if current_mean_power > 0:
            strength_data.append([
                "Mean Power",
                f"{current_mean_power:.0f}W",
                f"{max_peak_power:.0f}W" if max_peak_power else "-",
                f"P{min(95, int(current_mean_power / 30))}",  # Simplified percentile
                "→"
            ])
        
        if current_mean_speed > 0:
            strength_data.append([
                "Mean Speed",
                f"{current_mean_speed:.2f} m/s",
                f"{max_peak_speed:.2f} m/s" if max_peak_speed else "-",
                f"P{min(95, int(current_mean_speed * 40))}",  # Simplified percentile
                "→"
            ])
        
        if current_rsi > 0:
            strength_data.append([
                "RSI",
                f"{current_rsi:.2f}",
                f"{max(r['value'] for r in all_rsi):.2f}" if all_rsi else "-",
                f"P{rsi_percentile}",
                trend_symbol
            ])
        
        if len(strength_data) > 1:
            strength_table = Table(strength_data, colWidths=[3.5*cm, 3*cm, 3*cm, 2.5*cm, 2*cm])
            strength_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#7c3aed')),
                ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#c4b5fd')),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor('#f5f3ff')]),
            ]))
            story.append(strength_table)
            story.append(Spacer(1, 15))
        
        # RSI Classification and Insights
        if current_rsi > 0:
            story.append(Paragraph(f"<b>RSI Classification:</b> {rsi_class}", normal_style))
            
            # RSI Insights based on value
            insights_title = "Insights Práticos" if lang == "pt" else "Practical Insights"
            story.append(Paragraph(f"<b>{insights_title}:</b>", normal_style))
            
            if current_rsi < 1.0:
                insight1 = "• Baixa eficiência reativa / 'Pesado em campo'" if lang == "pt" else "• Low reactive efficiency / 'Heavy on field'"
                insight2 = "• Pode indicar acúmulo de fadiga periférica" if lang == "pt" else "• May indicate peripheral fatigue accumulation"
                insight3 = "• Recomendação: Foco em força excêntrica e técnica de aterrisagem" if lang == "pt" else "• Recommendation: Focus on eccentric strength and landing technique"
            elif current_rsi < 2.0:
                insight1 = "• Nível comum de atletas amadores" if lang == "pt" else "• Common level for amateur athletes"
                insight2 = "• Base razoável, mas com margem clara de melhora" if lang == "pt" else "• Reasonable base, but clear room for improvement"
                insight3 = "• Recomendação: Trabalho de pliometria progressiva" if lang == "pt" else "• Recommendation: Progressive plyometric work"
            elif current_rsi < 3.0:
                insight1 = "• Bom aproveitamento do ciclo CAE" if lang == "pt" else "• Good use of SSC (Stretch-Shortening Cycle)"
                insight2 = "• Nível semi-profissional bem desenvolvido" if lang == "pt" else "• Well-developed semi-professional level"
                insight3 = "• Recomendação: Manter treino e focar em velocidade/potência" if lang == "pt" else "• Recommendation: Maintain training, focus on speed/power"
            else:
                insight1 = "• Altíssima reatividade em campo" if lang == "pt" else "• Very high on-field reactivity"
                insight2 = "• Muita explosividade, reações rápidas" if lang == "pt" else "• High explosiveness, quick reactions"
                insight3 = "• Recomendação: Foco em velocidade, COD e potência" if lang == "pt" else "• Recommendation: Focus on speed, COD and power"
            
            story.append(Paragraph(insight1, normal_style))
            story.append(Paragraph(insight2, normal_style))
            story.append(Paragraph(insight3, normal_style))
            
            # RSI Alert for sudden drop
            if rsi_trend == "down":
                alert_text = "⚠️ Queda detectada no RSI - Monitorar fadiga e ajustar carga. Dias de baixa reatividade = menos saltos e ações explosivas." if lang == "pt" else "⚠️ RSI drop detected - Monitor fatigue and adjust load. Low reactivity days = fewer jumps and explosive actions."
                alert_style = ParagraphStyle('Alert', parent=normal_style, textColor=rl_colors.HexColor('#dc2626'))
                story.append(Spacer(1, 5))
                story.append(Paragraph(alert_text, alert_style))
        
        # ============= TRADITIONAL STRENGTH SECTION =============
        has_traditional = any(len(v) > 0 for v in traditional_metrics.values())
        if has_traditional:
            story.append(Spacer(1, 15))
            trad_title = "Força Tradicional" if lang == "pt" else "Traditional Strength"
            story.append(Paragraph(f"<b>🏋️ {trad_title}</b>", normal_style))
            story.append(Spacer(1, 8))
            
            trad_header = [
                "Exercício" if lang == "pt" else "Exercise",
                "Atual" if lang == "pt" else "Current",
                "Máximo" if lang == "pt" else "Max",
                "Média" if lang == "pt" else "Avg"
            ]
            trad_data = [trad_header]
            
            exercise_labels = {
                'bench_press_1rm': ('Supino', 'Bench Press'),
                'squat_1rm': ('Agachamento', 'Squat'),
                'deadlift_1rm': ('Levantamento Terra', 'Deadlift'),
                'vertical_jump': ('Salto Vertical', 'Vertical Jump')
            }
            
            for key, values in traditional_metrics.items():
                if values:
                    label = exercise_labels[key][0] if lang == "pt" else exercise_labels[key][1]
                    unit = "cm" if key == "vertical_jump" else "kg"
                    current_val = values[0] if values else 0
                    max_val = max(values) if values else 0
                    avg_val = sum(values) / len(values) if values else 0
                    trad_data.append([
                        label,
                        f"{current_val:.1f}{unit}",
                        f"{max_val:.1f}{unit}",
                        f"{avg_val:.1f}{unit}"
                    ])
            
            if len(trad_data) > 1:
                trad_table = Table(trad_data, colWidths=[4*cm, 3*cm, 3*cm, 3*cm])
                trad_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#059669')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#86efac')),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor('#ecfdf5')]),
                ]))
                story.append(trad_table)
    else:
        story.append(Paragraph(t('no_data'), normal_style))
    
    story.append(Spacer(1, 20))
    
    # Recent Sessions
    story.append(Paragraph(f"📅 {t('recent_sessions')}", heading_style))
    
    if gps_records:
        sessions_data = [[t('date'), t('distance'), t('high_int'), t('sprints'), t('period')]]
        
        for record in gps_records[:15]:  # Last 15 records
            period_name = record.get("period_name") or record.get("notes", "").replace("Período: ", "") or "-"
            sessions_data.append([
                record.get("date", "-"),
                f"{record.get('total_distance', 0):.0f}m",
                f"{record.get('high_intensity_distance', 0):.0f}m",
                str(record.get("number_of_sprints", 0)),
                period_name[:15]  # Truncate period name
            ])
        
        sessions_table = Table(sessions_data, colWidths=[3*cm, 2.5*cm, 2.5*cm, 2*cm, 4*cm])
        sessions_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#bfdbfe')),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor('#f0f9ff')]),
        ]))
        story.append(sessions_table)
    else:
        story.append(Paragraph(t('no_data'), normal_style))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    
    # Return PDF as streaming response
    filename = f"report_{athlete.get('name', 'athlete').replace(' ', '_')}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ============= CSV EXPORT ENDPOINTS =============

@api_router.get("/reports/athlete/{athlete_id}/csv")
async def export_athlete_csv(
    athlete_id: str,
    data_type: str = "all",  # all, gps, wellness, strength, body_composition
    current_user: dict = Depends(get_current_user)
):
    """Export athlete data as CSV"""
    import csv
    
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    buffer = BytesIO()
    writer_wrapper = io.TextIOWrapper(buffer, encoding='utf-8', newline='')
    writer = csv.writer(writer_wrapper)
    
    athlete_name = athlete.get('name', 'athlete')
    
    if data_type in ["all", "gps"]:
        # GPS Data
        writer.writerow(["=== GPS DATA ==="])
        writer.writerow(["Date", "Total Distance (m)", "High Intensity Distance (m)", "Sprints", "Max Speed (km/h)", "Period"])
        
        gps_records = await db.gps_data.find({
            "athlete_id": athlete_id,
            "coach_id": current_user["_id"]
        }).sort("date", -1).to_list(1000)
        
        for record in gps_records:
            writer.writerow([
                record.get("date", ""),
                record.get("total_distance", 0),
                record.get("high_intensity_distance", 0),
                record.get("number_of_sprints", 0),
                record.get("max_speed", 0),
                record.get("period_name", "")
            ])
        writer.writerow([])
    
    if data_type in ["all", "wellness"]:
        # Wellness Data
        writer.writerow(["=== WELLNESS DATA ==="])
        writer.writerow(["Date", "Fatigue (1-10)", "Sleep Quality (1-10)", "Muscle Soreness (1-10)", "Stress Level (1-10)", "Mood (1-10)", "QTR Score"])
        
        wellness_records = await db.wellness.find({
            "athlete_id": athlete_id,
            "coach_id": current_user["_id"]
        }).sort("date", -1).to_list(1000)
        
        for record in wellness_records:
            writer.writerow([
                record.get("date", ""),
                record.get("fatigue", ""),
                record.get("sleep_quality", ""),
                record.get("muscle_soreness", ""),
                record.get("stress_level", ""),
                record.get("mood", ""),
                record.get("qtr_score", "")
            ])
        writer.writerow([])
    
    if data_type in ["all", "strength"]:
        # Strength Assessments
        writer.writerow(["=== STRENGTH ASSESSMENTS ==="])
        writer.writerow(["Date", "Assessment Type", "Peak Power (W)", "RSI", "Speed (m/s)", "Notes"])
        
        strength_records = await db.assessments.find({
            "athlete_id": athlete_id,
            "coach_id": current_user["_id"],
            "assessment_type": "strength"
        }).sort("date", -1).to_list(1000)
        
        for record in strength_records:
            metrics = record.get("metrics", {})
            writer.writerow([
                record.get("date", ""),
                record.get("assessment_type", ""),
                metrics.get("peak_power", ""),
                metrics.get("rsi", ""),
                metrics.get("speed", ""),
                record.get("notes", "")
            ])
        writer.writerow([])
    
    if data_type in ["all", "body_composition"]:
        # Body Composition
        writer.writerow(["=== BODY COMPOSITION ==="])
        writer.writerow(["Date", "Protocol", "Weight (kg)", "Height (cm)", "Body Fat %", "Lean Mass (kg)", "Fat Mass (kg)", "Bone Mass (kg)", "BMI", "BMI Classification"])
        
        body_comp_records = await db.body_compositions.find({
            "athlete_id": athlete_id,
            "coach_id": current_user["_id"]
        }).sort("date", -1).to_list(1000)
        
        for record in body_comp_records:
            writer.writerow([
                record.get("date", ""),
                record.get("protocol", ""),
                record.get("weight", ""),
                record.get("height", ""),
                record.get("body_fat_percentage", ""),
                record.get("lean_mass_kg", ""),
                record.get("fat_mass_kg", ""),
                record.get("bone_mass_kg", ""),
                record.get("bmi", ""),
                record.get("bmi_classification", "")
            ])
    
    writer_wrapper.flush()
    buffer.seek(0)
    
    filename = f"export_{athlete_name.replace(' ', '_')}_{data_type}_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/reports/body-composition/{athlete_id}/pdf")
async def generate_body_composition_pdf(
    athlete_id: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Generate a PDF report for body composition assessments"""
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    
    # Translations
    tr = {
        "pt": {
            "title": "Relatório de Composição Corporal",
            "generated": "Gerado em",
            "athlete": "Atleta",
            "latest": "Avaliação Mais Recente",
            "date": "Data",
            "protocol": "Protocolo",
            "weight": "Peso",
            "height": "Altura",
            "body_fat": "% Gordura Corporal",
            "lean_mass": "Massa Magra",
            "fat_mass": "Massa de Gordura",
            "bone_mass": "Massa Óssea",
            "bmi": "IMC",
            "classification": "Classificação",
            "history": "Histórico de Avaliações",
            "evolution": "Evolução",
            "no_data": "Sem dados disponíveis",
            "fat_distribution": "Distribuição de Gordura",
            "upper_arm": "Braços",
            "trunk_front": "Tronco Frontal",
            "trunk_back": "Tronco Dorsal",
            "hip_waist": "Quadril/Cintura",
            "lower_body": "Membros Inf.",
        },
        "en": {
            "title": "Body Composition Report",
            "generated": "Generated on",
            "athlete": "Athlete",
            "latest": "Latest Assessment",
            "date": "Date",
            "protocol": "Protocol",
            "weight": "Weight",
            "height": "Height",
            "body_fat": "Body Fat %",
            "lean_mass": "Lean Mass",
            "fat_mass": "Fat Mass",
            "bone_mass": "Bone Mass",
            "bmi": "BMI",
            "classification": "Classification",
            "history": "Assessment History",
            "evolution": "Evolution",
            "no_data": "No data available",
            "fat_distribution": "Fat Distribution",
            "upper_arm": "Arms",
            "trunk_front": "Front Trunk",
            "trunk_back": "Back Trunk",
            "hip_waist": "Hip/Waist",
            "lower_body": "Lower Body",
        }
    }
    t = tr.get(lang, tr["en"])
    
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get body composition records
    records = await db.body_compositions.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(100)
    
    if not records:
        raise HTTPException(status_code=400, detail="No body composition data available")
    
    # Create PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5*cm,
        leftMargin=1.5*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=22,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=rl_colors.HexColor('#10b981')
    )
    heading_style = ParagraphStyle(
        'Heading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=15,
        spaceAfter=10,
        textColor=rl_colors.HexColor('#3b82f6')
    )
    normal_style = ParagraphStyle(
        'Normal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=6
    )
    
    story = []
    
    # Title
    story.append(Paragraph(f"📊 {t['title']}", title_style))
    story.append(Paragraph(f"{t['generated']}: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}", normal_style))
    story.append(Paragraph(f"{t['athlete']}: <b>{athlete.get('name', 'N/A')}</b>", normal_style))
    story.append(Spacer(1, 20))
    
    # Latest Assessment
    latest = records[0]
    story.append(Paragraph(f"🎯 {t['latest']}", heading_style))
    
    latest_data = [
        [t['date'], latest.get('date', 'N/A')],
        [t['protocol'], latest.get('protocol', 'N/A').replace('_', ' ').title()],
        [t['weight'], f"{latest.get('weight', 0):.1f} kg"],
        [t['height'], f"{latest.get('height', 0):.0f} cm"],
        [t['body_fat'], f"{latest.get('body_fat_percentage', 0):.1f}%"],
        [t['lean_mass'], f"{latest.get('lean_mass_kg', 0):.1f} kg"],
        [t['fat_mass'], f"{latest.get('fat_mass_kg', 0):.1f} kg"],
        [t['bone_mass'], f"{latest.get('bone_mass_kg', 0):.1f} kg"],
        [t['bmi'], f"{latest.get('bmi', 0):.1f}"],
        [t['classification'], latest.get('bmi_classification', 'N/A').replace('_', ' ').title()],
    ]
    
    latest_table = Table(latest_data, colWidths=[6*cm, 8*cm])
    latest_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#e5e7eb')),
        ('BACKGROUND', (0, 0), (0, -1), rl_colors.HexColor('#f3f4f6')),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(latest_table)
    story.append(Spacer(1, 20))
    
    # Fat Distribution
    fat_dist = latest.get('fat_distribution', {})
    if fat_dist:
        story.append(Paragraph(f"🔥 {t['fat_distribution']}", heading_style))
        dist_data = [
            [t['upper_arm'], f"{fat_dist.get('upper_arm', 0):.1f}%"],
            [t['trunk_front'], f"{fat_dist.get('trunk_front', 0):.1f}%"],
            [t['trunk_back'], f"{fat_dist.get('trunk_back', 0):.1f}%"],
            [t['hip_waist'], f"{fat_dist.get('hip_waist', 0):.1f}%"],
            [t['lower_body'], f"{fat_dist.get('lower_body', 0):.1f}%"],
        ]
        dist_table = Table(dist_data, colWidths=[6*cm, 4*cm])
        dist_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#e5e7eb')),
            ('BACKGROUND', (0, 0), (0, -1), rl_colors.HexColor('#fef3c7')),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(dist_table)
        story.append(Spacer(1, 20))
    
    # History
    if len(records) > 1:
        story.append(Paragraph(f"📈 {t['history']}", heading_style))
        
        history_header = [t['date'], t['protocol'], t['body_fat'], t['lean_mass'], t['bmi']]
        history_data = [history_header]
        
        for record in records[:10]:
            history_data.append([
                record.get('date', 'N/A'),
                record.get('protocol', 'N/A').replace('_', ' ').title()[:15],
                f"{record.get('body_fat_percentage', 0):.1f}%",
                f"{record.get('lean_mass_kg', 0):.1f} kg",
                f"{record.get('bmi', 0):.1f}"
            ])
        
        history_table = Table(history_data, colWidths=[3*cm, 4*cm, 2.5*cm, 2.5*cm, 2*cm])
        history_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#10b981')),
            ('TEXTCOLOR', (0, 0), (-1, 0), rl_colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#d1fae5')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor('#ecfdf5')]),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(history_table)
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    
    filename = f"body_composition_{athlete.get('name', 'athlete').replace(' ', '_')}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/reports/team/csv")
async def export_team_csv(
    current_user: dict = Depends(get_current_user)
):
    """Export team data as CSV"""
    import csv
    
    # Get all athletes
    athletes = await db.athletes.find({
        "coach_id": current_user["_id"]
    }).to_list(1000)
    
    if not athletes:
        raise HTTPException(status_code=400, detail="No athletes found")
    
    buffer = BytesIO()
    writer_wrapper = io.TextIOWrapper(buffer, encoding='utf-8', newline='')
    writer = csv.writer(writer_wrapper)
    
    # Team Summary
    writer.writerow(["=== TEAM SUMMARY ==="])
    writer.writerow(["Athlete Name", "Position", "Birth Date", "Latest Body Fat %", "Latest BMI", "Latest Weight (kg)"])
    
    for athlete in athletes:
        athlete_id = str(athlete["_id"])
        
        # Get latest body composition
        body_comp = await db.body_compositions.find_one({
            "athlete_id": athlete_id,
            "coach_id": current_user["_id"]
        }, sort=[("date", -1)])
        
        writer.writerow([
            athlete.get("name", ""),
            athlete.get("position", ""),
            athlete.get("birth_date", ""),
            body_comp.get("body_fat_percentage", "") if body_comp else "",
            body_comp.get("bmi", "") if body_comp else "",
            body_comp.get("weight", "") if body_comp else ""
        ])
    
    writer_wrapper.flush()
    buffer.seek(0)
    
    filename = f"team_export_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
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
            "high_intensity_distance": ["High Speed Running", "HSR", "HSR Distance", "High Speed Running (m)", "HSR (m)", "High Intensity Distance", "HID", "Sprint Distance"],
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
    GYMAWARE = "gymaware"
    PUSH_BAND = "push_band"
    BEAST = "beast"
    TENDO = "tendo"
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
    """Get supported VBT providers and their import formats"""
    return {
        "providers": [
            {
                "id": "gymaware",
                "name": "GymAware",
                "description_pt": "Sistema VBT profissional com encoder linear",
                "description_en": "Professional VBT system with linear encoder",
                "metrics": ["mean_velocity", "peak_velocity", "power", "rom", "force"],
                "import_format": "csv",
                "website": "https://gymaware.com"
            },
            {
                "id": "push_band",
                "name": "PUSH Band",
                "description_pt": "Sensor vestível para VBT",
                "description_en": "Wearable sensor for VBT",
                "metrics": ["mean_velocity", "peak_velocity", "power"],
                "import_format": "csv",
                "website": "https://www.trainwithpush.com"
            },
            {
                "id": "vitruve",
                "name": "Vitruve",
                "description_pt": "Encoder VBT compacto e acessível",
                "description_en": "Compact and affordable VBT encoder",
                "metrics": ["mean_velocity", "peak_velocity", "power", "rom"],
                "import_format": "csv",
                "website": "https://vitruve.fit"
            },
            {
                "id": "beast",
                "name": "Beast Sensor",
                "description_pt": "Sensor IMU para VBT",
                "description_en": "IMU sensor for VBT",
                "metrics": ["mean_velocity", "peak_velocity", "power"],
                "import_format": "csv"
            },
            {
                "id": "tendo",
                "name": "Tendo Unit",
                "description_pt": "Sistema VBT clássico para força",
                "description_en": "Classic VBT system for strength",
                "metrics": ["mean_velocity", "peak_velocity", "power"],
                "import_format": "manual"
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
    """Import VBT data from CSV file (GymAware, PUSH, Vitruve formats)"""
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
                "export_pdf": plan_data.get("export_pdf", False),
                "export_csv": plan_data.get("export_csv", False),
                "advanced_analytics": plan_data.get("advanced_analytics", False),
                "ai_insights": plan_data.get("ai_insights", False),
                "fatigue_alerts": plan_data.get("fatigue_alerts", False),
                "multi_user": plan_data.get("multi_user", False),
                "max_users": plan_data.get("max_users", 1),
                "features": plan_data.get("features", []),
                "trial_days": plan_data.get("trial_days", 7),
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
        "export_pdf": not plan_limits.get("export_pdf", False),
        "export_csv": not plan_limits.get("export_csv", False),
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
            "export_pdf": plan_limits.get("export_pdf", False),
            "export_csv": plan_limits.get("export_csv", False),
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
        "export_pdf": plan_limits.get("export_pdf", False),
        "export_csv": plan_limits.get("export_csv", False),
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
