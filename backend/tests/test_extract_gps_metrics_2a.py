"""Unit tests for `extract_gps_metrics_from_session` (post-Etapa 2A).

Locks the behavior of the function now that it delegates to the central
resolver. Covers shape preservation + P1/P2 scenarios that aren't yet
present in the production DB.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.periodization.routes import extract_gps_metrics_from_session


def _mk(**kwargs):
    base = {
        "total_distance": 0, "high_intensity_distance": 0,
        "high_speed_running": 0, "sprint_distance": 0,
        "number_of_sprints": 0,
        "number_of_accelerations": 0, "number_of_decelerations": 0,
    }
    base.update(kwargs)
    return base


# ---------------------------------------------------------------------------
# Empty input
# ---------------------------------------------------------------------------
def test_empty_returns_zeros():
    assert extract_gps_metrics_from_session([]) == {
        "total_distance": 0, "hid_z3": 0, "hsr_z4": 0,
        "sprint_z5": 0, "sprints_count": 0, "acc_dec_total": 0,
    }


def test_none_returns_zeros():
    assert extract_gps_metrics_from_session(None) == {
        "total_distance": 0, "hid_z3": 0, "hsr_z4": 0,
        "sprint_z5": 0, "sprints_count": 0, "acc_dec_total": 0,
    }


# ---------------------------------------------------------------------------
# P1 — record_type=session_total wins; first encountered when multiple
# ---------------------------------------------------------------------------
def test_p1_explicit_session_total_wins():
    records = [
        _mk(record_type="period", period_name="1st half", total_distance=4500),
        _mk(record_type="session_total", period_name="Full Match", total_distance=9200),
        _mk(record_type="period", period_name="2nd half", total_distance=4700),
    ]
    out = extract_gps_metrics_from_session(records)
    assert out["total_distance"] == 9200


def test_p1_multiple_session_total_uses_first():
    records = [
        _mk(record_type="session_total", total_distance=9100, _id="a"),
        _mk(record_type="session_total", total_distance=8900, _id="b"),
    ]
    out = extract_gps_metrics_from_session(records)
    assert out["total_distance"] == 9100


# ---------------------------------------------------------------------------
# P2 — explicit periods only (no session_total) → use only marked records
# ---------------------------------------------------------------------------
def test_p2_explicit_periods_summed():
    records = [
        _mk(record_type="period", period_name="Warmup", total_distance=1500,
            number_of_sprints=2),
        _mk(record_type="period", period_name="Drill", total_distance=2200,
            number_of_sprints=3),
    ]
    out = extract_gps_metrics_from_session(records)
    assert out["total_distance"] == 3700
    assert out["sprints_count"] == 5


def test_p2_explicit_ignores_keyword_heuristic():
    records = [
        _mk(period_name="Session Full", total_distance=9000),  # legacy kw, no record_type
        _mk(record_type="period", period_name="Warmup", total_distance=1500),
    ]
    out = extract_gps_metrics_from_session(records)
    assert out["total_distance"] == 1500


# ---------------------------------------------------------------------------
# P3 — has_session_total=True
# ---------------------------------------------------------------------------
def test_p3_consolidated_single_record():
    records = [
        _mk(has_session_total=True, total_distance=8800,
            high_intensity_distance=1200, high_speed_running=600,
            sprint_distance=350, number_of_sprints=18,
            number_of_accelerations=44, number_of_decelerations=42),
    ]
    out = extract_gps_metrics_from_session(records)
    assert out == {
        "total_distance": 8800, "hid_z3": 1200, "hsr_z4": 600,
        "sprint_z5": 350, "sprints_count": 18, "acc_dec_total": 86,
    }


def test_p3_consolidated_with_legacy_periods():
    records = [
        _mk(has_session_total=True, total_distance=8800),
        _mk(period_name="1st half", total_distance=4400),
    ]
    out = extract_gps_metrics_from_session(records)
    assert out["total_distance"] == 8800  # consolidated wins


# ---------------------------------------------------------------------------
# P4 — legacy keyword matching
# ---------------------------------------------------------------------------
def test_p4_legacy_session_keyword():
    records = [
        _mk(period_name="Session", total_distance=9000,
            number_of_accelerations=40, number_of_decelerations=38),
        _mk(period_name="1st half", total_distance=4500),
    ]
    out = extract_gps_metrics_from_session(records)
    assert out["total_distance"] == 9000
    assert out["acc_dec_total"] == 78


# ---------------------------------------------------------------------------
# P5 — fallback sum-all
# ---------------------------------------------------------------------------
def test_p5_no_markers_sums_all():
    records = [
        _mk(total_distance=4500, high_intensity_distance=400),
        _mk(total_distance=4800, high_intensity_distance=500),
    ]
    out = extract_gps_metrics_from_session(records)
    assert out["total_distance"] == 9300
    assert out["hid_z3"] == 900


# ---------------------------------------------------------------------------
# Output shape invariant
# ---------------------------------------------------------------------------
def test_output_shape_invariant():
    records = [_mk(record_type="session_total", total_distance=1000)]
    out = extract_gps_metrics_from_session(records)
    assert set(out.keys()) == {
        "total_distance", "hid_z3", "hsr_z4",
        "sprint_z5", "sprints_count", "acc_dec_total",
    }
