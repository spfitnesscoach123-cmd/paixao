"""Unit tests for the central GPS session resolver (Etapa 1).

Locks down the strict P1→P5 priority and all required edge cases.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.gps_session_resolver import (
    resolve_session_records,
    _is_explicit_session_total,
    _has_explicit_record_types,
    _is_consolidated_session_total,
    _is_legacy_session_keyword,
    _is_legacy_period_keyword,
)


# ---------------------------------------------------------------------------
# Empty / None handling
# ---------------------------------------------------------------------------
def test_returns_empty_for_none():
    assert resolve_session_records(None) == []


def test_returns_empty_for_empty_list():
    assert resolve_session_records([]) == []


# ---------------------------------------------------------------------------
# P1 — record_type == "session_total"
# ---------------------------------------------------------------------------
def test_p1_single_session_total():
    r1 = {"record_type": "session_total", "total_distance": 9000}
    r2 = {"period_name": "1st half", "total_distance": 4000}
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p1_multiple_session_total_returns_first_only():
    r1 = {"record_type": "session_total", "total_distance": 9000, "_id": "a"}
    r2 = {"record_type": "session_total", "total_distance": 8500, "_id": "b"}
    out = resolve_session_records([r1, r2])
    assert out == [r1]
    assert len(out) == 1


def test_p1_beats_has_session_total_and_keywords():
    r1 = {"record_type": "session_total", "total_distance": 9000}
    r2 = {"has_session_total": True, "total_distance": 8000}
    r3 = {"period_name": "Session", "total_distance": 7000}
    assert resolve_session_records([r2, r3, r1]) == [r1]


# ---------------------------------------------------------------------------
# P2 — any explicit record_type, no session_total → only explicit records
# ---------------------------------------------------------------------------
def test_p2_explicit_periods_only():
    r1 = {"record_type": "period", "period_name": "Warmup", "total_distance": 1500}
    r2 = {"record_type": "period", "period_name": "Drill", "total_distance": 2200}
    out = resolve_session_records([r1, r2])
    assert out == [r1, r2]


def test_p2_explicit_mixed_with_unmarked_uses_only_explicit():
    r1 = {"record_type": "period", "total_distance": 1500}
    r2 = {"total_distance": 2200}  # not marked
    r3 = {"record_type": "period", "total_distance": 1800}
    out = resolve_session_records([r1, r2, r3])
    assert out == [r1, r3]


def test_p2_explicit_ignores_keyword_heuristics():
    # Record without record_type but with "session" keyword should NOT win when
    # another record has explicit record_type and no session_total exists.
    r1 = {"period_name": "Session Full", "total_distance": 9000}  # legacy kw
    r2 = {"record_type": "period", "period_name": "Warmup", "total_distance": 1500}
    out = resolve_session_records([r1, r2])
    assert out == [r2]


def test_p2_agnostic_to_vocabulary():
    # Any truthy record_type counts as explicit (Interpretation 1).
    r1 = {"record_type": "warmup_block", "total_distance": 1500}
    r2 = {"record_type": "recovery", "total_distance": 800}
    out = resolve_session_records([r1, r2])
    assert out == [r1, r2]


def test_p2_empty_string_record_type_is_not_explicit():
    r1 = {"record_type": "", "period_name": "Session", "total_distance": 9000}
    r2 = {"period_name": "1st half", "total_distance": 4000}
    # No truthy record_type, no has_session_total, falls to P4 (keyword).
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p2_none_record_type_is_not_explicit():
    r1 = {"record_type": None, "period_name": "Session", "total_distance": 9000}
    r2 = {"period_name": "1st half", "total_distance": 4000}
    out = resolve_session_records([r1, r2])
    assert out == [r1]  # falls to P4


# ---------------------------------------------------------------------------
# P3 — has_session_total == True
# ---------------------------------------------------------------------------
def test_p3_has_session_total_true():
    r1 = {"has_session_total": True, "total_distance": 9000}
    r2 = {"period_name": "1st half", "total_distance": 4000}
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p3_first_when_multiple_consolidated():
    r1 = {"has_session_total": True, "total_distance": 9000, "_id": "a"}
    r2 = {"has_session_total": True, "total_distance": 8000, "_id": "b"}
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p3_strict_true_not_truthy():
    # has_session_total = 1 (truthy but not True) → should NOT trigger P3
    r1 = {"has_session_total": 1, "total_distance": 9000}
    r2 = {"period_name": "1st half", "total_distance": 4000}
    out = resolve_session_records([r1, r2])
    # No P1, P2, P3 (strict True), no P4 keyword match on r1
    # P4 finds nothing (r2 has period keyword), falls to P5.
    assert out == [r1, r2]


# ---------------------------------------------------------------------------
# P4 — legacy keyword matching
# ---------------------------------------------------------------------------
def test_p4_session_keyword_only():
    r1 = {"period_name": "Session", "total_distance": 9000}
    r2 = {"period_name": "1st Half", "total_distance": 4500}
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p4_full_keyword():
    r1 = {"period_name": "Full Match", "total_distance": 9500}
    r2 = {"period_name": "Half 1", "total_distance": 4500}
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p4_summary_keyword():
    r1 = {"period_name": "Summary", "total_distance": 9000}
    r2 = {"period_name": "Part 1", "total_distance": 4000}
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p4_portuguese_sessao_keyword():
    r1 = {"period_name": "Sessão Completa", "total_distance": 9000}
    r2 = {"period_name": "1º Tempo", "total_distance": 4000}
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p4_session_with_period_keyword_disqualified():
    # "Session 1st half" contains BOTH session and period kw → NOT session total
    r1 = {"period_name": "Session 1st half", "total_distance": 4500}
    r2 = {"period_name": "Session 2nd half", "total_distance": 4500}
    # Neither qualifies → falls to P5 (returns all)
    out = resolve_session_records([r1, r2])
    assert out == [r1, r2]


def test_p4_first_session_keyword_record_wins():
    r1 = {"period_name": "Complete", "total_distance": 9000}
    r2 = {"period_name": "Full", "total_distance": 9200}
    out = resolve_session_records([r1, r2])
    assert out == [r1]


def test_p4_missing_period_name():
    r1 = {"total_distance": 4000}
    r2 = {"total_distance": 4500}
    out = resolve_session_records([r1, r2])
    # No keyword match → P5 returns all
    assert out == [r1, r2]


def test_p4_period_name_none():
    r1 = {"period_name": None, "total_distance": 4000}
    r2 = {"period_name": "Session", "total_distance": 9000}
    out = resolve_session_records([r1, r2])
    assert out == [r2]


# ---------------------------------------------------------------------------
# P5 — fallback
# ---------------------------------------------------------------------------
def test_p5_no_markers_returns_all():
    r1 = {"period_name": "1st half", "total_distance": 4000}
    r2 = {"period_name": "2nd half", "total_distance": 4500}
    out = resolve_session_records([r1, r2])
    assert out == [r1, r2]


def test_p5_single_record_unmarked():
    r1 = {"total_distance": 8000}
    out = resolve_session_records([r1])
    assert out == [r1]


# ---------------------------------------------------------------------------
# Returned subset references same dict objects (no copy / no mutation)
# ---------------------------------------------------------------------------
def test_returns_same_object_references():
    r1 = {"record_type": "session_total", "total_distance": 9000}
    out = resolve_session_records([r1])
    assert out[0] is r1


def test_does_not_mutate_input():
    r1 = {"record_type": "session_total", "total_distance": 9000}
    r2 = {"period_name": "1st half", "total_distance": 4000}
    records = [r1, r2]
    _ = resolve_session_records(records)
    assert records == [r1, r2]
    assert r1 == {"record_type": "session_total", "total_distance": 9000}
    assert r2 == {"period_name": "1st half", "total_distance": 4000}


# ---------------------------------------------------------------------------
# Predicate-level tests
# ---------------------------------------------------------------------------
def test_predicate_is_explicit_session_total():
    assert _is_explicit_session_total({"record_type": "session_total"}) is True
    assert _is_explicit_session_total({"record_type": "period"}) is False
    assert _is_explicit_session_total({"record_type": None}) is False
    assert _is_explicit_session_total({}) is False
    assert _is_explicit_session_total(None) is False  # type: ignore[arg-type]


def test_predicate_has_explicit_record_types():
    assert _has_explicit_record_types([{"record_type": "period"}]) is True
    assert _has_explicit_record_types([{"record_type": ""}, {"record_type": "warmup"}]) is True
    assert _has_explicit_record_types([{"record_type": ""}]) is False
    assert _has_explicit_record_types([{"record_type": None}]) is False
    assert _has_explicit_record_types([{}]) is False
    assert _has_explicit_record_types([]) is False
    assert _has_explicit_record_types(None) is False  # type: ignore[arg-type]


def test_predicate_is_consolidated_session_total():
    assert _is_consolidated_session_total({"has_session_total": True}) is True
    assert _is_consolidated_session_total({"has_session_total": False}) is False
    assert _is_consolidated_session_total({"has_session_total": 1}) is False  # strict True
    assert _is_consolidated_session_total({}) is False


def test_predicate_is_legacy_session_keyword():
    assert _is_legacy_session_keyword({"period_name": "Session"}) is True
    assert _is_legacy_session_keyword({"period_name": "Full Match"}) is True
    assert _is_legacy_session_keyword({"period_name": "Sessão"}) is True
    assert _is_legacy_session_keyword({"period_name": "Session 1st half"}) is False  # period kw too
    assert _is_legacy_session_keyword({"period_name": "1st half"}) is False
    assert _is_legacy_session_keyword({"period_name": ""}) is False
    assert _is_legacy_session_keyword({"period_name": None}) is False
    assert _is_legacy_session_keyword({}) is False


def test_predicate_is_legacy_period_keyword():
    assert _is_legacy_period_keyword({"period_name": "1st half"}) is True
    assert _is_legacy_period_keyword({"period_name": "Tempo 1"}) is True
    assert _is_legacy_period_keyword({"period_name": "Parte 2"}) is True
    assert _is_legacy_period_keyword({"period_name": "Session"}) is False
    assert _is_legacy_period_keyword({"period_name": None}) is False
    assert _is_legacy_period_keyword({}) is False
