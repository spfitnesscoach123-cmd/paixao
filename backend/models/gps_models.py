from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from bson import ObjectId


class GPSDataCreate(BaseModel):
    athlete_id: str
    date: str
    session_id: Optional[str] = None
    session_name: Optional[str] = None
    period_name: Optional[str] = None
    activity_type: Optional[str] = None
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


class GPSData(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str
    coach_id: str
    date: str
    session_id: Optional[str] = None
    session_name: Optional[str] = None
    period_name: Optional[str] = None
    activity_type: Optional[str] = None
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
    player_load_per_minute: Optional[float] = None
    high_metabolic_load: Optional[float] = None
    max_velocity_percent: Optional[float] = None
    source: Optional[str] = None
    device: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class GPSDeleteRequest(BaseModel):
    session_ids: List[str]


class ActivityTypeUpdate(BaseModel):
    activity_type: str
    athlete_id: str


class ClassifyAllRequest(BaseModel):
    activity_type: str
