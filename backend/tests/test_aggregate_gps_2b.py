"""Unit tests for `RollingLoadEngine.aggregate_gps_for_date` (post-Etapa 2B).

Locks the behavior of the function now that it delegates to the central
resolver. Covers shape preservation + P1/P2/P3/P4/P5 scenarios using a
lightweight in-memory mock of the Mongo cursor.
"""

import os
import sys
import asyncio
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from load_engine.rolling_load_engine import RollingLoadEngine


# ---------------------------------------------------------------------------
# Minimal in-memory mock of motor's collection.find(...).to_list(N)
# ---------------------------------------------------------------------------
class _Cursor:
    def __init__(self, records):
        self._records = list(records)

    async def to_list(self, length):
        return list(self._records[:length])


class _GPSCollection:
    def __init__(self, records):
        self._records = records

    def find(self, query):
        athlete_id = query.get("athlete_id")
        coach_id = query.get("coach_id")
        date = query.get("date")
        matched = [
            r for r in self._records
            if r.get("athlete_id") == athlete_id
            and r.get("coach_id") == coach_id
            and r.get("date") == date
        ]
        return _Cursor(matched)


class _MockDB:
    def __init__(self, records):
        self.gps_data = _GPSCollection(records)

    def __getitem__(self, _name):
        # RollingLoadEngine.__init__ does `db[COLLECTION_NAME]` — return a
        # stub object; we never call its methods in these tests.
        return _GPSCollection([])


def _engine(records):
    db = _MockDB(records)
    return RollingLoadEngine(db)  # type: ignore[arg-type]


def _r(**kwargs):
    base = {
        "athlete_id": "A1", "coach_id": "C1", "date": "2026-05-01",
        "session_name": "S1",
        "total_distance": 0, "high_intensity_distance": 0,
        "high_speed_running": 0, "sprint_distance": 0,
        "number_of_sprints": 0,
        "number_of_accelerations": 0, "number_of_decelerations": 0,
    }
    base.update(kwargs)
    return base


# ---------------------------------------------------------------------------
# Empty / no records
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_no_records_returns_zeros():
    eng = _engine([])
    out = await eng.aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert out == {
        "distance": 0.0, "hsr": 0.0, "sprint_distance": 0.0,
        "acc_dec_load": 0.0, "high_intensity_distance": 0.0,
        "number_of_sprints": 0.0,
    }


# ---------------------------------------------------------------------------
# P1 — record_type=session_total
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_p1_explicit_session_total_wins():
    recs = [
        _r(record_type="period", period_name="1st half", total_distance=4500),
        _r(record_type="session_total", period_name="Full", total_distance=9200,
           number_of_accelerations=30, number_of_decelerations=28),
        _r(record_type="period", period_name="2nd half", total_distance=4700),
    ]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert out["distance"] == 9200.0
    assert out["acc_dec_load"] == 58.0


@pytest.mark.asyncio
async def test_p1_first_when_multiple_session_total():
    recs = [
        _r(record_type="session_total", total_distance=9100),
        _r(record_type="session_total", total_distance=8800),
    ]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert out["distance"] == 9100.0


# ---------------------------------------------------------------------------
# P2 — explicit record_type, no session_total → use only marked
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_p2_explicit_periods_summed():
    recs = [
        _r(record_type="period", period_name="Warmup", total_distance=1500),
        _r(record_type="period", period_name="Drill", total_distance=2200),
    ]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert out["distance"] == 3700.0


@pytest.mark.asyncio
async def test_p2_explicit_ignores_unmarked_with_keyword():
    recs = [
        _r(period_name="Session", total_distance=9000),  # keyword, no record_type
        _r(record_type="period", period_name="Warmup", total_distance=1500),
    ]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert out["distance"] == 1500.0  # only the explicit period record


# ---------------------------------------------------------------------------
# P3 — has_session_total
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_p3_has_session_total():
    recs = [
        _r(has_session_total=True, total_distance=8800,
           high_intensity_distance=1200, high_speed_running=600,
           sprint_distance=350, number_of_sprints=18,
           number_of_accelerations=44, number_of_decelerations=42),
    ]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert out == {
        "distance": 8800.0, "hsr": 600.0, "sprint_distance": 350.0,
        "acc_dec_load": 86.0, "high_intensity_distance": 1200.0,
        "number_of_sprints": 18.0,
    }


# ---------------------------------------------------------------------------
# P4 — legacy keyword
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_p4_legacy_session_keyword():
    recs = [
        _r(period_name="Session", total_distance=9000),
        _r(period_name="1st half", total_distance=4500),
    ]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert out["distance"] == 9000.0


# ---------------------------------------------------------------------------
# P5 — fallback sum-all
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_p5_no_markers_sums_all():
    recs = [
        _r(total_distance=4500),
        _r(total_distance=4800),
    ]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert out["distance"] == 9300.0


# ---------------------------------------------------------------------------
# Grouping by session_name — each session resolved independently
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_independent_grouping_by_session_name():
    recs = [
        # Session A: has session_total
        _r(session_name="A", record_type="session_total", total_distance=9000),
        _r(session_name="A", record_type="period", period_name="1st", total_distance=4500),
        # Session B: only periods
        _r(session_name="B", period_name="Warmup", total_distance=1200),
        _r(session_name="B", period_name="Cooldown", total_distance=800),
    ]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    # A contributes 9000 (P1) + B contributes 2000 (P5 fallback)
    assert out["distance"] == 11000.0


# ---------------------------------------------------------------------------
# Output shape & dtype invariant
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_output_shape_invariant():
    recs = [_r(record_type="session_total", total_distance=1000)]
    out = await _engine(recs).aggregate_gps_for_date("A1", "C1", "2026-05-01")
    assert set(out.keys()) == {
        "distance", "hsr", "sprint_distance", "acc_dec_load",
        "high_intensity_distance", "number_of_sprints",
    }
    for v in out.values():
        assert isinstance(v, float)
