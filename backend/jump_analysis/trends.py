"""
Trend Analysis
==============

Analyzes performance trends over time.

Key Metrics:
- Delta vs baseline (% change from reference)
- Weekly slope (linear regression)
- Direction indicators (improving/stable/declining)

Trends answer: "Is this athlete getting better or worse?"
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import statistics


class TrendDirection(str, Enum):
    """Direction of performance trend."""
    IMPROVING = "improving"      # Positive slope, significant gain
    STABLE = "stable"            # No significant change
    DECLINING = "declining"      # Negative slope, significant loss
    INSUFFICIENT_DATA = "insufficient_data"


@dataclass
class TrendAnalysis:
    """
    Trend analysis results for an athlete.
    
    Contains delta calculations and slope analysis.
    """
    athlete_id: str
    jump_type: str
    
    # Delta vs baseline (% change)
    delta_height_vs_best_pct: Optional[float] = None      # vs historical best
    delta_height_vs_14d_pct: Optional[float] = None       # vs 14-day average
    delta_height_vs_career_pct: Optional[float] = None    # vs career average
    
    delta_rsi_vs_best_pct: Optional[float] = None
    delta_rsi_vs_14d_pct: Optional[float] = None
    delta_rsi_vs_career_pct: Optional[float] = None
    
    # Current values (most recent)
    current_height_cm: Optional[float] = None
    current_rsi: Optional[float] = None
    current_date: Optional[datetime] = None
    
    # Weekly slope (linear regression coefficient)
    height_slope_per_week: Optional[float] = None         # cm per week
    rsi_slope_per_week: Optional[float] = None            # RSI units per week
    
    # Direction indicators
    height_trend: TrendDirection = TrendDirection.INSUFFICIENT_DATA
    rsi_trend: TrendDirection = TrendDirection.INSUFFICIENT_DATA
    
    # Confidence
    data_points_used: int = 0
    analysis_window_days: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'athlete_id': self.athlete_id,
            'jump_type': self.jump_type,
            'delta_height_vs_best_pct': self.delta_height_vs_best_pct,
            'delta_height_vs_14d_pct': self.delta_height_vs_14d_pct,
            'delta_height_vs_career_pct': self.delta_height_vs_career_pct,
            'delta_rsi_vs_best_pct': self.delta_rsi_vs_best_pct,
            'delta_rsi_vs_14d_pct': self.delta_rsi_vs_14d_pct,
            'delta_rsi_vs_career_pct': self.delta_rsi_vs_career_pct,
            'current_height_cm': self.current_height_cm,
            'current_rsi': self.current_rsi,
            'current_date': self.current_date.isoformat() if self.current_date else None,
            'height_slope_per_week': self.height_slope_per_week,
            'rsi_slope_per_week': self.rsi_slope_per_week,
            'height_trend': self.height_trend.value,
            'rsi_trend': self.rsi_trend.value,
            'data_points_used': self.data_points_used,
            'analysis_window_days': self.analysis_window_days,
        }


class TrendCalculator:
    """
    Calculator for performance trends.
    
    Uses linear regression to determine slope and direction.
    """
    
    # Thresholds for trend classification
    SIGNIFICANT_CHANGE_PCT = 3.0      # % change to be considered significant
    MIN_DATA_POINTS = 3               # Minimum points for trend calculation
    DEFAULT_WINDOW_DAYS = 28          # Default analysis window
    
    def __init__(
        self,
        reference_date: datetime = None,
        window_days: int = None
    ):
        """
        Initialize calculator.
        
        Args:
            reference_date: Date to analyze from
            window_days: Analysis window in days
        """
        self.reference_date = reference_date or datetime.utcnow()
        self.window_days = window_days or self.DEFAULT_WINDOW_DAYS
    
    def calculate(
        self,
        jumps: List[Dict[str, Any]],
        baseline: Dict[str, Any],
        athlete_id: str,
        jump_type: str = "CMJ"
    ) -> TrendAnalysis:
        """
        Calculate trend analysis.
        
        Args:
            jumps: List of jump records
            baseline: Baseline metrics dict (from AthleteBaseline.to_dict())
            athlete_id: Athlete identifier
            jump_type: Type of jump
            
        Returns:
            TrendAnalysis with calculated trends
        """
        analysis = TrendAnalysis(
            athlete_id=athlete_id,
            jump_type=jump_type,
            analysis_window_days=self.window_days
        )
        
        # Filter jumps by type and window
        cutoff = self.reference_date - timedelta(days=self.window_days)
        
        filtered_jumps = []
        for jump in jumps:
            if jump.get('jump_type', '').upper() != jump_type.upper():
                continue
            
            jump_date = self._parse_date(jump.get('jump_date'))
            if jump_date and jump_date >= cutoff:
                filtered_jumps.append({
                    'height': jump.get('jump_height_cm'),
                    'rsi': jump.get('reactive_strength_index'),
                    'date': jump_date
                })
        
        if not filtered_jumps:
            return analysis
        
        # Sort by date
        filtered_jumps.sort(key=lambda x: x['date'])
        analysis.data_points_used = len(filtered_jumps)
        
        # Get current values (most recent)
        latest = filtered_jumps[-1]
        analysis.current_height_cm = latest['height']
        analysis.current_rsi = latest['rsi']
        analysis.current_date = latest['date']
        
        # Calculate deltas vs baseline
        if analysis.current_height_cm and baseline.get('best_height_cm'):
            analysis.delta_height_vs_best_pct = self._calc_delta_pct(
                analysis.current_height_cm, baseline['best_height_cm']
            )
        
        if analysis.current_height_cm and baseline.get('avg_14d_height_cm'):
            analysis.delta_height_vs_14d_pct = self._calc_delta_pct(
                analysis.current_height_cm, baseline['avg_14d_height_cm']
            )
        
        if analysis.current_height_cm and baseline.get('career_avg_height_cm'):
            analysis.delta_height_vs_career_pct = self._calc_delta_pct(
                analysis.current_height_cm, baseline['career_avg_height_cm']
            )
        
        if analysis.current_rsi and baseline.get('best_rsi'):
            analysis.delta_rsi_vs_best_pct = self._calc_delta_pct(
                analysis.current_rsi, baseline['best_rsi']
            )
        
        if analysis.current_rsi and baseline.get('avg_14d_rsi'):
            analysis.delta_rsi_vs_14d_pct = self._calc_delta_pct(
                analysis.current_rsi, baseline['avg_14d_rsi']
            )
        
        if analysis.current_rsi and baseline.get('career_avg_rsi'):
            analysis.delta_rsi_vs_career_pct = self._calc_delta_pct(
                analysis.current_rsi, baseline['career_avg_rsi']
            )
        
        # Calculate slopes (linear regression)
        if len(filtered_jumps) >= self.MIN_DATA_POINTS:
            # Height slope
            height_points = [
                (j['date'], j['height']) 
                for j in filtered_jumps 
                if j['height'] is not None
            ]
            if len(height_points) >= self.MIN_DATA_POINTS:
                analysis.height_slope_per_week = self._calc_weekly_slope(height_points)
                analysis.height_trend = self._classify_trend(
                    analysis.height_slope_per_week,
                    baseline.get('career_avg_height_cm', 30)  # Default reference
                )
            
            # RSI slope
            rsi_points = [
                (j['date'], j['rsi']) 
                for j in filtered_jumps 
                if j['rsi'] is not None
            ]
            if len(rsi_points) >= self.MIN_DATA_POINTS:
                analysis.rsi_slope_per_week = self._calc_weekly_slope(rsi_points)
                analysis.rsi_trend = self._classify_trend(
                    analysis.rsi_slope_per_week,
                    baseline.get('career_avg_rsi', 100)  # Default reference
                )
        
        return analysis
    
    def _calc_delta_pct(self, current: float, baseline: float) -> float:
        """Calculate percentage change from baseline."""
        if baseline == 0:
            return 0.0
        return round(((current - baseline) / baseline) * 100, 2)
    
    def _calc_weekly_slope(self, points: List[tuple]) -> float:
        """
        Calculate weekly slope using simple linear regression.
        
        Args:
            points: List of (datetime, value) tuples
            
        Returns:
            Slope in units per week
        """
        if len(points) < 2:
            return 0.0
        
        # Convert dates to days since first point
        first_date = points[0][0]
        x = [(p[0] - first_date).days for p in points]
        y = [p[1] for p in points]
        
        n = len(x)
        
        # Linear regression: slope = (n*sum(xy) - sum(x)*sum(y)) / (n*sum(x²) - sum(x)²)
        sum_x = sum(x)
        sum_y = sum(y)
        sum_xy = sum(xi * yi for xi, yi in zip(x, y))
        sum_x2 = sum(xi ** 2 for xi in x)
        
        denominator = n * sum_x2 - sum_x ** 2
        if denominator == 0:
            return 0.0
        
        # Slope per day
        slope_per_day = (n * sum_xy - sum_x * sum_y) / denominator
        
        # Convert to slope per week
        return round(slope_per_day * 7, 3)
    
    def _classify_trend(self, slope_per_week: float, reference_value: float) -> TrendDirection:
        """
        Classify trend direction based on slope.
        
        Uses slope relative to reference value to determine significance.
        """
        if slope_per_week is None:
            return TrendDirection.INSUFFICIENT_DATA
        
        # Calculate slope as % of reference per week
        if reference_value > 0:
            slope_pct = (slope_per_week / reference_value) * 100
        else:
            slope_pct = 0
        
        if slope_pct >= self.SIGNIFICANT_CHANGE_PCT / 4:  # ~0.75% per week = 3% per month
            return TrendDirection.IMPROVING
        elif slope_pct <= -self.SIGNIFICANT_CHANGE_PCT / 4:
            return TrendDirection.DECLINING
        else:
            return TrendDirection.STABLE
    
    def _parse_date(self, date_value: Any) -> Optional[datetime]:
        """Parse date from various formats."""
        if date_value is None:
            return None
        
        if isinstance(date_value, datetime):
            return date_value
        
        if isinstance(date_value, str):
            try:
                if 'T' in date_value:
                    return datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                return datetime.strptime(date_value[:10], '%Y-%m-%d')
            except ValueError:
                return None
        
        return None


def calculate_trends(
    jumps: List[Dict[str, Any]],
    baseline: Dict[str, Any],
    athlete_id: str,
    jump_type: str = "CMJ",
    window_days: int = 28
) -> TrendAnalysis:
    """
    Convenience function to calculate trends.
    
    Args:
        jumps: List of jump records
        baseline: Baseline metrics dict
        athlete_id: Athlete identifier
        jump_type: Type of jump
        window_days: Analysis window
        
    Returns:
        TrendAnalysis with calculated trends
    """
    calculator = TrendCalculator(window_days=window_days)
    return calculator.calculate(jumps, baseline, athlete_id, jump_type)
