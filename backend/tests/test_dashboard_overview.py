"""
Test cases for the Dashboard Overview endpoint (GET /api/dashboard/overview).

Tests the advanced team performance intelligence dashboard with:
- 3 global filters (athlete_id, position, date_range)
- 3 modes: team (default), position (filter by position), athlete (individual)
- Summary stats, per-athlete metrics, timeline, insights
"""

import pytest
import requests
import os
from datetime import datetime

# Use the public URL from environment (same as frontend)
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://ios-native-audit.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"


@pytest.fixture(scope="module")
def auth_token():
    """Login and get auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get("access_token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for API calls"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestDashboardOverviewEndpoint:
    """Tests for GET /api/dashboard/overview endpoint"""
    
    def test_01_endpoint_returns_200(self, auth_headers):
        """Dashboard overview endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASSED: Dashboard overview returns 200")
    
    def test_02_default_mode_is_team(self, auth_headers):
        """Default mode (no filters) is 'team'"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        assert data.get("mode") == "team", f"Expected mode='team', got '{data.get('mode')}'"
        print(f"PASSED: Default mode is 'team'")
    
    def test_03_response_has_required_fields(self, auth_headers):
        """Response contains all required top-level fields"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        
        required_fields = ["mode", "filter", "positions", "summary", "athletes", "aggregated_timeline", "insights", "last_update"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
            print(f"  - Field '{field}' present")
        print("PASSED: All required top-level fields present")
    
    def test_04_summary_contains_team_metrics(self, auth_headers):
        """Summary contains team-level aggregated metrics"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        summary = data.get("summary", {})
        
        expected_summary_fields = [
            "total_athletes", "available", "unavailable", 
            "team_acwr", "team_wellness", "team_rsimod",
            "team_monotony", "team_strain", "team_lmpi",
            "team_acute_load", "team_chronic_load", "risk_distribution"
        ]
        
        for field in expected_summary_fields:
            assert field in summary, f"Missing summary field: {field}"
        print("PASSED: Summary contains all expected team metrics")
    
    def test_05_athletes_array_contains_per_athlete_data(self, auth_headers):
        """Athletes array contains per-athlete detailed data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        athletes = data.get("athletes", [])
        
        if len(athletes) == 0:
            pytest.skip("No athletes in response")
        
        # Check first athlete has required fields
        athlete = athletes[0]
        required_athlete_fields = [
            "id", "name", "position", "acwr", "acute_load", "chronic_load",
            "monotony", "strain", "wellness_score", "rsimod", "lmpi", "risk_level"
        ]
        
        for field in required_athlete_fields:
            assert field in athlete, f"Missing athlete field: {field}"
        print(f"PASSED: Athlete data contains all required fields (tested {len(athletes)} athletes)")
    
    def test_06_date_range_filter_7d(self, auth_headers):
        """date_range=7d filter works"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=7d", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["filter"]["date_range"] == "7d"
        assert data["filter"]["filter_days"] == 7
        print("PASSED: date_range=7d filter works")
    
    def test_07_date_range_filter_14d(self, auth_headers):
        """date_range=14d filter works"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=14d", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["filter"]["date_range"] == "14d"
        assert data["filter"]["filter_days"] == 14
        print("PASSED: date_range=14d filter works")
    
    def test_08_date_range_filter_28d(self, auth_headers):
        """date_range=28d filter works"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=28d", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["filter"]["date_range"] == "28d"
        assert data["filter"]["filter_days"] == 28
        print("PASSED: date_range=28d filter works")
    
    def test_09_date_range_filter_90d(self, auth_headers):
        """date_range=90d filter works"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=90d", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["filter"]["date_range"] == "90d"
        assert data["filter"]["filter_days"] == 90
        print("PASSED: date_range=90d filter works")
    
    def test_10_position_filter_changes_mode(self, auth_headers):
        """Selecting a position switches mode to 'position'"""
        # First get positions list
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        positions = data.get("positions", [])
        
        if not positions:
            pytest.skip("No positions available")
        
        position = positions[0]
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?position={position}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "position", f"Expected mode='position', got '{data['mode']}'"
        assert data["filter"]["position"] == position
        print(f"PASSED: Position filter '{position}' changes mode to 'position'")
    
    def test_11_athlete_filter_changes_mode(self, auth_headers):
        """Selecting an athlete_id switches mode to 'athlete'"""
        # First get athletes list
        response = requests.get(f"{BASE_URL}/api/athletes", headers=auth_headers)
        assert response.status_code == 200
        athletes = response.json()
        
        if not athletes:
            pytest.skip("No athletes available")
        
        athlete_id = athletes[0].get("id") or str(athletes[0].get("_id"))
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?athlete_id={athlete_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "athlete", f"Expected mode='athlete', got '{data['mode']}'"
        assert data["filter"]["athlete_id"] == athlete_id
        print(f"PASSED: Athlete filter changes mode to 'athlete'")
    
    def test_12_insights_object_present(self, auth_headers):
        """Insights object contains all expected insight keys"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        insights = data.get("insights", {})
        
        expected_insights = [
            "load_intelligence", "smart_summary", "team_status",
            "neuromuscular", "risk_intelligence"
        ]
        
        for key in expected_insights:
            assert key in insights, f"Missing insight: {key}"
            assert isinstance(insights[key], str), f"Insight {key} should be string"
        print("PASSED: All 5 insight keys present")
    
    def test_13_aggregated_timeline_present_in_team_mode(self, auth_headers):
        """aggregated_timeline is populated in team mode"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=28d", headers=auth_headers)
        data = response.json()
        
        agg_timeline = data.get("aggregated_timeline", [])
        # In team mode, aggregated_timeline should have entries
        if data["mode"] == "team" and data["summary"]["total_athletes"] > 0:
            assert len(agg_timeline) > 0, "aggregated_timeline should be populated in team mode"
            # Check timeline entry structure
            if agg_timeline:
                entry = agg_timeline[0]
                assert "date" in entry
                assert "total_distance" in entry
                print(f"PASSED: aggregated_timeline has {len(agg_timeline)} entries")
        else:
            print("PASSED: aggregated_timeline check (no athletes or not team mode)")
    
    def test_14_risk_distribution_format(self, auth_headers):
        """risk_distribution has correct format"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        
        risk_dist = data.get("summary", {}).get("risk_distribution", {})
        expected_keys = ["low", "optimal", "moderate", "high", "unknown"]
        
        for key in expected_keys:
            assert key in risk_dist, f"Missing risk_distribution key: {key}"
            assert isinstance(risk_dist[key], int), f"risk_distribution[{key}] should be int"
        print("PASSED: risk_distribution has correct format")
    
    def test_15_lang_parameter_pt(self, auth_headers):
        """lang=pt parameter works"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?lang=pt", headers=auth_headers)
        assert response.status_code == 200
        print("PASSED: lang=pt parameter works")
    
    def test_16_lang_parameter_en(self, auth_headers):
        """lang=en parameter works"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?lang=en", headers=auth_headers)
        assert response.status_code == 200
        print("PASSED: lang=en parameter works")
    
    def test_17_athlete_has_velocity_zones(self, auth_headers):
        """Athletes include velocity_zones data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        athletes = data.get("athletes", [])
        
        if not athletes:
            pytest.skip("No athletes available")
        
        athlete = athletes[0]
        vz = athlete.get("velocity_zones")
        assert vz is not None, "velocity_zones should be present"
        assert "low_intensity" in vz
        assert "hid_z3" in vz
        assert "hsr_z4" in vz
        assert "sprint_z5" in vz
        print("PASSED: Athlete has velocity_zones data")
    
    def test_18_athlete_has_daily_timeline(self, auth_headers):
        """Athletes include daily_timeline data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        athletes = data.get("athletes", [])
        
        if not athletes:
            pytest.skip("No athletes available")
        
        athlete = athletes[0]
        timeline = athlete.get("daily_timeline")
        assert timeline is not None, "daily_timeline should be present"
        assert isinstance(timeline, list), "daily_timeline should be a list"
        print(f"PASSED: Athlete has daily_timeline with {len(timeline)} entries")
    
    def test_19_athlete_has_acwr_timeline(self, auth_headers):
        """Athletes include acwr_timeline data"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        athletes = data.get("athletes", [])
        
        if not athletes:
            pytest.skip("No athletes available")
        
        athlete = athletes[0]
        acwr_timeline = athlete.get("acwr_timeline")
        assert acwr_timeline is not None, "acwr_timeline should be present"
        assert isinstance(acwr_timeline, list), "acwr_timeline should be a list"
        print(f"PASSED: Athlete has acwr_timeline with {len(acwr_timeline)} entries")
    
    def test_20_combined_filters(self, auth_headers):
        """Multiple filters can be combined"""
        # Get positions
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        data = response.json()
        positions = data.get("positions", [])
        
        if not positions:
            pytest.skip("No positions available")
        
        position = positions[0]
        response = requests.get(
            f"{BASE_URL}/api/dashboard/overview?position={position}&date_range=14d&lang=en", 
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filter"]["position"] == position
        assert data["filter"]["date_range"] == "14d"
        print("PASSED: Combined filters work correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
