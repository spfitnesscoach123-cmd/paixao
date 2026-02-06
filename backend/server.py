from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
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
import bcrypt
import jwt
from bson import ObjectId
import uuid
from io import BytesIO

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
    high_intensity_distance: float
    high_speed_running: Optional[float] = None
    sprint_distance: float
    number_of_sprints: int
    number_of_accelerations: int
    number_of_decelerations: int
    max_speed: Optional[float] = None
    max_acceleration: Optional[float] = None
    max_deceleration: Optional[float] = None
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
    hydration: int
    wellness_score: float  # Calculated score
    readiness_score: float  # Calculated score
    notes: Optional[str] = None
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
    
    for record in wellness_records:
        record["_id"] = str(record["_id"])
    return [WellnessQuestionnaire(**record) for record in wellness_records]

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
    expires_days: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """Generate a shareable link for athletes to submit wellness questionnaires"""
    import secrets
    
    link_token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=expires_days)
    
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

@api_router.get("/analysis/acwr/{athlete_id}")
async def get_acwr_analysis(
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
            detail="Insufficient data. Need at least 7 days of GPS data for ACWR calculation."
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
        raise HTTPException(status_code=400, detail="Unable to calculate ACWR")
    
    acute_load = sum(acute_loads)
    chronic_load = sum(chronic_loads) / 4  # Average per week over 4 weeks
    
    # Calculate ACWR ratio
    acwr_ratio = round(acute_load / chronic_load if chronic_load > 0 else 0, 2)
    
    # Determine risk level and recommendation
    if acwr_ratio < 0.8:
        risk_level = "low"
        recommendation = "Carga de treino abaixo do ideal. Considere aumentar gradualmente a intensidade para manter a forma física."
    elif 0.8 <= acwr_ratio <= 1.3:
        risk_level = "optimal"
        recommendation = "Carga de treino ótima! Continue mantendo este equilíbrio entre treino e recuperação."
    elif 1.3 < acwr_ratio <= 1.5:
        risk_level = "moderate"
        recommendation = "Carga de treino moderadamente elevada. Monitore sinais de fadiga e considere reduzir volume nos próximos dias."
    else:
        risk_level = "high"
        recommendation = "⚠️ ATENÇÃO: Carga de treino muito elevada! Alto risco de lesão. Recomenda-se redução imediata da carga e priorizar recuperação."
    
    return ACWRAnalysis(
        acute_load=round(acute_load, 2),
        chronic_load=round(chronic_load, 2),
        acwr_ratio=acwr_ratio,
        risk_level=risk_level,
        recommendation=recommendation
    )

# ============= ANALYSIS TRANSLATIONS =============

ANALYSIS_TRANSLATIONS = {
    "en": {
        # ACWR Simple
        "acwr_low": "Training load below optimal. Consider gradually increasing intensity to maintain fitness.",
        "acwr_optimal": "Optimal training load! Continue maintaining this balance between training and recovery.",
        "acwr_moderate": "Moderately high training load. Monitor fatigue signs and consider reducing volume in coming days.",
        "acwr_high": "⚠️ ATTENTION: Training load very high! High injury risk. Immediate load reduction recommended, prioritize recovery.",
        
        # ACWR Detailed
        "acwr_detail_high": "⚠️ ATTENTION: One or more parameters are in high risk zone. Immediate training load reduction recommended.",
        "acwr_detail_moderate": "Some parameters are elevated. Monitor fatigue and consider adjusting training volume.",
        "acwr_detail_optimal": "Balanced training load! Continue maintaining this pattern.",
        "acwr_detail_low": "Low training load. Consider progressively increasing intensity.",
        
        # Fatigue
        "fatigue_low": "Low fatigue level. Athlete is well recovered and ready for intense training.",
        "fatigue_moderate": "Moderate fatigue. Athlete can train normally, but monitor for overload signs.",
        "fatigue_high": "High fatigue detected. Reduce volume/intensity and prioritize active recovery.",
        "fatigue_critical": "⚠️ CRITICAL FATIGUE! Complete rest or light regenerative training recommended. Overtraining risk.",
        
        # Fatigue Factors
        "poor_sleep": "Poor sleep quality affecting recovery",
        "insufficient_sleep": "Insufficient sleep hours",
        "high_muscle_soreness": "Elevated muscle soreness",
        "high_fatigue_perception": "High fatigue perception",
        "elevated_stress": "Elevated stress level",
        "low_mood": "Low mood",
        "compromised_readiness": "Compromised readiness",
        
        # Wellness feedback
        "sleep_hours_tip": "Try to sleep at least 7-8 hours per night",
        "sleep_quality_tip": "Consider improving your sleep hygiene",
        "fatigue_tip": "High fatigue level - consider extra rest",
        "muscle_soreness_tip": "High muscle soreness - consider active recovery",
        "stress_tip": "High stress level - practice relaxation techniques",
        "all_good": "Great! You are in good condition!",
        
        # AI Insights
        "ai_default_rec": "Maintain current monitoring routine",
        "ai_no_data": "Insufficient data for complete analysis",
        
        # Metric names
        "metric_total_distance": "Total Distance",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acc/Dec",
    },
    "pt": {
        # ACWR Simple
        "acwr_low": "Carga de treino abaixo do ideal. Considere aumentar gradualmente a intensidade para manter a forma física.",
        "acwr_optimal": "Carga de treino ótima! Continue mantendo este equilíbrio entre treino e recuperação.",
        "acwr_moderate": "Carga de treino moderadamente elevada. Monitore sinais de fadiga e considere reduzir volume nos próximos dias.",
        "acwr_high": "⚠️ ATENÇÃO: Carga de treino muito elevada! Alto risco de lesão. Recomenda-se redução imediata da carga e priorizar recuperação.",
        
        # ACWR Detailed
        "acwr_detail_high": "⚠️ ATENÇÃO: Um ou mais parâmetros estão em zona de alto risco. Recomenda-se redução imediata da carga de treino.",
        "acwr_detail_moderate": "Alguns parâmetros estão elevados. Monitore a fadiga e considere ajustar o volume de treino.",
        "acwr_detail_optimal": "Carga de treino equilibrada! Continue mantendo este padrão.",
        "acwr_detail_low": "Carga de treino baixa. Considere aumentar progressivamente a intensidade.",
        
        # Fatigue
        "fatigue_low": "Baixo nível de fadiga. Atleta está bem recuperado e pronto para treinos intensos.",
        "fatigue_moderate": "Fadiga moderada. Atleta pode treinar normalmente, mas monitore sinais de sobrecarga.",
        "fatigue_high": "Alta fadiga detectada. Reduza volume/intensidade e priorize recuperação ativa.",
        "fatigue_critical": "⚠️ FADIGA CRÍTICA! Recomenda-se descanso completo ou treino regenerativo leve. Risco de overtraining.",
        
        # Fatigue Factors
        "poor_sleep": "Qualidade do sono ruim afetando recuperação",
        "insufficient_sleep": "Horas de sono insuficientes",
        "high_muscle_soreness": "Dor muscular elevada",
        "high_fatigue_perception": "Alta percepção de fadiga",
        "elevated_stress": "Nível de estresse elevado",
        "low_mood": "Humor baixo",
        "compromised_readiness": "Prontidão comprometida",
        
        # Wellness feedback
        "sleep_hours_tip": "Tente dormir pelo menos 7-8 horas por noite",
        "sleep_quality_tip": "Considere melhorar sua higiene do sono",
        "fatigue_tip": "Nível de fadiga elevado - considere descanso extra",
        "muscle_soreness_tip": "Dor muscular alta - considere recuperação ativa",
        "stress_tip": "Nível de estresse alto - pratique técnicas de relaxamento",
        "all_good": "Ótimo! Você está em boas condições!",
        
        # AI Insights
        "ai_default_rec": "Manter rotina atual de monitoramento",
        "ai_no_data": "Dados insuficientes para análise completa",
        
        # Metric names
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
        recommendation = "⚠️ ATENÇÃO: Um ou mais parâmetros estão em zona de alto risco. Recomenda-se redução imediata da carga de treino."
    elif risk_levels.count("moderate") >= 2:
        overall_risk = "moderate"
        recommendation = "Alguns parâmetros estão elevados. Monitore a fadiga e considere ajustar o volume de treino."
    elif "optimal" in risk_levels and risk_levels.count("optimal") >= 3:
        overall_risk = "optimal"
        recommendation = "Carga de treino equilibrada! Continue mantendo este padrão."
    else:
        overall_risk = "low"
        recommendation = "Carga de treino baixa. Considere aumentar progressivamente a intensidade."
    
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
    current_user: dict = Depends(get_current_user)
):
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
            detail="No wellness data available. Need recent wellness questionnaires for fatigue analysis."
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
        recommendation = "Baixo nível de fadiga. Atleta está bem recuperado e pronto para treinos intensos."
    elif fatigue_score < 50:
        fatigue_level = "moderate"
        recommendation = "Fadiga moderada. Atleta pode treinar normalmente, mas monitore sinais de sobrecarga."
    elif fatigue_score < 70:
        fatigue_level = "high"
        recommendation = "Alta fadiga detectada. Reduza volume/intensidade e priorize recuperação ativa."
    else:
        fatigue_level = "critical"
        recommendation = "⚠️ FADIGA CRÍTICA! Recomenda-se descanso completo ou treino regenerativo leve. Risco de overtraining."
    
    # Identify contributing factors
    contributing_factors = []
    if avg_fatigue >= 7:
        contributing_factors.append("Fadiga autorreportada elevada")
    if avg_sleep_quality <= 5:
        contributing_factors.append("Qualidade do sono comprometida")
    if avg_sleep_hours < 7:
        contributing_factors.append(f"Sono insuficiente ({avg_sleep_hours:.1f}h/noite)")
    if avg_muscle_soreness >= 7:
        contributing_factors.append("Dor muscular significativa")
    if avg_stress >= 7:
        contributing_factors.append("Níveis de estresse elevados")
    if len(gps_records) >= 5:
        contributing_factors.append("Alta frequência de treinos recentes")
    if avg_readiness < 6:
        contributing_factors.append(f"Baixo score de prontidão ({avg_readiness:.1f}/10)")
    
    if not contributing_factors:
        contributing_factors.append("Nenhum fator crítico identificado")
    
    return FatigueAnalysis(
        fatigue_level=fatigue_level,
        fatigue_score=fatigue_score,
        contributing_factors=contributing_factors,
        recommendation=recommendation
    )

@api_router.get("/analysis/ai-insights/{athlete_id}")
async def get_ai_insights(
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
            detail="Insufficient data for AI analysis. Please add GPS and wellness data first."
        )
    
    # Prepare data summary for AI
    data_summary = f"""
Análise do Atleta: {athlete['name']}
Posição: {athlete['position']}

DADOS GPS (últimos 30 registros):
- Total de sessões: {len(gps_records)}
- Distância média: {statistics.mean([g['total_distance'] for g in gps_records]):.0f}m
- Distância alta intensidade média: {statistics.mean([g['high_intensity_distance'] for g in gps_records]):.0f}m
- Sprints médios por sessão: {statistics.mean([g['number_of_sprints'] for g in gps_records]):.1f}
- Velocidade máxima média: {statistics.mean([g.get('max_speed', 0) for g in gps_records if g.get('max_speed')]):.1f} km/h

WELLNESS (últimos 30 registros):
- Total de questionários: {len(wellness_records)}
- Wellness score médio: {statistics.mean([w['wellness_score'] for w in wellness_records]):.1f}/10
- Readiness score médio: {statistics.mean([w['readiness_score'] for w in wellness_records]):.1f}/10
- Fadiga média: {statistics.mean([w['fatigue'] for w in wellness_records]):.1f}/10
- Qualidade sono média: {statistics.mean([w['sleep_quality'] for w in wellness_records]):.1f}/10
- Horas de sono média: {statistics.mean([w['sleep_hours'] for w in wellness_records]):.1f}h

AVALIAÇÕES FÍSICAS:
- Total de avaliações: {len(assessments)}
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
            system_message="""Você é um especialista em ciência do esporte e treinamento de futebol.
Analise os dados fornecidos e forneça insights profissionais, práticos e acionáveis.
Responda em português brasileiro de forma clara e objetiva."""
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(
            text=f"""{data_summary}

Com base nesses dados, forneça uma análise profissional completa incluindo:

1. RESUMO EXECUTIVO (2-3 linhas sobre o estado atual do atleta)

2. PONTOS FORTES (2-3 aspectos positivos identificados nos dados)

3. PONTOS DE ATENÇÃO (2-3 áreas que requerem monitoramento ou ajuste)

4. RECOMENDAÇÕES ESPECÍFICAS (3-4 ações concretas para otimizar o treinamento)

5. ZONAS DE TREINAMENTO RECOMENDADAS:
   - Zona de Recuperação: distância e características
   - Zona Aeróbica: distância e características  
   - Zona Anaeróbica: distância e características
   - Zona Máxima: distância e características

Formate sua resposta de forma estruturada e profissional."""
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
                
            if "RESUMO" in line.upper() or "EXECUTIVO" in line.upper():
                current_section = "summary"
            elif "FORTE" in line.upper() or "POSITIVO" in line.upper():
                current_section = "strengths"
            elif "ATENÇÃO" in line.upper() or "PREOCUP" in line.upper():
                current_section = "concerns"
            elif "RECOMENDA" in line.upper():
                current_section = "recommendations"
            elif "ZONA" in line.upper() and "TREINAMENTO" in line.upper():
                current_section = "zones"
            elif line.startswith('-') or line.startswith('•') or line[0].isdigit():
                content = line.lstrip('-•0123456789. ')
                if current_section == "strengths":
                    strengths.append(content)
                elif current_section == "concerns":
                    concerns.append(content)
                elif current_section == "recommendations":
                    recommendations.append(content)
            elif current_section == "summary" and len(line) > 20:
                summary += line + " "
        
        # Default zones if not properly parsed
        training_zones = {
            "recovery": "Até 5km, ritmo leve, FC < 70% máxima",
            "aerobic": "5-8km, ritmo moderado, FC 70-85% máxima",
            "anaerobic": "Alta intensidade, sprints curtos, FC 85-95% máxima",
            "maximum": "Esforço máximo, sprints, FC > 95% máxima"
        }
        
        return AIInsights(
            summary=summary.strip() if summary else "Análise dos dados do atleta concluída com sucesso.",
            strengths=strengths if strengths else ["Dados consistentes de treinamento"],
            concerns=concerns if concerns else ["Continue monitorando regularmente"],
            recommendations=recommendations if recommendations else ["Manter rotina atual de monitoramento"],
            training_zones=training_zones
        )
        
    except Exception as e:
        logger.error(f"AI Analysis error: {str(e)}")
        # Fallback to rule-based insights
        avg_wellness = statistics.mean([w['wellness_score'] for w in wellness_records]) if wellness_records else 0
        avg_readiness = statistics.mean([w['readiness_score'] for w in wellness_records]) if wellness_records else 0
        
        summary = f"Atleta apresenta wellness médio de {avg_wellness:.1f}/10 e prontidão de {avg_readiness:.1f}/10."
        
        strengths = []
        if avg_wellness >= 7:
            strengths.append("Bom estado geral de bem-estar")
        if len(gps_records) >= 10:
            strengths.append("Frequência de treino consistente")
        if avg_readiness >= 7:
            strengths.append("Alto nível de prontidão para treino")
            
        concerns = []
        if avg_wellness < 6:
            concerns.append("Wellness score abaixo do ideal")
        if avg_readiness < 6:
            concerns.append("Baixa prontidão para treinos intensos")
            
        recommendations = [
            "Manter monitoramento regular de wellness",
            "Ajustar carga de treino baseado em feedback diário",
            "Priorizar qualidade do sono e recuperação"
        ]
        
        return AIInsights(
            summary=summary,
            strengths=strengths if strengths else ["Coleta de dados regular"],
            concerns=concerns if concerns else ["Continue monitorando"],
            recommendations=recommendations,
            training_zones={
                "recovery": "Até 5km, ritmo leve",
                "aerobic": "5-8km, ritmo moderado",
                "anaerobic": "Alta intensidade, sprints curtos",
                "maximum": "Esforço máximo"
            }
        )

@api_router.get("/analysis/comprehensive/{athlete_id}")
async def get_comprehensive_analysis(
    athlete_id: str,
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
        acwr = await get_acwr_analysis(athlete_id, current_user)
        result.acwr = acwr
    except:
        pass
    
    try:
        fatigue = await get_fatigue_analysis(athlete_id, current_user)
        result.fatigue = fatigue
    except:
        pass
    
    try:
        insights = await get_ai_insights(athlete_id, current_user)
        result.ai_insights = insights
    except:
        pass
    
    return result

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
