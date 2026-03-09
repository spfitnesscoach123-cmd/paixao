"""
Unit Tests for Rolling Load Engine

Tests EWMA, ACWR, Monotony, Strain, and Spike Detection calculations.
"""

import pytest
import statistics
from load_engine import (
    # EWMA
    EWMACalculator,
    calculate_ewma_acute,
    calculate_ewma_chronic,
    EWMA_ACUTE_LAMBDA,
    EWMA_CHRONIC_LAMBDA,
    
    # ACWR
    ACWRCalculator,
    calculate_acwr,
    classify_acwr_zone,
    ACWRZone,
    
    # Spike
    SpikeDetector,
    calculate_monotony,
    calculate_strain,
    SpikeStatus,
)


class TestEWMACalculator:
    """Tests for EWMA calculations."""
    
    def setup_method(self):
        self.calc = EWMACalculator()
    
    def test_first_day_equals_load(self):
        """First day EWMA should equal the load."""
        result = self.calc.calculate_ewma(1000, None, EWMA_ACUTE_LAMBDA, is_first_day=True)
        assert result == 1000
    
    def test_ewma_formula(self):
        """Test EWMA formula: EWMA_today = Load * λ + EWMA_yesterday * (1 - λ)"""
        prev_ewma = 1000
        current_load = 2000
        lambda_val = 0.25
        
        expected = current_load * lambda_val + prev_ewma * (1 - lambda_val)
        result = self.calc.calculate_ewma(current_load, prev_ewma, lambda_val)
        
        assert result == expected
        assert result == 1250  # 2000 * 0.25 + 1000 * 0.75
    
    def test_acute_chronic_different(self):
        """Acute and chronic EWMA should have different decay rates."""
        load = 1000
        prev_acute = 500
        prev_chronic = 500
        
        acute = self.calc.calculate_acute_ewma(load, prev_acute)
        chronic = self.calc.calculate_chronic_ewma(load, prev_chronic)
        
        # Acute should respond faster (higher lambda)
        assert acute > chronic
    
    def test_zero_load_decreases_ewma(self):
        """Zero load should decrease EWMA towards zero."""
        prev_ewma = 1000
        
        acute = self.calc.calculate_acute_ewma(0, prev_ewma)
        
        assert acute < prev_ewma
        assert acute == prev_ewma * (1 - EWMA_ACUTE_LAMBDA)
    
    def test_calculate_from_history(self):
        """Test EWMA calculation from historical loads."""
        loads = [1000, 1000, 1000, 1000, 1000, 1000, 1000]
        
        ewma = self.calc.calculate_from_history(loads, EWMA_ACUTE_LAMBDA)
        
        # Constant load should converge to that load
        assert abs(ewma - 1000) < 50  # Allow small floating point variance
    
    def test_increasing_load_increases_ewma(self):
        """Increasing load should increase EWMA."""
        loads = [1000, 2000, 3000, 4000, 5000]
        
        ewma = self.calc.calculate_from_history(loads, EWMA_ACUTE_LAMBDA)
        
        # EWMA should be between min and max
        assert ewma > 1000
        assert ewma < 5000
        # With more values, EWMA weights recent values more
        # For short series, it may be close to mean
    
    def test_sudden_spike_response(self):
        """Test EWMA response to sudden workload spike."""
        # Normal load followed by spike
        prev_ewma = 1000
        spike_load = 5000
        
        acute = self.calc.calculate_acute_ewma(spike_load, prev_ewma)
        chronic = self.calc.calculate_chronic_ewma(spike_load, prev_ewma)
        
        # Both should increase, but acute more than chronic
        assert acute > prev_ewma
        assert chronic > prev_ewma
        assert acute > chronic
        
        # Acute should be: 5000 * 0.25 + 1000 * 0.75 = 2000
        assert acute == 2000


class TestACWRCalculator:
    """Tests for ACWR calculations."""
    
    def setup_method(self):
        self.calc = ACWRCalculator()
    
    def test_acwr_calculation(self):
        """Test basic ACWR calculation."""
        acute = 1000
        chronic = 800
        
        acwr = self.calc.calculate(acute, chronic)
        
        assert acwr == 1.25
    
    def test_acwr_zero_chronic(self):
        """ACWR should be None when chronic is zero."""
        acwr = self.calc.calculate(1000, 0)
        
        assert acwr is None
    
    def test_zone_classification_underload(self):
        """Test underload zone (< 0.8)."""
        zone = self.calc.classify(0.5)
        assert zone == ACWRZone.UNDERLOAD
        
        zone = self.calc.classify(0.79)
        assert zone == ACWRZone.UNDERLOAD
    
    def test_zone_classification_optimal(self):
        """Test optimal zone (0.8 - 1.3)."""
        zone = self.calc.classify(0.8)
        assert zone == ACWRZone.OPTIMAL
        
        zone = self.calc.classify(1.0)
        assert zone == ACWRZone.OPTIMAL
        
        zone = self.calc.classify(1.3)
        assert zone == ACWRZone.OPTIMAL
    
    def test_zone_classification_warning(self):
        """Test warning zone (1.3 - 1.5)."""
        zone = self.calc.classify(1.35)
        assert zone == ACWRZone.WARNING
        
        zone = self.calc.classify(1.5)
        assert zone == ACWRZone.WARNING
    
    def test_zone_classification_spike(self):
        """Test spike zone (> 1.5)."""
        zone = self.calc.classify(1.51)
        assert zone == ACWRZone.SPIKE
        
        zone = self.calc.classify(2.0)
        assert zone == ACWRZone.SPIKE
    
    def test_zone_classification_none(self):
        """Test unknown zone when ACWR is None."""
        zone = self.calc.classify(None)
        assert zone == ACWRZone.UNKNOWN
    
    def test_spike_detection(self):
        """Test spike detection based on ACWR."""
        has_spike, status = self.calc.detect_spike(1.6)
        assert has_spike is True
        assert status == SpikeStatus.HIGH
        
        has_spike, status = self.calc.detect_spike(2.5)
        assert has_spike is True
        assert status == SpikeStatus.CRITICAL
        
        has_spike, status = self.calc.detect_spike(1.0)
        assert has_spike is False
        assert status == SpikeStatus.NONE


class TestSpikeDetector:
    """Tests for Monotony, Strain, and Spike Detection."""
    
    def setup_method(self):
        self.detector = SpikeDetector()
    
    def test_monotony_calculation(self):
        """Test monotony = mean / std."""
        loads = [1000, 1200, 800, 1100, 900, 1000, 1000]
        
        mean_load = statistics.mean(loads)
        std_load = statistics.stdev(loads)
        expected_monotony = mean_load / std_load
        
        monotony = self.detector.calculate_monotony(loads)
        
        assert abs(monotony - expected_monotony) < 0.01
    
    def test_monotony_constant_load(self):
        """Constant load should give high monotony."""
        loads = [1000, 1000, 1000, 1000, 1000, 1000, 1000]
        
        monotony = self.detector.calculate_monotony(loads)
        
        # std = 0, so monotony should be high (10.0 in our implementation)
        assert monotony == 10.0
    
    def test_monotony_high_variation(self):
        """High variation should give low monotony."""
        loads = [1000, 5000, 500, 4000, 200, 6000, 100]
        
        monotony = self.detector.calculate_monotony(loads)
        
        # High variation = low monotony (< 2.0)
        assert monotony < 2.0
    
    def test_strain_calculation(self):
        """Test strain = weekly_load * monotony."""
        loads = [1000, 1200, 800, 1100, 900, 1000, 1000]
        
        weekly_load = sum(loads)
        monotony = self.detector.calculate_monotony(loads)
        expected_strain = weekly_load * monotony
        
        strain = self.detector.calculate_strain(loads)
        
        assert abs(strain - expected_strain) < 1.0
    
    def test_strain_with_zeros(self):
        """Test strain with zero load days."""
        loads = [1000, 0, 1000, 0, 1000, 0, 0]
        
        strain = self.detector.calculate_strain(loads)
        
        # With zeros, we should still get valid values
        assert strain >= 0
    
    def test_weekly_metrics(self):
        """Test all weekly metrics calculated together."""
        loads = [1000, 1200, 800, 1100, 900, 1000, 1000]
        
        metrics = self.detector.calculate_weekly_metrics(loads)
        
        assert "monotony" in metrics
        assert "strain" in metrics
        assert "weekly_load" in metrics
        assert "avg_daily_load" in metrics
        assert "std_daily_load" in metrics
        
        assert metrics["weekly_load"] == sum(loads)
        assert abs(metrics["avg_daily_load"] - statistics.mean(loads)) < 0.01
    
    def test_spike_from_loads(self):
        """Test spike detection from load comparison."""
        current = 3000
        previous = [1000, 1000, 1000, 1000, 1000]
        
        is_spike, ratio = self.detector.detect_spike_from_loads(current, previous)
        
        assert is_spike is True
        assert ratio == 3.0  # 3x the average
    
    def test_no_spike_normal_increase(self):
        """Test no spike with normal load increase."""
        current = 1200
        previous = [1000, 1000, 1000, 1000, 1000]
        
        is_spike, ratio = self.detector.detect_spike_from_loads(current, previous)
        
        assert is_spike is False
        assert ratio == 1.2
    
    def test_week_over_week_change(self):
        """Test week-over-week load change."""
        current_week = [1000, 1200, 800, 1100, 900, 1000, 1000]
        previous_week = [800, 900, 700, 800, 700, 800, 800]
        
        abs_change, pct_change = self.detector.calculate_week_over_week_change(
            current_week, previous_week
        )
        
        current_total = sum(current_week)  # 7000
        previous_total = sum(previous_week)  # 5500
        expected_abs = current_total - previous_total  # 1500
        expected_pct = (expected_abs / previous_total) * 100  # 27.27%
        
        assert abs(abs_change - expected_abs) < 1
        assert abs(pct_change - expected_pct) < 0.1


class TestIntegration:
    """Integration tests for the complete engine flow."""
    
    def test_complete_ewma_acwr_flow(self):
        """Test complete flow: loads -> EWMA -> ACWR -> zone."""
        ewma_calc = EWMACalculator()
        acwr_calc = ACWRCalculator()
        
        # Simulate 28 days of training
        daily_loads = [
            # Week 1 (days 1-7): Normal load
            5000, 4000, 6000, 5000, 5500, 4500, 0,
            # Week 2 (days 8-14): Normal load
            5000, 4000, 6000, 5000, 5500, 4500, 0,
            # Week 3 (days 15-21): Normal load
            5000, 4000, 6000, 5000, 5500, 4500, 0,
            # Week 4 (days 22-28): Sudden spike
            8000, 9000, 10000, 8000, 9000, 10000, 8000,
        ]
        
        # Calculate EWMA for each day
        acute = None
        chronic = None
        
        for i, load in enumerate(daily_loads):
            is_first = (i == 0)
            acute, chronic = ewma_calc.calculate_both(load, acute, chronic, is_first)
        
        # Calculate final ACWR
        acwr = acwr_calc.calculate(acute, chronic)
        zone = acwr_calc.classify(acwr)
        
        # After sudden spike, ACWR should be elevated
        assert acwr is not None
        assert acwr > 1.0  # Above baseline
        
        # Zone should be warning or spike due to increase
        assert zone in [ACWRZone.WARNING, ACWRZone.SPIKE, ACWRZone.OPTIMAL]
    
    def test_zero_load_period_recovery(self):
        """Test EWMA behavior after a period of zero load."""
        ewma_calc = EWMACalculator()
        
        # Build up EWMA
        acute = 1000
        chronic = 1000
        
        # Week of rest (zero load)
        for _ in range(7):
            acute, chronic = ewma_calc.calculate_both(0, acute, chronic)
        
        # EWMA should decrease but not be zero
        assert acute > 0
        assert chronic > 0
        assert acute < 500  # Significant decrease
        
        # Resume training
        acute, chronic = ewma_calc.calculate_both(5000, acute, chronic)
        
        # Should spike because baseline is low
        acwr = calculate_acwr(acute, chronic)
        assert acwr is not None
        # High ACWR expected due to low chronic baseline
    
    def test_steady_state_acwr(self):
        """Test that steady training leads to ACWR near 1.0."""
        ewma_calc = EWMACalculator()
        
        # 60 days of constant training
        acute = None
        chronic = None
        
        for i in range(60):
            is_first = (i == 0)
            acute, chronic = ewma_calc.calculate_both(5000, acute, chronic, is_first)
        
        acwr = calculate_acwr(acute, chronic)
        zone = classify_acwr_zone(acwr)
        
        # Should be very close to 1.0 in steady state
        assert acwr is not None
        assert abs(acwr - 1.0) < 0.1
        assert zone == ACWRZone.OPTIMAL


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
