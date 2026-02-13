"""
Test GPS Session Classifier Feature
- Tests session counting (groupedSessions.length)
- Tests PUT /api/gps-data/session/{session_id}/activity-type endpoint
- Tests activity_type field in GET /api/gps-data/athlete/{athlete_id} response
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://vbt-stable-build.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "silasf@ymail.com"
TEST_PASSWORD = "#Paixao"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def athlete_with_gps(headers):
    """Get an athlete that has GPS data"""
    # Get all athletes
    response = requests.get(f"{BASE_URL}/api/athletes", headers=headers)
    assert response.status_code == 200
    athletes = response.json()
    
    # Find an athlete with GPS data
    for athlete in athletes:
        athlete_id = athlete.get("_id") or athlete.get("id")
        gps_response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{athlete_id}",
            headers=headers
        )
        if gps_response.status_code == 200:
            gps_data = gps_response.json()
            if len(gps_data) > 0:
                return {
                    "athlete_id": athlete_id,
                    "gps_data": gps_data
                }
    
    pytest.skip("No athlete with GPS data found")


class TestGPSActivityTypeEndpoint:
    """Tests for PUT /api/gps-data/session/{session_id}/activity-type"""
    
    def test_update_activity_type_to_game(self, headers, athlete_with_gps):
        """Test setting activity_type to 'game'"""
        gps_data = athlete_with_gps["gps_data"]
        session_id = gps_data[0].get("session_id")
        
        if not session_id:
            pytest.skip("No session_id in GPS data")
        
        response = requests.put(
            f"{BASE_URL}/api/gps-data/session/{session_id}/activity-type",
            headers=headers,
            json={"activity_type": "game"}
        )
        
        assert response.status_code == 200, f"Failed to update activity type: {response.text}"
        data = response.json()
        assert data["activity_type"] == "game"
        assert data["session_id"] == session_id
        assert data["records_updated"] > 0
        assert "message" in data
    
    def test_update_activity_type_to_training(self, headers, athlete_with_gps):
        """Test setting activity_type to 'training'"""
        gps_data = athlete_with_gps["gps_data"]
        session_id = gps_data[0].get("session_id")
        
        if not session_id:
            pytest.skip("No session_id in GPS data")
        
        response = requests.put(
            f"{BASE_URL}/api/gps-data/session/{session_id}/activity-type",
            headers=headers,
            json={"activity_type": "training"}
        )
        
        assert response.status_code == 200, f"Failed to update activity type: {response.text}"
        data = response.json()
        assert data["activity_type"] == "training"
        assert data["session_id"] == session_id
        assert data["records_updated"] > 0
    
    def test_invalid_activity_type_rejected(self, headers, athlete_with_gps):
        """Test that invalid activity_type values are rejected"""
        gps_data = athlete_with_gps["gps_data"]
        session_id = gps_data[0].get("session_id")
        
        if not session_id:
            pytest.skip("No session_id in GPS data")
        
        response = requests.put(
            f"{BASE_URL}/api/gps-data/session/{session_id}/activity-type",
            headers=headers,
            json={"activity_type": "invalid_type"}
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid activity_type, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "game" in data["detail"] or "training" in data["detail"]
    
    def test_nonexistent_session_returns_404(self, headers):
        """Test that non-existent session_id returns 404"""
        fake_session_id = f"nonexistent_session_{uuid.uuid4()}"
        
        response = requests.put(
            f"{BASE_URL}/api/gps-data/session/{fake_session_id}/activity-type",
            headers=headers,
            json={"activity_type": "game"}
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent session, got {response.status_code}"


class TestGPSDataActivityTypeField:
    """Tests for activity_type field in GET /api/gps-data/athlete/{athlete_id}"""
    
    def test_activity_type_included_in_response(self, headers, athlete_with_gps):
        """Test that activity_type field is included in GPS data response"""
        athlete_id = athlete_with_gps["athlete_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{athlete_id}",
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) > 0, "No GPS data returned"
        
        # Check that activity_type field exists in response
        first_record = data[0]
        assert "activity_type" in first_record, "activity_type field missing from GPS data response"
    
    def test_activity_type_persists_after_update(self, headers, athlete_with_gps):
        """Test that activity_type value persists after update"""
        athlete_id = athlete_with_gps["athlete_id"]
        gps_data = athlete_with_gps["gps_data"]
        session_id = gps_data[0].get("session_id")
        
        if not session_id:
            pytest.skip("No session_id in GPS data")
        
        # Set to 'game'
        update_response = requests.put(
            f"{BASE_URL}/api/gps-data/session/{session_id}/activity-type",
            headers=headers,
            json={"activity_type": "game"}
        )
        assert update_response.status_code == 200
        
        # Verify in GET response
        get_response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{athlete_id}",
            headers=headers
        )
        assert get_response.status_code == 200
        data = get_response.json()
        
        # Find records with this session_id
        session_records = [r for r in data if r.get("session_id") == session_id]
        assert len(session_records) > 0, "No records found for session"
        
        # All records in session should have activity_type = 'game'
        for record in session_records:
            assert record.get("activity_type") == "game", f"Expected 'game', got {record.get('activity_type')}"


class TestGPSSessionCounting:
    """Tests for session counting (groupedSessions.length)"""
    
    def test_sessions_endpoint_returns_grouped_data(self, headers, athlete_with_gps):
        """Test that /api/gps-data/athlete/{athlete_id}/sessions returns grouped sessions"""
        athlete_id = athlete_with_gps["athlete_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{athlete_id}/sessions",
            headers=headers
        )
        
        assert response.status_code == 200
        sessions = response.json()
        
        # Sessions should be grouped by session_id
        assert isinstance(sessions, list)
        
        if len(sessions) > 0:
            first_session = sessions[0]
            # Each session should have these fields
            assert "session_id" in first_session
            assert "session_name" in first_session
            assert "date" in first_session
            assert "periods" in first_session
            assert "totals" in first_session
            # activity_type should be included
            assert "activity_type" in first_session
    
    def test_session_count_less_than_record_count(self, headers, athlete_with_gps):
        """Test that session count is less than or equal to individual record count"""
        athlete_id = athlete_with_gps["athlete_id"]
        
        # Get individual records
        records_response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{athlete_id}",
            headers=headers
        )
        assert records_response.status_code == 200
        records = records_response.json()
        
        # Get grouped sessions
        sessions_response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{athlete_id}/sessions",
            headers=headers
        )
        assert sessions_response.status_code == 200
        sessions = sessions_response.json()
        
        # Session count should be <= record count (since multiple records can belong to one session)
        assert len(sessions) <= len(records), f"Sessions ({len(sessions)}) should be <= records ({len(records)})"
        
        print(f"Records: {len(records)}, Sessions: {len(sessions)}")


class TestGPSDataModel:
    """Tests for GPSData model fields"""
    
    def test_gps_data_has_required_fields(self, headers, athlete_with_gps):
        """Test that GPS data has all required fields including session_id, session_name, period_name, activity_type"""
        athlete_id = athlete_with_gps["athlete_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{athlete_id}",
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) > 0
        
        first_record = data[0]
        
        # Check required fields from GPSData model
        required_fields = [
            "athlete_id", "date", "total_distance", "high_intensity_distance",
            "number_of_sprints", "number_of_accelerations", "number_of_decelerations"
        ]
        
        for field in required_fields:
            assert field in first_record, f"Missing required field: {field}"
        
        # Check new session-related fields
        session_fields = ["session_id", "session_name", "period_name", "activity_type"]
        for field in session_fields:
            assert field in first_record, f"Missing session field: {field}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
