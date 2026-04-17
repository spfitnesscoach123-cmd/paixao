from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ScientificInsightsResponse(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    gps_summary: Optional[Dict[str, Any]] = None
    acwr_analysis: Optional[Dict[str, Any]] = None
    wellness_summary: Optional[Dict[str, Any]] = None
    jump_analysis: Optional[Dict[str, Any]] = None
    vbt_analysis: Optional[Dict[str, Any]] = None
    body_composition: Optional[Dict[str, Any]] = None
    scientific_insights: Optional[str] = None
    overall_risk_level: str = "unknown"
    injury_risk_factors: List[str] = []
    training_recommendations: List[str] = []
    recovery_recommendations: List[str] = []
