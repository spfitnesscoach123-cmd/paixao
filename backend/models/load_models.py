from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ACWRAnalysis(BaseModel):
    acute_load: float
    chronic_load: float
    acwr_ratio: float
    risk_level: str
    recommendation: str


class FatigueAnalysis(BaseModel):
    fatigue_level: str
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


class ACWRMetricDetail(BaseModel):
    metric_id: str
    metric_name: str
    acute_load: float
    chronic_load: float
    acwr_ratio: float
    risk_level: str
    unit: str


class ACWRRollingResponse(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    metrics: List[ACWRMetricDetail]
    overall_risk: str
    recommendation: str


class TeamACWRMetric(BaseModel):
    metric_id: str
    metric_name: str
    avg_acwr: float
    risk_level: str


class TeamACWRResponse(BaseModel):
    team_size: int
    analysis_date: str
    metrics: List[TeamACWRMetric]
    overall_risk: str


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


class EWMAMetricResponse(BaseModel):
    load: float
    ewma_acute: float
    ewma_chronic: float
    acwr: Optional[float]
    acwr_zone: str


class AthleteLoadMetricsResponse(BaseModel):
    athlete_id: str
    date: str
    distance: EWMAMetricResponse
    hsr: EWMAMetricResponse
    sprint_distance: EWMAMetricResponse
    acc_dec_load: EWMAMetricResponse
    monotony: float
    strain: float
    weekly_load: float
    has_spike: bool
    spike_metrics: List[str]
    spike_status: str


class RecalculateResponse(BaseModel):
    success: bool
    athlete_id: str
    dates_processed: int
    message: str
