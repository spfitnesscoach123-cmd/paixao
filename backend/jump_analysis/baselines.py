"""
Baseline Calculator
===================

Calculates performance baselines for athletes.

Baselines are the foundation of all performance analysis:
- Historical best (peak performance reference)
- Rolling averages (recent performance level)
- Coefficient of Variation (consistency measure)

These establish the "normal" against which changes are measured.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import statistics


class JumpTypeBaseline(str, Enum):
    """Jump types for baseline calculation."""
    CMJ = "CMJ"
    SJ = "SJ"
    DJ = "DJ"
    RJ = "RJ"


@dataclass
class AthleteBaseline:
    """
    Baseline metrics for a single athlete.
    
    Contains historical reference points for performance comparison.
    """
    athlete_id: str
    jump_type: str
    
    # Historical best (peak reference)
    best_height_cm: Optional[float] = None
    best_height_date: Optional[datetime] = None
    best_rsi: Optional[float] = None
    best_rsi_date: Optional[datetime] = None
    
    # Rolling averages
    avg_7d_height_cm: Optional[float] = None
    avg_14d_height_cm: Optional[float] = None
    avg_28d_height_cm: Optional[float] = None
    avg_7d_rsi: Optional[float] = None
    avg_14d_rsi: Optional[float] = None
    avg_28d_rsi: Optional[float] = None
    
    # All-time average (career baseline)
    career_avg_height_cm: Optional[float] = None
    career_avg_rsi: Optional[float] = None
    
    # Coefficient of Variation (consistency)
    cv_height_percent: Optional[float] = None
    cv_rsi_percent: Optional[float] = None
    
    # Sample sizes
    total_jumps: int = 0
    jumps_7d: int = 0
    jumps_14d: int = 0
    jumps_28d: int = 0
    
    # Metadata
    calculated_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'athlete_id': self.athlete_id,
            'jump_type': self.jump_type,
            'best_height_cm': self.best_height_cm,
            'best_height_date': self.best_height_date.isoformat() if self.best_height_date else None,
            'best_rsi': self.best_rsi,
            'best_rsi_date': self.best_rsi_date.isoformat() if self.best_rsi_date else None,
            'avg_7d_height_cm': self.avg_7d_height_cm,
            'avg_14d_height_cm': self.avg_14d_height_cm,
            'avg_28d_height_cm': self.avg_28d_height_cm,
            'avg_7d_rsi': self.avg_7d_rsi,
            'avg_14d_rsi': self.avg_14d_rsi,
            'avg_28d_rsi': self.avg_28d_rsi,
            'career_avg_height_cm': self.career_avg_height_cm,
            'career_avg_rsi': self.career_avg_rsi,
            'cv_height_percent': self.cv_height_percent,
            'cv_rsi_percent': self.cv_rsi_percent,
            'total_jumps': self.total_jumps,
            'jumps_7d': self.jumps_7d,
            'jumps_14d': self.jumps_14d,
            'jumps_28d': self.jumps_28d,
            'calculated_at': self.calculated_at.isoformat() if self.calculated_at else None,
        }


class BaselineCalculator:
    """
    Calculator for athlete performance baselines.
    
    Processes jump data to establish reference points for:
    - Peak performance (historical best)
    - Recent performance (rolling windows)
    - Performance consistency (CV%)
    """
    
    # Rolling window sizes in days
    WINDOW_7D = 7
    WINDOW_14D = 14
    WINDOW_28D = 28
    
    def __init__(self, reference_date: datetime = None):
        """
        Initialize calculator.
        
        Args:
            reference_date: Date to calculate baselines from (default: now)
        """
        self.reference_date = reference_date or datetime.utcnow()
    
    def calculate(
        self,
        jumps: List[Dict[str, Any]],
        athlete_id: str,
        jump_type: str = "CMJ"
    ) -> AthleteBaseline:
        """
        Calculate baseline for an athlete and jump type.
        
        Args:
            jumps: List of jump records (dicts with jump_height_cm, 
                   reactive_strength_index, jump_date)
            athlete_id: Athlete identifier
            jump_type: Type of jump to analyze (CMJ, SJ, DJ, RJ)
            
        Returns:
            AthleteBaseline with all calculated metrics
        """
        baseline = AthleteBaseline(
            athlete_id=athlete_id,
            jump_type=jump_type,
            calculated_at=datetime.utcnow()
        )
        
        # Filter by jump type
        filtered_jumps = [
            j for j in jumps 
            if j.get('jump_type', '').upper() == jump_type.upper()
        ]
        
        if not filtered_jumps:
            return baseline
        
        baseline.total_jumps = len(filtered_jumps)
        
        # Extract heights and RSI values with dates
        heights_with_dates = []
        rsi_with_dates = []
        
        for jump in filtered_jumps:
            jump_date = self._parse_date(jump.get('jump_date'))
            
            height = jump.get('jump_height_cm')
            if height is not None and height > 0:
                heights_with_dates.append((height, jump_date))
            
            rsi = jump.get('reactive_strength_index')
            if rsi is not None and rsi > 0:
                rsi_with_dates.append((rsi, jump_date))
        
        # Calculate historical best
        if heights_with_dates:
            best_height, best_date = max(heights_with_dates, key=lambda x: x[0])
            baseline.best_height_cm = round(best_height, 2)
            baseline.best_height_date = best_date
        
        if rsi_with_dates:
            best_rsi, best_date = max(rsi_with_dates, key=lambda x: x[0])
            baseline.best_rsi = round(best_rsi, 2)
            baseline.best_rsi_date = best_date
        
        # Calculate rolling averages
        baseline.avg_7d_height_cm, baseline.jumps_7d = self._rolling_average(
            heights_with_dates, self.WINDOW_7D
        )
        baseline.avg_14d_height_cm, baseline.jumps_14d = self._rolling_average(
            heights_with_dates, self.WINDOW_14D
        )
        baseline.avg_28d_height_cm, baseline.jumps_28d = self._rolling_average(
            heights_with_dates, self.WINDOW_28D
        )
        
        baseline.avg_7d_rsi, _ = self._rolling_average(rsi_with_dates, self.WINDOW_7D)
        baseline.avg_14d_rsi, _ = self._rolling_average(rsi_with_dates, self.WINDOW_14D)
        baseline.avg_28d_rsi, _ = self._rolling_average(rsi_with_dates, self.WINDOW_28D)
        
        # Calculate career averages
        if heights_with_dates:
            heights = [h for h, _ in heights_with_dates]
            baseline.career_avg_height_cm = round(statistics.mean(heights), 2)
            
            # CV% = (std / mean) * 100
            if len(heights) >= 2:
                baseline.cv_height_percent = round(
                    (statistics.stdev(heights) / statistics.mean(heights)) * 100, 2
                )
        
        if rsi_with_dates:
            rsi_values = [r for r, _ in rsi_with_dates]
            baseline.career_avg_rsi = round(statistics.mean(rsi_values), 2)
            
            if len(rsi_values) >= 2:
                baseline.cv_rsi_percent = round(
                    (statistics.stdev(rsi_values) / statistics.mean(rsi_values)) * 100, 2
                )
        
        return baseline
    
    def _rolling_average(
        self,
        values_with_dates: List[tuple],
        window_days: int
    ) -> tuple:
        """
        Calculate rolling average for a time window.
        
        Returns:
            Tuple of (average, count) or (None, 0) if no data
        """
        if not values_with_dates:
            return None, 0
        
        cutoff = self.reference_date - timedelta(days=window_days)
        
        window_values = [
            v for v, d in values_with_dates 
            if d and d >= cutoff
        ]
        
        if not window_values:
            return None, 0
        
        return round(statistics.mean(window_values), 2), len(window_values)
    
    def _parse_date(self, date_value: Any) -> Optional[datetime]:
        """Parse date from various formats."""
        if date_value is None:
            return None
        
        if isinstance(date_value, datetime):
            return date_value
        
        if isinstance(date_value, str):
            try:
                # Try ISO format
                if 'T' in date_value:
                    return datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                return datetime.strptime(date_value[:10], '%Y-%m-%d')
            except ValueError:
                return None
        
        return None


def calculate_athlete_baseline(
    jumps: List[Dict[str, Any]],
    athlete_id: str,
    jump_type: str = "CMJ",
    reference_date: datetime = None
) -> AthleteBaseline:
    """
    Convenience function to calculate athlete baseline.
    
    Args:
        jumps: List of jump records
        athlete_id: Athlete identifier
        jump_type: Type of jump (default: CMJ)
        reference_date: Reference date for calculations
        
    Returns:
        AthleteBaseline with calculated metrics
    """
    calculator = BaselineCalculator(reference_date)
    return calculator.calculate(jumps, athlete_id, jump_type)
