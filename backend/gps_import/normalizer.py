"""
GPS Import Module - Data Normalizer

Transforms parsed GPS data into the application's GPSData model,
performing unit conversions and field mapping.

Internal storage conventions (matching existing GPSData model):
- max_speed: stored in m/s
- distances: stored in meters
- counts: stored as integers

Author: Sports Performance System
Version: 1.1.0
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

from .canonical_metrics import CANONICAL_METRICS
from .manufacturer_aliases import Manufacturer


class GPSDataNormalizer:
    """
    Normalizes parsed GPS data into the application's internal GPSData model.
    """

    # Canonical metric → internal DB field name
    FIELD_MAPPING = {
        "total_distance_m": "total_distance",
        "high_intensity_distance_m": "high_intensity_distance",
        "high_speed_running_m": "high_speed_running",
        "sprint_distance_m": "sprint_distance",
        "max_speed_kmh": "max_speed",          # will convert km/h → m/s
        "max_speed_ms": "max_speed",            # already m/s
        "number_of_sprints": "number_of_sprints",
        "accelerations_count": "number_of_accelerations",
        "decelerations_count": "number_of_decelerations",
        "max_acceleration_ms2": "max_acceleration",
        "max_deceleration_ms2": "max_deceleration",
        "player_load": "player_load",
        "player_load_per_minute": "player_load_per_minute",
        "metabolic_power_avg": "metabolic_power",
        "dynamic_stress_load": "dynamic_stress_load",
        "session_duration_min": "duration_minutes",
        "heart_rate_avg": "avg_heart_rate",
        "heart_rate_max": "max_heart_rate",
        "player_name": "original_player_name",
        "period_name": "period_name",
        "session_date": "date",
    }

    # Fields that must be stored as integers
    INT_FIELDS = {"number_of_sprints", "number_of_accelerations", "number_of_decelerations"}

    def __init__(
        self,
        athlete_id: str,
        coach_id: str,
        session_name: str = None,
        manufacturer: Manufacturer = Manufacturer.UNKNOWN,
    ):
        self.athlete_id = athlete_id
        self.coach_id = coach_id
        self.session_name = session_name or f"Session {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        self.session_id = f"import_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{athlete_id[:8]}"
        self.manufacturer = manufacturer

    def normalize_records(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        normalized = []
        for idx, record in enumerate(records):
            result = self._normalize_single(record, idx)
            if result:
                normalized.append(result)
        return normalized

    def _normalize_single(self, record: Dict[str, Any], period_index: int = 0) -> Dict[str, Any]:
        doc = {
            "athlete_id": self.athlete_id,
            "coach_id": self.coach_id,
            "session_id": self.session_id,
            "session_name": self.session_name,
            "activity_type": "training",
            "source": f"csv_import_{self.manufacturer.value}",
            "device": self.manufacturer.value.title() if self.manufacturer != Manufacturer.UNKNOWN else "CSV",
            "import_session_id": self.session_id,
            "imported_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
        }

        # Track if max_speed already set (m/s takes priority over km/h)
        max_speed_set = False

        for canonical_name, internal_name in self.FIELD_MAPPING.items():
            if canonical_name not in record or record[canonical_name] is None:
                continue

            value = record[canonical_name]

            # String fields
            if canonical_name in ("player_name", "period_name", "session_date"):
                doc[internal_name] = str(value).strip() if value else None
                continue

            # Unit conversions
            if canonical_name == "max_speed_kmh":
                if max_speed_set:
                    continue
                value = round(float(value) / 3.6, 2)  # km/h → m/s
                max_speed_set = True
            elif canonical_name == "max_speed_ms":
                value = round(float(value), 2)
                max_speed_set = True

            # Integer casting
            if internal_name in self.INT_FIELDS:
                value = int(round(float(value)))
            elif isinstance(value, (int, float)):
                value = round(float(value), 2)

            doc[internal_name] = value

        # Date handling
        doc["date"] = self._extract_date(record)

        # Period name fallback
        if not doc.get("period_name"):
            doc["period_name"] = f"Period {period_index + 1}"

        # high_speed_running fallback → same as high_intensity_distance
        if doc.get("high_speed_running") is None and doc.get("high_intensity_distance") is not None:
            doc["high_speed_running"] = doc["high_intensity_distance"]

        # Apply defaults for missing required fields
        self._set_defaults(doc)

        # Discard rows with zero meaningful data
        if doc["total_distance"] == 0 and doc.get("high_intensity_distance", 0) == 0 and doc.get("number_of_sprints", 0) == 0:
            return None

        # Remove None values
        return {k: v for k, v in doc.items() if v is not None}

    def _extract_date(self, record: Dict[str, Any]) -> str:
        raw_date = record.get("session_date") or record.get("date")
        if not raw_date:
            return datetime.now().strftime("%Y-%m-%d")

        date_formats = [
            "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d",
            "%d-%m-%Y", "%d.%m.%Y",
            "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
            "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ",
        ]
        for fmt in date_formats:
            try:
                return datetime.strptime(str(raw_date).strip(), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return datetime.now().strftime("%Y-%m-%d")

    @staticmethod
    def _set_defaults(doc: Dict[str, Any]) -> None:
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
        for field, default in defaults.items():
            if field not in doc or doc[field] is None:
                doc[field] = default


def normalize_gps_data(
    records: List[Dict[str, Any]],
    athlete_id: str,
    coach_id: str,
    session_name: str = None,
    manufacturer: Manufacturer = Manufacturer.UNKNOWN,
) -> List[Dict[str, Any]]:
    """Convenience function to normalize parsed GPS records."""
    normalizer = GPSDataNormalizer(athlete_id, coach_id, session_name, manufacturer)
    return normalizer.normalize_records(records)
