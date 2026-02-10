"""
Chronojump Mapper
=================

Mapper for Chronojump open-source timing system.

Chronojump is a free/libre software project for measuring and managing
sport performance and fitness. It uses contact platforms and photocells.

CSV Export Format:
- uniqueID: unique jump identifier
- personID: athlete identifier
- sessionID: test session
- type: jump type (CMJ, SJ, DJ, etc.)
- tv: tempo de voo (flight time) in seconds
- tc: tempo de contato (contact time) in seconds  
- fall: drop height for DJ in cm
- weight: body weight or external load
- description: notes
- angle: knee angle
- simulated: 0/1 flag
- datetime: timestamp

Reference: https://chronojump.org/
"""

from typing import Dict, Any, Optional
from datetime import datetime
from .base import BaseMapper


class ChronojumpMapper(BaseMapper):
    """
    Mapper for Chronojump CSV exports.
    """
    
    MANUFACTURER_NAME = "chronojump"
    
    COLUMN_MAP: Dict[str, str] = {
        # Primary identifiers
        'personid': 'athlete_id',
        'personID': 'athlete_id',
        'person_id': 'athlete_id',
        'person': 'athlete_id',
        
        # Jump identification
        'uniqueid': 'test_id',
        'uniqueID': 'test_id',
        'unique_id': 'test_id',
        
        # Session
        'sessionid': 'session_id',
        'sessionID': 'session_id',
        'session_id': 'session_id',
        
        # Jump type
        'type': 'jump_type',
        'jumptype': 'jump_type',
        
        # Flight time (tv = tempo de voo)
        'tv': 'flight_time_s',
        'flight_time': 'flight_time_s',
        'flighttime': 'flight_time_s',
        
        # Contact time (tc = tempo de contato)
        'tc': 'contact_time_s',
        'contact_time': 'contact_time_s',
        'contacttime': 'contact_time_s',
        
        # Drop height for DJ
        'fall': 'drop_height_cm',
        'dropheight': 'drop_height_cm',
        'drop_height': 'drop_height_cm',
        
        # Weight (can be body mass or external load)
        'weight': 'body_mass_kg',
        'bodymass': 'body_mass_kg',
        'body_mass': 'body_mass_kg',
        
        # Additional load
        'extra_weight': 'load_kg',
        'extraweight': 'load_kg',
        'external_load': 'load_kg',
        
        # Notes
        'description': 'notes',
        'comments': 'notes',
        'notes': 'notes',
        
        # Angle
        'angle': 'knee_angle',
        'kneeangle': 'knee_angle',
        
        # Date/time
        'datetime': 'jump_date',
        'date': 'jump_date',
        'timestamp': 'jump_date',
        
        # Person name (for reference)
        'personname': 'athlete_name',
        'person_name': 'athlete_name',
        'name': 'athlete_name',
    }
    
    # Chronojump jump type mappings to canonical types
    JUMP_TYPE_MAP: Dict[str, str] = {
        'cmj': 'CMJ',
        'countermovement': 'CMJ',
        'countermovement jump': 'CMJ',
        'sj': 'SJ',
        'squat': 'SJ',
        'squat jump': 'SJ',
        'dj': 'DJ',
        'drop': 'DJ',
        'drop jump': 'DJ',
        'depth': 'DJ',
        'depth jump': 'DJ',
        'rj': 'RJ',
        'reactive': 'RJ',
        'repeated': 'RJ',
        'rjl': 'RJ',  # Reactive jump with load
        'abalakov': 'CMJ',  # CMJ with arm swing
        'cmja': 'CMJ',  # CMJ with arms
        'cmjas': 'CMJ',  # CMJ with arm swing
        'free': 'CMJ',  # Free jump treated as CMJ
        'slcmj': 'CMJ',  # Single leg CMJ
    }
    
    def transform_value(self, field: str, value: Any) -> Any:
        """Transform Chronojump-specific values."""
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip()
            if value == '' or value == '-1' or value == '-':
                return None
        
        # Transform jump type to canonical
        if field == 'jump_type':
            if isinstance(value, str):
                value_lower = value.lower().strip()
                return self.JUMP_TYPE_MAP.get(value_lower, value.upper())
            return value
        
        # Chronojump uses -1 for missing values
        if field in ['flight_time_s', 'contact_time_s', 'drop_height_cm']:
            float_val = self._to_float(value)
            if float_val is not None and float_val < 0:
                return None
            return float_val
        
        return super().transform_value(field, value)
    
    def map_row(self, raw_row: Dict[str, Any]) -> Dict[str, Any]:
        """Map Chronojump row with special handling."""
        result = super().map_row(raw_row)
        
        # Chronojump may have 'simulated' flag - skip simulated jumps
        simulated = raw_row.get('simulated', '0')
        if str(simulated) == '1':
            result['notes'] = (result.get('notes', '') or '') + ' [SIMULATED]'
        
        # Store drop height in notes for DJ jumps
        drop_height = result.pop('drop_height_cm', None)
        if drop_height and result.get('jump_type') == 'DJ':
            result['protocol'] = f"Drop Jump {drop_height}cm"
        
        # Handle knee angle
        knee_angle = result.pop('knee_angle', None)
        if knee_angle:
            existing_notes = result.get('notes', '') or ''
            result['notes'] = f"{existing_notes} Knee angle: {knee_angle}°".strip()
        
        return result
