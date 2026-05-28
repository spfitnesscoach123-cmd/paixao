"""Unit tests for the P2C session-designation pre-check pattern.

The pattern is replicated at 6 callsites. We test the pattern in isolation
via a small helper that mirrors what the callers do, plus an end-to-end
check via the central resolver to confirm:

  C1: athlete WITH session_total in designated session → uses only session_total
  C2: athlete WITHOUT session_total in designated session → empty
  C3: training-only-periods session (no designation) → resolver P2 sums
  C4: legacy (no record_type at all) → P4/P5 intact
  C5: mixed group of athletes in one designated session
  C6: same athlete across two sessions (one designated, one not)
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.gps_session_resolver import resolve_session_records


def aggregate_with_p2c(records_by_athlete_session, designated_keys):
    """Mirror what the 4 read-path callers do:
       records_by_athlete_session: {(athlete_id, date, session): [records]}
       designated_keys: set of f"{date}_{session}" with any session_total
       returns: {(athlete_id, date, session): total_distance}
    """
    out = {}
    for (aid, date, sname), recs in records_by_athlete_session.items():
        if (f"{date}_{sname}" in designated_keys
                and not any(r.get("record_type") == "session_total" for r in recs)):
            out[(aid, date, sname)] = 0.0
            continue
        source = resolve_session_records(recs)
        out[(aid, date, sname)] = sum(r.get("total_distance", 0) or 0 for r in source)
    return out


# ---------------------------------------------------------------------------
# C1 — athlete WITH session_total in designated session
# ---------------------------------------------------------------------------
def test_c1_athlete_with_designated_total_uses_only_that():
    records = {
        ("A1", "2026-05-01", "Match X"): [
            {"period_name": "W-UP", "record_type": "session_total", "total_distance": 1600},
            {"period_name": "Session", "record_type": "period", "total_distance": 9000},
            {"period_name": "1ST HALF", "record_type": "period", "total_distance": 4500},
        ],
    }
    designated = {"2026-05-01_Match X"}
    out = aggregate_with_p2c(records, designated)
    assert out[("A1", "2026-05-01", "Match X")] == 1600


# ---------------------------------------------------------------------------
# C2 — athlete WITHOUT session_total in designated session
# ---------------------------------------------------------------------------
def test_c2_athlete_without_designated_total_returns_zero():
    records = {
        ("B1", "2026-05-01", "Match X"): [
            {"period_name": "Session", "record_type": "period", "total_distance": 5700},
            {"period_name": "2ND HALF", "record_type": "period", "total_distance": 5700},
        ],
    }
    designated = {"2026-05-01_Match X"}
    out = aggregate_with_p2c(records, designated)
    assert out[("B1", "2026-05-01", "Match X")] == 0.0  # NOT 11400


# ---------------------------------------------------------------------------
# C3 — training-only-periods (no session_total designated anywhere)
# ---------------------------------------------------------------------------
def test_c3_training_only_periods_p2_sums_normally():
    records = {
        ("C1", "2026-05-02", "Training Y"): [
            {"period_name": "Warmup", "record_type": "period", "total_distance": 1200},
            {"period_name": "Drill", "record_type": "period", "total_distance": 2200},
            {"period_name": "Block", "record_type": "period", "total_distance": 3000},
        ],
    }
    designated: set = set()  # No designation across the dataset
    out = aggregate_with_p2c(records, designated)
    assert out[("C1", "2026-05-02", "Training Y")] == 6400  # P2 sums all


# ---------------------------------------------------------------------------
# C4 — legacy (no record_type at all)
# ---------------------------------------------------------------------------
def test_c4_legacy_keyword_matching_intact():
    records = {
        ("D1", "2026-05-03", "Legacy Match"): [
            {"period_name": "Session", "total_distance": 9000},
            {"period_name": "1st half", "total_distance": 4500},
            {"period_name": "2nd half", "total_distance": 4500},
        ],
    }
    designated: set = set()
    out = aggregate_with_p2c(records, designated)
    # P4 picks 'Session' (session kw and not period kw) → 9000
    assert out[("D1", "2026-05-03", "Legacy Match")] == 9000


def test_c4b_legacy_no_keyword_p5_sums():
    records = {
        ("D2", "2026-05-04", "Legacy Drill"): [
            {"period_name": "Block A", "total_distance": 3000},
            {"period_name": "Block B", "total_distance": 4000},
        ],
    }
    designated: set = set()
    out = aggregate_with_p2c(records, designated)
    assert out[("D2", "2026-05-04", "Legacy Drill")] == 7000  # P5 sums


# ---------------------------------------------------------------------------
# C5 — mixed group: same designated session, multiple athletes
# ---------------------------------------------------------------------------
def test_c5_mixed_group_handled_per_athlete():
    records = {
        ("Khosaif", "2026-05-01", "Match X"): [
            {"period_name": "W-UP", "record_type": "session_total", "total_distance": 1600},
            {"period_name": "Session", "record_type": "period", "total_distance": 11800},
            {"period_name": "1ST HALF", "record_type": "period", "total_distance": 5200},
            {"period_name": "2ND HALF", "record_type": "period", "total_distance": 5000},
        ],
        ("Nahyan", "2026-05-01", "Match X"): [
            {"period_name": "Session", "record_type": "period", "total_distance": 2842},
            {"period_name": "2ND HALF", "record_type": "period", "total_distance": 2842},
        ],
    }
    designated = {"2026-05-01_Match X"}
    out = aggregate_with_p2c(records, designated)
    assert out[("Khosaif", "2026-05-01", "Match X")] == 1600   # P1 wins
    assert out[("Nahyan", "2026-05-01", "Match X")] == 0.0     # P2C skip


# ---------------------------------------------------------------------------
# C6 — same athlete in two sessions: one designated, one not
# ---------------------------------------------------------------------------
def test_c6_same_athlete_two_sessions_one_designated():
    records = {
        ("Z1", "2026-05-01", "Match Designated"): [
            {"period_name": "Session", "record_type": "period", "total_distance": 5700},
            {"period_name": "2ND HALF", "record_type": "period", "total_distance": 5700},
        ],
        ("Z1", "2026-05-02", "Training Free"): [
            {"period_name": "Warmup", "record_type": "period", "total_distance": 1000},
            {"period_name": "Drill", "record_type": "period", "total_distance": 2000},
        ],
    }
    designated = {"2026-05-01_Match Designated"}
    out = aggregate_with_p2c(records, designated)
    # Designated + missing → 0
    assert out[("Z1", "2026-05-01", "Match Designated")] == 0.0
    # Not designated + all periods → P2 sums
    assert out[("Z1", "2026-05-02", "Training Free")] == 3000


# ---------------------------------------------------------------------------
# Sanity: empty inputs
# ---------------------------------------------------------------------------
def test_empty_records():
    out = aggregate_with_p2c({}, set())
    assert out == {}
