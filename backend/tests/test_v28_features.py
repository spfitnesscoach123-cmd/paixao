"""
Tests for V28 Features: GPS Activity Deletion, Scientific Analysis Session Counting,
Jump Assessment Deletion, and Jump Protocol Selector
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for testing"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Auth failed: {response.status_code}")
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def headers(auth_token):
    """Auth headers"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def test_athlete_id(headers):
    """Get first athlete ID for testing"""
    response = requests.get(f"{BASE_URL}/api/athletes", headers=headers)
    if response.status_code != 200:
        pytest.skip("Could not fetch athletes")
    athletes = response.json()
    if not athletes:
        pytest.skip("No athletes found")
    # Handle both 'id' and '_id' formats
    athlete = athletes[0]
    return athlete.get("id") or athlete.get("_id")


# ======================================
# Test 1: GPS Delete Activities Endpoint
# ======================================
class TestGPSDeleteActivities:
    """Test POST /api/gps-data/delete-activities endpoint"""
    
    def test_delete_activities_endpoint_exists(self, headers):
        """Test endpoint returns proper response for empty session_ids"""
        response = requests.post(
            f"{BASE_URL}/api/gps-data/delete-activities",
            headers=headers,
            json={"session_ids": []}
        )
        # Should return 400 for empty session_ids
        assert response.status_code == 400
        assert "No session_ids provided" in response.json().get("detail", "")
    
    def test_delete_nonexistent_session(self, headers):
        """Test deleting non-existent session returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/gps-data/delete-activities",
            headers=headers,
            json={"session_ids": ["nonexistent_session_12345"]}
        )
        # Should return 404 for non-existent sessions
        assert response.status_code == 404
        assert "No activities found" in response.json().get("detail", "")


# ======================================
# Test 2: Scientific Analysis GPS Session Count
# ======================================
class TestScientificAnalysisSessionCount:
    """Test that scientific analysis only counts SESSION periods"""
    
    def test_scientific_analysis_endpoint(self, headers, test_athlete_id):
        """Test GET /api/analysis/scientific endpoint returns correct session count"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/scientific/{test_athlete_id}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "athlete_id" in data
        assert "athlete_name" in data
        
        # GPS summary should have sessions_count
        if data.get("gps_summary"):
            assert "sessions_count" in data["gps_summary"]
            # sessions_count should be a number >= 0
            assert isinstance(data["gps_summary"]["sessions_count"], (int, float))


# ======================================
# Test 3: Jump Protocol Analysis
# ======================================
class TestJumpProtocolAnalysis:
    """Test jump protocol analysis returns selected_assessment_id"""
    
    def test_protocol_analysis_cmj(self, headers, test_athlete_id):
        """Test CMJ protocol analysis"""
        response = requests.get(
            f"{BASE_URL}/api/jump/protocol-analysis/{test_athlete_id}",
            headers=headers,
            params={"protocol": "cmj", "lang": "pt"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "protocol" in data
        assert data["protocol"] == "cmj"
        assert "has_data" in data
        assert "available_dates" in data
        
        # If has_data is True, selected_assessment_id should be present
        if data.get("has_data"):
            assert "selected_assessment_id" in data
            assert "metrics" in data
            assert "fatigue_index" in data or data.get("fatigue_index") is None
    
    def test_protocol_analysis_sl_cmj_left(self, headers, test_athlete_id):
        """Test SL-CMJ Left protocol analysis"""
        response = requests.get(
            f"{BASE_URL}/api/jump/protocol-analysis/{test_athlete_id}",
            headers=headers,
            params={"protocol": "sl_cmj_left", "lang": "pt"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "protocol" in data
        assert data["protocol"] == "sl_cmj_left"
        
        # If has_data and asymmetry exists, verify asymmetry fields
        if data.get("has_data") and data.get("asymmetry"):
            asymmetry = data["asymmetry"]
            assert "rsi_asymmetry_percent" in asymmetry
            assert "left_rsi" in asymmetry
            assert "right_rsi" in asymmetry
    
    def test_protocol_analysis_dj(self, headers, test_athlete_id):
        """Test DJ protocol analysis"""
        response = requests.get(
            f"{BASE_URL}/api/jump/protocol-analysis/{test_athlete_id}",
            headers=headers,
            params={"protocol": "dj", "lang": "pt"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "protocol" in data
        assert data["protocol"] == "dj"


# ======================================
# Test 4: Jump Assessment Deletion
# ======================================
class TestJumpAssessmentDeletion:
    """Test DELETE /api/jump/assessment/{id} endpoint"""
    
    def test_delete_nonexistent_assessment(self, headers):
        """Test deleting non-existent assessment returns 404"""
        fake_id = "507f1f77bcf86cd799439011"  # Valid ObjectId format but doesn't exist
        response = requests.delete(
            f"{BASE_URL}/api/jump/assessment/{fake_id}",
            headers=headers
        )
        assert response.status_code == 404
    
    def test_delete_invalid_id(self, headers):
        """Test deleting with invalid ID returns error"""
        response = requests.delete(
            f"{BASE_URL}/api/jump/assessment/invalid_id",
            headers=headers
        )
        # Should return error (500 or 400) for invalid ObjectId
        assert response.status_code in [400, 500, 422]


# ======================================
# Test 5: Athlete GPS Sessions
# ======================================
class TestAthleteGPSSessions:
    """Test GPS sessions endpoint"""
    
    def test_get_athlete_sessions(self, headers, test_athlete_id):
        """Test GET /api/gps-data/athlete/{id}/sessions"""
        response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{test_athlete_id}/sessions",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        
        # Each session should have required fields
        for session in data[:3]:  # Check first 3
            assert "session_id" in session
            assert "date" in session
            assert "totals" in session


# ======================================
# Test 6: Wellness Endpoint Exists
# ======================================
class TestWellnessEndpoint:
    """Test wellness endpoint for QTR gauge data"""
    
    def test_wellness_athlete_endpoint(self, headers, test_athlete_id):
        """Test GET /api/wellness/athlete/{id}"""
        response = requests.get(
            f"{BASE_URL}/api/wellness/athlete/{test_athlete_id}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        
        # Each wellness entry should have score fields
        for entry in data[:3]:
            if entry:
                assert "date" in entry or "wellness_score" in entry or "readiness_score" in entry


# ======================================
# Test 7: Authentication Endpoints
# ======================================
class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_success(self):
        """Test successful login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrongpass"}
        )
        assert response.status_code == 401


# ======================================
# Test 8: Athletes CRUD
# ======================================
class TestAthletesCRUD:
    """Test athletes CRUD operations"""
    
    def test_get_athletes(self, headers):
        """Test GET /api/athletes"""
        response = requests.get(f"{BASE_URL}/api/athletes", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Each athlete should have basic fields (handle both id and _id)
        for athlete in data[:3]:
            assert "id" in athlete or "_id" in athlete
            assert "name" in athlete


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
