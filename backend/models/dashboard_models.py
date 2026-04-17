from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class TeamDashboardAthlete(BaseModel):
    id: str
    name: str
    position: str
    acwr: Optional[float] = None
    risk_level: str = "unknown"
    fatigue_score: Optional[float] = None
    readiness_score: Optional[float] = None
    last_gps_date: Optional[str] = None
    last_wellness_date: Optional[str] = None
    wellness_score: Optional[float] = None
    total_sessions_7d: int = 0
    avg_distance_7d: float = 0
    injury_risk: bool = False
    peripheral_fatigue: bool = False
    monotony: Optional[float] = None
    strain: Optional[float] = None
    metric_value: Optional[float] = None


class TeamDashboardStats(BaseModel):
    total_athletes: int
    athletes_high_risk: int
    athletes_optimal: int
    athletes_fatigued: int
    team_avg_acwr: float
    team_avg_wellness: float
    team_avg_fatigue: float
    team_avg_readiness: Optional[float] = None
    sessions_this_week: int
    total_distance_this_week: float
    team_avg_power: Optional[float] = None
    team_avg_body_fat: Optional[float] = None
    team_avg_hid: Optional[float] = None
    team_avg_rsi: Optional[float] = None
    rsi_trend: Optional[str] = None
    rsi_percentile: Optional[float] = None
    avg_distance_per_session: Optional[float] = None


class TeamDashboardResponse(BaseModel):
    stats: TeamDashboardStats
    athletes: List[TeamDashboardAthlete]
    risk_distribution: Dict[str, int]
    position_summary: Dict[str, Dict[str, Any]]
    alerts: List[str]


class TeamTableRow(BaseModel):
    athlete_id: str
    name: str
    position: str
    total_distance: float = 0
    z3: float = 0
    z4: float = 0
    z5: float = 0
    sprint_count: int = 0
    acc_dec: int = 0
    rsimod: Optional[float] = None
    rsimod_delta: Optional[float] = None
    rsimod_baseline_28d: Optional[float] = None
    fatigue_index: Optional[float] = None
    fatigue_baseline_28d: Optional[float] = None
    fatigue_status: str = "UNKNOWN"
    readiness_status: str = "UNKNOWN"
    weight: Optional[float] = None
    body_fat: Optional[float] = None
    lean_mass: Optional[float] = None


class TeamTableResponse(BaseModel):
    rows: List[TeamTableRow]
    period_label: str
