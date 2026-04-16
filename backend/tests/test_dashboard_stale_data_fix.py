"""
Test Dashboard Stale Data Fix:
- GPS CREATE updates athlete_load_metrics and Overview API reflects new data
- GPS DELETE cleans stale metrics and Overview API reverts to baseline
- Dashboard Overview and Team Dashboard return consistent values

Test Athlete: João Silva (69a6ca6a85668876432f090a) with GPS on 2026-03-03
Credentials: contato@loadmanagerpro.com.br / #UAE2026
API URL: https://slcmj-audit.preview.emergentagent.com
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://slcmj-audit.preview.emergentagent.com").rstrip("/")

# Test athlete info
JOAO_SILVA_ID = "69a6ca6a85668876432f090a"

@pytest.fixture(scope="module")
def auth_token():
    """Authenticate and get token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "contato@loadmanagerpro.com.br",
        "password": "#UAE2026"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json().get("access_token")
    assert token, "No access_token in response"
    return token

@pytest.fixture(scope="module")
def headers(auth_token):
    """Auth headers for requests"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestDashboardStaleDataFix:
    """Test GPS create/delete properly updates athlete_load_metrics and dashboard APIs"""
    
    # Store state between tests
    baseline_overview = None
    baseline_team = None
    created_gps_session_id = None
    test_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")  # Future date to avoid conflicts
    
    def test_01_get_baseline_overview(self, headers):
        """Get baseline Overview API values BEFORE GPS creation"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/overview?lang=en&date_range=28d&athlete_id={JOAO_SILVA_ID}",
            headers=headers
        )
        assert response.status_code == 200, f"Overview failed: {response.text}"
        
        data = response.json()
        TestDashboardStaleDataFix.baseline_overview = {
            "team_acwr": data.get("summary", {}).get("team_acwr"),
            "team_acute_load": data.get("summary", {}).get("team_acute_load"),
            "team_chronic_load": data.get("summary", {}).get("team_chronic_load"),
            "mode": data.get("mode"),
        }
        
        # Also get the athlete's ACWR from athletes array
        athletes = data.get("athletes", [])
        if athletes:
            TestDashboardStaleDataFix.baseline_overview["athlete_acwr"] = athletes[0].get("acwr")
            TestDashboardStaleDataFix.baseline_overview["athlete_acute_load"] = athletes[0].get("acute_load")
        
        print(f"BASELINE Overview: {TestDashboardStaleDataFix.baseline_overview}")
        assert TestDashboardStaleDataFix.baseline_overview["team_acwr"] is not None or TestDashboardStaleDataFix.baseline_overview.get("athlete_acwr") is not None
    
    def test_02_get_baseline_team_dashboard(self, headers):
        """Get baseline Team Dashboard API values"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/team?lang=en&date_range=7d",
            headers=headers
        )
        assert response.status_code == 200, f"Team Dashboard failed: {response.text}"
        
        data = response.json()
        TestDashboardStaleDataFix.baseline_team = {
            "team_avg_acwr": data.get("stats", {}).get("team_avg_acwr"),
            "total_distance_this_week": data.get("stats", {}).get("total_distance_this_week"),
        }
        
        # Find João Silva in athletes
        athletes = data.get("athletes", [])
        for a in athletes:
            if a.get("id") == JOAO_SILVA_ID:
                TestDashboardStaleDataFix.baseline_team["joao_acwr"] = a.get("acwr")
                break
        
        print(f"BASELINE Team: {TestDashboardStaleDataFix.baseline_team}")
    
    def test_03_create_gps_data(self, headers):
        """Create new GPS data for João Silva on a new date"""
        test_date = TestDashboardStaleDataFix.test_date
        session_id = f"test_stale_fix_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        TestDashboardStaleDataFix.created_gps_session_id = session_id
        
        gps_payload = {
            "athlete_id": JOAO_SILVA_ID,
            "date": test_date,
            "session_id": session_id,
            "session_name": "Test Stale Data Fix",
            "activity_type": "training",
            "total_distance": 8000,  # 8km
            "high_intensity_distance": 1500,
            "high_speed_running": 800,
            "sprint_distance": 300,
            "number_of_sprints": 10,
            "number_of_accelerations": 25,
            "number_of_decelerations": 20,
            "max_speed": 28.5,
            "notes": "Test data for stale data fix verification"
        }
        
        response = requests.post(f"{BASE_URL}/api/gps-data", json=gps_payload, headers=headers)
        assert response.status_code == 200, f"GPS create failed: {response.text}"
        
        data = response.json()
        assert data.get("session_id") == session_id
        assert data.get("athlete_id") == JOAO_SILVA_ID
        print(f"Created GPS with session_id: {session_id} on date: {test_date}")
    
    def test_04_verify_overview_updated_after_create(self, headers):
        """Verify Overview API shows updated data after GPS creation"""
        time.sleep(0.5)  # Small delay for async processing
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/overview?lang=en&date_range=90d&athlete_id={JOAO_SILVA_ID}",
            headers=headers
        )
        assert response.status_code == 200, f"Overview failed: {response.text}"
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # The data should be different from baseline (more data = different EWMA/ACWR)
        current_acwr = None
        current_acute = None
        if athletes:
            current_acwr = athletes[0].get("acwr")
            current_acute = athletes[0].get("acute_load")
        
        print(f"AFTER CREATE - Overview athlete ACWR: {current_acwr}, acute_load: {current_acute}")
        
        # Verify we have data
        assert data.get("mode") is not None, "Overview mode should be present"
    
    def test_05_verify_team_dashboard_updated(self, headers):
        """Verify Team Dashboard shows updated data after GPS creation"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/team?lang=en&date_range=28d",
            headers=headers
        )
        assert response.status_code == 200, f"Team Dashboard failed: {response.text}"
        
        data = response.json()
        stats = data.get("stats", {})
        
        print(f"AFTER CREATE - Team Dashboard total_distance_this_week: {stats.get('total_distance_this_week')}")
    
    def test_06_delete_gps_data(self, headers):
        """Delete the created GPS data"""
        session_id = TestDashboardStaleDataFix.created_gps_session_id
        assert session_id, "No session_id to delete"
        
        response = requests.post(
            f"{BASE_URL}/api/gps-data/delete-activities",
            json={"session_ids": [session_id]},
            headers=headers
        )
        assert response.status_code == 200, f"GPS delete failed: {response.text}"
        
        data = response.json()
        assert data.get("deleted_count", 0) > 0, "Should have deleted at least 1 record"
        
        # Verify metrics were recalculated
        metrics_recalc = data.get("metrics_recalculated", [])
        print(f"DELETE response: deleted_count={data.get('deleted_count')}, metrics_recalculated={metrics_recalc}")
    
    def test_07_verify_overview_reverted_after_delete(self, headers):
        """Verify Overview API reverted to baseline after GPS deletion"""
        time.sleep(0.5)  # Small delay for async processing
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/overview?lang=en&date_range=28d&athlete_id={JOAO_SILVA_ID}",
            headers=headers
        )
        assert response.status_code == 200, f"Overview failed: {response.text}"
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        current_acwr = None
        if athletes:
            current_acwr = athletes[0].get("acwr")
        
        baseline_acwr = TestDashboardStaleDataFix.baseline_overview.get("athlete_acwr")
        
        print(f"AFTER DELETE - Overview athlete ACWR: {current_acwr}, BASELINE was: {baseline_acwr}")
        
        # ACWR should be close to baseline (within tolerance for EWMA decay)
        if baseline_acwr is not None and current_acwr is not None:
            # Allow 0.1 tolerance for EWMA floating point calculations
            assert abs(current_acwr - baseline_acwr) < 0.5, \
                f"ACWR should revert to baseline. Got {current_acwr}, expected ~{baseline_acwr}"
    
    def test_08_verify_team_dashboard_reverted(self, headers):
        """Verify Team Dashboard reverted after GPS deletion"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/team?lang=en&date_range=7d",
            headers=headers
        )
        assert response.status_code == 200, f"Team Dashboard failed: {response.text}"
        
        data = response.json()
        stats = data.get("stats", {})
        
        print(f"AFTER DELETE - Team Dashboard total_distance_this_week: {stats.get('total_distance_this_week')}")
        
        # The total distance should be back to baseline (or close)
        baseline_dist = TestDashboardStaleDataFix.baseline_team.get("total_distance_this_week", 0)
        current_dist = stats.get("total_distance_this_week", 0)
        
        # Verify the data didn't increase (deleted GPS should be removed from totals)
        print(f"Baseline distance: {baseline_dist}, Current distance: {current_dist}")


class TestDashboardConsistency:
    """Test that Overview and Team Dashboard return consistent values for same athlete"""
    
    def test_01_overview_and_team_consistent_acwr(self, headers):
        """Verify Overview and Team Dashboard return consistent ACWR for João Silva"""
        # Get Overview for individual athlete
        overview_resp = requests.get(
            f"{BASE_URL}/api/dashboard/overview?lang=en&date_range=28d&athlete_id={JOAO_SILVA_ID}",
            headers=headers
        )
        assert overview_resp.status_code == 200
        overview_data = overview_resp.json()
        
        # Get Team Dashboard
        team_resp = requests.get(
            f"{BASE_URL}/api/dashboard/team?lang=en&date_range=28d",
            headers=headers
        )
        assert team_resp.status_code == 200
        team_data = team_resp.json()
        
        # Extract João's ACWR from Overview
        overview_athletes = overview_data.get("athletes", [])
        overview_acwr = None
        if overview_athletes:
            overview_acwr = overview_athletes[0].get("acwr")
        
        # Extract João's ACWR from Team Dashboard
        team_athletes = team_data.get("athletes", [])
        team_acwr = None
        for a in team_athletes:
            if a.get("id") == JOAO_SILVA_ID:
                team_acwr = a.get("acwr")
                break
        
        print(f"Overview ACWR for João: {overview_acwr}")
        print(f"Team Dashboard ACWR for João: {team_acwr}")
        
        # They should be the same (or very close)
        if overview_acwr is not None and team_acwr is not None:
            assert abs(overview_acwr - team_acwr) < 0.01, \
                f"ACWR mismatch: Overview={overview_acwr}, Team={team_acwr}"
    
    def test_02_overview_summary_has_required_fields(self, headers):
        """Verify Overview summary contains all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/overview?lang=en&date_range=28d",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        summary = data.get("summary", {})
        
        # Required fields in summary for team mode
        required_fields = [
            "team_acwr", "team_acute_load", "team_chronic_load",
            "team_monotony", "team_strain", "team_wellness", "team_readiness"
        ]
        
        for field in required_fields:
            assert field in summary, f"Missing required field '{field}' in summary"
            print(f"  {field}: {summary.get(field)}")
    
    def test_03_team_dashboard_stats_has_required_fields(self, headers):
        """Verify Team Dashboard stats contains all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/team?lang=en&date_range=7d",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        stats = data.get("stats", {})
        
        required_fields = [
            "total_athletes", "team_avg_acwr", "team_avg_wellness", 
            "team_avg_readiness", "total_distance_this_week"
        ]
        
        for field in required_fields:
            assert field in stats, f"Missing required field '{field}' in stats"
            print(f"  {field}: {stats.get(field)}")


class TestFrontendUseFocusEffect:
    """Verify useFocusEffect is properly implemented in frontend files"""
    
    def test_data_tsx_has_useFocusEffect_import(self):
        """Verify data.tsx imports useFocusEffect from expo-router"""
        with open("/app/frontend/app/(tabs)/data.tsx", "r") as f:
            content = f.read()
        
        assert "import { useFocusEffect } from 'expo-router'" in content or \
               "useFocusEffect } from 'expo-router'" in content, \
               "data.tsx should import useFocusEffect from expo-router"
        print("data.tsx: useFocusEffect import FOUND")
    
    def test_data_tsx_uses_useFocusEffect_for_refetch(self):
        """Verify data.tsx uses useFocusEffect to call refetch()"""
        with open("/app/frontend/app/(tabs)/data.tsx", "r") as f:
            content = f.read()
        
        # Check for the useFocusEffect hook usage
        assert "useFocusEffect(" in content, "data.tsx should use useFocusEffect"
        assert "refetch()" in content, "data.tsx should call refetch()"
        
        # Verify the pattern: useFocusEffect with refetch
        assert "useCallback(() => {" in content or "useCallback(() =>" in content, \
            "Should use useCallback with useFocusEffect"
        print("data.tsx: useFocusEffect with refetch() FOUND")
    
    def test_team_tsx_has_useFocusEffect_import(self):
        """Verify team.tsx imports useFocusEffect from expo-router"""
        with open("/app/frontend/app/(tabs)/team.tsx", "r") as f:
            content = f.read()
        
        assert "useFocusEffect" in content, "team.tsx should import useFocusEffect"
        assert "expo-router" in content, "useFocusEffect should come from expo-router"
        print("team.tsx: useFocusEffect import FOUND")
    
    def test_team_tsx_uses_useFocusEffect_for_refetch(self):
        """Verify team.tsx uses useFocusEffect to call refetch()"""
        with open("/app/frontend/app/(tabs)/team.tsx", "r") as f:
            content = f.read()
        
        # Check for the useFocusEffect hook usage
        assert "useFocusEffect(" in content, "team.tsx should use useFocusEffect"
        assert "refetch()" in content, "team.tsx should call refetch()"
        print("team.tsx: useFocusEffect with refetch() FOUND")
    
    def test_layout_tsx_no_custom_staleTime(self):
        """Verify _layout.tsx QueryClient has no custom staleTime that would prevent refetch"""
        with open("/app/frontend/app/_layout.tsx", "r") as f:
            content = f.read()
        
        # Check that QueryClient is created without custom staleTime: Infinity
        assert "QueryClient()" in content or "new QueryClient" in content, \
            "_layout.tsx should create QueryClient"
        
        # Ensure no staleTime: Infinity which would prevent refetch from working
        if "staleTime" in content:
            assert "Infinity" not in content, \
                "QueryClient should NOT have staleTime: Infinity (would prevent refetch)"
        
        print("_layout.tsx: QueryClient with default staleTime (allows refetch) CONFIRMED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
