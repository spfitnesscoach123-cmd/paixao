from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
from enum import Enum

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

MAX_DEVICES_PER_USER = 5

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
    pain_location: Optional[str] = Field(default=None, max_length=100)

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
    pain_location: Optional[str] = None
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

