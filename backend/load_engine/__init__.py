"""
Load Engine Package

Rolling Load Engine for incremental workload metric calculations.
Provides EWMA, ACWR, Monotony, Strain, and Spike Detection.
"""

from .load_metrics import (
    # Constants
    EWMA_ACUTE_WINDOW,
    EWMA_CHRONIC_WINDOW,
    EWMA_ACUTE_LAMBDA,
    EWMA_CHRONIC_LAMBDA,
    ACWR_UNDERLOAD_THRESHOLD,
    ACWR_OPTIMAL_MAX,
    ACWR_WARNING_MAX,
    MONOTONY_WINDOW,
    TRACKED_METRICS,
    
    # Enums
    ACWRZone,
    SpikeStatus,
    
    # Models
    MetricValues,
    DailyMetrics,
    WeeklyMetrics,
    AthleteLoadMetrics,
    LoadEngineInput,
    LoadEngineResult,
    
    # Functions
    classify_acwr,
    classify_spike,
)

from .ewma_calculator import (
    EWMACalculator,
    ewma_calculator,
    calculate_ewma_acute,
    calculate_ewma_chronic,
)

from .acwr_calculator import (
    ACWRCalculator,
    acwr_calculator,
    calculate_acwr,
    classify_acwr_zone,
)

from .spike_detector import (
    SpikeDetector,
    spike_detector,
    calculate_monotony,
    calculate_strain,
)

from .rolling_load_engine import (
    RollingLoadEngine,
    create_load_engine,
)

__all__ = [
    # Constants
    "EWMA_ACUTE_WINDOW",
    "EWMA_CHRONIC_WINDOW",
    "EWMA_ACUTE_LAMBDA",
    "EWMA_CHRONIC_LAMBDA",
    "ACWR_UNDERLOAD_THRESHOLD",
    "ACWR_OPTIMAL_MAX",
    "ACWR_WARNING_MAX",
    "MONOTONY_WINDOW",
    "TRACKED_METRICS",
    
    # Enums
    "ACWRZone",
    "SpikeStatus",
    
    # Models
    "MetricValues",
    "DailyMetrics",
    "WeeklyMetrics",
    "AthleteLoadMetrics",
    "LoadEngineInput",
    "LoadEngineResult",
    
    # EWMA
    "EWMACalculator",
    "ewma_calculator",
    "calculate_ewma_acute",
    "calculate_ewma_chronic",
    
    # ACWR
    "ACWRCalculator",
    "acwr_calculator",
    "calculate_acwr",
    "classify_acwr",
    "classify_acwr_zone",
    "classify_spike",
    
    # Spike/Monotony
    "SpikeDetector",
    "spike_detector",
    "calculate_monotony",
    "calculate_strain",
    
    # Engine
    "RollingLoadEngine",
    "create_load_engine",
]
