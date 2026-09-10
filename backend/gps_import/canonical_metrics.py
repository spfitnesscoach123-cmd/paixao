"""
GPS Import Module - Canonical Metrics Dictionary

This module defines the universal dictionary of GPS metrics using canonical names,
units, and definitions. All manufacturer-specific data will be mapped to these
canonical metrics.

Author: Sports Performance System
Version: 1.0.0
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any
from enum import Enum


class MetricUnit(str, Enum):
    """Standard units for GPS metrics"""
    METERS = "m"
    KILOMETERS = "km"
    KMH = "km/h"
    MS = "m/s"
    COUNT = "count"
    MINUTES = "min"
    SECONDS = "s"
    ARBITRARY = "au"  # Arbitrary units (e.g., PlayerLoad)
    PERCENTAGE = "%"
    MS2 = "m/s²"  # Acceleration


@dataclass
class MetricDefinition:
    """
    Definition of a canonical GPS metric.
    
    Attributes:
        canonical_name: The standardized name used internally
        unit: The standard unit for this metric
        description: Human-readable description
        min_value: Minimum expected value (for validation)
        max_value: Maximum expected value (for validation)
        required: Whether this metric must be present for valid import
        category: Grouping category for the metric
    """
    canonical_name: str
    unit: MetricUnit
    description: str
    min_value: float
    max_value: float
    required: bool
    category: str
    
    def validate_value(self, value: float) -> tuple[bool, Optional[str]]:
        """
        Validate a value against this metric's expected range.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        if value < self.min_value:
            return False, f"{self.canonical_name}: value {value} below minimum {self.min_value}"
        if value > self.max_value:
            return False, f"{self.canonical_name}: value {value} above maximum {self.max_value}"
        return True, None


# =============================================================================
# CANONICAL GPS METRICS DICTIONARY
# =============================================================================

CANONICAL_METRICS: Dict[str, MetricDefinition] = {
    # =========================================================================
    # DISTANCE METRICS
    # =========================================================================
    "total_distance_m": MetricDefinition(
        canonical_name="total_distance_m",
        unit=MetricUnit.METERS,
        description="Total distance covered during the session",
        min_value=0,
        max_value=50000,  # 50km max for a session
        required=True,
        category="distance"
    ),
    
    "high_intensity_distance_m": MetricDefinition(
        canonical_name="high_intensity_distance_m",
        unit=MetricUnit.METERS,
        description="Distance covered at high intensity (Zone 3: 15-20 km/h)",
        min_value=0,
        max_value=15000,
        required=False,
        category="distance"
    ),
    
    "high_speed_running_m": MetricDefinition(
        canonical_name="high_speed_running_m",
        unit=MetricUnit.METERS,
        description="Distance covered at high speed running (Zone 4: 20-25 km/h)",
        min_value=0,
        max_value=8000,
        required=False,
        category="distance"
    ),
    
    "sprint_distance_m": MetricDefinition(
        canonical_name="sprint_distance_m",
        unit=MetricUnit.METERS,
        description="Distance covered at sprint speed (Zone 5: >25 km/h)",
        min_value=0,
        max_value=5000,
        required=False,
        category="distance"
    ),
    
    # =========================================================================
    # SPEED METRICS
    # =========================================================================
    "max_speed_kmh": MetricDefinition(
        canonical_name="max_speed_kmh",
        unit=MetricUnit.KMH,
        description="Maximum speed reached during the session",
        min_value=0,
        max_value=45,  # Human max ~44 km/h
        required=False,
        category="speed"
    ),
    
    "average_speed_kmh": MetricDefinition(
        canonical_name="average_speed_kmh",
        unit=MetricUnit.KMH,
        description="Average speed during the session",
        min_value=0,
        max_value=25,
        required=False,
        category="speed"
    ),
    
    "max_speed_ms": MetricDefinition(
        canonical_name="max_speed_ms",
        unit=MetricUnit.MS,
        description="Maximum speed in meters per second",
        min_value=0,
        max_value=12.5,  # ~45 km/h
        required=False,
        category="speed"
    ),
    
    # =========================================================================
    # SPRINT & EFFORT COUNTS
    # =========================================================================
    "number_of_sprints": MetricDefinition(
        canonical_name="number_of_sprints",
        unit=MetricUnit.COUNT,
        description="Total number of sprint efforts",
        min_value=0,
        max_value=200,
        required=False,
        category="efforts"
    ),
    
    "accelerations_count": MetricDefinition(
        canonical_name="accelerations_count",
        unit=MetricUnit.COUNT,
        description="Total number of accelerations (>2 m/s²)",
        min_value=0,
        max_value=500,
        required=False,
        category="efforts"
    ),
    
    "decelerations_count": MetricDefinition(
        canonical_name="decelerations_count",
        unit=MetricUnit.COUNT,
        description="Total number of decelerations (<-2 m/s²)",
        min_value=0,
        max_value=500,
        required=False,
        category="efforts"
    ),
    
    "high_intensity_efforts": MetricDefinition(
        canonical_name="high_intensity_efforts",
        unit=MetricUnit.COUNT,
        description="Total high intensity efforts (combined accelerations/sprints)",
        min_value=0,
        max_value=500,
        required=False,
        category="efforts"
    ),
    
    # =========================================================================
    # ACCELERATION METRICS
    # =========================================================================
    "max_acceleration_ms2": MetricDefinition(
        canonical_name="max_acceleration_ms2",
        unit=MetricUnit.MS2,
        description="Maximum acceleration achieved",
        min_value=0,
        max_value=15,
        required=False,
        category="acceleration"
    ),
    
    "max_deceleration_ms2": MetricDefinition(
        canonical_name="max_deceleration_ms2",
        unit=MetricUnit.MS2,
        description="Maximum deceleration achieved (absolute value)",
        min_value=0,
        max_value=15,
        required=False,
        category="acceleration"
    ),
    
    # =========================================================================
    # LOAD METRICS
    # =========================================================================
    "player_load": MetricDefinition(
        canonical_name="player_load",
        unit=MetricUnit.ARBITRARY,
        description="Accumulated instantaneous rate of change of acceleration (Catapult proprietary)",
        min_value=0,
        max_value=2000,
        required=False,
        category="load"
    ),
    
    "player_load_per_minute": MetricDefinition(
        canonical_name="player_load_per_minute",
        unit=MetricUnit.ARBITRARY,
        description="Player load normalized per minute",
        min_value=0,
        max_value=50,
        required=False,
        category="load"
    ),
    
    "metabolic_power_avg": MetricDefinition(
        canonical_name="metabolic_power_avg",
        unit=MetricUnit.ARBITRARY,
        description="Average metabolic power output (W/kg)",
        min_value=0,
        max_value=50,
        required=False,
        category="load"
    ),
    
    "dynamic_stress_load": MetricDefinition(
        canonical_name="dynamic_stress_load",
        unit=MetricUnit.ARBITRARY,
        description="Dynamic stress load (STATSports proprietary)",
        min_value=0,
        max_value=5000,
        required=False,
        category="load"
    ),
    
    # =========================================================================
    # TIME METRICS
    # =========================================================================
    "session_duration_min": MetricDefinition(
        canonical_name="session_duration_min",
        unit=MetricUnit.MINUTES,
        description="Total session duration in minutes",
        min_value=0,
        max_value=180,  # 3 hours max
        required=False,
        category="time"
    ),
    
    "session_duration_s": MetricDefinition(
        canonical_name="session_duration_s",
        unit=MetricUnit.SECONDS,
        description="Total session duration in seconds",
        min_value=0,
        max_value=10800,  # 3 hours in seconds
        required=False,
        category="time"
    ),
    
    # =========================================================================
    # HEART RATE METRICS (if available)
    # =========================================================================
    "heart_rate_avg": MetricDefinition(
        canonical_name="heart_rate_avg",
        unit=MetricUnit.COUNT,  # bpm
        description="Average heart rate during session",
        min_value=40,
        max_value=220,
        required=False,
        category="physiological"
    ),
    
    "heart_rate_max": MetricDefinition(
        canonical_name="heart_rate_max",
        unit=MetricUnit.COUNT,  # bpm
        description="Maximum heart rate during session",
        min_value=40,
        max_value=220,
        required=False,
        category="physiological"
    ),
    
    "time_in_hr_zone_5_pct": MetricDefinition(
        canonical_name="time_in_hr_zone_5_pct",
        unit=MetricUnit.PERCENTAGE,
        description="Percentage of time in heart rate zone 5",
        min_value=0,
        max_value=100,
        required=False,
        category="physiological"
    ),
}


# =============================================================================
# REQUIRED METRICS FOR VALID IMPORT
# =============================================================================

REQUIRED_METRICS = [
    name for name, metric in CANONICAL_METRICS.items() if metric.required
]


# =============================================================================
# METRIC CATEGORIES
# =============================================================================

METRIC_CATEGORIES = {
    "distance": [m for m, d in CANONICAL_METRICS.items() if d.category == "distance"],
    "speed": [m for m, d in CANONICAL_METRICS.items() if d.category == "speed"],
    "efforts": [m for m, d in CANONICAL_METRICS.items() if d.category == "efforts"],
    "acceleration": [m for m, d in CANONICAL_METRICS.items() if d.category == "acceleration"],
    "load": [m for m, d in CANONICAL_METRICS.items() if d.category == "load"],
    "time": [m for m, d in CANONICAL_METRICS.items() if d.category == "time"],
    "physiological": [m for m, d in CANONICAL_METRICS.items() if d.category == "physiological"],
}


def get_metric_definition(canonical_name: str) -> Optional[MetricDefinition]:
    """Get the definition for a canonical metric name."""
    return CANONICAL_METRICS.get(canonical_name)


def validate_metric_value(canonical_name: str, value: float) -> tuple[bool, Optional[str]]:
    """
    Validate a value against a canonical metric's expected range.
    
    Args:
        canonical_name: The canonical metric name
        value: The value to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    metric = get_metric_definition(canonical_name)
    if metric is None:
        return False, f"Unknown metric: {canonical_name}"
    return metric.validate_value(value)
