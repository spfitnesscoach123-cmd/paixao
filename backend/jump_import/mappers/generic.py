"""
Generic Mapper
==============

Mapper for standard/generic CSV formats.
Supports common column naming conventions used across various systems.

This mapper serves as the default when no specific manufacturer is detected.
It includes aliases for common column name variations.
"""

from typing import Dict, Any
from .base import BaseMapper


class GenericMapper(BaseMapper):
    """
    Generic mapper for standard CSV formats.
    
    Supports multiple column name variations for each canonical field.
    """
    
    MANUFACTURER_NAME = "generic"
    
    # Comprehensive mapping including common aliases
    COLUMN_MAP: Dict[str, str] = {
        # Athlete ID variations
        'athlete_id': 'athlete_id',
        'athleteid': 'athlete_id',
        'athlete': 'athlete_id',
        'player_id': 'athlete_id',
        'playerid': 'athlete_id',
        'player': 'athlete_id',
        'id_atleta': 'athlete_id',
        'atleta_id': 'athlete_id',
        'subject_id': 'athlete_id',
        'subjectid': 'athlete_id',
        'subject': 'athlete_id',
        
        # External ID
        'athlete_external_id': 'athlete_external_id',
        'external_id': 'athlete_external_id',
        'externalid': 'athlete_external_id',
        'ext_id': 'athlete_external_id',
        
        # Athlete name (will be used for lookup if ID not provided)
        'athlete_name': 'athlete_name',
        'athletename': 'athlete_name',
        'name': 'athlete_name',
        'player_name': 'athlete_name',
        'playername': 'athlete_name',
        'nome': 'athlete_name',
        'nome_atleta': 'athlete_name',
        
        # Jump type variations
        'jump_type': 'jump_type',
        'jumptype': 'jump_type',
        'type': 'jump_type',
        'jump': 'jump_type',
        'tipo_salto': 'jump_type',
        'tipo': 'jump_type',
        'test_type': 'jump_type',
        'testtype': 'jump_type',
        
        # Jump height variations
        'jump_height_cm': 'jump_height_cm',
        'jumpheight': 'jump_height_cm',
        'jump_height': 'jump_height_cm',
        'height_cm': 'jump_height_cm',
        'height': 'jump_height_cm',
        'altura_cm': 'jump_height_cm',
        'altura': 'jump_height_cm',
        'jump_height_m': 'jump_height_m',  # Special: needs conversion
        'heightm': 'jump_height_m',
        
        # Flight time variations
        'flight_time_s': 'flight_time_s',
        'flighttime': 'flight_time_s',
        'flight_time': 'flight_time_s',
        'tv': 'flight_time_s',  # tempo de voo
        'tempo_voo': 'flight_time_s',
        'air_time': 'flight_time_s',
        'airtime': 'flight_time_s',
        'flight_time_ms': 'flight_time_ms',  # Special: needs conversion
        
        # Contact time variations
        'contact_time_s': 'contact_time_s',
        'contacttime': 'contact_time_s',
        'contact_time': 'contact_time_s',
        'tc': 'contact_time_s',  # tempo de contato
        'tempo_contato': 'contact_time_s',
        'ground_contact_time': 'contact_time_s',
        'gct': 'contact_time_s',
        'contact_time_ms': 'contact_time_ms',  # Special: needs conversion
        
        # RSI variations
        'reactive_strength_index': 'reactive_strength_index',
        'rsi': 'reactive_strength_index',
        'reactivestrengthindex': 'reactive_strength_index',
        'indice_reativo': 'reactive_strength_index',
        
        # Power variations
        'peak_power_w': 'peak_power_w',
        'peakpower': 'peak_power_w',
        'peak_power': 'peak_power_w',
        'power_w': 'peak_power_w',
        'power': 'peak_power_w',
        'potencia': 'peak_power_w',
        'potencia_pico': 'peak_power_w',
        'power_relative_w_kg': 'power_relative_w_kg',  # Special: relative power
        
        # Takeoff velocity
        'takeoff_velocity_m_s': 'takeoff_velocity_m_s',
        'takeoffvelocity': 'takeoff_velocity_m_s',
        'takeoff_velocity': 'takeoff_velocity_m_s',
        'velocity_m_s': 'takeoff_velocity_m_s',
        'velocity': 'takeoff_velocity_m_s',
        'velocidade_decolagem': 'takeoff_velocity_m_s',
        
        # Load/weight
        'load_kg': 'load_kg',
        'load': 'load_kg',
        'weight_kg': 'load_kg',
        'weight': 'load_kg',
        'carga': 'load_kg',
        'carga_kg': 'load_kg',
        'body_mass_kg': 'body_mass_kg',
        'bodymass': 'body_mass_kg',
        'body_weight': 'body_mass_kg',
        
        # Date/time variations
        'jump_date': 'jump_date',
        'date': 'jump_date',
        'test_date': 'jump_date',
        'testdate': 'jump_date',
        'data': 'jump_date',
        'data_teste': 'jump_date',
        'datetime': 'jump_date',
        'timestamp': 'jump_date',
        
        # Time of day (will be combined with date)
        'test_time': 'test_time',
        'time': 'test_time',
        'hora': 'test_time',
        'horario': 'test_time',
        
        # Attempt number
        'attempt_number': 'attempt_number',
        'attempt': 'attempt_number',
        'trial': 'attempt_number',
        'rep': 'attempt_number',
        'repetition': 'attempt_number',
        'numero_tentativa': 'attempt_number',
        'tentativa': 'attempt_number',
        
        # Test ID
        'test_id': 'test_id',
        'testid': 'test_id',
        'session_id': 'test_id',
        'sessionid': 'test_id',
        'id_teste': 'test_id',
        
        # Protocol
        'protocol': 'protocol',
        'test_protocol': 'protocol',
        'protocolo': 'protocol',
        
        # Notes
        'notes': 'notes',
        'comments': 'notes',
        'observations': 'notes',
        'obs': 'notes',
        'notas': 'notes',
        'observacoes': 'notes',
        
        # Device info
        'device_brand': 'device_brand',
        'brand': 'device_brand',
        'manufacturer': 'device_brand',
        'fabricante': 'device_brand',
        'device_model': 'device_model',
        'model': 'device_model',
        'device': 'device_model',
        'equipamento': 'device_model',
        
        # Operator
        'operator_name': 'operator_name',
        'operator': 'operator_name',
        'tester': 'operator_name',
        'avaliador': 'operator_name',
    }
    
    def transform_value(self, field: str, value: Any) -> Any:
        """
        Transform values with unit conversions for generic format.
        """
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip()
            if value == '':
                return None
        
        # Handle special conversions
        if field == 'jump_height_m':
            # Convert meters to centimeters
            float_val = self._to_float(value)
            if float_val is not None:
                return float_val * 100
            return None
        
        if field == 'flight_time_ms' or field == 'contact_time_ms':
            # Convert milliseconds to seconds
            float_val = self._to_float(value)
            if float_val is not None:
                return float_val / 1000
            return None
        
        if field == 'power_relative_w_kg':
            # Store relative power (will need body mass for absolute)
            return self._to_float(value)
        
        # Use base class transformation
        return super().transform_value(field, value)
    
    def map_row(self, raw_row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map row with additional handling for combined date/time fields.
        """
        result = super().map_row(raw_row)
        
        # Combine date and time if both present
        if 'jump_date' in result and 'test_time' in result:
            date_val = result.get('jump_date')
            time_val = result.get('test_time')
            
            if date_val and time_val:
                from datetime import datetime
                
                # If date is already datetime, combine with time string
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
                elif isinstance(date_val, str) and isinstance(time_val, str):
                    # Try to combine string date and time
                    try:
                        combined = f"{date_val.strip()} {time_val.strip()}"
                        result['jump_date'] = combined
                    except:
                        pass
            
            # Remove the separate time field
            result.pop('test_time', None)
        
        # Handle height conversion from meters
        if 'jump_height_m' in result and 'jump_height_cm' not in result:
            height_m = result.pop('jump_height_m')
            if height_m is not None:
                result['jump_height_cm'] = height_m  # Already converted in transform_value
        
        # Handle time conversion from milliseconds
        if 'flight_time_ms' in result and 'flight_time_s' not in result:
            result['flight_time_s'] = result.pop('flight_time_ms')
        
        if 'contact_time_ms' in result and 'contact_time_s' not in result:
            result['contact_time_s'] = result.pop('contact_time_ms')
        
        return result
