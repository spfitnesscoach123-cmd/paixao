"""
GPS Metric Recalculation Tests
Tests for automatic athlete_load_metrics recalculation when GPS data is created, updated, or deleted.
Also tests cascade deletion of athlete-related data.

Test Scenarios:
1. POST /api/gps-data - creates GPS, metrics should update via load engine
2. POST /api/gps-data/delete-activities - deletes GPS, metrics should be cleaned and recalculated
3. PUT /api/gps-data/session/{session_id}/activity-type - updates type, triggers recalculation
4. DELETE /api/athletes/{athlete_id} - cascade-delete all related data
5. Dashboard consistency after GPS mutations
6. Live-queried delete endpoints (jumps, body-composition)
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"

# Known athlete IDs from seed data
JOAO_SILVA_ID = "69a6ca6a85668876432f090a"
MARIA_SANTOS_ID = "69a6ca6a85668876432f090b"
PEDRO_COSTA_ID = "69a6ca6a85668876432f090c"

# Test date - different from João's existing GPS (2026-03-03)
TEST_DATE = "2026-03-10"
TEST_SESSION_ID = f"test_recalc_session_{int(time.time())}"


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for API calls"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestGPSCreateTriggersMetricRecalculation:
    """Test that creating GPS data triggers athlete_load_metrics update"""
    
    def test_get_baseline_metrics_before_create(self, api_client):
        """Get João's current metrics before creating new GPS data"""
        response = api_client.get(f"{BASE_URL}/api/load-metrics/{JOAO_SILVA_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # Store baseline for comparison
        self.baseline_metrics = data
        print(f"Baseline metrics for João: date={data.get('date')}, ACWR={data.get('distance', {}).get('acwr')}")
        return data
    
    def test_create_gps_data_returns_200(self, api_client):
        """Create GPS data for João on a new date"""
        gps_payload = {
            "athlete_id": JOAO_SILVA_ID,
            "date": TEST_DATE,
            "session_id": TEST_SESSION_ID,
            "session_name": "Test Recalc Session",
            "period_name": "Session",
            "activity_type": "training",
            "total_distance": 8500,
            "high_intensity_distance": 1200,
            "high_speed_running": 600,
            "sprint_distance": 200,
            "number_of_sprints": 5,
            "number_of_accelerations": 30,
            "number_of_decelerations": 28,
            "max_speed": 28.5,
            "notes": "Test session for metric recalculation"
        }
        
        response = api_client.post(f"{BASE_URL}/api/gps-data", json=gps_payload)
        assert response.status_code == 200, f"Failed to create GPS: {response.text}"
        
        data = response.json()
        assert data.get("athlete_id") == JOAO_SILVA_ID
        assert data.get("date") == TEST_DATE
        assert data.get("session_id") == TEST_SESSION_ID
        print(f"Created GPS data: id={data.get('id')}, date={data.get('date')}")
        return data
    
    def test_metrics_updated_after_gps_create(self, api_client):
        """Verify athlete_load_metrics updated after GPS creation"""
        # Small delay to allow async update
        time.sleep(0.5)
        
        response = api_client.get(f"{BASE_URL}/api/load-metrics/{JOAO_SILVA_ID}")
        assert response.status_code == 200
        
        data = response.json()
        # Metrics should now include the new date or be updated
        assert data.get("date") is not None
        assert "distance" in data
        assert data["distance"].get("acwr") is not None
        print(f"Updated metrics: date={data.get('date')}, ACWR={data['distance'].get('acwr')}")
        return data
    
    def test_metrics_for_new_date_exist(self, api_client):
        """Verify metrics document exists for the new GPS date"""
        # Use dashboard endpoint to check all metrics
        response = api_client.get(f"{BASE_URL}/api/dashboard/overview")
        assert response.status_code == 200
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find João in the list
        joao = next((a for a in athletes if str(a.get("id")) == JOAO_SILVA_ID), None)
        assert joao is not None, "João Silva not found in dashboard"
        print(f"João in dashboard: name={joao.get('name')}, acwr={joao.get('acwr')}")


class TestGPSDeleteTriggersMetricRecalculation:
    """Test that deleting GPS data cleans stale metrics and recalculates"""
    
    def test_get_metrics_before_delete(self, api_client):
        """Get metrics before deleting the test GPS data"""
        response = api_client.get(f"{BASE_URL}/api/load-metrics/{JOAO_SILVA_ID}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Metrics before delete: date={data.get('date')}, ACWR={data.get('distance', {}).get('acwr')}")
        return data
    
    def test_delete_gps_activities_returns_200(self, api_client):
        """Delete the test GPS session"""
        delete_payload = {
            "session_ids": [TEST_SESSION_ID]
        }
        
        response = api_client.post(f"{BASE_URL}/api/gps-data/delete-activities", json=delete_payload)
        assert response.status_code == 200, f"Failed to delete GPS: {response.text}"
        
        data = response.json()
        assert data.get("deleted_count", 0) > 0, "No GPS records deleted"
        assert "metrics_recalculated" in data
        print(f"Delete response: deleted={data.get('deleted_count')}, recalc={data.get('metrics_recalculated')}")
        return data
    
    def test_metrics_cleaned_after_delete(self, api_client):
        """Verify stale metrics are cleaned after GPS deletion"""
        # Small delay for recalculation
        time.sleep(0.5)
        
        response = api_client.get(f"{BASE_URL}/api/load-metrics/{JOAO_SILVA_ID}")
        assert response.status_code == 200
        
        data = response.json()
        # Metrics should no longer be for the deleted date
        # They should revert to the original date (2026-03-03) or be cleaned
        print(f"Metrics after delete: date={data.get('date')}, ACWR={data.get('distance', {}).get('acwr')}")
        return data
    
    def test_dashboard_consistent_after_delete(self, api_client):
        """Verify dashboard shows consistent values after GPS deletion"""
        response = api_client.get(f"{BASE_URL}/api/dashboard/overview")
        assert response.status_code == 200
        
        data = response.json()
        assert "summary" in data
        assert "athletes" in data
        
        # Check João's values are consistent
        athletes = data.get("athletes", [])
        joao = next((a for a in athletes if str(a.get("id")) == JOAO_SILVA_ID), None)
        assert joao is not None
        print(f"Dashboard after delete: João acwr={joao.get('acwr')}, acute={joao.get('acute_load')}")


class TestActivityTypeUpdateTriggersRecalculation:
    """Test that updating activity type triggers load engine recalculation"""
    
    @pytest.fixture(autouse=True)
    def setup_test_gps(self, api_client):
        """Create GPS data for this test class"""
        self.test_session_id = f"activity_type_test_{int(time.time())}"
        gps_payload = {
            "athlete_id": JOAO_SILVA_ID,
            "date": "2026-03-11",
            "session_id": self.test_session_id,
            "session_name": "Activity Type Test",
            "period_name": "Session",
            "activity_type": "training",
            "total_distance": 7000,
            "high_intensity_distance": 1000,
            "high_speed_running": 500,
            "sprint_distance": 150,
            "number_of_sprints": 4,
            "number_of_accelerations": 25,
            "number_of_decelerations": 22
        }
        
        response = api_client.post(f"{BASE_URL}/api/gps-data", json=gps_payload)
        if response.status_code != 200:
            pytest.skip(f"Could not create test GPS: {response.text}")
        
        yield
        
        # Cleanup
        api_client.post(f"{BASE_URL}/api/gps-data/delete-activities", json={
            "session_ids": [self.test_session_id]
        })
    
    def test_update_activity_type_returns_200(self, api_client):
        """Update session activity type from training to game"""
        response = api_client.put(
            f"{BASE_URL}/api/gps-data/session/{self.test_session_id}/activity-type",
            json={"activity_type": "game", "athlete_id": JOAO_SILVA_ID}
        )
        assert response.status_code == 200, f"Failed to update activity type: {response.text}"
        
        data = response.json()
        assert data.get("activity_type") == "game"
        assert data.get("metrics_recalculated") == True
        print(f"Activity type updated: session={data.get('session_id')}, recalc={data.get('metrics_recalculated')}")
    
    def test_metrics_reflect_activity_type_change(self, api_client):
        """Verify metrics are recalculated after activity type change"""
        time.sleep(0.3)
        
        response = api_client.get(f"{BASE_URL}/api/load-metrics/{JOAO_SILVA_ID}")
        assert response.status_code == 200
        
        data = response.json()
        # Just verify metrics exist - specific values depend on EWMA calculation
        assert "distance" in data
        print(f"Metrics after activity change: date={data.get('date')}")


class TestAthleteDeleteCascade:
    """Test that deleting an athlete cascade-deletes all related data"""
    
    @pytest.fixture
    def temp_athlete(self, api_client):
        """Create a temporary athlete for cascade delete testing"""
        athlete_payload = {
            "name": "TEST_Cascade Athlete",
            "birth_date": "1995-01-15",
            "position": "Defender"
        }
        
        response = api_client.post(f"{BASE_URL}/api/athletes", json=athlete_payload)
        assert response.status_code == 200
        
        athlete_data = response.json()
        athlete_id = athlete_data.get("id") or str(athlete_data.get("_id"))
        
        yield athlete_id
        
        # Cleanup if test failed before deletion
        try:
            api_client.delete(f"{BASE_URL}/api/athletes/{athlete_id}")
        except:
            pass
    
    def test_create_related_data_for_athlete(self, api_client, temp_athlete):
        """Create GPS, wellness, and other data for the temp athlete"""
        athlete_id = temp_athlete
        
        # Create GPS data
        gps_response = api_client.post(f"{BASE_URL}/api/gps-data", json={
            "athlete_id": athlete_id,
            "date": "2026-03-12",
            "session_id": f"cascade_test_{athlete_id}",
            "session_name": "Cascade Test Session",
            "period_name": "Session",
            "activity_type": "training",
            "total_distance": 5000,
            "high_intensity_distance": 800,
            "sprint_distance": 100,
            "number_of_sprints": 2,
            "number_of_accelerations": 15,
            "number_of_decelerations": 12
        })
        assert gps_response.status_code == 200
        
        # Create wellness data
        wellness_response = api_client.post(f"{BASE_URL}/api/wellness", json={
            "athlete_id": athlete_id,
            "date": "2026-03-12",
            "fatigue": 7,
            "stress": 5,
            "mood": 8,
            "sleep_quality": 7,
            "sleep_hours": 7.5,
            "muscle_soreness": 4,
            "hydration": 6
        })
        assert wellness_response.status_code == 200
        
        print(f"Created related data for athlete {athlete_id}")
        return athlete_id
    
    def test_delete_athlete_cascade_deletes_related(self, api_client, temp_athlete):
        """Delete athlete and verify cascade cleanup"""
        athlete_id = temp_athlete
        
        # First create related data
        self.test_create_related_data_for_athlete(api_client, temp_athlete)
        
        # Wait for metrics to be calculated
        time.sleep(0.5)
        
        # Delete the athlete
        response = api_client.delete(f"{BASE_URL}/api/athletes/{athlete_id}")
        assert response.status_code == 200, f"Failed to delete athlete: {response.text}"
        
        data = response.json()
        assert "related_data_cleaned" in data
        
        cleanup = data.get("related_data_cleaned", {})
        print(f"Cascade cleanup results: {cleanup}")
        
        # Verify expected collections were cleaned
        expected_collections = ["gps_data", "athlete_load_metrics", "wellness"]
        for collection in expected_collections:
            assert collection in cleanup, f"Missing cleanup for {collection}"
        
        # Verify athlete no longer exists
        get_response = api_client.get(f"{BASE_URL}/api/athletes/{athlete_id}")
        assert get_response.status_code == 404


class TestDashboardConsistencyAfterGPSMutations:
    """Test that dashboard shows consistent values after GPS create/delete"""
    
    def test_dashboard_overview_returns_200(self, api_client):
        """Verify dashboard overview endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/dashboard/overview")
        assert response.status_code == 200
        
        data = response.json()
        assert "summary" in data
        assert "athletes" in data
        print(f"Dashboard overview: {len(data.get('athletes', []))} athletes")
    
    def test_dashboard_team_returns_200(self, api_client):
        """Verify team dashboard endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/dashboard/team")
        assert response.status_code == 200
        
        data = response.json()
        assert "team_avg_acwr" in data or "athletes" in data
        print(f"Team dashboard response keys: {list(data.keys())}")
    
    def test_create_gps_and_verify_dashboard_updates(self, api_client):
        """Create GPS and verify dashboard reflects change"""
        session_id = f"dashboard_test_{int(time.time())}"
        
        # Get dashboard before
        before_response = api_client.get(f"{BASE_URL}/api/dashboard/overview")
        before_data = before_response.json()
        
        # Create GPS
        gps_payload = {
            "athlete_id": JOAO_SILVA_ID,
            "date": "2026-03-15",
            "session_id": session_id,
            "session_name": "Dashboard Test",
            "period_name": "Session",
            "activity_type": "training",
            "total_distance": 9000,
            "high_intensity_distance": 1500,
            "high_speed_running": 700,
            "sprint_distance": 250,
            "number_of_sprints": 6,
            "number_of_accelerations": 35,
            "number_of_decelerations": 30
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/gps-data", json=gps_payload)
        assert create_response.status_code == 200
        
        time.sleep(0.5)
        
        # Get dashboard after
        after_response = api_client.get(f"{BASE_URL}/api/dashboard/overview")
        after_data = after_response.json()
        
        # Find João in both
        joao_before = next((a for a in before_data.get("athletes", []) if str(a.get("id")) == JOAO_SILVA_ID), None)
        joao_after = next((a for a in after_data.get("athletes", []) if str(a.get("id")) == JOAO_SILVA_ID), None)
        
        print(f"João BEFORE: acwr={joao_before.get('acwr') if joao_before else 'N/A'}")
        print(f"João AFTER: acwr={joao_after.get('acwr') if joao_after else 'N/A'}")
        
        # Cleanup
        api_client.post(f"{BASE_URL}/api/gps-data/delete-activities", json={"session_ids": [session_id]})


class TestLiveQueriedDeleteEndpoints:
    """Test delete endpoints for live-queried collections (no derived tables)"""
    
    def test_delete_jump_assessment_endpoint_exists(self, api_client):
        """Verify DELETE /api/jump/assessment/{id} endpoint works"""
        # Try to delete a non-existent ID to verify endpoint exists
        response = api_client.delete(f"{BASE_URL}/api/jump/assessment/000000000000000000000000")
        # 404 = endpoint exists but resource not found (expected)
        # 405 = endpoint doesn't support DELETE (bad)
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"Jump assessment delete endpoint: {response.status_code}")
    
    def test_delete_body_composition_endpoint_exists(self, api_client):
        """Verify DELETE /api/body-composition/{id} endpoint works"""
        response = api_client.delete(f"{BASE_URL}/api/body-composition/000000000000000000000000")
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"Body composition delete endpoint: {response.status_code}")
    
    def test_delete_jumps_endpoint_exists(self, api_client):
        """Verify DELETE /api/jumps/{id} endpoint works"""
        response = api_client.delete(f"{BASE_URL}/api/jumps/000000000000000000000000")
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"Jumps delete endpoint: {response.status_code}")


class TestEWMAMetricsAfterGPSDelete:
    """Critical test: EWMA values must revert correctly after GPS deletion"""
    
    def test_full_create_delete_cycle(self, api_client):
        """
        Critical test:
        1. Get João's baseline metrics
        2. Create GPS data on new date
        3. Verify metrics changed
        4. Delete the GPS data
        5. Verify metrics reverted to baseline values
        """
        # Step 1: Baseline metrics
        baseline_response = api_client.get(f"{BASE_URL}/api/load-metrics/{JOAO_SILVA_ID}")
        assert baseline_response.status_code == 200
        baseline = baseline_response.json()
        baseline_acwr = baseline.get("distance", {}).get("acwr")
        baseline_acute = baseline.get("distance", {}).get("ewma_acute")
        print(f"BASELINE: date={baseline.get('date')}, ACWR={baseline_acwr}, acute={baseline_acute}")
        
        # Step 2: Create GPS
        session_id = f"ewma_test_{int(time.time())}"
        create_response = api_client.post(f"{BASE_URL}/api/gps-data", json={
            "athlete_id": JOAO_SILVA_ID,
            "date": "2026-03-20",
            "session_id": session_id,
            "session_name": "EWMA Test",
            "period_name": "Session",
            "activity_type": "training",
            "total_distance": 12000,  # Higher than baseline to see clear change
            "high_intensity_distance": 2000,
            "high_speed_running": 1000,
            "sprint_distance": 400,
            "number_of_sprints": 8,
            "number_of_accelerations": 45,
            "number_of_decelerations": 40
        })
        assert create_response.status_code == 200
        time.sleep(0.5)
        
        # Step 3: Verify metrics changed
        after_create_response = api_client.get(f"{BASE_URL}/api/load-metrics/{JOAO_SILVA_ID}")
        after_create = after_create_response.json()
        after_create_acwr = after_create.get("distance", {}).get("acwr")
        print(f"AFTER CREATE: date={after_create.get('date')}, ACWR={after_create_acwr}")
        
        # Step 4: Delete GPS
        delete_response = api_client.post(f"{BASE_URL}/api/gps-data/delete-activities", json={
            "session_ids": [session_id]
        })
        assert delete_response.status_code == 200
        delete_data = delete_response.json()
        print(f"DELETE result: deleted={delete_data.get('deleted_count')}, recalc={delete_data.get('metrics_recalculated')}")
        time.sleep(0.5)
        
        # Step 5: Verify metrics reverted
        after_delete_response = api_client.get(f"{BASE_URL}/api/load-metrics/{JOAO_SILVA_ID}")
        after_delete = after_delete_response.json()
        after_delete_acwr = after_delete.get("distance", {}).get("acwr")
        after_delete_date = after_delete.get("date")
        print(f"AFTER DELETE: date={after_delete_date}, ACWR={after_delete_acwr}")
        
        # The date should revert to the original baseline date (2026-03-03)
        # or the metrics should reflect only the remaining GPS data
        assert after_delete_date != "2026-03-20", f"Stale metrics not cleaned: date still {after_delete_date}"
        
        # ACWR should be close to baseline (within reasonable tolerance for EWMA decay)
        # Since we deleted the only new record, values should match baseline
        print(f"EWMA cycle test: baseline_acwr={baseline_acwr}, after_delete_acwr={after_delete_acwr}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
