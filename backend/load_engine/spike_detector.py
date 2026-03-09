"""
Spike Detector

Detects workload spikes and calculates monotony/strain metrics.
"""

import statistics
from typing import List, Optional, Tuple, Dict
from .load_metrics import (
    SpikeStatus,
    ACWRZone,
    MONOTONY_WINDOW,
    classify_spike,
)


class SpikeDetector:
    """
    Detects workload spikes and calculates weekly training metrics.
    
    Provides:
    - Monotony: Variability of training load (low variability = high monotony = higher risk)
    - Strain: Accumulated weekly stress (weekly_load * monotony)
    - Spike detection: Sudden increases in workload
    - Week-over-week change detection
    """
    
    def __init__(self, window: int = MONOTONY_WINDOW):
        """
        Initialize spike detector.
        
        Args:
            window: Number of days for monotony calculation (default 7)
        """
        self.window = window
    
    def calculate_monotony(self, daily_loads: List[float]) -> float:
        """
        Calculate training monotony.
        
        Monotony = mean(daily_loads) / std(daily_loads)
        
        High monotony (>2.0) indicates lack of variation, which increases
        injury and overtraining risk.
        
        Args:
            daily_loads: List of daily load values (should be last 7 days)
            
        Returns:
            Monotony value (0 if std is 0)
        """
        if not daily_loads or len(daily_loads) < 2:
            return 0.0
        
        mean_load = statistics.mean(daily_loads)
        
        try:
            std_load = statistics.stdev(daily_loads)
        except statistics.StatisticsError:
            return 0.0
        
        if std_load == 0:
            # All loads are the same - technically infinite monotony
            # Return a high value to indicate this
            return 10.0 if mean_load > 0 else 0.0
        
        return round(mean_load / std_load, 2)
    
    def calculate_strain(
        self,
        daily_loads: List[float],
        monotony: Optional[float] = None
    ) -> float:
        """
        Calculate training strain.
        
        Strain = weekly_load * monotony
        
        High strain (>5000-6000 for typical loads) indicates accumulated stress.
        
        Args:
            daily_loads: List of daily load values
            monotony: Pre-calculated monotony (calculated if None)
            
        Returns:
            Strain value
        """
        if not daily_loads:
            return 0.0
        
        weekly_load = sum(daily_loads)
        
        if monotony is None:
            monotony = self.calculate_monotony(daily_loads)
        
        return round(weekly_load * monotony, 2)
    
    def calculate_weekly_metrics(
        self,
        daily_loads: List[float]
    ) -> Dict[str, float]:
        """
        Calculate all weekly metrics at once.
        
        Args:
            daily_loads: List of last 7 days of load values
            
        Returns:
            Dict with monotony, strain, weekly_load, avg_daily_load, std_daily_load
        """
        if not daily_loads:
            return {
                "monotony": 0.0,
                "strain": 0.0,
                "weekly_load": 0.0,
                "avg_daily_load": 0.0,
                "std_daily_load": 0.0,
            }
        
        weekly_load = sum(daily_loads)
        avg_daily = statistics.mean(daily_loads) if daily_loads else 0.0
        
        try:
            std_daily = statistics.stdev(daily_loads) if len(daily_loads) > 1 else 0.0
        except statistics.StatisticsError:
            std_daily = 0.0
        
        monotony = self.calculate_monotony(daily_loads)
        strain = weekly_load * monotony
        
        return {
            "monotony": round(monotony, 2),
            "strain": round(strain, 2),
            "weekly_load": round(weekly_load, 2),
            "avg_daily_load": round(avg_daily, 2),
            "std_daily_load": round(std_daily, 2),
        }
    
    def detect_spike_from_acwr(self, acwr: Optional[float]) -> Tuple[bool, SpikeStatus]:
        """
        Detect spike based on ACWR value.
        
        Args:
            acwr: ACWR value
            
        Returns:
            Tuple of (has_spike, spike_status)
        """
        status = classify_spike(acwr)
        has_spike = status != SpikeStatus.NONE
        return has_spike, status
    
    def detect_spike_from_loads(
        self,
        current_load: float,
        previous_loads: List[float],
        threshold_multiplier: float = 1.5
    ) -> Tuple[bool, float]:
        """
        Detect spike by comparing current load to recent average.
        
        A spike is detected if current load exceeds threshold_multiplier
        times the average of previous loads.
        
        Args:
            current_load: Today's load
            previous_loads: List of previous days' loads
            threshold_multiplier: Spike threshold (default 1.5x)
            
        Returns:
            Tuple of (is_spike, ratio to average)
        """
        if not previous_loads:
            return False, 0.0
        
        avg_previous = statistics.mean(previous_loads)
        
        if avg_previous == 0:
            return current_load > 0, float('inf') if current_load > 0 else 0.0
        
        ratio = current_load / avg_previous
        is_spike = ratio > threshold_multiplier
        
        return is_spike, round(ratio, 2)
    
    def calculate_week_over_week_change(
        self,
        current_week_loads: List[float],
        previous_week_loads: List[float]
    ) -> Tuple[float, float]:
        """
        Calculate week-over-week load change.
        
        Args:
            current_week_loads: This week's daily loads
            previous_week_loads: Last week's daily loads
            
        Returns:
            Tuple of (absolute change, percentage change)
        """
        current_total = sum(current_week_loads) if current_week_loads else 0
        previous_total = sum(previous_week_loads) if previous_week_loads else 0
        
        absolute_change = current_total - previous_total
        
        if previous_total == 0:
            percentage_change = 100.0 if current_total > 0 else 0.0
        else:
            percentage_change = (absolute_change / previous_total) * 100
        
        return round(absolute_change, 2), round(percentage_change, 2)
    
    def get_risk_assessment(
        self,
        acwr: Optional[float],
        monotony: float,
        strain: float
    ) -> Dict[str, any]:
        """
        Get comprehensive risk assessment.
        
        Args:
            acwr: ACWR value
            monotony: Monotony value
            strain: Strain value
            
        Returns:
            Dict with risk factors and overall assessment
        """
        risks = []
        risk_level = "low"
        
        # ACWR risk
        if acwr is not None:
            if acwr > 1.5:
                risks.append("ACWR spike (>1.5)")
                risk_level = "high"
            elif acwr > 1.3:
                risks.append("ACWR elevated (1.3-1.5)")
                if risk_level != "high":
                    risk_level = "moderate"
            elif acwr < 0.8:
                risks.append("ACWR low (<0.8) - detraining risk")
                if risk_level == "low":
                    risk_level = "low-underload"
        
        # Monotony risk
        if monotony > 2.0:
            risks.append("High monotony (>2.0) - lack of variation")
            if risk_level not in ["high"]:
                risk_level = "moderate"
        
        # Strain risk (threshold depends on sport/load units)
        # Using generic thresholds - should be calibrated per sport
        if strain > 6000:
            risks.append("High strain (>6000)")
            risk_level = "high"
        elif strain > 4000:
            risks.append("Elevated strain (4000-6000)")
            if risk_level == "low":
                risk_level = "moderate"
        
        return {
            "risk_level": risk_level,
            "risk_factors": risks,
            "has_risks": len(risks) > 0,
            "acwr": acwr,
            "monotony": monotony,
            "strain": strain,
        }
    
    def get_spike_status_label(self, status: SpikeStatus, locale: str = "en") -> str:
        """
        Get human-readable spike status label.
        
        Args:
            status: SpikeStatus value
            locale: Language code
            
        Returns:
            Human-readable label
        """
        labels = {
            "en": {
                SpikeStatus.NONE: "Normal",
                SpikeStatus.MODERATE: "Moderate Spike",
                SpikeStatus.HIGH: "High Spike",
                SpikeStatus.CRITICAL: "Critical Spike",
            },
            "pt": {
                SpikeStatus.NONE: "Normal",
                SpikeStatus.MODERATE: "Pico Moderado",
                SpikeStatus.HIGH: "Pico Alto",
                SpikeStatus.CRITICAL: "Pico Crítico",
            }
        }
        return labels.get(locale, labels["en"]).get(status, "Unknown")


# Singleton instance
spike_detector = SpikeDetector()


def calculate_monotony(loads: List[float]) -> float:
    """Convenience function for monotony calculation."""
    return spike_detector.calculate_monotony(loads)


def calculate_strain(loads: List[float]) -> float:
    """Convenience function for strain calculation."""
    return spike_detector.calculate_strain(loads)
