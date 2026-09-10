"""
GPS Import Module - Multi-Manufacturer CSV Import Pipeline

Supports: Catapult, STATSports, PlayerTek, GPEXE
"""

from .csv_parser import GPSCSVParser, parse_gps_csv, ParseResult
from .normalizer import GPSDataNormalizer, normalize_gps_data
from .consolidator import consolidate_session
from .manufacturer_aliases import Manufacturer, detect_manufacturer_from_columns, build_column_mapping
from .canonical_metrics import CANONICAL_METRICS, REQUIRED_METRICS, METRIC_CATEGORIES

__all__ = [
    "GPSCSVParser",
    "parse_gps_csv",
    "ParseResult",
    "GPSDataNormalizer",
    "normalize_gps_data",
    "consolidate_session",
    "Manufacturer",
    "detect_manufacturer_from_columns",
    "build_column_mapping",
    "CANONICAL_METRICS",
    "REQUIRED_METRICS",
    "METRIC_CATEGORIES",
]
