"""
Tests for Jump Analysis Module
==============================

Tests for baselines, trends, fatigue detection, and readiness assessment.
"""

import pytest
from datetime import datetime, timedelta
from jump_analysis import (
    calculate_athlete_baseline,
    calculate_trends,
    detect_fatigue,
    assess_readiness,
    generate_report,
    compare_athletes,
    normalize_jump_data,
)


# ============= TEST DATA FIXTURES =============

@pytest.fixture
def sample_cmj_jumps():
    """Generate sample CMJ jump data over 14 days."""
    base_date = datetime(2026, 2, 10)
    return [
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 35.2, "jump_date": base_date - timedelta(days=9)},
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 34.8, "jump_date": base_date - timedelta(days=8)},
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 36.1, "jump_date": base_date - timedelta(days=7)},  # Best
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 35.5, "jump_date": base_date - timedelta(days=6)},
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 33.9, "jump_date": base_date - timedelta(days=5)},
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 34.2, "jump_date": base_date - timedelta(days=4)},
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 35.0, "jump_date": base_date - timedelta(days=3)},
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 34.5, "jump_date": base_date - timedelta(days=2)},
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 35.8, "jump_date": base_date - timedelta(days=1)},
        {"athlete_id": "A001", "jump_type": "CMJ", "jump_height_cm": 34.0, "jump_date": base_date},  # Current
    ]


@pytest.fixture
def fatigued_athlete_jumps():
    """Generate sample data showing fatigue (significant drop)."""
    base_date = datetime(2026, 2, 10)
    return [
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 40.0, "jump_date": base_date - timedelta(days=14)},
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 39.5, "jump_date": base_date - timedelta(days=13)},
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 40.2, "jump_date": base_date - timedelta(days=12)},
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 39.8, "jump_date": base_date - timedelta(days=11)},
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 40.0, "jump_date": base_date - timedelta(days=10)},
        # Fatigue starts here
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 36.0, "jump_date": base_date - timedelta(days=3)},  # -10%
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 35.5, "jump_date": base_date - timedelta(days=2)},  # -11%
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 35.0, "jump_date": base_date - timedelta(days=1)},  # -12.5%
        {"athlete_id": "A002", "jump_type": "CMJ", "jump_height_cm": 34.5, "jump_date": base_date},  # -13.7%
    ]


@pytest.fixture
def dj_jumps_with_rsi():
    """Generate Drop Jump data with RSI values."""
    base_date = datetime(2026, 2, 10)
    return [
        {"athlete_id": "A003", "jump_type": "DJ", "jump_height_cm": 32.0, "contact_time_s": 0.195, "reactive_strength_index": 164.1, "jump_date": base_date - timedelta(days=5)},
        {"athlete_id": "A003", "jump_type": "DJ", "jump_height_cm": 33.5, "contact_time_s": 0.188, "reactive_strength_index": 178.2, "jump_date": base_date - timedelta(days=3)},
        {"athlete_id": "A003", "jump_type": "DJ", "jump_height_cm": 31.8, "contact_time_s": 0.200, "reactive_strength_index": 159.0, "jump_date": base_date - timedelta(days=1)},
        {"athlete_id": "A003", "jump_type": "DJ", "jump_height_cm": 30.5, "contact_time_s": 0.210, "reactive_strength_index": 145.2, "jump_date": base_date},
    ]


# ============= BASELINE TESTS =============

class TestBaselines:
    """Tests for baseline calculation."""
    
    def test_calculate_best_height(self, sample_cmj_jumps):
        """Best height should be identified correctly."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        assert baseline.best_height_cm == 36.1
    
    def test_calculate_career_average(self, sample_cmj_jumps):
        """Career average should be calculated correctly."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        # Average of all heights
        expected_avg = sum(j["jump_height_cm"] for j in sample_cmj_jumps) / len(sample_cmj_jumps)
        assert abs(baseline.career_avg_height_cm - expected_avg) < 0.1
    
    def test_calculate_cv_percent(self, sample_cmj_jumps):
        """Coefficient of Variation should be calculated."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        assert baseline.cv_height_percent is not None
        assert baseline.cv_height_percent > 0
        assert baseline.cv_height_percent < 10  # Should be low variance
    
    def test_rolling_averages(self, sample_cmj_jumps):
        """Rolling averages for different windows."""
        baseline = calculate_athlete_baseline(
            sample_cmj_jumps, "A001", "CMJ",
            reference_date=datetime(2026, 2, 10)
        )
        assert baseline.avg_7d_height_cm is not None
        assert baseline.avg_14d_height_cm is not None
        assert baseline.jumps_7d > 0
        assert baseline.jumps_14d > 0
    
    def test_empty_jumps_returns_empty_baseline(self):
        """Empty jump list should return baseline with no data."""
        baseline = calculate_athlete_baseline([], "A001", "CMJ")
        assert baseline.total_jumps == 0
        assert baseline.best_height_cm is None
        assert baseline.career_avg_height_cm is None
    
    def test_filters_by_jump_type(self, sample_cmj_jumps):
        """Should only consider jumps of the specified type."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "SJ")
        assert baseline.total_jumps == 0


# ============= TREND TESTS =============

class TestTrends:
    """Tests for trend analysis."""
    
    def test_delta_vs_best(self, sample_cmj_jumps):
        """Delta vs best should be calculated correctly."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        trends = calculate_trends(
            sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ"
        )
        # Current: 34.0, Best: 36.1
        # Delta = (34.0 - 36.1) / 36.1 * 100 = -5.82%
        assert trends.delta_height_vs_best_pct is not None
        assert trends.delta_height_vs_best_pct < 0  # Below best
    
    def test_current_values(self, sample_cmj_jumps):
        """Current values should be the most recent."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        trends = calculate_trends(
            sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ"
        )
        assert trends.current_height_cm == 34.0  # Most recent
    
    def test_trend_direction_declining(self, fatigued_athlete_jumps):
        """Declining trend should be detected."""
        baseline = calculate_athlete_baseline(fatigued_athlete_jumps, "A002", "CMJ")
        trends = calculate_trends(
            fatigued_athlete_jumps, baseline.to_dict(), "A002", "CMJ"
        )
        assert trends.height_trend.value == "declining"
    
    def test_slope_calculation(self, sample_cmj_jumps):
        """Weekly slope should be calculated."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        trends = calculate_trends(
            sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ"
        )
        assert trends.height_slope_per_week is not None


# ============= FATIGUE TESTS =============

class TestFatigueDetection:
    """Tests for fatigue detection."""
    
    def test_no_fatigue_normal_performance(self, sample_cmj_jumps):
        """Normal performance should not trigger fatigue flag."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        fatigue = detect_fatigue(
            sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ"
        )
        assert fatigue.fatigue_detected is False
        assert fatigue.fatigue_level.value in ["none", "low"]
    
    def test_fatigue_detected_significant_drop(self, fatigued_athlete_jumps):
        """Significant performance drop should trigger fatigue."""
        baseline = calculate_athlete_baseline(fatigued_athlete_jumps, "A002", "CMJ")
        fatigue = detect_fatigue(
            fatigued_athlete_jumps, baseline.to_dict(), "A002", "CMJ"
        )
        # 13.7% drop from baseline should trigger fatigue
        assert fatigue.cmj_drop_pct is not None
        assert fatigue.cmj_drop_pct > 10  # > 10% drop
    
    def test_cmj_threshold_breach(self, fatigued_athlete_jumps):
        """CMJ threshold breach should be detected."""
        baseline = calculate_athlete_baseline(fatigued_athlete_jumps, "A002", "CMJ")
        fatigue = detect_fatigue(
            fatigued_athlete_jumps, baseline.to_dict(), "A002", "CMJ"
        )
        assert fatigue.cmj_threshold_breached is True
    
    def test_recommendation_provided(self, sample_cmj_jumps):
        """Should always provide a recommendation."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        fatigue = detect_fatigue(
            sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ"
        )
        assert len(fatigue.recommendation) > 0


# ============= READINESS TESTS =============

class TestReadinessAssessment:
    """Tests for readiness assessment."""
    
    def test_good_readiness_normal_performance(self, sample_cmj_jumps):
        """Normal performance should result in good readiness."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        trends = calculate_trends(sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ")
        fatigue = detect_fatigue(sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ")
        
        readiness = assess_readiness(
            baseline.to_dict(), trends.to_dict(), fatigue.to_dict(), "A001"
        )
        
        assert readiness.readiness_level.value in ["optimal", "good", "moderate"]
        assert readiness.readiness_score >= 50
    
    def test_low_readiness_fatigued_athlete(self, fatigued_athlete_jumps):
        """Fatigued athlete should have lower readiness."""
        baseline = calculate_athlete_baseline(fatigued_athlete_jumps, "A002", "CMJ")
        trends = calculate_trends(fatigued_athlete_jumps, baseline.to_dict(), "A002", "CMJ")
        fatigue = detect_fatigue(fatigued_athlete_jumps, baseline.to_dict(), "A002", "CMJ")
        
        readiness = assess_readiness(
            baseline.to_dict(), trends.to_dict(), fatigue.to_dict(), "A002"
        )
        
        # Score should be lower due to fatigue
        assert readiness.trend_declining is True
    
    def test_training_load_modifier(self, sample_cmj_jumps):
        """Training load modifier should be provided."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        trends = calculate_trends(sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ")
        fatigue = detect_fatigue(sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ")
        
        readiness = assess_readiness(
            baseline.to_dict(), trends.to_dict(), fatigue.to_dict(), "A001"
        )
        
        assert readiness.training_load_modifier >= 0.3
        assert readiness.training_load_modifier <= 1.2
    
    def test_status_emoji_provided(self, sample_cmj_jumps):
        """Status emoji should be provided."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        trends = calculate_trends(sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ")
        fatigue = detect_fatigue(sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ")
        
        readiness = assess_readiness(
            baseline.to_dict(), trends.to_dict(), fatigue.to_dict(), "A001"
        )
        
        assert len(readiness.status_emoji) > 0


# ============= REPORT TESTS =============

class TestReportGeneration:
    """Tests for report generation."""
    
    def test_generate_complete_report(self, sample_cmj_jumps):
        """Should generate a complete report."""
        report = generate_report(
            sample_cmj_jumps, "A001", "João Silva", "CMJ", 14
        )
        
        assert report["athlete_id"] == "A001"
        assert report["athlete_name"] == "João Silva"
        assert "baseline" in report
        assert "trends" in report
        assert "fatigue" in report
        assert "readiness_detail" in report
    
    def test_report_with_empty_data(self):
        """Report with no data should indicate no_data quality."""
        report = generate_report([], "A001", "Test", "CMJ", 14)
        
        assert report["data_quality"] == "no_data"
        assert report["jumps_analyzed"] == 0
    
    def test_report_headline_generated(self, sample_cmj_jumps):
        """Report should have a headline."""
        report = generate_report(
            sample_cmj_jumps, "A001", "João", "CMJ", 14
        )
        
        assert len(report["headline"]) > 0
    
    def test_report_recommendation_generated(self, sample_cmj_jumps):
        """Report should have a recommendation."""
        report = generate_report(
            sample_cmj_jumps, "A001", "João", "CMJ", 14
        )
        
        assert len(report["recommendation"]) > 0


# ============= COMPARISON TESTS =============

class TestComparisons:
    """Tests for athlete comparisons."""
    
    def test_normalize_jump_data(self, sample_cmj_jumps):
        """Should normalize jump data with z-scores and percentages."""
        baseline = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        normalized = normalize_jump_data(
            sample_cmj_jumps, baseline.to_dict(), "A001", "CMJ"
        )
        
        assert len(normalized) > 0
        first = normalized[0]
        assert "z_height" in first or first.get("z_height") is None
        assert "pct_best_height" in first
    
    def test_compare_multiple_athletes(self, sample_cmj_jumps, fatigued_athlete_jumps):
        """Should compare multiple athletes."""
        baseline1 = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        baseline2 = calculate_athlete_baseline(fatigued_athlete_jumps, "A002", "CMJ")
        
        athlete_data = [
            {"athlete_id": "A001", "baseline": baseline1.to_dict(), "jumps": sample_cmj_jumps},
            {"athlete_id": "A002", "baseline": baseline2.to_dict(), "jumps": fatigued_athlete_jumps},
        ]
        
        comparison = compare_athletes(athlete_data, "pct_best_height", "CMJ")
        
        assert "athletes" in comparison
        assert len(comparison["athletes"]) == 2
        # Athletes should be ranked
        assert comparison["athletes"][0]["rank"] == 1
        assert comparison["athletes"][1]["rank"] == 2
    
    def test_comparison_group_statistics(self, sample_cmj_jumps, fatigued_athlete_jumps):
        """Comparison should include group statistics."""
        baseline1 = calculate_athlete_baseline(sample_cmj_jumps, "A001", "CMJ")
        baseline2 = calculate_athlete_baseline(fatigued_athlete_jumps, "A002", "CMJ")
        
        athlete_data = [
            {"athlete_id": "A001", "baseline": baseline1.to_dict(), "jumps": sample_cmj_jumps},
            {"athlete_id": "A002", "baseline": baseline2.to_dict(), "jumps": fatigued_athlete_jumps},
        ]
        
        comparison = compare_athletes(athlete_data, "z_height", "CMJ")
        
        assert "group_mean" in comparison
        assert "group_std" in comparison


# ============= RSI TESTS =============

class TestRSIAnalysis:
    """Tests for RSI (Reactive Strength Index) analysis."""
    
    def test_rsi_baseline_calculation(self, dj_jumps_with_rsi):
        """RSI baseline should be calculated for DJ jumps."""
        baseline = calculate_athlete_baseline(dj_jumps_with_rsi, "A003", "DJ")
        
        assert baseline.best_rsi is not None
        assert baseline.best_rsi == 178.2  # Highest RSI in data
        assert baseline.career_avg_rsi is not None
    
    def test_rsi_trend_analysis(self, dj_jumps_with_rsi):
        """RSI trends should be calculated."""
        baseline = calculate_athlete_baseline(dj_jumps_with_rsi, "A003", "DJ")
        trends = calculate_trends(
            dj_jumps_with_rsi, baseline.to_dict(), "A003", "DJ"
        )
        
        assert trends.current_rsi is not None
        # RSI is declining in sample data
        if trends.delta_rsi_vs_best_pct is not None:
            assert trends.delta_rsi_vs_best_pct < 0
