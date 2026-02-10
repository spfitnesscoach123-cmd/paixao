"""
GPS Import Module - Data Normalizer

Transforms parsed GPS data into the application's data model,
performing final normalization and unit conversions.

Author: Sports Performance System
Version: 1.0.0
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, date
import uuid
import re

from .canonical_metrics import CANONICAL_METRICS, MetricUnit


class GPSDataNormalizer:
    """
    Normalizes parsed GPS data into the application's internal data model.
    
    Handles:
    - Unit conversions
    - Field renaming to match internal schema
    - Default value assignment
    - Session/period grouping
    """
    
    # Mapping from canonical metric names to internal database field names
    FIELD_MAPPING = {
        "total_distance_m": "total_distance",
        "high_intensity_distance_m": "high_intensity_distance",
        "high_speed_running_m": "high_speed_running",
        "sprint_distance_m": "sprint_distance",
        "max_speed_kmh": "max_speed",
        "max_speed_ms": "max_speed_ms",
        "average_speed_kmh": "average_speed",
        "number_of_sprints": "number_of_sprints",
        "accelerations_count": "number_of_accelerations",
        "decelerations_count": "number_of_decelerations",
        "max_acceleration_ms2": "max_acceleration",
        "max_deceleration_ms2": "max_deceleration",
        "player_load": "player_load",
        "session_duration_min": "duration_minutes",
        "player_name": "player_name",
        "period_name": "period_name",
        "session_date": "date",
    }
    
    def __init__(self, athlete_id: str, coach_id: str, session_name: str = None):
        """
        Initialize the normalizer.
        
        Args:
            athlete_id: ID of the athlete this data belongs to
            coach_id: ID of the coach uploading the data
            session_name: Optional name for the session
        """
        self.athlete_id = athlete_id
        self.coach_id = coach_id
        self.session_name = session_name or f"Session {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        self.session_id = f"session_{int(datetime.now().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}"
    
    def normalize_records(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Normalize a list of parsed records into internal format.
        
        Args:
            records: List of records from the CSV parser
            
        Returns:
            List of normalized records ready for database insertion
        """
        normalized = []
        
        for idx, record in enumerate(records):
            normalized_record = self.normalize_single_record(record, idx)
            if normalized_record:
                normalized.append(normalized_record)
        
        return normalized
    
    def normalize_single_record(self, record: Dict[str, Any], period_index: int = 0) -> Dict[str, Any]:
        """
        Normalize a single record.
        
        Args:
            record: A single parsed record from the CSV
            period_index: Index of this period within the session
            
        Returns:
            Normalized record dictionary
        """
        normalized = {
            "athlete_id": self.athlete_id,
            "coach_id": self.coach_id,
            "session_id": self.session_id,
            "session_name": self.session_name,
            "created_at": datetime.utcnow(),
            "activity_type": "training",  # Default, can be updated later
        }
        
        # Map canonical fields to internal fields
        for canonical_name, internal_name in self.FIELD_MAPPING.items():
            if canonical_name in record and record[canonical_name] is not None:
                value = record[canonical_name]
                
                # Apply any necessary conversions
                value = self._convert_value(canonical_name, value)
                
                normalized[internal_name] = value
        
        # Handle date
        normalized["date"] = self._extract_date(record)
        
        # Handle period name
        if "period_name" not in normalized or not normalized.get("period_name"):
            normalized["period_name"] = f"Period {period_index + 1}"
        
        # Set defaults for missing metrics
        normalized = self._set_defaults(normalized)
        
        return normalized
    
    def _convert_value(self, canonical_name: str, value: Any) -> Any:
        """
        Apply any necessary unit conversions.
        
        Args:
            canonical_name: The canonical metric name
            value: The value to convert
            
        Returns:
            Converted value
        """
        metric_def = CANONICAL_METRICS.get(canonical_name)
        if not metric_def:
            return value
        
        # Convert m/s to km/h if needed
        if canonical_name == "max_speed_ms" and value is not None:
            # We store as km/h internally for consistency
            return value * 3.6
        
        return value
    
    def _extract_date(self, record: Dict[str, Any]) -> str:
        """
        Extract and format the date from a record.
        
        Args:
            record: The parsed record
            
        Returns:
            Date string in YYYY-MM-DD format
        """
        raw_date = record.get("session_date") or record.get("date")
        
        if not raw_date:
            return datetime.now().strftime("%Y-%m-%d")
        
        # Try various date formats
        date_formats = [
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%m/%d/%Y",
            "%Y/%m/%d",
            "%d-%m-%Y",
            "%d.%m.%Y",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S",
        ]
        
        for fmt in date_formats:
            try:
                parsed = datetime.strptime(str(raw_date).strip(), fmt)
                return parsed.strftime("%Y-%m-%d")
            except ValueError:
                continue
        
        # If all parsing fails, return today
        return datetime.now().strftime("%Y-%m-%d")
    
    def _set_defaults(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Set default values for missing metrics.
        
        Args:
            record: The normalized record
            
        Returns:
            Record with defaults filled in
        """
        defaults = {
            "total_distance": 0,
            "high_intensity_distance": 0,
            "high_speed_running": 0,
            "sprint_distance": 0,
            "number_of_sprints": 0,
            "number_of_accelerations": 0,
            "number_of_decelerations": 0,
            "max_speed": 0,
            "max_acceleration": 0,
            "max_deceleration": 0,
        }
        
        for field, default_value in defaults.items():
            if field not in record or record[field] is None:
                record[field] = default_value
        
        return record


def normalize_gps_data(
    records: List[Dict[str, Any]],
    athlete_id: str,
    coach_id: str,
    session_name: str = None
) -> List[Dict[str, Any]]:
    """
    Convenience function to normalize GPS data.
    
    Args:
        records: Parsed records from the CSV parser
        athlete_id: ID of the athlete
        coach_id: ID of the coach
        session_name: Optional session name
        
    Returns:
        List of normalized records
    """
    normalizer = GPSDataNormalizer(athlete_id, coach_id, session_name)
    return normalizer.normalize_records(records)
