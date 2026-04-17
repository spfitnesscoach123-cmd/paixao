from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum


class DayClassification(str, Enum):
    MD = "MD"
    MD_1 = "MD-1"
    MD_2 = "MD-2"
    MD_3 = "MD-3"
    MD_4 = "MD-4"
    MD_5 = "MD-5"
    DO = "D.O"


class GPSMetricType(str, Enum):
    TOTAL_DISTANCE = "total_distance"
    HID_Z3 = "hid_z3"
    HSR_Z4 = "hsr_z4"
    SPRINT_Z5 = "sprint_z5"
    SPRINTS_COUNT = "sprints_count"
    ACC_DEC_TOTAL = "acc_dec_total"


class AthletePeakValues(BaseModel):
    athlete_id: str
    coach_id: str
    total_distance: float = 0
    hid_z3: float = 0
    hsr_z4: float = 0
    sprint_z5: float = 0
    sprints_count: int = 0
    acc_dec_total: int = 0
    last_updated: Optional[datetime] = None
    update_history: List[Dict] = []


class WeeklyPrescription(BaseModel):
    total_distance_multiplier: float = 1.0
    hid_z3_multiplier: float = 1.0
    hsr_z4_multiplier: float = 1.0
    sprint_z5_multiplier: float = 1.0
    sprints_count_multiplier: float = 1.0
    acc_dec_total_multiplier: float = 1.0


class DailyPrescription(BaseModel):
    day_classification: str
    date: str
    total_distance_percent: float = 0
    hid_z3_percent: float = 0
    hsr_z4_percent: float = 0
    sprint_z5_percent: float = 0
    sprints_count_percent: float = 0
    acc_dec_total_percent: float = 0


class AthleteOverride(BaseModel):
    athlete_id: str
    metric: str
    value: float
    reason: Optional[str] = None


class PeriodizationWeekCreate(BaseModel):
    name: str
    start_date: str
    end_date: str
    days: List[DailyPrescription]
    weekly_prescription: WeeklyPrescription
    athlete_overrides: List[AthleteOverride] = []


class PeriodizationWeek(BaseModel):
    id: Optional[str] = None
    coach_id: str
    name: str
    start_date: str
    end_date: str
    days: List[DailyPrescription]
    weekly_prescription: WeeklyPrescription
    athlete_overrides: List[AthleteOverride] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PeakValueNotification(BaseModel):
    id: Optional[str] = None
    coach_id: str
    athlete_id: str
    athlete_name: str
    metric: str
    old_value: float
    new_value: float
    session_date: str
    created_at: Optional[datetime] = None
    read: bool = False
