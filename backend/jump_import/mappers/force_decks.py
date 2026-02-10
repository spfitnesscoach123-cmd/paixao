"""
Force Decks Mapper
==================

Mapper for VALD Force Decks force plate system.

VALD Force Decks is a portable dual force plate system used for
jump testing, balance assessment, and other force-based metrics.

CSV Export typically includes:
- Test ID, Athlete ID, Athlete Name
- Jump Height (Flight Time), Jump Height (Impulse-Momentum)
- Flight Time, Contact Time
- RSI, RSI Modified
- Peak Propulsive Force, Mean Propulsive Force
- Peak Landing Force, Time to Stabilization
- Contraction Time, Eccentric Duration
- And many more force-derived metrics

Reference: https://valdperformance.com/forcedecks/
"""

from typing import Dict, Any, Optional
from .base import BaseMapper


class ForceDecksMapper(BaseMapper):
    """
    Mapper for VALD Force Decks CSV exports.
    """
    
    MANUFACTURER_NAME = "force_decks"
    
    COLUMN_MAP: Dict[str, str] = {
        # Athlete identification
        'athlete id': 'athlete_id',
        'athleteid': 'athlete_id',
        'athlete_id': 'athlete_id',
        'participant id': 'athlete_id',
        'subject id': 'athlete_id',
        
        'athlete name': 'athlete_name',
        'athletename': 'athlete_name',
        'athlete': 'athlete_name',
        'participant name': 'athlete_name',
        'name': 'athlete_name',
        
        'athlete external id': 'athlete_external_id',
        'external id': 'athlete_external_id',
        
        # Test identification
        'test id': 'test_id',
        'testid': 'test_id',
        'test_id': 'test_id',
        'session id': 'test_id',
        
        # Jump type
        'test type': 'jump_type',
        'testtype': 'jump_type',
        'jump type': 'jump_type',
        'jumptype': 'jump_type',
        'type': 'jump_type',
        
        # Jump height - Force Decks provides multiple calculation methods
        'jump height (flight time)': 'jump_height_cm',
        'jump height flight time': 'jump_height_cm',
        'jump height (flight time) [cm]': 'jump_height_cm',
        'jump height [cm]': 'jump_height_cm',
        'jump height': 'jump_height_cm',
        'jumpheight': 'jump_height_cm',
        'flight time jump height': 'jump_height_cm',
        
        # Alternative height calculations (for reference)
        'jump height (impulse-momentum)': 'jump_height_impulse_cm',
        'jump height impulse momentum': 'jump_height_impulse_cm',
        'jump height (imp-mom)': 'jump_height_impulse_cm',
        
        # Flight time
        'flight time': 'flight_time_s',
        'flighttime': 'flight_time_s',
        'flight time [s]': 'flight_time_s',
        'flight time (s)': 'flight_time_s',
        'air time': 'flight_time_s',
        
        # Contact time (for reactive jumps)
        'contact time': 'contact_time_s',
        'contacttime': 'contact_time_s',
        'contact time [s]': 'contact_time_s',
        'contact time (s)': 'contact_time_s',
        'ground contact time': 'contact_time_s',
        
        # RSI
        'rsi': 'reactive_strength_index',
        'reactive strength index': 'reactive_strength_index',
        'rsi [m/s]': 'reactive_strength_index',
        'rsi (m/s)': 'reactive_strength_index',
        'rsi modified': 'rsi_modified',
        'rsim': 'rsi_modified',
        
        # Power metrics
        'peak propulsive power': 'peak_power_w',
        'peak power': 'peak_power_w',
        'peak propulsive power [w]': 'peak_power_w',
        'concentric peak power': 'peak_power_w',
        
        'mean propulsive power': 'mean_power_w',
        'mean power': 'mean_power_w',
        'concentric mean power': 'mean_power_w',
        
        'peak propulsive power / bm': 'power_relative_w_kg',
        'relative peak power': 'power_relative_w_kg',
        'peak power / bm': 'power_relative_w_kg',
        
        # Velocity
        'takeoff velocity': 'takeoff_velocity_m_s',
        'peak velocity': 'takeoff_velocity_m_s',
        'takeoff velocity [m/s]': 'takeoff_velocity_m_s',
        'concentric peak velocity': 'takeoff_velocity_m_s',
        
        # Body mass
        'body mass': 'body_mass_kg',
        'bodymass': 'body_mass_kg',
        'body mass [kg]': 'body_mass_kg',
        'weight': 'body_mass_kg',
        'system weight': 'body_mass_kg',
        
        # External load
        'external load': 'load_kg',
        'added load': 'load_kg',
        'additional load': 'load_kg',
        'load [kg]': 'load_kg',
        
        # Date/time
        'test date': 'jump_date',
        'testdate': 'jump_date',
        'date': 'jump_date',
        'datetime': 'jump_date',
        'timestamp': 'jump_date',
        
        'test time': 'test_time',
        'time': 'test_time',
        
        # Trial/attempt
        'trial': 'attempt_number',
        'trial number': 'attempt_number',
        'rep': 'attempt_number',
        'repetition': 'attempt_number',
        'attempt': 'attempt_number',
        
        # Protocol
        'protocol': 'protocol',
        'test protocol': 'protocol',
        
        # Notes
        'notes': 'notes',
        'comments': 'notes',
        'tags': 'notes',
        
        # Force metrics (stored for reference)
        'peak propulsive force': 'peak_propulsive_force_n',
        'peak landing force': 'peak_landing_force_n',
        'mean propulsive force': 'mean_propulsive_force_n',
        
        # Timing metrics
        'contraction time': 'contraction_time_s',
        'eccentric duration': 'eccentric_duration_s',
        'concentric duration': 'concentric_duration_s',
        'time to takeoff': 'time_to_takeoff_s',
    }
    
    # Force Decks jump type mappings
    JUMP_TYPE_MAP: Dict[str, str] = {
        'cmj': 'CMJ',
        'countermovement jump': 'CMJ',
        'countermovement': 'CMJ',
        'cmj - arms': 'CMJ',
        'cmj arms': 'CMJ',
        'cmj (arms)': 'CMJ',
        'cmj - no arms': 'CMJ',
        'cmj no arms': 'CMJ',
        'cmj hands on hips': 'CMJ',
        'sj': 'SJ',
        'squat jump': 'SJ',
        'static jump': 'SJ',
        'dj': 'DJ',
        'drop jump': 'DJ',
        'depth jump': 'DJ',
        'reactive jump': 'DJ',
        'rj': 'RJ',
        'repeated jump': 'RJ',
        'repeated jumps': 'RJ',
        'rebound jump': 'RJ',
        'continuous jump': 'RJ',
    }
    
    def transform_value(self, field: str, value: Any) -> Any:
        """Transform Force Decks specific values."""
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip()
            if value == '' or value.lower() in ['n/a', 'na', '-', '--']:
                return None
        
        # Transform jump type
        if field == 'jump_type':
            if isinstance(value, str):
                value_lower = value.lower().strip()
                return self.JUMP_TYPE_MAP.get(value_lower, value.upper())
            return value
        
        # Force Decks RSI is sometimes in m/s (height in m / contact time in s)
        # Our canonical RSI uses cm/s, so multiply by 100 if value seems too small
        if field == 'reactive_strength_index':
            float_val = self._to_float(value)
            if float_val is not None and float_val > 0 and float_val < 5:
                # Likely in m/s, convert to cm/s equivalent
                return float_val * 100
            return float_val
        
        # Handle jump height in meters (some exports use m instead of cm)
        if field == 'jump_height_cm':
            float_val = self._to_float(value)
            if float_val is not None:
                # If value is less than 2, it's probably in meters
                if float_val < 2:
                    return float_val * 100
            return float_val
        
        return super().transform_value(field, value)
    
    def map_row(self, raw_row: Dict[str, Any]) -> Dict[str, Any]:
        """Map Force Decks row with additional processing."""
        result = super().map_row(raw_row)
        
        # Use impulse-momentum height if flight time height not available
        if not result.get('jump_height_cm') and result.get('jump_height_impulse_cm'):
            height = result.pop('jump_height_impulse_cm')
            # Convert if in meters
            if height is not None and height < 2:
                height = height * 100
            result['jump_height_cm'] = height
        
        # Store RSI modified in notes if present
        rsi_mod = result.pop('rsi_modified', None)
        if rsi_mod:
            existing_notes = result.get('notes', '') or ''
            result['notes'] = f"{existing_notes} RSI-mod: {rsi_mod}".strip()
        
        # Store additional force metrics in notes for reference
        force_metrics = []
        for metric in ['peak_propulsive_force_n', 'peak_landing_force_n', 
                       'contraction_time_s', 'eccentric_duration_s']:
            val = result.pop(metric, None)
            if val:
                force_metrics.append(f"{metric}: {val}")
        
        if force_metrics:
            existing_notes = result.get('notes', '') or ''
            result['notes'] = f"{existing_notes} [{', '.join(force_metrics)}]".strip()
        
        return result
