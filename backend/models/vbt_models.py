from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class VBTProvider(str, Enum):
    PUSH_BAND = "push_band"
    BEAST = "beast"
    VITRUVE = "vitruve"
    MANUAL = "manual"
    CAMERA = "camera"


class VBTDataCreate(BaseModel):
    athlete_id: str
    date: str
    provider: VBTProvider
    exercise: str
    sets: List[dict]
    notes: Optional[str] = None
