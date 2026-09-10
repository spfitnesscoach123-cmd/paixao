"""
GPS Import Module - Session Consolidator

Consolidates multiple CSV rows from a single activity into ONE document.
Prevents metric duplication when a CSV contains both session totals and period breakdowns.

Rules:
- If a SESSION_TOTAL row exists → use its values for summable metrics
- If no SESSION_TOTAL row → sum PERIOD values
- MAX metrics always take the maximum across all rows
- AVERAGE metrics use session total if available, else average of periods
- Periods are embedded as a sub-array for drill-down

Author: Sports Performance System
Version: 1.0.0
"""

import re
from typing import Dict, Any, List, Optional
from datetime import datetime


# ============================================================================
# METRIC CLASSIFICATION
# ============================================================================

SUMMABLE_METRICS = {
    "total_distance",
    "high_intensity_distance",
    "high_speed_running",
    "sprint_distance",
    "number_of_sprints",
    "number_of_accelerations",
    "number_of_decelerations",
    "player_load",
    "duration_minutes",
    "dynamic_stress_load",
}

MAX_METRICS = {
    "max_speed",
    "max_acceleration",
    "max_deceleration",
    "max_heart_rate",
}

AVERAGE_METRICS = {
    "avg_heart_rate",
    "metabolic_power",
    "player_load_per_minute",
}

# All numeric metrics that participate in consolidation
ALL_METRICS = SUMMABLE_METRICS | MAX_METRICS | AVERAGE_METRICS

# Fields copied from the base record (metadata, not aggregated)
METADATA_FIELDS = {
    "athlete_id", "coach_id", "session_id", "session_name", "date",
    "activity_type", "source", "device", "import_session_id",
    "imported_at", "created_at", "original_player_name",
}


# ============================================================================
# PERIOD NAME CLASSIFICATION
# ============================================================================

# Patterns that indicate a row is a SESSION TOTAL (case-insensitive, substring)
_SESSION_TOTAL_KEYWORDS = {
    "total", "full", "complete", "summary", "sessão", "sesión",
}

# Regex: "session" NOT followed by period/part/split indicators
_SESSION_KEYWORD_RE = re.compile(r"\bsession\b", re.IGNORECASE)
_PERIOD_QUALIFIER_RE = re.compile(r"(?:part|split|phase|period|half)\s*\d", re.IGNORECASE)

# Patterns that indicate a row is a PERIOD (substring or regex)
_PERIOD_KEYWORDS = {
    "half", "1st", "2nd", "3rd", "4th",
    "first half", "second half",
    "parte", "etapa",
}

_PERIOD_REGEX = re.compile(
    r"(?:"
    r"\d+[ºª]?\s*(?:tempo|half|period|part|split|phase|tiempo)"
    r"|(?:period|split|phase|part|tempo|half)\s*\d"
    r"|[12][tT]\b"
    r")",
    re.IGNORECASE,
)


def _classify_period_name(name: str) -> str:
    """
    Classify a period_name as 'session_total' or 'period'.

    Returns:
        'session_total' or 'period'
    """
    if not name:
        return "period"

    lower = name.lower().strip()

    # Check session total keywords
    for kw in _SESSION_TOTAL_KEYWORDS:
        if kw in lower:
            return "session_total"

    # Check "session" keyword (but not if it also has period qualifiers)
    if _SESSION_KEYWORD_RE.search(lower) and not _PERIOD_QUALIFIER_RE.search(lower):
        return "session_total"

    # Check period keywords
    for kw in _PERIOD_KEYWORDS:
        if kw in lower:
            return "period"

    # Check period regex
    if _PERIOD_REGEX.search(lower):
        return "period"

    # Default: treat as period (safe — will be summed, not used as total)
    return "period"


# ============================================================================
# CONSOLIDATOR
# ============================================================================

def consolidate_session(records: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Consolidate multiple normalized records from a single CSV into ONE document.

    Args:
        records: List of normalized GPS records (all from the same import/session).

    Returns:
        A single consolidated document, or None if no valid records.
    """
    if not records:
        return None

    # Single record — no consolidation needed
    if len(records) == 1:
        doc = dict(records[0])
        doc["periods"] = []
        doc["has_session_total"] = True
        return doc

    # Classify records
    session_totals: List[Dict[str, Any]] = []
    periods: List[Dict[str, Any]] = []

    for rec in records:
        classification = _classify_period_name(rec.get("period_name", ""))
        if classification == "session_total":
            session_totals.append(rec)
        else:
            periods.append(rec)

    has_session_total = len(session_totals) > 0

    # Build base document from metadata of the first record
    base = records[0]
    consolidated = {}

    for field in METADATA_FIELDS:
        if field in base:
            consolidated[field] = base[field]

    # --- Summable metrics ---
    for metric in SUMMABLE_METRICS:
        if has_session_total:
            # Use the session total's value (first session total row)
            consolidated[metric] = _first_value(session_totals, metric)
        else:
            # Sum all period values
            consolidated[metric] = _sum_values(periods, metric)

    # --- Max metrics ---
    for metric in MAX_METRICS:
        consolidated[metric] = _max_value(records, metric)

    # --- Average metrics ---
    for metric in AVERAGE_METRICS:
        if has_session_total:
            consolidated[metric] = _first_value(session_totals, metric)
        else:
            consolidated[metric] = _avg_values(periods, metric)

    # Embed period breakdown
    consolidated["periods"] = [_build_period_entry(r) for r in periods]
    consolidated["has_session_total"] = has_session_total

    # Remove None values and zero-only optional fields
    return {k: v for k, v in consolidated.items() if v is not None}


# ============================================================================
# HELPERS
# ============================================================================

def _first_value(records: List[Dict], metric: str) -> Any:
    """Get the value of a metric from the first record that has it."""
    for rec in records:
        val = rec.get(metric)
        if val is not None:
            return val
    return 0


def _sum_values(records: List[Dict], metric: str) -> float:
    """Sum a metric across all records."""
    return sum(rec.get(metric, 0) or 0 for rec in records)


def _max_value(records: List[Dict], metric: str) -> float:
    """Get the maximum value of a metric across all records."""
    values = [rec.get(metric, 0) or 0 for rec in records]
    return max(values) if values else 0


def _avg_values(records: List[Dict], metric: str) -> float:
    """Average a metric across records that have a non-zero value."""
    values = [rec.get(metric) for rec in records if rec.get(metric) is not None and rec.get(metric) != 0]
    if not values:
        return 0
    return round(sum(values) / len(values), 2)


def _build_period_entry(record: Dict[str, Any]) -> Dict[str, Any]:
    """Extract period-level data from a record for embedding."""
    entry = {"period_name": record.get("period_name", "Unknown")}
    for metric in ALL_METRICS:
        val = record.get(metric)
        if val is not None and val != 0:
            entry[metric] = val
    return entry
