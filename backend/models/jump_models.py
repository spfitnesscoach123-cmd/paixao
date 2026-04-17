from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId
from enum import Enum


class JumpProtocol(str, Enum):
    CMJ = "cmj"
    SL_CMJ_RIGHT = "sl_cmj_right"
    SL_CMJ_LEFT = "sl_cmj_left"


class JumpAssessmentCreate(BaseModel):
    athlete_id: str
    date: str
    protocol: JumpProtocol
    flight_time_ms: float
    contact_time_ms: float = 0
    jump_height_cm: Optional[float] = None
    time_to_takeoff_ms: Optional[float] = None
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
    time_to_takeoff_ms: Optional[float] = None
    rsi: float
    rsi_modified: Optional[float] = None
    peak_power_w: float
    peak_velocity_ms: float
    relative_power_wkg: float
    rsi_classification: str
    fatigue_status: str
    fatigue_percentage: float
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
