from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime
from bson import ObjectId
from enum import Enum


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
    weight: float
    height: float
    age: int
    gender: str
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
    triceps: Optional[float] = None
    subscapular: Optional[float] = None
    suprailiac: Optional[float] = None
    abdominal: Optional[float] = None
    chest: Optional[float] = None
    midaxillary: Optional[float] = None
    thigh: Optional[float] = None
    calf: Optional[float] = None
    biceps: Optional[float] = None
    body_fat_percentage: float
    lean_mass_kg: float
    fat_mass_kg: float
    bone_mass_kg: float
    bmi: float
    bmi_classification: str
    body_density: Optional[float] = None
    fat_distribution: Optional[Dict[str, float]] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class PhysicalAssessmentCreate(BaseModel):
    athlete_id: str
    date: str
    assessment_type: str
    metrics: Dict[str, object]
    notes: Optional[str] = None


class PhysicalAssessment(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str
    coach_id: str
    date: str
    assessment_type: str
    metrics: Dict[str, object]
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
