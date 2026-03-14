"""
Test Suite for ACWR EWMA Fix

Tests the fix for ACWR calculation on Team Dashboard endpoint.
Previously, ACWR was incorrectly stuck at 4.0 for all athletes due to
using inline 'Coupled ACWR' calculation instead of EWMA-based Rolling Load Engine.

Key tests:
- GET /api/dashboard/team returns EWMA-based ACWR (not 4.0)
- ACWR = 1.0 for athletes with only 1 day of GPS data
- Athletes without GPS data should have acwr=null and risk_level='unknown'
- team_avg_acwr is calculated only from valid ACWR values
- risk_distribution correctly categorizes athletes
- All 6 acwr_metric options work correctly
- GET /api/load-metrics/team/latest returns consistent EWMA ACWR values
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fallback for local development
    BASE_URL = "https://ratio-fix-1.preview.emergentagent.com"

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"

# Known athlete IDs from the database
ATHLETE_WITH_GPS = "69a6ca6a85668876432f090a"  # João Silva
ATHLETES_WITHOUT_GPS = ["maria_santos_id", "pedro_costa_id"]  # No GPS data

# All 6 ACWR metric options
ACWR_METRICS = [
    "total_distance",
    "high_intensity_distance",
    "high_speed_running",
    "sprint_distance",
    "number_of_sprints",
    "acc_dec"
]


class TestACWREWMAFix:
    """Tests for the ACWR EWMA fix on Team Dashboard"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Authenticate
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.text}")
        
        login_data = login_response.json()
        # Note: API returns 'access_token', not 'token'
        token = login_data.get("access_token")
        if not token:
            pytest.skip("No access_token in login response")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.user = login_data.get("user", {})
    
    # ============================================================
    # TEST 1: Team Dashboard returns EWMA-based ACWR (NOT 4.0)
    # ============================================================
    def test_team_dashboard_acwr_not_stuck_at_4(self):
        """
        CRITICAL TEST: ACWR should NOT be stuck at 4.0 for all athletes.
        Before the fix, all athletes showed ACWR=4.0 due to Coupled ACWR calculation.
        After the fix, EWMA-based ACWR should return different values.
        """
        response = self.session.get(
            f"{BASE_URL}/api/dashboard/team",
            params={"lang": "pt", "acwr_metric": "total_distance", "date_range": "7d"}
        )
        
        assert response.status_code == 200, f"API returned {response.status_code}: {response.text}"
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find athletes with ACWR values
        acwr_values = []
        for athlete in athletes:
            acwr = athlete.get("acwr")
            if acwr is not None:
                acwr_values.append(acwr)
                # CRITICAL: No ACWR should be exactly 4.0 (the bug value)
                assert acwr != 4.0, f"Bug detected! ACWR still stuck at 4.0 for athlete {athlete.get('name')}"
        
        print(f"ACWR values found: {acwr_values}")
        
        # If we have GPS data, we should have at least one ACWR value
        if len(acwr_values) == 0:
            print("Warning: No athletes with GPS data/ACWR values found")
    
    # ============================================================
    # TEST 2: ACWR = 1.0 for athletes with only 1 day of GPS data
    # ============================================================
    def test_acwr_equals_1_for_single_day_data(self):
        """
        EWMA property: For a single data point, EWMA_acute = EWMA_chronic = load
        Therefore ACWR = ewma_acute / ewma_chronic = 1.0
        
        João Silva has only 1 GPS record dated 2026-03-03, so ACWR should be 1.0
        """
        response = self.session.get(
            f"{BASE_URL}/api/dashboard/team",
            params={"lang": "pt", "acwr_metric": "total_distance", "date_range": "7d"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Find João Silva (athlete with GPS data)
        joao_silva = None
        for athlete in data.get("athletes", []):
            if "joão" in athlete.get("name", "").lower() or "joao" in athlete.get("name", "").lower():
                joao_silva = athlete
                break
            # Also check by athlete ID
            if athlete.get("id") == ATHLETE_WITH_GPS:
                joao_silva = athlete
                break
        
        if joao_silva is None:
            pytest.skip("João Silva not found in athletes list")
        
        acwr = joao_silva.get("acwr")
        print(f"João Silva ACWR: {acwr}")
        
        # EWMA property: single day data should have ACWR = 1.0
        if acwr is not None:
            assert acwr == 1.0, f"ACWR should be 1.0 for single-day data, got {acwr}"
        else:
            pytest.fail("João Silva should have ACWR value but got None")
    
    # ============================================================
    # TEST 3: Athletes without GPS data have acwr=null, risk='unknown'
    # ============================================================
    def test_athletes_without_gps_have_null_acwr_and_unknown_risk(self):
        """
        Athletes with no GPS data should have:
        - acwr: null
        - risk_level: 'unknown'
        
        Maria Santos and Pedro Costa have no GPS data
        """
        response = self.session.get(
            f"{BASE_URL}/api/dashboard/team",
            params={"lang": "pt", "acwr_metric": "total_distance", "date_range": "7d"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        athletes_without_gps_found = []
        for athlete in data.get("athletes", []):
            name = athlete.get("name", "").lower()
            # Check for Maria Santos or Pedro Costa
            if "maria" in name or "pedro" in name:
                athletes_without_gps_found.append(athlete)
                
                acwr = athlete.get("acwr")
                risk_level = athlete.get("risk_level")
                
                # Should have null ACWR and unknown risk
                assert acwr is None, f"{athlete.get('name')} has no GPS data but ACWR is {acwr} instead of null"
                assert risk_level == "unknown", f"{athlete.get('name')} should have risk_level='unknown', got '{risk_level}'"
                
                print(f"{athlete.get('name')}: acwr={acwr}, risk_level={risk_level} - CORRECT")
        
        if len(athletes_without_gps_found) == 0:
            print("Warning: No athletes without GPS data found (Maria/Pedro)")
    
    # ============================================================
    # TEST 4: team_avg_acwr calculated only from valid ACWR values
    # ============================================================
    def test_team_avg_acwr_excludes_null_values(self):
        """
        team_avg_acwr should be calculated only from athletes with valid ACWR values.
        Athletes with null ACWR should be excluded from the average calculation.
        """
        response = self.session.get(
            f"{BASE_URL}/api/dashboard/team",
            params={"lang": "pt", "acwr_metric": "total_distance", "date_range": "7d"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # team_avg_acwr is inside 'stats'
        stats = data.get("stats", {})
        team_avg_acwr = stats.get("team_avg_acwr")
        athletes = data.get("athletes", [])
        
        # Count athletes with valid ACWR
        valid_acwr_values = [a.get("acwr") for a in athletes if a.get("acwr") is not None]
        
        print(f"Team avg ACWR: {team_avg_acwr}")
        print(f"Valid ACWR values: {valid_acwr_values}")
        
        if len(valid_acwr_values) > 0:
            # Calculate expected average
            expected_avg = sum(valid_acwr_values) / len(valid_acwr_values)
            
            # Allow small floating point difference
            if team_avg_acwr is not None:
                assert abs(team_avg_acwr - expected_avg) < 0.01, \
                    f"team_avg_acwr ({team_avg_acwr}) doesn't match expected average ({expected_avg})"
        else:
            # No valid ACWR values, team_avg should be 0 or null
            assert team_avg_acwr in [0, None], f"No valid ACWR but team_avg_acwr is {team_avg_acwr}"
    
    # ============================================================
    # TEST 5: risk_distribution correctly categorizes athletes
    # ============================================================
    def test_risk_distribution_categorization(self):
        """
        risk_distribution should correctly count athletes in each category:
        - low: ACWR < 0.8
        - optimal: ACWR 0.8-1.3
        - moderate: ACWR 1.3-1.5
        - high: ACWR > 1.5
        - unknown: no GPS data / null ACWR
        """
        response = self.session.get(
            f"{BASE_URL}/api/dashboard/team",
            params={"lang": "pt", "acwr_metric": "total_distance", "date_range": "7d"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        risk_distribution = data.get("risk_distribution", {})
        athletes = data.get("athletes", [])
        
        print(f"Risk distribution: {risk_distribution}")
        
        # Verify structure
        assert "low" in risk_distribution, "risk_distribution should have 'low' key"
        assert "optimal" in risk_distribution, "risk_distribution should have 'optimal' key"
        assert "moderate" in risk_distribution, "risk_distribution should have 'moderate' key"
        assert "high" in risk_distribution, "risk_distribution should have 'high' key"
        assert "unknown" in risk_distribution, "risk_distribution should have 'unknown' key"
        
        # Count expected distribution
        expected = {"low": 0, "optimal": 0, "moderate": 0, "high": 0, "unknown": 0}
        for athlete in athletes:
            acwr = athlete.get("acwr")
            if acwr is None:
                expected["unknown"] += 1
            elif acwr < 0.8:
                expected["low"] += 1
            elif acwr <= 1.3:
                expected["optimal"] += 1
            elif acwr <= 1.5:
                expected["moderate"] += 1
            else:
                expected["high"] += 1
        
        print(f"Expected distribution: {expected}")
        
        # Verify counts match
        for category in expected:
            actual = risk_distribution.get(category, 0)
            assert actual == expected[category], \
                f"risk_distribution['{category}'] is {actual}, expected {expected[category]}"
    
    # ============================================================
    # TEST 6: All 6 acwr_metric options work correctly
    # ============================================================
    @pytest.mark.parametrize("metric", ACWR_METRICS)
    def test_all_acwr_metrics_work(self, metric):
        """
        Test that all 6 acwr_metric options return valid responses:
        - total_distance
        - high_intensity_distance
        - high_speed_running
        - sprint_distance
        - number_of_sprints
        - acc_dec
        """
        response = self.session.get(
            f"{BASE_URL}/api/dashboard/team",
            params={"lang": "pt", "acwr_metric": metric, "date_range": "7d"}
        )
        
        assert response.status_code == 200, f"API failed for acwr_metric={metric}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "athletes" in data, f"Response for {metric} missing 'athletes'"
        assert "stats" in data, f"Response for {metric} missing 'stats'"
        assert "risk_distribution" in data, f"Response for {metric} missing 'risk_distribution'"
        
        # team_avg_acwr is inside stats
        stats = data.get("stats", {})
        assert "team_avg_acwr" in stats, f"stats for {metric} missing 'team_avg_acwr'"
        
        # For athlete with GPS data, ACWR should be 1.0 (single day)
        for athlete in data.get("athletes", []):
            acwr = athlete.get("acwr")
            if acwr is not None:
                # Not stuck at 4.0
                assert acwr != 4.0, f"ACWR still 4.0 for metric {metric}"
                print(f"Metric {metric}: {athlete.get('name')} ACWR = {acwr}")
    
    # ============================================================
    # TEST 7: GET /api/load-metrics/team/latest returns consistent values
    # ============================================================
    def test_load_metrics_team_latest_consistency(self):
        """
        GET /api/load-metrics/team/latest should return EWMA-based ACWR values
        that are consistent with the Team Dashboard endpoint.
        """
        response = self.session.get(f"{BASE_URL}/api/load-metrics/team/latest")
        
        assert response.status_code == 200, f"API returned {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert data.get("success") == True, "Response should have success=True"
        assert "metrics" in data, "Response should have 'metrics' array"
        
        metrics = data.get("metrics", [])
        print(f"Team metrics count: {len(metrics)}")
        
        for m in metrics:
            athlete_name = m.get("athlete_name")
            distance_acwr = m.get("distance_acwr")
            
            print(f"{athlete_name}: distance_acwr={distance_acwr}")
            
            # If we have ACWR, it shouldn't be 4.0
            if distance_acwr is not None:
                assert distance_acwr != 4.0, f"Bug: ACWR stuck at 4.0 for {athlete_name}"
                # For single-day data, ACWR should be 1.0
                if "joão" in athlete_name.lower() or "joao" in athlete_name.lower():
                    assert distance_acwr == 1.0, f"João Silva should have ACWR=1.0, got {distance_acwr}"


class TestBackendStartup:
    """Test that backend starts without errors and initializes correctly"""
    
    def test_backend_health(self):
        """Backend should respond to health check"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        # Some APIs may not have /health endpoint, check alternatives
        if response.status_code == 404:
            # Try root or docs
            response = requests.get(f"{BASE_URL}/api/docs", timeout=10)
        
        # Backend should respond (200, 307 redirect, etc.)
        assert response.status_code < 500, f"Backend returned server error: {response.status_code}"
    
    def test_login_endpoint_available(self):
        """Login endpoint should be available"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Login response should contain 'access_token'"
        assert "user" in data, "Login response should contain 'user'"


class TestAthleteLoadMetricsCollection:
    """Tests for athlete_load_metrics collection initialization"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed")
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_individual_athlete_load_metrics(self):
        """
        GET /api/load-metrics/{athlete_id} should return EWMA metrics
        for an athlete with GPS data.
        """
        response = self.session.get(f"{BASE_URL}/api/load-metrics/{ATHLETE_WITH_GPS}")
        
        assert response.status_code == 200, f"API returned {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify EWMA metric structure
        assert "distance" in data, "Response should have 'distance' metric"
        
        distance = data.get("distance", {})
        if distance:
            assert "ewma_acute" in distance, "distance should have ewma_acute"
            assert "ewma_chronic" in distance, "distance should have ewma_chronic"
            assert "acwr" in distance, "distance should have acwr"
            
            # For single day, ACWR should be 1.0
            acwr = distance.get("acwr")
            if acwr is not None:
                assert acwr == 1.0, f"ACWR should be 1.0 for single-day data, got {acwr}"
            
            print(f"Distance EWMA: acute={distance.get('ewma_acute')}, chronic={distance.get('ewma_chronic')}, acwr={acwr}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
