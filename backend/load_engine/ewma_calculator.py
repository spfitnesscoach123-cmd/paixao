"""
EWMA Calculator

Implements Exponential Weighted Moving Average calculations for load metrics.
Uses the standard formula: EWMA_today = Load_today * λ + EWMA_yesterday * (1 - λ)
"""

from typing import List, Optional, Tuple
from .load_metrics import (
    EWMA_ACUTE_LAMBDA,
    EWMA_CHRONIC_LAMBDA,
    EWMA_ACUTE_WINDOW,
    EWMA_CHRONIC_WINDOW,
)


class EWMACalculator:
    """
    Calculates Exponential Weighted Moving Average for training loads.
    
    EWMA is preferred over simple rolling averages because it:
    - Gives more weight to recent values
    - Responds faster to changes in load
    - Is less affected by single outliers
    - Can be calculated incrementally (no need to store all history)
    """
    
    def __init__(
        self,
        acute_lambda: float = EWMA_ACUTE_LAMBDA,
        chronic_lambda: float = EWMA_CHRONIC_LAMBDA
    ):
        """
        Initialize EWMA calculator with decay factors.
        
        Args:
            acute_lambda: Decay factor for acute load (7-day window), default ≈ 0.25
            chronic_lambda: Decay factor for chronic load (28-day window), default ≈ 0.069
        """
        self.acute_lambda = acute_lambda
        self.chronic_lambda = chronic_lambda
    
    def calculate_ewma(
        self,
        current_load: float,
        previous_ewma: Optional[float] = None,
        decay_lambda: float = EWMA_ACUTE_LAMBDA,
        is_first_day: bool = False
    ) -> float:
        """
        Calculate EWMA for a single day.
        
        Formula: EWMA_today = Load_today * λ + EWMA_yesterday * (1 - λ)
        
        Args:
            current_load: Today's load value
            previous_ewma: Yesterday's EWMA value (None if first calculation)
            decay_lambda: Decay factor (λ)
            is_first_day: If True, use current_load as initial EWMA
            
        Returns:
            New EWMA value
        """
        if previous_ewma is None or is_first_day:
            # First day: EWMA equals the load
            return current_load
        
        return current_load * decay_lambda + previous_ewma * (1 - decay_lambda)
    
    def calculate_acute_ewma(
        self,
        current_load: float,
        previous_acute_ewma: Optional[float] = None,
        is_first_day: bool = False
    ) -> float:
        """
        Calculate acute EWMA (7-day equivalent window).
        
        Args:
            current_load: Today's load value
            previous_acute_ewma: Yesterday's acute EWMA
            is_first_day: If True, initialize with current_load
            
        Returns:
            New acute EWMA value
        """
        return self.calculate_ewma(
            current_load,
            previous_acute_ewma,
            self.acute_lambda,
            is_first_day
        )
    
    def calculate_chronic_ewma(
        self,
        current_load: float,
        previous_chronic_ewma: Optional[float] = None,
        is_first_day: bool = False
    ) -> float:
        """
        Calculate chronic EWMA (28-day equivalent window).
        
        Args:
            current_load: Today's load value
            previous_chronic_ewma: Yesterday's chronic EWMA
            is_first_day: If True, initialize with current_load
            
        Returns:
            New chronic EWMA value
        """
        return self.calculate_ewma(
            current_load,
            previous_chronic_ewma,
            self.chronic_lambda,
            is_first_day
        )
    
    def calculate_both(
        self,
        current_load: float,
        previous_acute: Optional[float] = None,
        previous_chronic: Optional[float] = None,
        is_first_day: bool = False
    ) -> Tuple[float, float]:
        """
        Calculate both acute and chronic EWMA in one call.
        
        Args:
            current_load: Today's load value
            previous_acute: Yesterday's acute EWMA
            previous_chronic: Yesterday's chronic EWMA
            is_first_day: If True, initialize both with current_load
            
        Returns:
            Tuple of (acute_ewma, chronic_ewma)
        """
        acute = self.calculate_acute_ewma(current_load, previous_acute, is_first_day)
        chronic = self.calculate_chronic_ewma(current_load, previous_chronic, is_first_day)
        return acute, chronic
    
    def calculate_from_history(
        self,
        loads: List[float],
        decay_lambda: float = EWMA_ACUTE_LAMBDA
    ) -> float:
        """
        Calculate EWMA from a list of historical loads (oldest first).
        
        This is useful for recalculating from scratch when needed.
        
        Args:
            loads: List of daily loads, ordered from oldest to newest
            decay_lambda: Decay factor to use
            
        Returns:
            Final EWMA value
        """
        if not loads:
            return 0.0
        
        ewma = loads[0]  # Initialize with first value
        for load in loads[1:]:
            ewma = load * decay_lambda + ewma * (1 - decay_lambda)
        
        return ewma
    
    def calculate_both_from_history(
        self,
        loads: List[float]
    ) -> Tuple[float, float]:
        """
        Calculate both acute and chronic EWMA from historical loads.
        
        Args:
            loads: List of daily loads, ordered from oldest to newest
            
        Returns:
            Tuple of (acute_ewma, chronic_ewma)
        """
        acute = self.calculate_from_history(loads, self.acute_lambda)
        chronic = self.calculate_from_history(loads, self.chronic_lambda)
        return acute, chronic
    
    def get_effective_days(self, decay_lambda: float, threshold: float = 0.01) -> int:
        """
        Calculate how many days contribute meaningfully to EWMA.
        
        A day's contribution is considered "meaningful" if its weight
        exceeds the threshold percentage.
        
        Args:
            decay_lambda: Decay factor
            threshold: Minimum weight to consider meaningful (default 1%)
            
        Returns:
            Number of days with meaningful contribution
        """
        weight = 1.0
        days = 0
        while weight > threshold:
            days += 1
            weight *= (1 - decay_lambda)
        return days


# Singleton instance for convenience
ewma_calculator = EWMACalculator()


def calculate_ewma_acute(load: float, prev: Optional[float] = None, first: bool = False) -> float:
    """Convenience function for acute EWMA calculation."""
    return ewma_calculator.calculate_acute_ewma(load, prev, first)


def calculate_ewma_chronic(load: float, prev: Optional[float] = None, first: bool = False) -> float:
    """Convenience function for chronic EWMA calculation."""
    return ewma_calculator.calculate_chronic_ewma(load, prev, first)
