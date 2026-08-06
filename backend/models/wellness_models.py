from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId
from enum import Enum


class WellnessQuestionnaireCreate(BaseModel):
    athlete_id: str
    date: str
    fatigue: int
    stress: int
    mood: int
    sleep_quality: int
    sleep_hours: float
    muscle_soreness: int
    hydration: int
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
    hydration: Optional[int] = 5
    wellness_score: Optional[float] = None
    readiness_score: Optional[float] = None
    notes: Optional[str] = None
    pain_location: Optional[str] = None
    submitted_via: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


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
    expires_in: str = "24h"
    language: Optional[str] = None


class WellnessTokenStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    EXPIRED = "expired"


class WellnessToken(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    token_id: str
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
    sleep_quality: int
    fatigue: int
    muscle_soreness: int
    stress: int
    mood: int
    hydration: Optional[int] = None
    notes: Optional[str] = None
    pain_location: Optional[str] = Field(default=None, max_length=100)


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
    sleep_quality: int
    fatigue: int
    muscle_soreness: int
    stress: int
    mood: int
    hydration: Optional[int] = None
    nutrition: Optional[int] = None
    notes: Optional[str] = None
    pain_location: Optional[str] = Field(default=None, max_length=100)
