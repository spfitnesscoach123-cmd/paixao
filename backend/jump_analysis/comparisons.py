"""
Comparisons and Normalization
=============================

Enables comparisons between:
- Athletes (inter-athlete comparison)
- Devices (inter-device normalization)
- Time periods (longitudinal comparison)

Key Methods:
- Z-score normalization (intra-athlete)
- Percentile ranking (inter-athlete)
- Device offset correction
- Percent of personal best

This makes data from different athletes, devices, and
time periods comparable on a common scale.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
import statistics


class NormalizationMethod(str, Enum):
    """Normalization methods available."""
    Z_SCORE = "z_score"                    # (value - mean) / std
    PERCENT_BEST = "percent_best"          # value / best * 100
    PERCENT_CAREER = "percent_career"      # value / career_avg * 100
    PERCENTILE = "percentile"              # Rank among group


@dataclass
class NormalizedJump:
    """
    A jump record with normalized values.
    
    Contains both raw and normalized metrics.
    """
    athlete_id: str
    jump_date: Optional[datetime]
    jump_type: str
    
    # Raw values
    raw_height_cm: Optional[float] = None
    raw_rsi: Optional[float] = None
    
    # Z-score normalized (intra-athlete)
    z_height: Optional[float] = None
    z_rsi: Optional[float] = None
    
    # Percent of personal best
    pct_best_height: Optional[float] = None
    pct_best_rsi: Optional[float] = None
    
    # Percent of career average
    pct_career_height: Optional[float] = None
    pct_career_rsi: Optional[float] = None
    
    # Device-corrected values (if applicable)
    device_corrected_height: Optional[float] = None
    device: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'athlete_id': self.athlete_id,
            'jump_date': self.jump_date.isoformat() if self.jump_date else None,
            'jump_type': self.jump_type,
            'raw_height_cm': self.raw_height_cm,
            'raw_rsi': self.raw_rsi,
            'z_height': self.z_height,
            'z_rsi': self.z_rsi,
            'pct_best_height': self.pct_best_height,
            'pct_best_rsi': self.pct_best_rsi,
            'pct_career_height': self.pct_career_height,
            'pct_career_rsi': self.pct_career_rsi,
            'device_corrected_height': self.device_corrected_height,
            'device': self.device,
        }


@dataclass
class AthleteComparison:
    """
    Comparison results between athletes.
    """
    athletes: List[Dict[str, Any]] = field(default_factory=list)
    comparison_metric: str = "z_height"
    group_mean: Optional[float] = None
    group_std: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'athletes': self.athletes,
            'comparison_metric': self.comparison_metric,
            'group_mean': self.group_mean,
            'group_std': self.group_std,
        }


class ComparisonEngine:
    """
    Engine for athlete and device comparisons.
    
    Normalizes data to enable fair comparisons across:
    - Different athletes (biological variance)
    - Different devices (measurement variance)
    - Different time periods (temporal variance)
    """
    
    # Known device offsets (cm difference from "gold standard")
    # Positive = device measures higher, Negative = device measures lower
    # These should be calibrated empirically
    DEVICE_OFFSETS: Dict[str, float] = {
        'generic': 0.0,
        'chronojump': 0.0,
        'force_decks': 0.5,     # Force plates typically slightly higher
        'axon_jump': -0.3,      # Contact mats sometimes slightly lower
        'optojump': 0.2,
    }
    
    def normalize_athlete_jumps(
        self,
        jumps: List[Dict[str, Any]],
        baseline: Dict[str, Any],
        athlete_id: str,
        jump_type: str = "CMJ",
        apply_device_correction: bool = True
    ) -> List[NormalizedJump]:
        """
        Normalize all jumps for an athlete.
        
        Args:
            jumps: List of jump records
            baseline: Athlete baseline metrics
            athlete_id: Athlete identifier
            jump_type: Type of jump to normalize
            apply_device_correction: Whether to apply device offset correction
            
        Returns:
            List of NormalizedJump objects
        """
        # Filter by jump type
        filtered = [
            j for j in jumps 
            if j.get('jump_type', '').upper() == jump_type.upper()
        ]
        
        if not filtered:
            return []
        
        # Extract heights and RSI for statistics
        heights = [j.get('jump_height_cm') for j in filtered if j.get('jump_height_cm')]
        rsis = [j.get('reactive_strength_index') for j in filtered if j.get('reactive_strength_index')]
        
        # Calculate athlete statistics
        height_mean = statistics.mean(heights) if heights else None
        height_std = statistics.stdev(heights) if len(heights) >= 2 else None
        rsi_mean = statistics.mean(rsis) if rsis else None
        rsi_std = statistics.stdev(rsis) if len(rsis) >= 2 else None
        
        # Get baseline values
        best_height = baseline.get('best_height_cm')
        best_rsi = baseline.get('best_rsi')
        career_height = baseline.get('career_avg_height_cm')
        career_rsi = baseline.get('career_avg_rsi')
        
        # Normalize each jump
        normalized_jumps = []
        
        for jump in filtered:
            nj = NormalizedJump(
                athlete_id=athlete_id,
                jump_date=self._parse_date(jump.get('jump_date')),
                jump_type=jump_type,
                raw_height_cm=jump.get('jump_height_cm'),
                raw_rsi=jump.get('reactive_strength_index'),
                device=jump.get('source_system')
            )
            
            height = jump.get('jump_height_cm')
            rsi = jump.get('reactive_strength_index')
            
            # Z-score normalization
            if height is not None and height_mean is not None and height_std and height_std > 0:
                nj.z_height = round((height - height_mean) / height_std, 3)
            
            if rsi is not None and rsi_mean is not None and rsi_std and rsi_std > 0:
                nj.z_rsi = round((rsi - rsi_mean) / rsi_std, 3)
            
            # Percent of best
            if height is not None and best_height:
                nj.pct_best_height = round((height / best_height) * 100, 2)
            
            if rsi is not None and best_rsi:
                nj.pct_best_rsi = round((rsi / best_rsi) * 100, 2)
            
            # Percent of career
            if height is not None and career_height:
                nj.pct_career_height = round((height / career_height) * 100, 2)
            
            if rsi is not None and career_rsi:
                nj.pct_career_rsi = round((rsi / career_rsi) * 100, 2)
            
            # Device correction
            if apply_device_correction and height is not None:
                device = (jump.get('source_system') or 'generic').lower()
                offset = self.DEVICE_OFFSETS.get(device, 0.0)
                nj.device_corrected_height = round(height - offset, 2)
            
            normalized_jumps.append(nj)
        
        return normalized_jumps
    
    def compare_athletes(
        self,
        athlete_data: List[Dict[str, Any]],
        metric: str = "z_height",
        jump_type: str = "CMJ"
    ) -> AthleteComparison:
        """
        Compare multiple athletes on a common scale.
        
        Args:
            athlete_data: List of dicts with 'athlete_id', 'baseline', 'jumps'
            metric: Metric to compare ('z_height', 'pct_best_height', etc.)
            jump_type: Type of jump to compare
            
        Returns:
            AthleteComparison with ranked athletes
        """
        comparison = AthleteComparison(comparison_metric=metric)
        
        athlete_summaries = []
        all_values = []
        
        for data in athlete_data:
            athlete_id = data['athlete_id']
            baseline = data.get('baseline', {})
            jumps = data.get('jumps', [])
            
            # Normalize jumps
            normalized = self.normalize_athlete_jumps(
                jumps, baseline, athlete_id, jump_type
            )
            
            if not normalized:
                continue
            
            # Get latest normalized value
            latest = normalized[-1]
            value = getattr(latest, metric, None)
            
            if value is not None:
                all_values.append(value)
                athlete_summaries.append({
                    'athlete_id': athlete_id,
                    'value': value,
                    'raw_height_cm': latest.raw_height_cm,
                    'pct_best_height': latest.pct_best_height,
                    'jump_count': len(normalized),
                })
        
        # Calculate group statistics
        if all_values:
            comparison.group_mean = round(statistics.mean(all_values), 3)
            if len(all_values) >= 2:
                comparison.group_std = round(statistics.stdev(all_values), 3)
        
        # Rank athletes
        athlete_summaries.sort(key=lambda x: x['value'], reverse=True)
        
        for rank, summary in enumerate(athlete_summaries, 1):
            summary['rank'] = rank
            summary['percentile'] = round(
                (len(athlete_summaries) - rank + 1) / len(athlete_summaries) * 100, 1
            )
        
        comparison.athletes = athlete_summaries
        
        return comparison
    
    def calculate_percentile_rank(
        self,
        value: float,
        all_values: List[float]
    ) -> float:
        """
        Calculate percentile rank of a value.
        
        Args:
            value: Value to rank
            all_values: All values in the comparison group
            
        Returns:
            Percentile (0-100)
        """
        if not all_values:
            return 50.0
        
        below = sum(1 for v in all_values if v < value)
        return round((below / len(all_values)) * 100, 1)
    
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


def normalize_jump_data(
    jumps: List[Dict[str, Any]],
    baseline: Dict[str, Any],
    athlete_id: str,
    jump_type: str = "CMJ"
) -> List[Dict[str, Any]]:
    """
    Convenience function to normalize jump data.
    
    Args:
        jumps: List of jump records
        baseline: Athlete baseline metrics
        athlete_id: Athlete identifier
        jump_type: Type of jump to normalize
        
    Returns:
        List of normalized jump dicts
    """
    engine = ComparisonEngine()
    normalized = engine.normalize_athlete_jumps(jumps, baseline, athlete_id, jump_type)
    return [nj.to_dict() for nj in normalized]


def compare_athletes(
    athlete_data: List[Dict[str, Any]],
    metric: str = "z_height",
    jump_type: str = "CMJ"
) -> Dict[str, Any]:
    """
    Convenience function to compare athletes.
    
    Args:
        athlete_data: List of dicts with 'athlete_id', 'baseline', 'jumps'
        metric: Metric to compare
        jump_type: Type of jump to compare
        
    Returns:
        Comparison results dict
    """
    engine = ComparisonEngine()
    comparison = engine.compare_athletes(athlete_data, metric, jump_type)
    return comparison.to_dict()
