"""
Derived Metrics Calculator for Jump Data
=========================================

Calculates derived metrics from raw jump data according to
established biomechanical formulas.

Key Calculations:
1. Jump Height from Flight Time
2. Reactive Strength Index (RSI)
3. Takeoff Velocity from Jump Height

All formulas are documented with scientific references.
"""

from typing import Dict, Any, Optional, List
import math


class JumpCalculator:
    """
    Calculator for derived jump metrics.
    
    Implements standard biomechanical formulas for computing
    metrics that may not be present in the raw CSV data.
    """
    
    # Gravitational acceleration constant (m/s²)
    GRAVITY = 9.81
    
    def __init__(self):
        """Initialize calculator with tracking for calculated fields."""
        self._calculated_fields: List[str] = []
    
    @property
    def calculated_fields(self) -> List[str]:
        """Return list of fields that were calculated (not from raw data)."""
        return self._calculated_fields.copy()
    
    def reset_tracking(self) -> None:
        """Reset the calculated fields tracking."""
        self._calculated_fields = []
    
    def calculate(self, raw_row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate derived metrics for a jump record.
        
        Applies calculations in order:
        1. Jump height from flight time (if height missing)
        2. RSI from height and contact time (if RSI missing)
        3. Takeoff velocity from jump height (if velocity missing)
        
        Args:
            raw_row: Normalized row data from CSV parser
            
        Returns:
            Row data with calculated metrics added
        """
        self.reset_tracking()
        result = raw_row.copy()
        
        # Extract existing values (handle None, empty string, and actual values)
        flight_time = self._get_numeric(result, 'flight_time_s')
        jump_height = self._get_numeric(result, 'jump_height_cm')
        contact_time = self._get_numeric(result, 'contact_time_s')
        rsi = self._get_numeric(result, 'reactive_strength_index')
        takeoff_velocity = self._get_numeric(result, 'takeoff_velocity_m_s')
        
        # 1. Calculate jump height from flight time if not provided
        if jump_height is None and flight_time is not None:
            jump_height = self.calculate_jump_height(flight_time)
            result['jump_height_cm'] = jump_height
            self._calculated_fields.append('jump_height_cm')
        
        # 2. Calculate RSI if not provided and we have required inputs
        if rsi is None and jump_height is not None and contact_time is not None:
            if contact_time > 0:  # Avoid division by zero
                rsi = self.calculate_rsi(jump_height, contact_time)
                result['reactive_strength_index'] = rsi
                self._calculated_fields.append('reactive_strength_index')
        
        # 3. Calculate takeoff velocity if not provided
        if takeoff_velocity is None and jump_height is not None:
            takeoff_velocity = self.calculate_takeoff_velocity(jump_height)
            result['takeoff_velocity_m_s'] = takeoff_velocity
            self._calculated_fields.append('takeoff_velocity_m_s')
        
        return result
    
    def _get_numeric(self, data: Dict[str, Any], field: str) -> Optional[float]:
        """
        Safely extract a numeric value from the data dict.
        
        Returns None for:
        - Missing keys
        - None values
        - Empty strings
        - Non-numeric values
        
        Returns actual 0.0 if the value is explicitly 0.
        """
        value = data.get(field)
        
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip()
            if value == '':
                return None
            try:
                return float(value)
            except ValueError:
                return None
        
        if isinstance(value, (int, float)):
            return float(value)
        
        return None
    
    @classmethod
    def calculate_jump_height(cls, flight_time_s: float) -> float:
        """
        Calculate jump height from flight time using projectile motion.
        
        Formula: h = (g × t²) / 8
        
        Derivation:
        - Total flight time t = 2 × time_to_peak
        - At peak: v = 0, so time_to_peak = v₀/g
        - Jump height h = v₀²/(2g)
        - Since t = 2v₀/g, we get v₀ = gt/2
        - Therefore: h = (gt/2)²/(2g) = g²t²/(4×2g) = gt²/8
        
        References:
        - Bosco, C., Luhtanen, P., & Komi, P. V. (1983). A simple method
          for measurement of mechanical power in jumping.
        
        Args:
            flight_time_s: Flight time in seconds
            
        Returns:
            Jump height in centimeters
        """
        # h = (g × t²) / 8, result in meters
        height_m = (cls.GRAVITY * flight_time_s ** 2) / 8
        
        # Convert to centimeters
        height_cm = height_m * 100
        
        return round(height_cm, 2)
    
    @classmethod
    def calculate_rsi(cls, jump_height_cm: float, contact_time_s: float) -> float:
        """
        Calculate Reactive Strength Index.
        
        Formula: RSI = jump_height_cm / contact_time_s
        
        The RSI is a measure of reactive strength and the ability
        to change quickly from an eccentric to a concentric contraction.
        
        Typical values:
        - < 1.0: Poor reactive strength
        - 1.0-1.5: Average
        - 1.5-2.0: Good
        - 2.0-2.5: Very good
        - > 2.5: Elite
        
        Note: Some sources use RSI = height_m / contact_time_s,
        which gives values ~100x smaller. We use cm for consistency
        with common practice in applied sport science.
        
        Args:
            jump_height_cm: Jump height in centimeters
            contact_time_s: Ground contact time in seconds
            
        Returns:
            RSI value (dimensionless ratio)
        """
        if contact_time_s <= 0:
            return 0.0
        
        # RSI = height (cm) / contact_time (s)
        # Alternatively expressed as mm/ms which gives same value
        rsi = jump_height_cm / contact_time_s
        
        return round(rsi, 2)
    
    @classmethod
    def calculate_takeoff_velocity(cls, jump_height_cm: float) -> float:
        """
        Calculate takeoff velocity from jump height.
        
        Formula: v = √(2gh)
        
        From energy conservation:
        - Kinetic energy at takeoff = Potential energy at peak
        - ½mv² = mgh
        - v = √(2gh)
        
        Args:
            jump_height_cm: Jump height in centimeters
            
        Returns:
            Takeoff velocity in meters per second
        """
        # Convert height to meters
        height_m = jump_height_cm / 100
        
        # v = √(2gh)
        velocity = math.sqrt(2 * cls.GRAVITY * height_m)
        
        return round(velocity, 2)
    
    @classmethod
    def calculate_flight_time(cls, jump_height_cm: float) -> float:
        """
        Calculate flight time from jump height (inverse calculation).
        
        Formula: t = √(8h/g)
        
        Derived from: h = gt²/8 → t = √(8h/g)
        
        Args:
            jump_height_cm: Jump height in centimeters
            
        Returns:
            Flight time in seconds
        """
        # Convert height to meters
        height_m = jump_height_cm / 100
        
        # t = √(8h/g)
        flight_time = math.sqrt(8 * height_m / cls.GRAVITY)
        
        return round(flight_time, 3)


# Module-level convenience function
def calculate_derived_metrics(raw_row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate derived metrics for a single row.
    
    Convenience function for use without instantiating JumpCalculator.
    
    Args:
        raw_row: Normalized row data
        
    Returns:
        Row data with calculated metrics
    """
    calculator = JumpCalculator()
    return calculator.calculate(raw_row)
