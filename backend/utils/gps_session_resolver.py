"""
GPS Session Resolver — Etapa 1 (operational / visual read-path only).

Single, central, pure function that resolves which GPS records of a given
session (already grouped upstream by the caller) should be treated as the
"session total" source of truth.

This module is intentionally:
    - pure (no IO, no DB, no logging, no mutation, no side effects)
    - decoupled from `utils/load_calculations.py` (keyword constants are
      duplicated here on purpose during Etapa 1; consolidation is deferred
      to Etapa 2 to avoid coupling/circularity with scientific code)
    - agnostic to the `record_type` vocabulary (any truthy value is treated
      as explicit coach intent — see P2)

Resolution priority (strict order):

    P1: any record with record_type == "session_total"
        → returns the FIRST such record (single-element list)

    P2: no P1 match AND any record has a truthy record_type
        → returns ONLY the records with a truthy record_type
        → legacy keyword heuristics are IGNORED

    P3: no P1/P2 match AND any record has has_session_total == True
        → returns the FIRST such record (single-element list)

    P4: no P1/P2/P3 match AND legacy keyword match succeeds
        → "session-total" record = has a session keyword AND NOT a period keyword
        → returns the FIRST such record (single-element list)

    P5: fallback — returns all records (caller sums them)

The caller is responsible for:
    - grouping records by (date, session_name) (or session_id, depending on
      the endpoint shape) BEFORE invoking this resolver
    - iterating the returned subset and computing whatever metrics they need
    - guaranteeing a stable, deterministic iteration order for "first
      encountered" semantics
"""

from typing import List, Dict, Any, Optional


# ---------------------------------------------------------------------------
# Legacy keyword sets (duplicated on purpose during Etapa 1 — see module docstring)
# ---------------------------------------------------------------------------
_LEGACY_SESSION_KEYWORDS = {
    "session", "total", "full", "complete", "summary", "sessão",
}
_LEGACY_PERIOD_KEYWORDS = {
    "half", "1st", "2nd", "period", "split", "tempo", "parte",
}


# ---------------------------------------------------------------------------
# Predicates (kept separate to prevent drift / improve testability)
# ---------------------------------------------------------------------------
def _is_explicit_session_total(record: Dict[str, Any]) -> bool:
    """P1 predicate: record_type is exactly the canonical "session_total" string."""
    if not isinstance(record, dict):
        return False
    return record.get("record_type") == "session_total"


def _has_explicit_record_types(records: List[Dict[str, Any]]) -> bool:
    """P2 predicate (collection-level): at least one record has a truthy record_type.

    Truthy includes any non-empty string. None / missing / "" are NOT truthy.
    Agnostic to the vocabulary: any value the coach explicitly set counts.
    """
    if not records:
        return False
    for r in records:
        if isinstance(r, dict) and r.get("record_type"):
            return True
    return False


def _is_consolidated_session_total(record: Dict[str, Any]) -> bool:
    """P3 predicate: has_session_total flag set to True (boolean strict)."""
    if not isinstance(record, dict):
        return False
    return record.get("has_session_total") is True


def _is_legacy_session_keyword(record: Dict[str, Any]) -> bool:
    """P4 predicate (positive side): period_name contains a session keyword
    AND does NOT contain any period keyword. Mirrors the legacy inline
    behaviour of A/B/C dashboards.
    """
    if not isinstance(record, dict):
        return False
    pname = (record.get("period_name") or "").lower()
    if not pname:
        return False
    has_session_kw = any(kw in pname for kw in _LEGACY_SESSION_KEYWORDS)
    if not has_session_kw:
        return False
    has_period_kw = any(kw in pname for kw in _LEGACY_PERIOD_KEYWORDS)
    return not has_period_kw


def _is_legacy_period_keyword(record: Dict[str, Any]) -> bool:
    """P4 predicate (period side): period_name contains a period keyword.
    Provided for testability / future use. Not consumed directly by the
    resolver, but kept here so all five legacy concerns live in one module.
    """
    if not isinstance(record, dict):
        return False
    pname = (record.get("period_name") or "").lower()
    if not pname:
        return False
    return any(kw in pname for kw in _LEGACY_PERIOD_KEYWORDS)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def resolve_session_records(
    records: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """Resolve which records of a single (already-grouped) session represent
    the session-total source of truth.

    See module docstring for the strict P1→P5 priority.

    Args:
        records: list of GPS record dicts belonging to one session
                 (caller is responsible for grouping). May be None or [].

    Returns:
        Subset of the input list (same dict objects, not copies). Empty list
        when input is None or empty.
    """
    if not records:
        return []

    # P1: explicit session_total wins, first encountered
    for r in records:
        if _is_explicit_session_total(r):
            return [r]

    # P2: any explicit record_type → use only the explicitly-marked records,
    #     ignore keyword heuristics entirely
    if _has_explicit_record_types(records):
        explicit = [r for r in records if isinstance(r, dict) and r.get("record_type")]
        # _has_explicit_record_types returned True, so `explicit` is non-empty.
        return explicit

    # P3: consolidated flag, first encountered
    for r in records:
        if _is_consolidated_session_total(r):
            return [r]

    # P4: legacy keyword match — first record that is "session-kw AND NOT period-kw"
    for r in records:
        if _is_legacy_session_keyword(r):
            return [r]

    # P5: fallback — return everything, caller sums
    return list(records)


__all__ = ["resolve_session_records"]
