"""
Jump Analysis Module
====================

Analytical engine for jump performance data.
Creates actionable insights from raw metrics.

Core Capabilities:
- Baseline calculation (historical best, rolling averages, CV%)
- Trend analysis (delta vs baseline, weekly slope)
- Fatigue detection (neuromuscular fatigue flags)
- Readiness assessment (training load recommendations)
- Inter-athlete and inter-device comparisons

This module defines the analytical "contract" - what the system
asserts about performance before any UI is built.

Author: Load Manager Team
Version: 1.0.0
"""

from .baselines import (
    AthleteBaseline,
    BaselineCalculator,
    calculate_athlete_baseline,
)
from .trends import (
    TrendAnalysis,
    TrendCalculator,
    calculate_trends,
)
from .fatigue import (
    FatigueStatus,
    FatigueDetector,
    detect_fatigue,
)
from .readiness import (
    ReadinessLevel,
    ReadinessAssessment,
    ReadinessCalculator,
    assess_readiness,
)
from .comparisons import (
    AthleteComparison,
    NormalizationMethod,
    ComparisonEngine,
    compare_athletes,
    normalize_jump_data,
)
from .report import (
    JumpReport,
    ReportGenerator,
    generate_report,
)


__all__ = [
    # Baselines
    'AthleteBaseline',
    'BaselineCalculator',
    'calculate_athlete_baseline',
    # Trends
    'TrendAnalysis',
    'TrendCalculator',
    'calculate_trends',
    # Fatigue
    'FatigueStatus',
    'FatigueDetector',
    'detect_fatigue',
    # Readiness
    'ReadinessLevel',
    'ReadinessAssessment',
    'ReadinessCalculator',
    'assess_readiness',
    # Comparisons
    'AthleteComparison',
    'NormalizationMethod',
    'ComparisonEngine',
    'compare_athletes',
    'normalize_jump_data',
    # Reports
    'JumpReport',
    'ReportGenerator',
    'generate_report',
]
