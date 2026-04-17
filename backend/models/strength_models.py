from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class StrengthMetric(BaseModel):
    name: str
    value: float
    unit: str
    classification: str
    percentile: float
    variation_from_peak: Optional[float] = None
    variation_from_previous: Optional[float] = None
    previous_value: Optional[float] = None


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


STRENGTH_NORMATIVES = {
    "mean_power": {"excellent": 2500, "good": 2200, "average": 1900, "below_average": 1600, "unit": "W"},
    "peak_power": {"excellent": 4000, "good": 3500, "average": 3000, "below_average": 2500, "unit": "W"},
    "mean_speed": {"excellent": 1.5, "good": 1.3, "average": 1.1, "below_average": 0.9, "unit": "m/s"},
    "peak_speed": {"excellent": 3.0, "good": 2.6, "average": 2.2, "below_average": 1.8, "unit": "m/s"},
    "rsi": {"excellent": 2.5, "good": 2.0, "average": 1.5, "below_average": 1.0, "unit": ""},
    "fatigue_index": {"low": 30, "moderate": 50, "high": 70, "critical": 85, "unit": "%"}
}
