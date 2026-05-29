"""
Phase 2 validation — Speed & Metabolic Load: Import + Persistence.

Scope under test (ADDITIVE / null-safe):
- csv_analyzer.INTERNAL_FIELDS gained 3 new OPTIONAL fields:
  player_load_per_minute, high_metabolic_load, max_velocity_percent
- csv_analyzer.analyze_csv auto-detects these from multiple provider header variants
- csv_analyzer.apply_custom_mapping coerces them
- /csv/import-mapped persistence is null-safe (replicated below exactly)

These tests DO NOT touch the DB, existing metrics, max_speed unit, the resolver
or the wearable pipeline.
"""
import csv_analyzer
from csv_analyzer import INTERNAL_FIELDS, analyze_csv, apply_custom_mapping


# ---- Exact replica of the persistence expression used in
# routes/csv_import/routes.py for the new optional numeric fields ----
def persist_optional(rec, key):
    return float(rec.get(key, 0) or 0) if rec.get(key) else None


def _csv(headers, rows):
    lines = [",".join(headers)]
    for r in rows:
        lines.append(",".join(str(c) for c in r))
    return ("\n".join(lines)).encode("utf-8")


# ============================================================
# 0) The 3 new fields exist and are OPTIONAL (backward-compat)
# ============================================================
def test_new_fields_registered_as_optional():
    for f in ("player_load_per_minute", "high_metabolic_load", "max_velocity_percent"):
        assert f in INTERNAL_FIELDS, f"{f} missing from INTERNAL_FIELDS"
        assert INTERNAL_FIELDS[f]["group"] == "optional", f"{f} must be optional"
        assert INTERNAL_FIELDS[f]["type"] == "numeric"
    # existing required/recommended fields untouched
    assert INTERNAL_FIELDS["total_distance"]["group"] == "required"
    assert INTERNAL_FIELDS["sprint_distance"]["group"] == "recommended"
    assert INTERNAL_FIELDS["hsr_distance"]["group"] == "recommended"


# ============================================================
# Alias flexibility across professional GPS providers
# ============================================================
def test_alias_detection_multiprovider():
    variants = [
        # (player_load_per_minute header, high_metabolic_load header, max_velocity_percent header)
        ("Player Load Per Minute", "High Metabolic Load Distance", "Max Velocity (%)"),
        ("PL/min", "HMLD", "% Max Speed"),
        ("Player Load/Min", "Metabolic Power Distance", "Max Vel %"),
        ("Dynamic Stress Load Per Minute", "HML Distance", "% Vmax"),
    ]
    for plpm, hml, mvp in variants:
        raw = _csv(
            ["Player Name", "Date", "Total Distance (m)", plpm, hml, mvp],
            [["John Doe", "2026-01-10", "5000", "12.5", "850", "92"]],
        )
        res = analyze_csv(raw, "provider.csv")
        am = res["auto_mapping"]
        assert am["player_load_per_minute"]["csv_column"] == plpm, f"PL/min not detected for {plpm}"
        assert am["high_metabolic_load"]["csv_column"] == hml, f"HML not detected for {hml}"
        assert am["max_velocity_percent"]["csv_column"] == mvp, f"MaxVel% not detected for {mvp}"


# ============================================================
# 1) CSV WITHOUT the new fields -> still imports, new fields = None
# ============================================================
def test_scenario_1_csv_without_new_fields():
    raw = _csv(
        ["Player Name", "Date", "Total Distance (m)", "Sprint Distance (m)", "Max Speed"],
        [["John Doe", "2026-01-10", "5000", "120", "31.2"]],
    )
    res = analyze_csv(raw, "old.csv")
    am = res["auto_mapping"]
    # New fields are simply unmapped — NOT an error
    assert am["player_load_per_minute"]["csv_column"] is None
    assert am["high_metabolic_load"]["csv_column"] is None
    assert am["max_velocity_percent"]["csv_column"] is None
    # required still detected -> import viable
    assert am["athlete_name"]["csv_column"] is not None
    assert am["total_distance"]["csv_column"] is not None

    mapping = {
        "athlete_name": "Player Name",
        "session_date": "Date",
        "total_distance": "Total Distance (m)",
        "sprint_distance": "Sprint Distance (m)",
        "max_speed": "Max Speed",
    }
    recs = apply_custom_mapping(raw, mapping, "old.csv")
    assert len(recs) == 1
    rec = recs[0]
    # persistence is null-safe -> None for absent fields
    assert persist_optional(rec, "player_load_per_minute") is None
    assert persist_optional(rec, "high_metabolic_load") is None
    assert persist_optional(rec, "max_velocity_percent") is None
    assert persist_optional(rec, "duration_minutes") is None
    # existing metric untouched
    assert rec["total_distance"] == 5000.0
    assert rec["max_speed"] == 31.2


# ============================================================
# 2) CSV with SOME new fields -> only mapped ones persist
# ============================================================
def test_scenario_2_csv_with_some_new_fields():
    raw = _csv(
        ["Player Name", "Date", "Total Distance (m)", "Avg Player Load", "Duration (min)"],
        [["Jane", "2026-01-11", "6200", "415", "92"]],
    )
    mapping = {
        "athlete_name": "Player Name",
        "session_date": "Date",
        "total_distance": "Total Distance (m)",
        "player_load": "Avg Player Load",
        "duration_minutes": "Duration (min)",
    }
    rec = apply_custom_mapping(raw, mapping, "some.csv")[0]
    assert persist_optional(rec, "player_load") == 415.0
    assert persist_optional(rec, "duration_minutes") == 92.0
    # not provided -> None
    assert persist_optional(rec, "player_load_per_minute") is None
    assert persist_optional(rec, "high_metabolic_load") is None
    assert persist_optional(rec, "max_velocity_percent") is None


# ============================================================
# 3) CSV with ALL new fields -> all persist with exact values
# ============================================================
def test_scenario_3_csv_with_all_new_fields():
    raw = _csv(
        ["Player Name", "Date", "Total Distance (m)",
         "Avg Player Load", "PL/min", "High Metabolic Load Distance",
         "Duration (min)", "Max Acceleration", "Max Deceleration", "Max Velocity (%)"],
        [["Carl", "2026-01-12", "7100", "480", "13.7", "910", "95", "4.2", "-5.1", "88"]],
    )
    mapping = {
        "athlete_name": "Player Name",
        "session_date": "Date",
        "total_distance": "Total Distance (m)",
        "player_load": "Avg Player Load",
        "player_load_per_minute": "PL/min",
        "high_metabolic_load": "High Metabolic Load Distance",
        "duration_minutes": "Duration (min)",
        "max_acceleration": "Max Acceleration",
        "max_deceleration": "Max Deceleration",
        "max_velocity_percent": "Max Velocity (%)",
    }
    rec = apply_custom_mapping(raw, mapping, "all.csv")[0]
    assert persist_optional(rec, "player_load") == 480.0
    assert persist_optional(rec, "player_load_per_minute") == 13.7
    assert persist_optional(rec, "high_metabolic_load") == 910.0
    assert persist_optional(rec, "duration_minutes") == 95.0
    assert persist_optional(rec, "max_velocity_percent") == 88.0
    # max_velocity_percent stored EXACTLY as imported (no conversion / derivation)
    assert rec["max_velocity_percent"] == 88.0


# ============================================================
# 4) NULL values (empty cells) -> None (never 0, never crash)
# ============================================================
def test_scenario_4_null_values():
    raw = _csv(
        ["Player Name", "Date", "Total Distance (m)", "PL/min", "HMLD", "Max Vel %"],
        [["Empty", "2026-01-13", "5000", "", "", ""]],
    )
    mapping = {
        "athlete_name": "Player Name",
        "session_date": "Date",
        "total_distance": "Total Distance (m)",
        "player_load_per_minute": "PL/min",
        "high_metabolic_load": "HMLD",
        "max_velocity_percent": "Max Vel %",
    }
    rec = apply_custom_mapping(raw, mapping, "nulls.csv")[0]
    # empty numeric cell -> 0 in mapping, -> None after null-safe persistence
    assert persist_optional(rec, "player_load_per_minute") is None
    assert persist_optional(rec, "high_metabolic_load") is None
    assert persist_optional(rec, "max_velocity_percent") is None
    # required total still ok
    assert rec["total_distance"] == 5000.0


# ============================================================
# 5) EMPTY columns (header present, all rows empty)
# ============================================================
def test_scenario_5_empty_columns():
    raw = _csv(
        ["Player Name", "Date", "Total Distance (m)", "High Metabolic Load Distance"],
        [["A", "2026-01-14", "4800", ""],
         ["B", "2026-01-14", "5200", ""]],
    )
    mapping = {
        "athlete_name": "Player Name",
        "session_date": "Date",
        "total_distance": "Total Distance (m)",
        "high_metabolic_load": "High Metabolic Load Distance",
    }
    recs = apply_custom_mapping(raw, mapping, "empty.csv")
    assert len(recs) == 2
    for rec in recs:
        assert persist_optional(rec, "high_metabolic_load") is None


# ============================================================
# 6) MISSING columns (not mapped at all) -> None
# ============================================================
def test_scenario_6_missing_columns():
    raw = _csv(
        ["Player Name", "Date", "Total Distance (m)"],
        [["Solo", "2026-01-15", "5300"]],
    )
    mapping = {
        "athlete_name": "Player Name",
        "session_date": "Date",
        "total_distance": "Total Distance (m)",
        # new fields intentionally not mapped (columns do not exist)
    }
    rec = apply_custom_mapping(raw, mapping, "missing.csv")[0]
    assert persist_optional(rec, "player_load_per_minute") is None
    assert persist_optional(rec, "high_metabolic_load") is None
    assert persist_optional(rec, "max_velocity_percent") is None
    assert persist_optional(rec, "duration_minutes") is None


# ============================================================
# Bad/garbage numeric values must not crash (coerced safely)
# ============================================================
def test_garbage_numeric_is_safe():
    raw = _csv(
        ["Player Name", "Date", "Total Distance (m)", "Max Vel %"],
        [["Bad", "2026-01-16", "5000", "N/A"]],
    )
    mapping = {
        "athlete_name": "Player Name",
        "session_date": "Date",
        "total_distance": "Total Distance (m)",
        "max_velocity_percent": "Max Vel %",
    }
    rec = apply_custom_mapping(raw, mapping, "bad.csv")[0]
    # 'N/A' -> 0 (coercion fallback) -> None after null-safe persistence
    assert persist_optional(rec, "max_velocity_percent") is None
