"""
Tests for the GPS Import Module.
Tests canonical metrics, manufacturer aliases, CSV parser, and normalizer.
"""

import pytest
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from gps_import.canonical_metrics import (
    CANONICAL_METRICS, REQUIRED_METRICS, METRIC_CATEGORIES,
    validate_metric_value, get_metric_definition
)
from gps_import.manufacturer_aliases import (
    Manufacturer, detect_manufacturer_from_columns,
    build_column_mapping, MANUFACTURER_ALIASES, MANUFACTURER_SIGNATURES
)
from gps_import.csv_parser import GPSCSVParser, parse_gps_csv
from gps_import.normalizer import GPSDataNormalizer, normalize_gps_data
from gps_import.consolidator import (
    consolidate_session, _classify_period_name,
    SUMMABLE_METRICS, MAX_METRICS, AVERAGE_METRICS,
)


# ============ CANONICAL METRICS TESTS ============

class TestCanonicalMetrics:
    def test_total_distance_is_required(self):
        assert "total_distance_m" in REQUIRED_METRICS

    def test_validate_valid_distance(self):
        is_valid, err = validate_metric_value("total_distance_m", 5000.0)
        assert is_valid is True
        assert err is None

    def test_validate_distance_above_max(self):
        is_valid, err = validate_metric_value("total_distance_m", 999999.0)
        assert is_valid is False
        assert "above maximum" in err

    def test_validate_distance_below_min(self):
        is_valid, err = validate_metric_value("total_distance_m", -1.0)
        assert is_valid is False
        assert "below minimum" in err

    def test_validate_unknown_metric(self):
        is_valid, err = validate_metric_value("unknown_metric", 10.0)
        assert is_valid is False
        assert "Unknown metric" in err

    def test_metric_categories_cover_all(self):
        all_categorized = []
        for metrics in METRIC_CATEGORIES.values():
            all_categorized.extend(metrics)
        for metric_name in CANONICAL_METRICS:
            assert metric_name in all_categorized, f"{metric_name} not categorized"


# ============ MANUFACTURER DETECTION TESTS ============

class TestManufacturerDetection:
    def test_detect_catapult(self):
        cols = ["Date", "Player Name", "Player Load", "Total Distance", "Max Velocity"]
        result = detect_manufacturer_from_columns(cols)
        assert result == Manufacturer.CATAPULT

    def test_detect_statsports(self):
        cols = ["Date", "Player Name", "Dynamic Stress Load", "HSR (15-20 km/h)", "Total Distance (m)"]
        result = detect_manufacturer_from_columns(cols)
        assert result == Manufacturer.STATSPORTS

    def test_detect_playertek_by_name(self):
        cols = ["Date", "Player", "Total Distance", "Sprints", "Max Speed", "PlayerTek"]
        result = detect_manufacturer_from_columns(cols)
        assert result == Manufacturer.PLAYERTEK

    def test_detect_gpexe(self):
        cols = ["date", "player", "totdist", "equivalent distance", "power events"]
        result = detect_manufacturer_from_columns(cols)
        assert result == Manufacturer.GPEXE

    def test_detect_unknown_fallback(self):
        cols = ["col_a", "col_b", "col_c"]
        result = detect_manufacturer_from_columns(cols)
        assert result == Manufacturer.UNKNOWN

    def test_build_column_mapping_catapult(self):
        cols = ["Player Name", "Total Distance", "Player Load", "Max Velocity", "Sprints"]
        mapping = build_column_mapping(cols, Manufacturer.CATAPULT)
        assert mapping.get("Total Distance") == "total_distance_m"
        assert mapping.get("Player Load") == "player_load"
        assert mapping.get("Player Name") == "player_name"

    def test_build_column_mapping_auto_detect(self):
        cols = ["Player Name", "Player Load", "Total Distance", "Date"]
        mapping = build_column_mapping(cols)  # no manufacturer hint
        assert "Total Distance" in mapping


# ============ CSV PARSER TESTS ============

class TestCSVParser:
    def _make_csv(self, header: str, rows: list[str], delimiter=",") -> bytes:
        lines = [header] + rows
        return "\n".join(lines).encode("utf-8")

    def test_parse_catapult_csv(self):
        content = self._make_csv(
            "Date,Player Name,Total Distance,Player Load,Max Velocity,Sprints,Accelerations,Decelerations",
            ["2025-01-01,Player A,8000,450,32.5,12,40,35"]
        )
        result = parse_gps_csv(content, strict=False)
        assert result.success is True
        assert result.manufacturer == Manufacturer.CATAPULT
        assert len(result.records) == 1
        rec = result.records[0]
        assert rec["total_distance_m"] == 8000.0
        assert rec["player_load"] == 450.0

    def test_parse_statsports_csv(self):
        content = self._make_csv(
            "Date,Player Name,Total Distance (m),Dynamic Stress Load,HSR (15-20 km/h),Max Speed (km/h)",
            ["2025-01-01,Player B,9100,520,1350,33.8"]
        )
        result = parse_gps_csv(content, strict=False)
        assert result.success is True
        assert result.manufacturer == Manufacturer.STATSPORTS
        assert result.records[0]["total_distance_m"] == 9100.0

    def test_parse_semicolon_delimiter(self):
        content = b"date;player;totdist;acc;dec;sprints\n2025-01-01;Player;8200;40;35;11\n"
        result = parse_gps_csv(content, strict=False)
        assert result.success is True
        assert len(result.records) == 1

    def test_parse_comma_decimal_european(self):
        content = b"date;player;totdist;max_speed;sprints\n2025-01-01;Player;8200,5;31,8;11\n"
        result = parse_gps_csv(content, strict=False)
        assert result.success is True
        rec = result.records[0]
        assert rec["total_distance_m"] == 8200.5

    def test_parse_empty_csv(self):
        result = parse_gps_csv(b"", strict=False)
        assert result.success is False

    def test_parse_bom_utf8(self):
        bom = b"\xef\xbb\xbf"
        content = bom + b"Date,Player Name,Total Distance,Player Load\n2025-01-01,Player,5000,300\n"
        result = parse_gps_csv(content, strict=False)
        assert result.success is True
        assert len(result.records) == 1

    def test_rows_with_no_data_still_parsed(self):
        content = self._make_csv(
            "Date,Player Name,Total Distance",
            ["2025-01-01,Player A,0"]
        )
        result = parse_gps_csv(content, strict=False)
        # Row with distance=0 is still parsed (just might be filtered later)
        assert result.total_rows == 1


# ============ NORMALIZER TESTS ============

class TestNormalizer:
    def test_basic_normalization(self):
        records = [
            {
                "total_distance_m": 8500.0,
                "high_speed_running_m": 1200.0,
                "max_speed_kmh": 32.5,
                "number_of_sprints": 12.0,
                "accelerations_count": 40.0,
                "decelerations_count": 35.0,
                "player_name": "Player Test",
                "session_date": "2025-01-01",
            }
        ]
        result = normalize_gps_data(records, "athlete123", "coach456")
        assert len(result) == 1
        doc = result[0]
        assert doc["athlete_id"] == "athlete123"
        assert doc["coach_id"] == "coach456"
        assert doc["total_distance"] == 8500.0
        assert doc["high_speed_running"] == 1200.0
        # max_speed converted from km/h to m/s
        assert abs(doc["max_speed"] - 32.5 / 3.6) < 0.1
        assert doc["number_of_sprints"] == 12
        assert doc["number_of_accelerations"] == 40
        assert doc["number_of_decelerations"] == 35
        assert doc["date"] == "2025-01-01"
        assert doc["activity_type"] == "training"

    def test_zero_data_row_skipped(self):
        records = [
            {
                "total_distance_m": 0,
                "high_intensity_distance_m": 0,
                "number_of_sprints": 0,
            }
        ]
        result = normalize_gps_data(records, "a", "c")
        assert len(result) == 0  # Row discarded

    def test_hsr_fallback_to_hid(self):
        records = [
            {
                "total_distance_m": 5000.0,
                "high_intensity_distance_m": 800.0,
                "number_of_sprints": 5.0,
            }
        ]
        result = normalize_gps_data(records, "a", "c")
        assert len(result) == 1
        doc = result[0]
        # high_speed_running should fallback to high_intensity_distance
        assert doc["high_speed_running"] == 800.0

    def test_date_parsing_formats(self):
        for date_str, expected in [
            ("2025-01-15", "2025-01-15"),
            ("15/01/2025", "2025-01-15"),
            ("01/15/2025", "2025-01-15"),
            ("15.01.2025", "2025-01-15"),
        ]:
            records = [{"total_distance_m": 1000, "number_of_sprints": 1, "session_date": date_str}]
            result = normalize_gps_data(records, "a", "c")
            assert result[0]["date"] == expected, f"Failed for {date_str}"

    def test_source_and_device_set(self):
        records = [{"total_distance_m": 5000, "number_of_sprints": 5}]
        result = normalize_gps_data(records, "a", "c", manufacturer=Manufacturer.CATAPULT)
        doc = result[0]
        assert doc["source"] == "csv_import_catapult"
        assert doc["device"] == "Catapult"

    def test_none_values_removed(self):
        records = [{"total_distance_m": 5000, "number_of_sprints": 5, "player_load": None}]
        result = normalize_gps_data(records, "a", "c")
        doc = result[0]
        assert "player_load" not in doc or doc.get("player_load") is not None


# ============ CONSOLIDATOR TESTS ============

class TestConsolidator:
    def _make_record(self, period_name="Period 1", **overrides):
        base = {
            "athlete_id": "a1", "coach_id": "c1", "session_id": "s1",
            "session_name": "Test", "date": "2025-01-01",
            "activity_type": "training", "source": "csv_import_catapult",
            "device": "Catapult", "period_name": period_name,
            "total_distance": 0, "high_intensity_distance": 0,
            "high_speed_running": 0, "sprint_distance": 0,
            "number_of_sprints": 0, "number_of_accelerations": 0,
            "number_of_decelerations": 0, "max_speed": 0,
            "max_acceleration": 0, "max_deceleration": 0,
        }
        base.update(overrides)
        return base

    # --- Period classification ---
    def test_classify_session_total_keyword(self):
        assert _classify_period_name("Match - Session Total") == "session_total"
        assert _classify_period_name("Session") == "session_total"
        assert _classify_period_name("Total") == "session_total"
        assert _classify_period_name("Full Session") == "session_total"

    def test_classify_period_keyword(self):
        assert _classify_period_name("1st Half") == "period"
        assert _classify_period_name("2nd Half") == "period"
        assert _classify_period_name("1º Tempo") == "period"
        assert _classify_period_name("Period 2") == "period"

    def test_classify_ambiguous_defaults_to_period(self):
        assert _classify_period_name("Treino Tático") == "period"
        assert _classify_period_name("Drill 3") == "period"
        assert _classify_period_name("") == "period"

    # --- Consolidation with session total ---
    def test_consolidate_with_session_total_no_duplication(self):
        """The core bug scenario: session(10000) + 1st(5000) + 2nd(5000) = 10000, NOT 20000"""
        records = [
            self._make_record("Match - Session Total", total_distance=10000, max_speed=9.5, number_of_sprints=18),
            self._make_record("Match - 1st Half", total_distance=5000, max_speed=9.5, number_of_sprints=10),
            self._make_record("Match - 2nd Half", total_distance=5000, max_speed=9.0, number_of_sprints=8),
        ]
        result = consolidate_session(records)
        assert result is not None
        assert result["total_distance"] == 10000  # From session total, NOT 20000
        assert result["number_of_sprints"] == 18   # From session total
        assert result["max_speed"] == 9.5           # Max across all
        assert result["has_session_total"] is True
        assert len(result["periods"]) == 2

    def test_consolidate_session_total_max_speed_from_period(self):
        """max_speed should be the MAX across ALL rows including periods"""
        records = [
            self._make_record("Session Total", total_distance=10000, max_speed=8.0),
            self._make_record("1st Half", total_distance=5000, max_speed=9.5),
            self._make_record("2nd Half", total_distance=5000, max_speed=8.5),
        ]
        result = consolidate_session(records)
        assert result["total_distance"] == 10000  # From session total
        assert result["max_speed"] == 9.5          # Max across all (from 1st Half)

    # --- Consolidation without session total (sum periods) ---
    def test_consolidate_periods_only_sums(self):
        records = [
            self._make_record("1st Half", total_distance=5500, number_of_sprints=11, max_speed=9.3),
            self._make_record("2nd Half", total_distance=4800, number_of_sprints=7, max_speed=8.7),
        ]
        result = consolidate_session(records)
        assert result["total_distance"] == 10300   # 5500 + 4800
        assert result["number_of_sprints"] == 18   # 11 + 7
        assert result["max_speed"] == 9.3           # Max
        assert result["has_session_total"] is False
        assert len(result["periods"]) == 2

    # --- Single record ---
    def test_consolidate_single_record(self):
        records = [self._make_record("Treino", total_distance=8200)]
        result = consolidate_session(records)
        assert result["total_distance"] == 8200
        assert result["has_session_total"] is True
        assert len(result["periods"]) == 0

    # --- Empty input ---
    def test_consolidate_empty(self):
        assert consolidate_session([]) is None

    # --- Period entries contain metrics ---
    def test_periods_embed_metrics(self):
        records = [
            self._make_record("Session Total", total_distance=10000),
            self._make_record("1st Half", total_distance=5000, high_speed_running=900),
        ]
        result = consolidate_session(records)
        period = result["periods"][0]
        assert period["period_name"] == "1st Half"
        assert period["total_distance"] == 5000
        assert period["high_speed_running"] == 900


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
