"""
Base Mapper Class
=================

Abstract base class for manufacturer-specific column mappers.
All mappers must extend this class and implement the required methods.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime


class BaseMapper(ABC):
    """
    Base class for manufacturer column mappers.
    
    Each manufacturer mapper must:
    1. Define COLUMN_MAP: Dict mapping manufacturer columns to canonical names
    2. Define MANUFACTURER_NAME: String identifier for the manufacturer
    3. Optionally override value transformation methods
    """
    
    # Override in subclass: manufacturer identifier
    MANUFACTURER_NAME: str = "base"
    
    # Override in subclass: mapping from manufacturer columns to canonical columns
    # Format: {'manufacturer_column': 'canonical_column'}
    COLUMN_MAP: Dict[str, str] = {}
    
    # Canonical field names with expected types
    CANONICAL_FIELDS = {
        'athlete_id': str,
        'athlete_external_id': str,
        'jump_type': str,
        'jump_height_cm': float,
        'flight_time_s': float,
        'contact_time_s': float,
        'reactive_strength_index': float,
        'peak_power_w': float,
        'takeoff_velocity_m_s': float,
        'load_kg': float,
        'jump_date': datetime,
        'source_system': str,
        'attempt_number': int,
        'test_id': str,
        'protocol': str,
        'notes': str,
    }
    
    def __init__(self):
        """Initialize mapper with reverse lookup table."""
        # Create case-insensitive lookup
        self._column_lookup: Dict[str, str] = {}
        for mfr_col, canonical_col in self.COLUMN_MAP.items():
            self._column_lookup[mfr_col.lower().strip()] = canonical_col
    
    def map_row(self, raw_row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map a raw CSV row to canonical field names.
        
        Args:
            raw_row: Dictionary with manufacturer column names
            
        Returns:
            Dictionary with canonical column names
        """
        result = {}
        
        for raw_key, raw_value in raw_row.items():
            # Normalize key for lookup
            key_normalized = raw_key.lower().strip()
            
            # Find canonical column name
            canonical_key = self._column_lookup.get(key_normalized)
            
            if canonical_key:
                # Transform value if needed
                transformed_value = self.transform_value(canonical_key, raw_value)
                result[canonical_key] = transformed_value
            else:
                # Try exact match with canonical field names
                if key_normalized in [k.lower() for k in self.CANONICAL_FIELDS.keys()]:
                    # Find the properly cased canonical name
                    for canonical_name in self.CANONICAL_FIELDS.keys():
                        if canonical_name.lower() == key_normalized:
                            transformed_value = self.transform_value(canonical_name, raw_value)
                            result[canonical_name] = transformed_value
                            break
        
        # Add source system
        if 'source_system' not in result or not result.get('source_system'):
            result['source_system'] = self.MANUFACTURER_NAME
        
        return result
    
    def transform_value(self, field: str, value: Any) -> Any:
        """
        Transform a value for a specific field.
        
        Override in subclass for manufacturer-specific transformations.
        
        Args:
            field: Canonical field name
            value: Raw value from CSV
            
        Returns:
            Transformed value
        """
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip()
            if value == '':
                return None
        
        # Apply type-specific transformations
        expected_type = self.CANONICAL_FIELDS.get(field)
        
        if expected_type == float:
            return self._to_float(value)
        elif expected_type == int:
            return self._to_int(value)
        elif expected_type == datetime:
            return self._to_datetime(value)
        
        return value
    
    def _to_float(self, value: Any) -> Optional[float]:
        """Convert value to float, returning None for empty/invalid."""
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip().replace(',', '.')
            if value == '':
                return None
            try:
                return float(value)
            except ValueError:
                return None
        
        if isinstance(value, (int, float)):
            return float(value)
        
        return None
    
    def _to_int(self, value: Any) -> Optional[int]:
        """Convert value to int, returning None for empty/invalid."""
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip()
            if value == '':
                return None
            try:
                return int(float(value))
            except ValueError:
                return None
        
        if isinstance(value, (int, float)):
            return int(value)
        
        return None
    
    def _to_datetime(self, value: Any) -> Optional[datetime]:
        """Convert value to datetime."""
        if value is None:
            return None
        
        if isinstance(value, datetime):
            return value
        
        if isinstance(value, str):
            value = value.strip()
            if value == '':
                return None
            
            # Try common formats
            formats = [
                '%Y-%m-%d',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M:%S.%f',
                '%d/%m/%Y',
                '%d/%m/%Y %H:%M:%S',
                '%m/%d/%Y',
                '%d-%m-%Y',
            ]
            
            for fmt in formats:
                try:
                    return datetime.strptime(value, fmt)
                except ValueError:
                    continue
        
        return None
    
    @classmethod
    def get_required_columns(cls) -> List[str]:
        """
        Get list of required columns for this manufacturer.
        
        Returns:
            List of manufacturer column names that map to required fields
        """
        required_canonical = {'athlete_id', 'jump_type', 'jump_date'}
        required_columns = []
        
        for mfr_col, canonical_col in cls.COLUMN_MAP.items():
            if canonical_col in required_canonical:
                required_columns.append(mfr_col)
        
        return required_columns
    
    @classmethod
    def get_column_info(cls) -> Dict[str, Dict[str, str]]:
        """
        Get information about all supported columns.
        
        Returns:
            Dict with column name -> {canonical, type, description}
        """
        info = {}
        for mfr_col, canonical_col in cls.COLUMN_MAP.items():
            expected_type = cls.CANONICAL_FIELDS.get(canonical_col, str)
            info[mfr_col] = {
                'canonical': canonical_col,
                'type': expected_type.__name__,
            }
        return info
