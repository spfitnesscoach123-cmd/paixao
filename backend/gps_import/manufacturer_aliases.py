"""
GPS Import Module - Manufacturer Column Aliases

This module defines the mapping layer that translates manufacturer-specific
column names into canonical metrics. Each manufacturer has its own naming
conventions, and this mapping allows the system to normalize data from any
supported device.

Supported Manufacturers:
- Catapult (Vector, Optimeye)
- STATSports (Apex, Apex Pro)
- PlayerTek
- GPEXE

Author: Sports Performance System
Version: 1.0.0
"""

from typing import Dict, List, Set
from enum import Enum


class Manufacturer(str, Enum):
    """Supported GPS device manufacturers"""
    CATAPULT = "catapult"
    STATSPORTS = "statsports"
    PLAYERTEK = "playertek"
    GPEXE = "gpexe"
    UNKNOWN = "unknown"


# =============================================================================
# MANUFACTURER COLUMN ALIASES
# =============================================================================
# Each canonical metric maps to a list of possible column names for each manufacturer.
# The order in the list represents priority (first match wins).
# All aliases are stored in lowercase for case-insensitive matching.

MANUFACTURER_ALIASES: Dict[str, Dict[Manufacturer, List[str]]] = {
    # =========================================================================
    # DISTANCE METRICS
    # =========================================================================
    "total_distance_m": {
        Manufacturer.CATAPULT: [
            "total distance",
            "total distance (m)",
            "distance",
            "total_distance",
            "tot dist",
            "distance total",
            "dist"
        ],
        Manufacturer.STATSPORTS: [
            "total distance (m)",
            "total distance",
            "distance total",
            "distance",
            "total_distance_m",
            "dist (m)"
        ],
        Manufacturer.PLAYERTEK: [
            "total distance",
            "td",
            "distance",
            "total distance (m)",
            "total_distance",
            "totaldistance"
        ],
        Manufacturer.GPEXE: [
            "totdist",
            "totaldist",
            "total_dist",
            "distance_m",
            "dist_tot",
            "total distance"
        ],
    },
    
    "high_intensity_distance_m": {
        Manufacturer.CATAPULT: [
            "high intensity distance",
            "hid",
            "hi distance",
            "high intensity running",
            "zone 3 distance",
            "z3 distance",
            "hir distance",
            "high intensity (m)"
        ],
        Manufacturer.STATSPORTS: [
            "hsr (15-20 km/h)",
            "hsr distance",
            "high speed running",
            "zone 3",
            "z3",
            "hid (m)",
            "high intensity distance",
            "hsr zone 3"
        ],
        Manufacturer.PLAYERTEK: [
            "high intensity distance",
            "hi distance",
            "hid",
            "zone 3 distance",
            "high speed running",
            "high speed running distance",
            "hsr",
            "hsr distance"
        ],
        Manufacturer.GPEXE: [
            "hir",
            "high_int_dist",
            "z3_dist",
            "hid",
            "hi_dist"
        ],
    },
    
    "high_speed_running_m": {
        Manufacturer.CATAPULT: [
            "high speed running",
            "hsr",
            "hsr distance",
            "zone 4 distance",
            "z4 distance",
            "very high intensity",
            "vhi distance"
        ],
        Manufacturer.STATSPORTS: [
            "hsr (20-25 km/h)",
            "very high speed running",
            "vhsr distance",
            "zone 4",
            "z4",
            "hsr (m)",
            "high speed running distance"
        ],
        Manufacturer.PLAYERTEK: [
            "high speed running",
            "hsr",
            "zone 4 distance",
            "very high intensity",
            "vhi"
        ],
        Manufacturer.GPEXE: [
            "hsr",
            "vhir",
            "z4_dist",
            "high_speed_dist",
            "vhi_dist"
        ],
    },
    
    "sprint_distance_m": {
        Manufacturer.CATAPULT: [
            "sprint distance",
            "sprinting distance",
            "zone 5 distance",
            "z5 distance",
            "sprint dist",
            "distance at sprint speed"
        ],
        Manufacturer.STATSPORTS: [
            "sprint distance (m)",
            "sprinting (>25 km/h)",
            "sprint dist",
            "zone 5",
            "z5",
            "sprint (m)",
            "sprint distance"
        ],
        Manufacturer.PLAYERTEK: [
            "sprint distance",
            "sprinting",
            "zone 5 distance",
            "sprint dist",
            "sprints distance"
        ],
        Manufacturer.GPEXE: [
            "sprint_dist",
            "z5_dist",
            "sprinting",
            "sp_dist",
            "sprint"
        ],
    },
    
    # =========================================================================
    # SPEED METRICS
    # =========================================================================
    "max_speed_kmh": {
        Manufacturer.CATAPULT: [
            "max velocity",
            "maximum velocity",
            "max speed",
            "maximum speed",
            "peak velocity",
            "top speed",
            "max vel (km/h)",
            "max speed (km/h)"
        ],
        Manufacturer.STATSPORTS: [
            "max speed (km/h)",
            "top speed",
            "peak speed",
            "maximum speed",
            "max velocity",
            "max speed"
        ],
        Manufacturer.PLAYERTEK: [
            "max speed",
            "top speed",
            "maximum speed",
            "peak speed",
            "max velocity"
        ],
        Manufacturer.GPEXE: [
            "max_speed",
            "peak_speed",
            "vmax",
            "top_speed",
            "maxvel"
        ],
    },
    
    "max_speed_ms": {
        Manufacturer.CATAPULT: [
            "max velocity (m/s)",
            "max speed (m/s)",
            "peak velocity (m/s)"
        ],
        Manufacturer.STATSPORTS: [
            "max speed (m/s)",
            "max velocity (m/s)"
        ],
        Manufacturer.PLAYERTEK: [
            "max speed (m/s)"
        ],
        Manufacturer.GPEXE: [
            "max_speed_ms",
            "vmax_ms"
        ],
    },
    
    "average_speed_kmh": {
        Manufacturer.CATAPULT: [
            "average velocity",
            "avg velocity",
            "avg speed",
            "average speed",
            "mean velocity",
            "mean speed"
        ],
        Manufacturer.STATSPORTS: [
            "average speed",
            "avg speed",
            "mean speed",
            "average velocity"
        ],
        Manufacturer.PLAYERTEK: [
            "average speed",
            "avg speed",
            "mean speed"
        ],
        Manufacturer.GPEXE: [
            "avg_speed",
            "mean_speed",
            "average_vel"
        ],
    },
    
    # =========================================================================
    # SPRINT & EFFORT COUNTS
    # =========================================================================
    "number_of_sprints": {
        Manufacturer.CATAPULT: [
            "sprint efforts",
            "sprints",
            "sprint count",
            "number of sprints",
            "# sprints",
            "sprint number",
            "no. sprints"
        ],
        Manufacturer.STATSPORTS: [
            "number of sprints",
            "sprints",
            "sprint count",
            "sprint efforts",
            "no. of sprints",
            "# sprints"
        ],
        Manufacturer.PLAYERTEK: [
            "sprints",
            "number of sprints",
            "sprint count",
            "sprint efforts"
        ],
        Manufacturer.GPEXE: [
            "n_sprints",
            "sprints",
            "sprint_count",
            "num_sprints"
        ],
    },
    
    "accelerations_count": {
        Manufacturer.CATAPULT: [
            "accelerations",
            "accel count",
            "acc",
            "number of accelerations",
            "# accelerations",
            "accel efforts",
            "acceleration count",
            "high accelerations"
        ],
        Manufacturer.STATSPORTS: [
            "accelerations",
            "acc",
            "number of accelerations",
            "accel",
            "high accelerations",
            "acceleration count"
        ],
        Manufacturer.PLAYERTEK: [
            "accelerations",
            "acc",
            "accel count",
            "number of accelerations"
        ],
        Manufacturer.GPEXE: [
            "acc",
            "accelerations",
            "n_acc",
            "acc_count"
        ],
    },
    
    "decelerations_count": {
        Manufacturer.CATAPULT: [
            "decelerations",
            "decel count",
            "dec",
            "number of decelerations",
            "# decelerations",
            "decel efforts",
            "deceleration count",
            "high decelerations"
        ],
        Manufacturer.STATSPORTS: [
            "decelerations",
            "dec",
            "number of decelerations",
            "decel",
            "high decelerations",
            "deceleration count"
        ],
        Manufacturer.PLAYERTEK: [
            "decelerations",
            "dec",
            "decel count",
            "number of decelerations"
        ],
        Manufacturer.GPEXE: [
            "dec",
            "decelerations",
            "n_dec",
            "dec_count"
        ],
    },
    
    # =========================================================================
    # ACCELERATION METRICS
    # =========================================================================
    "max_acceleration_ms2": {
        Manufacturer.CATAPULT: [
            "max acceleration",
            "peak acceleration",
            "max accel",
            "maximum acceleration"
        ],
        Manufacturer.STATSPORTS: [
            "max acceleration",
            "peak acceleration",
            "max accel (m/s²)"
        ],
        Manufacturer.PLAYERTEK: [
            "max acceleration",
            "peak acceleration"
        ],
        Manufacturer.GPEXE: [
            "max_acc",
            "peak_acc",
            "acc_max"
        ],
    },
    
    "max_deceleration_ms2": {
        Manufacturer.CATAPULT: [
            "max deceleration",
            "peak deceleration",
            "max decel",
            "maximum deceleration"
        ],
        Manufacturer.STATSPORTS: [
            "max deceleration",
            "peak deceleration",
            "max decel (m/s²)"
        ],
        Manufacturer.PLAYERTEK: [
            "max deceleration",
            "peak deceleration"
        ],
        Manufacturer.GPEXE: [
            "max_dec",
            "peak_dec",
            "dec_max"
        ],
    },
    
    # =========================================================================
    # LOAD METRICS
    # =========================================================================
    "player_load": {
        Manufacturer.CATAPULT: [
            "player load",
            "playerload",
            "pl",
            "total player load",
            "accumulated player load"
        ],
        Manufacturer.STATSPORTS: [
            "dynamic stress load",
            "dsl",
            "total load",
            "training load"
        ],
        Manufacturer.PLAYERTEK: [
            "player load",
            "load",
            "total load",
            "activity load"
        ],
        Manufacturer.GPEXE: [
            "power_events",
            "load",
            "training_load",
            "mechanical_load"
        ],
    },
    
    "player_load_per_minute": {
        Manufacturer.CATAPULT: [
            "player load per minute",
            "pl/min",
            "playerload/min",
            "player load / min"
        ],
        Manufacturer.STATSPORTS: [
            "dsl/min",
            "load/min",
            "training load per minute"
        ],
        Manufacturer.PLAYERTEK: [
            "load/min",
            "player load per minute"
        ],
        Manufacturer.GPEXE: [
            "load_per_min",
            "load/min"
        ],
    },
    
    "metabolic_power_avg": {
        Manufacturer.CATAPULT: [
            "metabolic power",
            "avg metabolic power",
            "metpower",
            "met power"
        ],
        Manufacturer.STATSPORTS: [
            "metabolic power",
            "avg metabolic power",
            "met power (w/kg)"
        ],
        Manufacturer.PLAYERTEK: [
            "metabolic power",
            "met power"
        ],
        Manufacturer.GPEXE: [
            "met_power",
            "metabolic_power_avg",
            "p_met"
        ],
    },
    
    # =========================================================================
    # TIME METRICS
    # =========================================================================
    "session_duration_min": {
        Manufacturer.CATAPULT: [
            "duration",
            "session duration",
            "time",
            "total time",
            "duration (min)",
            "session time"
        ],
        Manufacturer.STATSPORTS: [
            "duration (min)",
            "session duration",
            "total duration",
            "time (min)",
            "activity duration"
        ],
        Manufacturer.PLAYERTEK: [
            "duration",
            "session duration",
            "time",
            "total time"
        ],
        Manufacturer.GPEXE: [
            "duration",
            "time_min",
            "session_time",
            "tot_time"
        ],
    },
    
    # =========================================================================
    # PLAYER/ATHLETE IDENTIFICATION
    # =========================================================================
    "player_name": {
        Manufacturer.CATAPULT: [
            "athlete",
            "athlete name",
            "player",
            "player name",
            "name",
            "athlete id"
        ],
        Manufacturer.STATSPORTS: [
            "player name",
            "player",
            "athlete",
            "name",
            "athlete name"
        ],
        Manufacturer.PLAYERTEK: [
            "player",
            "player name",
            "athlete",
            "name"
        ],
        Manufacturer.GPEXE: [
            "athlete",
            "player",
            "name",
            "player_name"
        ],
    },
    
    "period_name": {
        Manufacturer.CATAPULT: [
            "period",
            "period name",
            "drill",
            "drill name",
            "activity",
            "activity name",
            "split name",
            "split"
        ],
        Manufacturer.STATSPORTS: [
            "period",
            "drill",
            "activity",
            "activity name",
            "period name",
            "session part"
        ],
        Manufacturer.PLAYERTEK: [
            "period",
            "activity",
            "drill",
            "period name"
        ],
        Manufacturer.GPEXE: [
            "period",
            "drill",
            "activity",
            "phase"
        ],
    },
    
    "session_date": {
        Manufacturer.CATAPULT: [
            "date",
            "session date",
            "start time",
            "start date",
            "timestamp"
        ],
        Manufacturer.STATSPORTS: [
            "date",
            "session date",
            "activity date",
            "start date"
        ],
        Manufacturer.PLAYERTEK: [
            "date",
            "session date",
            "activity date"
        ],
        Manufacturer.GPEXE: [
            "date",
            "session_date",
            "start_date"
        ],
    },
}


# =============================================================================
# DETECTION SIGNATURES
# =============================================================================
# These are column names that are unique or highly specific to each manufacturer.
# Used for auto-detection of the data source.

MANUFACTURER_SIGNATURES: Dict[Manufacturer, Set[str]] = {
    Manufacturer.CATAPULT: {
        "player load",
        "playerload",
        "pl",
        "ima",
        "ima accel",
        "ima decel",
        "velocity band",
        "odometer"
    },
    Manufacturer.STATSPORTS: {
        "dynamic stress load",
        "dsl",
        "hsr (15-20 km/h)",
        "hsr (20-25 km/h)",
        "sprint (>25 km/h)",
        "step balance",
        "step count"
    },
    Manufacturer.PLAYERTEK: {
        "playertek",
        "activity id",
        "total energy",
        "energy per minute"
    },
    Manufacturer.GPEXE: {
        "gpexe",
        "external load",
        "power events",
        "equivalent distance",
        "eqdist"
    },
}


def get_canonical_aliases(canonical_metric: str, manufacturer: Manufacturer) -> List[str]:
    """
    Get the list of column aliases for a canonical metric and manufacturer.
    
    Args:
        canonical_metric: The canonical metric name
        manufacturer: The manufacturer enum value
        
    Returns:
        List of possible column names (lowercase)
    """
    metric_aliases = MANUFACTURER_ALIASES.get(canonical_metric, {})
    return metric_aliases.get(manufacturer, [])


def get_all_aliases_for_metric(canonical_metric: str) -> List[str]:
    """
    Get all possible column aliases for a canonical metric across all manufacturers.
    
    Args:
        canonical_metric: The canonical metric name
        
    Returns:
        Flat list of all possible column names (lowercase)
    """
    metric_aliases = MANUFACTURER_ALIASES.get(canonical_metric, {})
    all_aliases = []
    for manufacturer_aliases in metric_aliases.values():
        all_aliases.extend(manufacturer_aliases)
    return list(set(all_aliases))  # Remove duplicates


def detect_manufacturer_from_columns(columns: List[str]) -> Manufacturer:
    """
    Attempt to detect the manufacturer based on column names.
    
    Args:
        columns: List of column names from the CSV (will be normalized internally)
        
    Returns:
        Detected Manufacturer enum value
    """
    # Normalize columns for comparison
    normalized_columns = set(col.lower().strip() for col in columns)
    
    # Score each manufacturer based on signature matches
    scores: Dict[Manufacturer, int] = {m: 0 for m in Manufacturer if m != Manufacturer.UNKNOWN}
    
    for manufacturer, signatures in MANUFACTURER_SIGNATURES.items():
        for sig in signatures:
            if sig.lower() in normalized_columns:
                scores[manufacturer] += 1
    
    # Bonus: if the manufacturer's own name appears as a column value, give strong weight
    name_bonus = {
        Manufacturer.CATAPULT: {"catapult"},
        Manufacturer.STATSPORTS: {"statsports", "apex"},
        Manufacturer.PLAYERTEK: {"playertek"},
        Manufacturer.GPEXE: {"gpexe"},
    }
    for manufacturer, names in name_bonus.items():
        if names & normalized_columns:
            scores[manufacturer] += 5  # Strong signal
    
    # Find manufacturer with highest score
    best_manufacturer = max(scores, key=scores.get)
    
    if scores[best_manufacturer] > 0:
        return best_manufacturer
    
    return Manufacturer.UNKNOWN


def build_column_mapping(columns: List[str], manufacturer: Manufacturer = None) -> Dict[str, str]:
    """
    Build a mapping from original column names to canonical metric names.
    
    Args:
        columns: List of original column names from CSV
        manufacturer: Optional manufacturer hint (if None, will try to auto-detect)
        
    Returns:
        Dict mapping original column names to canonical metric names
    """
    # Detect manufacturer if not provided
    if manufacturer is None:
        manufacturer = detect_manufacturer_from_columns(columns)
    
    # Normalize columns for matching
    normalized_to_original = {col.lower().strip(): col for col in columns}
    
    mapping = {}
    
    for canonical_name, aliases_by_manufacturer in MANUFACTURER_ALIASES.items():
        # Get aliases for detected manufacturer (or all if unknown)
        if manufacturer != Manufacturer.UNKNOWN:
            aliases = aliases_by_manufacturer.get(manufacturer, [])
        else:
            # If unknown, try all aliases from all manufacturers
            aliases = get_all_aliases_for_metric(canonical_name)
        
        # Try to match
        for alias in aliases:
            normalized_alias = alias.lower().strip()
            if normalized_alias in normalized_to_original:
                original_col = normalized_to_original[normalized_alias]
                mapping[original_col] = canonical_name
                break  # Stop at first match
    
    return mapping
