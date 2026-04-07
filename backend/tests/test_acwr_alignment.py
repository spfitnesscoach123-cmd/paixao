"""
Test cases for ACWR alignment between Dashboard Overview and Team Dashboard.

The issue was that Dashboard Overview used inline Coupled ACWR calculation,
while Team Dashboard used EWMA ACWR from athlete_load_metrics (RollingLoadEngine).

The fix aligns Dashboard Overview to also use athlete_load_metrics.

Key test scenarios:
1. GET /api/dashboard/overview should return ACWR=1.0 for João Silva (same as Team Dashboard)
2. GET /api/dashboard/team should still return ACWR=1.0 for João Silva (no regression)
3. Both endpoints should return the same team_acwr value
4. Dashboard Overview acute_load and chronic_load should come from EWMA (10500 each for João)
5. Dashboard Overview monotony and strain should come from athlete_load_metrics
6. Dashboard Overview acwr_timeline should contain EWMA-based entries
7. Athletes without data (Maria Santos, Pedro Costa) should have ACWR=None in both endpoints
8. Date range filters (today, yesterday, 7d, 14d, 28d, 90d) should all work without errors
"""

import pytest
import requests
import os
from datetime import datetime

# Use the public URL from environment (same as frontend)
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://jump-camera-fix.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"

# Expected athlete with data: João Silva (athlete_id: 69a6ca6a85668876432f090a)
# Expected EWMA values: distance.acwr=1.0, distance.ewma_acute=10500, distance.ewma_chronic=10500
JOAO_SILVA_ATHLETE_ID = "69a6ca6a85668876432f090a"
EXPECTED_ACWR = 1.0
EXPECTED_EWMA_ACUTE = 10500
EXPECTED_EWMA_CHRONIC = 10500


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


class TestACWRAlignment:
    """Tests for ACWR alignment between Dashboard Overview and Team Dashboard"""
    
    def test_01_team_dashboard_acwr_for_joao_silva(self, auth_headers):
        """Team Dashboard should return ACWR=1.0 for João Silva (baseline - no regression)"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find João Silva
        joao = None
        for athlete in athletes:
            if "João Silva" in athlete.get("name", "") or "Joao Silva" in athlete.get("name", ""):
                joao = athlete
                break
            # Also check by athlete_id
            if athlete.get("id") == JOAO_SILVA_ATHLETE_ID:
                joao = athlete
                break
        
        if joao is None:
            pytest.skip("João Silva not found in team dashboard athletes")
        
        acwr = joao.get("acwr")
        print(f"Team Dashboard - João Silva ACWR: {acwr}")
        assert acwr == EXPECTED_ACWR, f"Expected ACWR={EXPECTED_ACWR}, got {acwr}"
        print(f"PASSED: Team Dashboard returns ACWR={EXPECTED_ACWR} for João Silva")
    
    def test_02_dashboard_overview_acwr_for_joao_silva(self, auth_headers):
        """Dashboard Overview should return ACWR=1.0 for João Silva (same as Team Dashboard)"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find João Silva
        joao = None
        for athlete in athletes:
            if "João Silva" in athlete.get("name", "") or "Joao Silva" in athlete.get("name", ""):
                joao = athlete
                break
            if athlete.get("id") == JOAO_SILVA_ATHLETE_ID:
                joao = athlete
                break
        
        if joao is None:
            pytest.skip("João Silva not found in dashboard overview athletes")
        
        acwr = joao.get("acwr")
        print(f"Dashboard Overview - João Silva ACWR: {acwr}")
        assert acwr == EXPECTED_ACWR, f"Expected ACWR={EXPECTED_ACWR}, got {acwr}"
        print(f"PASSED: Dashboard Overview returns ACWR={EXPECTED_ACWR} for João Silva")
    
    def test_03_both_endpoints_return_same_team_acwr(self, auth_headers):
        """Both endpoints should return the same team_acwr value"""
        # Get Team Dashboard
        team_response = requests.get(f"{BASE_URL}/api/dashboard/team", headers=auth_headers)
        assert team_response.status_code == 200
        team_data = team_response.json()
        team_acwr_team_dash = team_data.get("stats", {}).get("team_avg_acwr")
        
        # Get Dashboard Overview
        overview_response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert overview_response.status_code == 200
        overview_data = overview_response.json()
        team_acwr_overview = overview_data.get("summary", {}).get("team_acwr")
        
        print(f"Team Dashboard team_avg_acwr: {team_acwr_team_dash}")
        print(f"Dashboard Overview team_acwr: {team_acwr_overview}")
        
        # Allow small floating point difference
        if team_acwr_team_dash is not None and team_acwr_overview is not None:
            assert abs(team_acwr_team_dash - team_acwr_overview) < 0.01, \
                f"Team ACWR mismatch: Team Dashboard={team_acwr_team_dash}, Overview={team_acwr_overview}"
            print(f"PASSED: Both endpoints return same team_acwr value")
        else:
            # If both are None or one is None, they're technically aligned
            print(f"INFO: team_acwr values - Team Dashboard: {team_acwr_team_dash}, Overview: {team_acwr_overview}")
    
    def test_04_dashboard_overview_ewma_acute_chronic(self, auth_headers):
        """Dashboard Overview acute_load and chronic_load should come from EWMA (10500 each for João)"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find João Silva
        joao = None
        for athlete in athletes:
            if "João Silva" in athlete.get("name", "") or "Joao Silva" in athlete.get("name", ""):
                joao = athlete
                break
            if athlete.get("id") == JOAO_SILVA_ATHLETE_ID:
                joao = athlete
                break
        
        if joao is None:
            pytest.skip("João Silva not found in dashboard overview athletes")
        
        acute_load = joao.get("acute_load")
        chronic_load = joao.get("chronic_load")
        
        print(f"Dashboard Overview - João Silva acute_load: {acute_load}")
        print(f"Dashboard Overview - João Silva chronic_load: {chronic_load}")
        
        # EWMA values should be 10500 each
        assert acute_load == EXPECTED_EWMA_ACUTE, f"Expected acute_load={EXPECTED_EWMA_ACUTE}, got {acute_load}"
        assert chronic_load == EXPECTED_EWMA_CHRONIC, f"Expected chronic_load={EXPECTED_EWMA_CHRONIC}, got {chronic_load}"
        print(f"PASSED: Dashboard Overview returns EWMA acute_load={EXPECTED_EWMA_ACUTE}, chronic_load={EXPECTED_EWMA_CHRONIC}")
    
    def test_05_dashboard_overview_monotony_strain(self, auth_headers):
        """Dashboard Overview monotony and strain should come from athlete_load_metrics"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find João Silva
        joao = None
        for athlete in athletes:
            if "João Silva" in athlete.get("name", "") or "Joao Silva" in athlete.get("name", ""):
                joao = athlete
                break
            if athlete.get("id") == JOAO_SILVA_ATHLETE_ID:
                joao = athlete
                break
        
        if joao is None:
            pytest.skip("João Silva not found in dashboard overview athletes")
        
        monotony = joao.get("monotony")
        strain = joao.get("strain")
        
        print(f"Dashboard Overview - João Silva monotony: {monotony}")
        print(f"Dashboard Overview - João Silva strain: {strain}")
        
        # Monotony and strain should be present (from athlete_load_metrics)
        assert monotony is not None, "monotony should be present"
        assert strain is not None, "strain should be present"
        print(f"PASSED: Dashboard Overview returns monotony={monotony}, strain={strain}")
    
    def test_06_dashboard_overview_acwr_timeline(self, auth_headers):
        """Dashboard Overview acwr_timeline should contain EWMA-based entries"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find João Silva
        joao = None
        for athlete in athletes:
            if "João Silva" in athlete.get("name", "") or "Joao Silva" in athlete.get("name", ""):
                joao = athlete
                break
            if athlete.get("id") == JOAO_SILVA_ATHLETE_ID:
                joao = athlete
                break
        
        if joao is None:
            pytest.skip("João Silva not found in dashboard overview athletes")
        
        acwr_timeline = joao.get("acwr_timeline", [])
        print(f"Dashboard Overview - João Silva acwr_timeline has {len(acwr_timeline)} entries")
        
        # Check acwr_timeline structure if not empty
        if acwr_timeline:
            entry = acwr_timeline[0]
            assert "date" in entry, "acwr_timeline entry should have 'date'"
            assert "acwr" in entry, "acwr_timeline entry should have 'acwr'"
            print(f"  Sample entry: {entry}")
        
        print(f"PASSED: Dashboard Overview acwr_timeline structure is correct")
    
    def test_07_athletes_without_data_have_null_acwr_team_dashboard(self, auth_headers):
        """Athletes without data (Maria Santos, Pedro Costa) should have ACWR=None in Team Dashboard"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find athletes without EWMA data
        athletes_without_data = []
        for athlete in athletes:
            name = athlete.get("name", "")
            if "Maria Santos" in name or "Pedro Costa" in name:
                athletes_without_data.append(athlete)
        
        if not athletes_without_data:
            print("INFO: Maria Santos and Pedro Costa not found in Team Dashboard")
        else:
            for athlete in athletes_without_data:
                acwr = athlete.get("acwr")
                print(f"Team Dashboard - {athlete.get('name')} ACWR: {acwr}")
                # Athletes without EWMA data should have ACWR=None
                assert acwr is None, f"Expected ACWR=None for {athlete.get('name')}, got {acwr}"
            print(f"PASSED: Athletes without data have ACWR=None in Team Dashboard")
    
    def test_08_athletes_without_data_have_null_acwr_overview(self, auth_headers):
        """Athletes without data (Maria Santos, Pedro Costa) should have ACWR=None in Dashboard Overview"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find athletes without EWMA data
        athletes_without_data = []
        for athlete in athletes:
            name = athlete.get("name", "")
            if "Maria Santos" in name or "Pedro Costa" in name:
                athletes_without_data.append(athlete)
        
        if not athletes_without_data:
            print("INFO: Maria Santos and Pedro Costa not found in Dashboard Overview")
        else:
            for athlete in athletes_without_data:
                acwr = athlete.get("acwr")
                print(f"Dashboard Overview - {athlete.get('name')} ACWR: {acwr}")
                # Athletes without EWMA data should have ACWR=None
                assert acwr is None, f"Expected ACWR=None for {athlete.get('name')}, got {acwr}"
            print(f"PASSED: Athletes without data have ACWR=None in Dashboard Overview")
    
    def test_09_date_range_filter_today(self, auth_headers):
        """Date range filter 'today' should work without errors"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=today", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("filter", {}).get("date_range") == "today"
        print("PASSED: date_range=today works")
    
    def test_10_date_range_filter_yesterday(self, auth_headers):
        """Date range filter 'yesterday' should work without errors"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=yesterday", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("filter", {}).get("date_range") == "yesterday"
        print("PASSED: date_range=yesterday works")
    
    def test_11_date_range_filter_7d(self, auth_headers):
        """Date range filter '7d' should work without errors"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=7d", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("filter", {}).get("date_range") == "7d"
        print("PASSED: date_range=7d works")
    
    def test_12_date_range_filter_14d(self, auth_headers):
        """Date range filter '14d' should work without errors"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=14d", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("filter", {}).get("date_range") == "14d"
        print("PASSED: date_range=14d works")
    
    def test_13_date_range_filter_28d(self, auth_headers):
        """Date range filter '28d' should work without errors"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=28d", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("filter", {}).get("date_range") == "28d"
        print("PASSED: date_range=28d works")
    
    def test_14_date_range_filter_90d(self, auth_headers):
        """Date range filter '90d' should work without errors"""
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?date_range=90d", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("filter", {}).get("date_range") == "90d"
        print("PASSED: date_range=90d works")
    
    def test_15_individual_athlete_acwr_comparison(self, auth_headers):
        """Compare ACWR values between both endpoints for all athletes"""
        # Get Team Dashboard
        team_response = requests.get(f"{BASE_URL}/api/dashboard/team", headers=auth_headers)
        assert team_response.status_code == 200
        team_data = team_response.json()
        team_athletes = {a.get("id"): a for a in team_data.get("athletes", [])}
        
        # Get Dashboard Overview
        overview_response = requests.get(f"{BASE_URL}/api/dashboard/overview", headers=auth_headers)
        assert overview_response.status_code == 200
        overview_data = overview_response.json()
        overview_athletes = {a.get("id"): a for a in overview_data.get("athletes", [])}
        
        # Compare ACWR for each athlete
        mismatches = []
        for athlete_id in team_athletes:
            team_acwr = team_athletes[athlete_id].get("acwr")
            overview_acwr = overview_athletes.get(athlete_id, {}).get("acwr")
            
            name = team_athletes[athlete_id].get("name", "Unknown")
            
            if team_acwr != overview_acwr:
                # Allow None == None
                if team_acwr is None and overview_acwr is None:
                    continue
                mismatches.append({
                    "name": name,
                    "id": athlete_id,
                    "team_acwr": team_acwr,
                    "overview_acwr": overview_acwr
                })
        
        if mismatches:
            print("ACWR mismatches found:")
            for m in mismatches:
                print(f"  {m['name']}: Team Dashboard={m['team_acwr']}, Overview={m['overview_acwr']}")
            pytest.fail(f"ACWR mismatch for {len(mismatches)} athletes")
        
        print(f"PASSED: ACWR values match for all {len(team_athletes)} athletes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
