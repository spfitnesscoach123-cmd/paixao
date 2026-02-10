"""
Axon Jump Mapper
================

Mapper for Axon Jump contact mat system.

Axon Jump is a contact mat timing system commonly used in 
sports performance testing for measuring jump height and
reactive strength.

CSV Export typically includes:
- Athlete, Test, Date, Time
- Flight Time (s), Contact Time (s)
- Height (cm), RSI
- Stiffness, Jump Type

Reference: https://www.axonjump.com/
"""

from typing import Dict, Any, Optional
from .base import BaseMapper


class AxonJumpMapper(BaseMapper):
    """
    Mapper for Axon Jump CSV exports.
    """
    
    MANUFACTURER_NAME = "axon_jump"
    
    COLUMN_MAP: Dict[str, str] = {
        # Athlete identification
        'athlete': 'athlete_id',
        'athlete_id': 'athlete_id',
        'athleteid': 'athlete_id',
        'atleta': 'athlete_id',
        'name': 'athlete_name',
        'athlete name': 'athlete_name',
        'nome': 'athlete_name',
        
        # Test identification
        'test': 'test_id',
        'test_id': 'test_id',
        'testid': 'test_id',
        'teste': 'test_id',
        'session': 'test_id',
        
        # Jump type
        'jump type': 'jump_type',
        'jumptype': 'jump_type',
        'jump_type': 'jump_type',
        'type': 'jump_type',
        'tipo': 'jump_type',
        'tipo de salto': 'jump_type',
        
        # Flight time
        'flight time (s)': 'flight_time_s',
        'flight time': 'flight_time_s',
        'flighttime': 'flight_time_s',
        'flight_time_s': 'flight_time_s',
        'tv (s)': 'flight_time_s',
        'tv': 'flight_time_s',
        'tempo de voo': 'flight_time_s',
        'tempo de voo (s)': 'flight_time_s',
        
        # Contact time
        'contact time (s)': 'contact_time_s',
        'contact time': 'contact_time_s',
        'contacttime': 'contact_time_s',
        'contact_time_s': 'contact_time_s',
        'tc (s)': 'contact_time_s',
        'tc': 'contact_time_s',
        'tempo de contato': 'contact_time_s',
        'tempo de contato (s)': 'contact_time_s',
        
        # Jump height
        'height (cm)': 'jump_height_cm',
        'height': 'jump_height_cm',
        'jump height': 'jump_height_cm',
        'jumpheight': 'jump_height_cm',
        'altura (cm)': 'jump_height_cm',
        'altura': 'jump_height_cm',
        'h (cm)': 'jump_height_cm',
        
        # RSI
        'rsi': 'reactive_strength_index',
        'reactive strength index': 'reactive_strength_index',
        'indice de forca reativa': 'reactive_strength_index',
        'ifr': 'reactive_strength_index',
        
        # Stiffness
        'stiffness': 'leg_stiffness',
        'leg stiffness': 'leg_stiffness',
        'rigidez': 'leg_stiffness',
        
        # Power
        'power': 'peak_power_w',
        'peak power': 'peak_power_w',
        'potencia': 'peak_power_w',
        'power (w)': 'peak_power_w',
        
        # Date/time
        'date': 'jump_date',
        'data': 'jump_date',
        'datetime': 'jump_date',
        'test date': 'jump_date',
        
        'time': 'test_time',
        'hora': 'test_time',
        'horario': 'test_time',
        
        # Attempt
        'attempt': 'attempt_number',
        'trial': 'attempt_number',
        'rep': 'attempt_number',
        'tentativa': 'attempt_number',
        'numero': 'attempt_number',
        
        # Protocol
        'protocol': 'protocol',
        'protocolo': 'protocol',
        
        # Notes
        'notes': 'notes',
        'comments': 'notes',
        'obs': 'notes',
        'observacoes': 'notes',
        
        # Body mass
        'weight': 'body_mass_kg',
        'body weight': 'body_mass_kg',
        'peso': 'body_mass_kg',
        'massa': 'body_mass_kg',
    }
    
    # Axon Jump type mappings
    JUMP_TYPE_MAP: Dict[str, str] = {
        'cmj': 'CMJ',
        'countermovement': 'CMJ',
        'contramovimento': 'CMJ',
        'sj': 'SJ',
        'squat': 'SJ',
        'agachamento': 'SJ',
        'dj': 'DJ',
        'drop': 'DJ',
        'queda': 'DJ',
        'profundidade': 'DJ',
        'rj': 'RJ',
        'reactive': 'RJ',
        'reativo': 'RJ',
        'repetido': 'RJ',
        'abalakov': 'CMJ',
        'abk': 'CMJ',
    }
    
    def transform_value(self, field: str, value: Any) -> Any:
        """Transform Axon Jump specific values."""
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip()
            if value == '' or value.lower() in ['n/a', '-', '--', 'null']:
                return None
        
        # Transform jump type
        if field == 'jump_type':
            if isinstance(value, str):
                value_lower = value.lower().strip()
                return self.JUMP_TYPE_MAP.get(value_lower, value.upper())
            return value
        
        return super().transform_value(field, value)
    
    def map_row(self, raw_row: Dict[str, Any]) -> Dict[str, Any]:
        """Map Axon Jump row with additional processing."""
        result = super().map_row(raw_row)
        
        # Store leg stiffness in notes if present
        stiffness = result.pop('leg_stiffness', None)
        if stiffness:
            existing_notes = result.get('notes', '') or ''
            result['notes'] = f"{existing_notes} Leg Stiffness: {stiffness}".strip()
        
        # Combine date and time
        if 'jump_date' in result and 'test_time' in result:
            date_val = result.get('jump_date')
            time_val = result.get('test_time')
            
            if date_val and time_val:
                from datetime import datetime
                
                if isinstance(date_val, datetime):
                    if isinstance(time_val, str) and time_val.strip():
                        try:
                            time_parts = time_val.strip().split(':')
                            if len(time_parts) >= 2:
                                hour = int(time_parts[0])
                                minute = int(time_parts[1])
                                second = int(time_parts[2]) if len(time_parts) > 2 else 0
                                result['jump_date'] = date_val.replace(
                                    hour=hour, minute=minute, second=second
                                )
                        except (ValueError, IndexError):
                            pass
            
            result.pop('test_time', None)
        
        return result
