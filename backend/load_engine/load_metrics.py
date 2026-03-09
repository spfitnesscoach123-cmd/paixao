"""
Load Engine Types and Constants

Defines data models, constants, and type hints for the Rolling Load Engine.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Literal
from datetime import date, datetime
from enum import Enum


# ============================================================================
# CONSTANTS
# ============================================================================

# EWMA decay factors (lambda)
# λ = 2 / (N + 1)
EWMA_ACUTE_WINDOW = 7
EWMA_CHRONIC_WINDOW = 28
EWMA_ACUTE_LAMBDA = 2 / (EWMA_ACUTE_WINDOW + 1)    # ≈ 0.25
EWMA_CHRONIC_LAMBDA = 2 / (EWMA_CHRONIC_WINDOW + 1)  # ≈ 0.069

# ACWR Risk Zones
ACWR_UNDERLOAD_THRESHOLD = 0.8
ACWR_OPTIMAL_MAX = 1.3
ACWR_WARNING_MAX = 1.5

# Monotony calculation window (days)
MONOTONY_WINDOW = 7

# Metrics to track
TRACKED_METRICS = [
    "distance",
    "hsr",  # High Speed Running
    "sprint_distance",
    "acc_dec_load"
]


# ============================================================================
# ENUMS
# ============================================================================

class ACWRZone(str, Enum):
    """ACWR risk classification zones"""
    UNDERLOAD = "underload"      # < 0.8
    OPTIMAL = "optimal"          # 0.8 - 1.3
    WARNING = "warning"          # 1.3 - 1.5
    SPIKE = "spike"              # > 1.5
    UNKNOWN = "unknown"          # No chronic data


class SpikeStatus(str, Enum):
    """Spike detection status"""
    NONE = "none"
    MODERATE = "moderate"  # 1.3-1.5
    HIGH = "high"          # > 1.5
    CRITICAL = "critical"  # > 2.0


# ============================================================================
# DATA MODELS
# ============================================================================

class MetricValues(BaseModel):
    """Values for a single metric"""
    load: float = 0.0
    ewma_acute: float = 0.0
    ewma_chronic: float = 0.0
    acwr: Optional[float] = None
    acwr_zone: ACWRZone = ACWRZone.UNKNOWN
    
    class Config:
        use_enum_values = True


class DailyMetrics(BaseModel):
    """All metrics for a single day"""
    distance: MetricValues = Field(default_factory=MetricValues)
    hsr: MetricValues = Field(default_factory=MetricValues)
    sprint_distance: MetricValues = Field(default_factory=MetricValues)
    acc_dec_load: MetricValues = Field(default_factory=MetricValues)


class WeeklyMetrics(BaseModel):
    """Weekly aggregated metrics"""
    monotony: float = 0.0
    strain: float = 0.0
    weekly_load: float = 0.0
    avg_daily_load: float = 0.0
    std_daily_load: float = 0.0


class AthleteLoadMetrics(BaseModel):
    """Complete load metrics document for an athlete on a specific date"""
    athlete_id: str
    coach_id: str
    date: str  # YYYY-MM-DD format
    
    # Per-metric values
    distance: MetricValues = Field(default_factory=MetricValues)
    hsr: MetricValues = Field(default_factory=MetricValues)
    sprint_distance: MetricValues = Field(default_factory=MetricValues)
    acc_dec_load: MetricValues = Field(default_factory=MetricValues)
    
    # Weekly aggregates (based on primary metric - distance)
    monotony: float = 0.0
    strain: float = 0.0
    weekly_load: float = 0.0
    
    # Spike detection (any metric)
    has_spike: bool = False
    spike_metrics: List[str] = Field(default_factory=list)
    spike_status: SpikeStatus = SpikeStatus.NONE
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        use_enum_values = True


class LoadEngineInput(BaseModel):
    """Input data for load engine calculation"""
    athlete_id: str
    coach_id: str
    date: str
    
    # Raw daily loads
    distance: float = 0.0
    hsr: float = 0.0
    sprint_distance: float = 0.0
    acc_dec_load: float = 0.0


class LoadEngineResult(BaseModel):
    """Result of load engine calculation"""
    success: bool
    athlete_id: str
    date: str
    metrics: Optional[AthleteLoadMetrics] = None
    error: Optional[str] = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def classify_acwr(acwr: Optional[float]) -> ACWRZone:
    """Classify ACWR value into risk zones"""
    if acwr is None:
        return ACWRZone.UNKNOWN
    if acwr < ACWR_UNDERLOAD_THRESHOLD:
        return ACWRZone.UNDERLOAD
    if acwr <= ACWR_OPTIMAL_MAX:
        return ACWRZone.OPTIMAL
    if acwr <= ACWR_WARNING_MAX:
        return ACWRZone.WARNING
    return ACWRZone.SPIKE


def classify_spike(acwr: Optional[float]) -> SpikeStatus:
    """Classify spike status based on ACWR"""
    if acwr is None:
        return SpikeStatus.NONE
    if acwr > 2.0:
        return SpikeStatus.CRITICAL
    if acwr > ACWR_WARNING_MAX:
        return SpikeStatus.HIGH
    if acwr > ACWR_OPTIMAL_MAX:
        return SpikeStatus.MODERATE
    return SpikeStatus.NONE
