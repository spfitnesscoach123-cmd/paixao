"""
Test Suite for Wellness Token System
Tests token creation, validation, athlete listing, athlete usage check, and submission flows.

Endpoints tested:
- POST /api/wellness/token - Create token (coach authenticated)
- POST /api/wellness/token/validate - Validate token (public)
- GET /api/wellness/token/{token_id}/athletes - List athletes for token (public)
- GET /api/wellness/token/{token_id}/check-athlete/{athlete_id} - Check if athlete used token (public)
- POST /api/wellness/token/submit - Submit wellness via token (public)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_COACH_EMAIL = "testcoach@test.com"
TEST_COACH_PASSWORD = "test123"


class TestWellnessTokenSystem:
    """Complete test suite for wellness token functionality"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create a requests session"""
        return requests.Session()
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        """Get authentication token for test coach"""
        # First try to login
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_COACH_EMAIL,
            "password": TEST_COACH_PASSWORD
        })
        
        if response.status_code == 200:
            return response.json().get("access_token")
        
        # If login fails, try to register
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_COACH_EMAIL,
            "password": TEST_COACH_PASSWORD,
            "name": "Test Coach"
        })
        
        if response.status_code == 200:
            return response.json().get("access_token")
        
        pytest.skip(f"Could not authenticate: {response.text}")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def test_athlete(self, session, auth_headers):
        """Create a test athlete for this test session"""
        athlete_data = {
            "name": f"TEST_WellnessAthlete_{int(time.time())}",
            "birth_date": "2000-01-01",
            "position": "Midfielder",
            "height": 175.0,
            "weight": 70.0
        }
        
        response = session.post(
            f"{BASE_URL}/api/athletes",
            json=athlete_data,
            headers=auth_headers
        )
        
        if response.status_code not in [200, 201]:
            pytest.skip(f"Could not create test athlete: {response.text}")
        
        athlete = response.json()
        yield athlete
        
        # Cleanup: Delete athlete after tests
        session.delete(
            f"{BASE_URL}/api/athletes/{athlete.get('id', athlete.get('_id'))}",
            headers=auth_headers
        )
    
    # ==================== TOKEN CREATION TESTS ====================
    
    def test_create_token_success(self, session, auth_headers):
        """Test successful token creation with valid parameters"""
        response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token_id" in data
        assert len(data["token_id"]) == 6  # 6-character token
        assert data["max_uses"] == 5
        assert data["current_uses"] == 0
        assert data["status"] == "active"
        assert "expires_at" in data
        
        print(f"Token created: {data['token_id']}")
    
    def test_create_token_default_values(self, session, auth_headers):
        """Test token creation with default values"""
        response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={},  # Use defaults: max_uses=30, expires_in=24h
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["max_uses"] == 30  # Default value
    
    def test_create_token_invalid_expiry(self, session, auth_headers):
        """Test token creation fails with invalid expiry time"""
        response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "invalid"},
            headers=auth_headers
        )
        
        assert response.status_code == 400
    
    def test_create_token_requires_auth(self, session):
        """Test token creation requires authentication"""
        response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"}
            # No auth headers
        )
        
        assert response.status_code in [401, 403]
    
    # ==================== TOKEN VALIDATION TESTS ====================
    
    def test_validate_token_success(self, session, auth_headers):
        """Test successful token validation"""
        # Create token first
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        assert create_response.status_code == 200
        token_id = create_response.json()["token_id"]
        
        # Validate token (no auth required)
        validate_response = session.post(
            f"{BASE_URL}/api/wellness/token/validate",
            json={"token": token_id}
        )
        
        assert validate_response.status_code == 200
        data = validate_response.json()
        assert data["valid"] is True
        assert data["token_id"] == token_id
        assert "coach_id" in data
    
    def test_validate_token_case_insensitive(self, session, auth_headers):
        """Test token validation is case-insensitive"""
        # Create token first
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        
        # Validate with lowercase
        validate_response = session.post(
            f"{BASE_URL}/api/wellness/token/validate",
            json={"token": token_id.lower()}
        )
        
        assert validate_response.status_code == 200
        assert validate_response.json()["valid"] is True
    
    def test_validate_token_not_found(self, session):
        """Test validation fails for non-existent token"""
        response = session.post(
            f"{BASE_URL}/api/wellness/token/validate",
            json={"token": "XXXXXX"}
        )
        
        assert response.status_code == 404
    
    # ==================== GET ATHLETES FOR TOKEN TESTS ====================
    
    def test_get_athletes_for_token_success(self, session, auth_headers, test_athlete):
        """Test getting athletes list for a valid token"""
        # Create token
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        
        # Get athletes (no auth required)
        response = session.get(f"{BASE_URL}/api/wellness/token/{token_id}/athletes")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Check that test athlete is in the list
        athlete_ids = [a["id"] for a in data]
        test_athlete_id = test_athlete.get("id", test_athlete.get("_id"))
        assert test_athlete_id in athlete_ids
        
        # Check structure of returned athletes
        for athlete in data:
            assert "id" in athlete
            assert "name" in athlete
    
    def test_get_athletes_invalid_token(self, session):
        """Test getting athletes fails for invalid token"""
        response = session.get(f"{BASE_URL}/api/wellness/token/INVALID/athletes")
        
        assert response.status_code == 404
    
    # ==================== CHECK ATHLETE TOKEN USAGE TESTS ====================
    
    def test_check_athlete_not_used(self, session, auth_headers, test_athlete):
        """Test checking if athlete has NOT used a fresh token"""
        # Create new token
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        test_athlete_id = test_athlete.get("id", test_athlete.get("_id"))
        
        # Check usage (no auth required)
        response = session.get(
            f"{BASE_URL}/api/wellness/token/{token_id}/check-athlete/{test_athlete_id}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["already_used"] is False
        assert data["message"] == "OK"
    
    # ==================== TOKEN SUBMISSION TESTS ====================
    
    def test_submit_wellness_via_token_success(self, session, auth_headers, test_athlete):
        """Test successful wellness submission via token"""
        # Create new token
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        test_athlete_id = test_athlete.get("id", test_athlete.get("_id"))
        
        # Submit wellness (no auth required)
        today = datetime.now().strftime("%Y-%m-%d")
        response = session.post(
            f"{BASE_URL}/api/wellness/token/submit",
            json={
                "token": token_id,
                "athlete_id": test_athlete_id,
                "date": today,
                "sleep_hours": 8.0,
                "sleep_quality": 8,
                "fatigue": 3,
                "muscle_soreness": 2,
                "stress": 3,
                "mood": 8,
                "hydration": 7,
                "notes": "Test submission"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["success"] is True
        assert "feedback" in data
        assert data["feedback"]["athlete_name"] == test_athlete["name"]
        assert "readiness_score" in data["feedback"]
    
    def test_submit_wellness_increments_usage(self, session, auth_headers, test_athlete):
        """Test that submitting wellness increments token usage count"""
        # Create new token with 3 max uses
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 3, "expires_in": "1h"},
            headers=auth_headers
        )
        token_data = create_response.json()
        token_id = token_data["token_id"]
        
        # Create another test athlete for this test
        athlete_response = session.post(
            f"{BASE_URL}/api/athletes",
            json={
                "name": f"TEST_UsageAthlete_{int(time.time())}",
                "birth_date": "2000-01-01",
                "position": "Forward"
            },
            headers=auth_headers
        )
        new_athlete = athlete_response.json()
        new_athlete_id = new_athlete.get("id", new_athlete.get("_id"))
        
        # Submit wellness
        today = datetime.now().strftime("%Y-%m-%d")
        submit_response = session.post(
            f"{BASE_URL}/api/wellness/token/submit",
            json={
                "token": token_id,
                "athlete_id": new_athlete_id,
                "date": today,
                "sleep_hours": 7.0,
                "sleep_quality": 7,
                "fatigue": 4,
                "muscle_soreness": 3,
                "stress": 4,
                "mood": 7
            }
        )
        assert submit_response.status_code == 200
        
        # Validate token to check current_uses is tracked (indirectly via still being valid)
        validate_response = session.post(
            f"{BASE_URL}/api/wellness/token/validate",
            json={"token": token_id}
        )
        assert validate_response.status_code == 200
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/athletes/{new_athlete_id}", headers=auth_headers)
    
    def test_submit_wellness_athlete_cannot_use_twice(self, session, auth_headers, test_athlete):
        """CRITICAL: Test that an athlete cannot use the same token twice"""
        # Create new token
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 10, "expires_in": "1h"},  # High max_uses to isolate athlete blocking
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        
        # Create a fresh athlete for this test
        athlete_response = session.post(
            f"{BASE_URL}/api/athletes",
            json={
                "name": f"TEST_DoubleUseAthlete_{int(time.time())}",
                "birth_date": "2000-01-01",
                "position": "Defender"
            },
            headers=auth_headers
        )
        athlete = athlete_response.json()
        athlete_id = athlete.get("id", athlete.get("_id"))
        
        today = datetime.now().strftime("%Y-%m-%d")
        wellness_data = {
            "token": token_id,
            "athlete_id": athlete_id,
            "date": today,
            "sleep_hours": 8.0,
            "sleep_quality": 8,
            "fatigue": 3,
            "muscle_soreness": 2,
            "stress": 3,
            "mood": 8
        }
        
        # First submission should succeed
        response1 = session.post(f"{BASE_URL}/api/wellness/token/submit", json=wellness_data)
        assert response1.status_code == 200, f"First submission failed: {response1.text}"
        
        # Second submission should fail
        response2 = session.post(f"{BASE_URL}/api/wellness/token/submit", json=wellness_data)
        assert response2.status_code == 400, f"Second submission should fail: {response2.text}"
        assert "já respondeu" in response2.json().get("detail", "").lower()
        
        # Verify check-athlete endpoint also shows already_used
        check_response = session.get(
            f"{BASE_URL}/api/wellness/token/{token_id}/check-athlete/{athlete_id}"
        )
        assert check_response.status_code == 200
        assert check_response.json()["already_used"] is True
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/athletes/{athlete_id}", headers=auth_headers)
        print("PASS: Athlete blocked from using token twice")
    
    def test_submit_wellness_max_uses_exceeded(self, session, auth_headers):
        """Test token becomes inactive when max_uses is reached"""
        # Create token with max_uses = 1
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 1, "expires_in": "1h"},
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        
        # Create first athlete and submit
        athlete1_response = session.post(
            f"{BASE_URL}/api/athletes",
            json={
                "name": f"TEST_MaxUsesAthlete1_{int(time.time())}",
                "birth_date": "2000-01-01",
                "position": "Goalkeeper"
            },
            headers=auth_headers
        )
        athlete1 = athlete1_response.json()
        athlete1_id = athlete1.get("id", athlete1.get("_id"))
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        # First submission uses up the single use
        response1 = session.post(
            f"{BASE_URL}/api/wellness/token/submit",
            json={
                "token": token_id,
                "athlete_id": athlete1_id,
                "date": today,
                "sleep_hours": 8.0,
                "sleep_quality": 8,
                "fatigue": 3,
                "muscle_soreness": 2,
                "stress": 3,
                "mood": 8
            }
        )
        assert response1.status_code == 200
        
        # Create second athlete
        athlete2_response = session.post(
            f"{BASE_URL}/api/athletes",
            json={
                "name": f"TEST_MaxUsesAthlete2_{int(time.time())}",
                "birth_date": "2000-01-01",
                "position": "Striker"
            },
            headers=auth_headers
        )
        athlete2 = athlete2_response.json()
        athlete2_id = athlete2.get("id", athlete2.get("_id"))
        
        # Second submission by different athlete should fail (max_uses exceeded)
        response2 = session.post(
            f"{BASE_URL}/api/wellness/token/submit",
            json={
                "token": token_id,
                "athlete_id": athlete2_id,
                "date": today,
                "sleep_hours": 7.0,
                "sleep_quality": 7,
                "fatigue": 4,
                "muscle_soreness": 3,
                "stress": 4,
                "mood": 7
            }
        )
        assert response2.status_code == 400
        assert "limite" in response2.json().get("detail", "").lower()
        
        # Token validation should also fail
        validate_response = session.post(
            f"{BASE_URL}/api/wellness/token/validate",
            json={"token": token_id}
        )
        assert validate_response.status_code == 400
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/athletes/{athlete1_id}", headers=auth_headers)
        session.delete(f"{BASE_URL}/api/athletes/{athlete2_id}", headers=auth_headers)
        print("PASS: Token becomes inactive when max_uses reached")
    
    def test_submit_wellness_invalid_token(self, session, test_athlete):
        """Test submission fails with invalid token"""
        test_athlete_id = test_athlete.get("id", test_athlete.get("_id"))
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = session.post(
            f"{BASE_URL}/api/wellness/token/submit",
            json={
                "token": "INVALID",
                "athlete_id": test_athlete_id,
                "date": today,
                "sleep_hours": 8.0,
                "sleep_quality": 8,
                "fatigue": 3,
                "muscle_soreness": 2,
                "stress": 3,
                "mood": 8
            }
        )
        
        assert response.status_code == 404
    
    def test_submit_wellness_invalid_athlete(self, session, auth_headers):
        """Test submission fails with invalid athlete ID"""
        # Create token
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = session.post(
            f"{BASE_URL}/api/wellness/token/submit",
            json={
                "token": token_id,
                "athlete_id": "000000000000000000000000",  # Non-existent athlete
                "date": today,
                "sleep_hours": 8.0,
                "sleep_quality": 8,
                "fatigue": 3,
                "muscle_soreness": 2,
                "stress": 3,
                "mood": 8
            }
        )
        
        assert response.status_code == 404


class TestTokenExpirationFlow:
    """Tests for token expiration scenarios"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_COACH_EMAIL,
            "password": TEST_COACH_PASSWORD
        })
        
        if response.status_code != 200:
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": TEST_COACH_EMAIL,
                "password": TEST_COACH_PASSWORD,
                "name": "Test Coach"
            })
        
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_token_expiry_options(self, session, auth_headers):
        """Test all valid expiry options"""
        valid_expiries = ["30min", "1h", "2h", "8h", "24h"]
        
        for expiry in valid_expiries:
            response = session.post(
                f"{BASE_URL}/api/wellness/token",
                json={"max_uses": 5, "expires_in": expiry},
                headers=auth_headers
            )
            
            assert response.status_code == 200, f"Failed for expiry {expiry}: {response.text}"
            data = response.json()
            assert "expires_at" in data
            print(f"PASS: Token created with {expiry} expiry")


class TestWellnessFeedback:
    """Tests for wellness feedback calculation"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    @pytest.fixture(scope="class")
    def auth_token(self, session):
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_COACH_EMAIL,
            "password": TEST_COACH_PASSWORD
        })
        
        if response.status_code != 200:
            response = session.post(f"{BASE_URL}/api/auth/register", json={
                "email": TEST_COACH_EMAIL,
                "password": TEST_COACH_PASSWORD,
                "name": "Test Coach"
            })
        
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_feedback_optimal_readiness(self, session, auth_headers):
        """Test feedback for optimal readiness score"""
        # Create token
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        
        # Create athlete
        athlete_response = session.post(
            f"{BASE_URL}/api/athletes",
            json={
                "name": f"TEST_OptimalAthlete_{int(time.time())}",
                "birth_date": "2000-01-01",
                "position": "Midfielder"
            },
            headers=auth_headers
        )
        athlete = athlete_response.json()
        athlete_id = athlete.get("id", athlete.get("_id"))
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Submit with optimal values (low fatigue, high sleep quality, etc.)
        response = session.post(
            f"{BASE_URL}/api/wellness/token/submit",
            json={
                "token": token_id,
                "athlete_id": athlete_id,
                "date": today,
                "sleep_hours": 9.0,
                "sleep_quality": 10,
                "fatigue": 1,
                "muscle_soreness": 1,
                "stress": 1,
                "mood": 10
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["feedback"]["status"] == "optimal"
        assert data["feedback"]["readiness_score"] >= 7
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/athletes/{athlete_id}", headers=auth_headers)
    
    def test_feedback_low_readiness(self, session, auth_headers):
        """Test feedback for low readiness score"""
        # Create token
        create_response = session.post(
            f"{BASE_URL}/api/wellness/token",
            json={"max_uses": 5, "expires_in": "1h"},
            headers=auth_headers
        )
        token_id = create_response.json()["token_id"]
        
        # Create athlete
        athlete_response = session.post(
            f"{BASE_URL}/api/athletes",
            json={
                "name": f"TEST_LowAthlete_{int(time.time())}",
                "birth_date": "2000-01-01",
                "position": "Defender"
            },
            headers=auth_headers
        )
        athlete = athlete_response.json()
        athlete_id = athlete.get("id", athlete.get("_id"))
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Submit with poor values
        response = session.post(
            f"{BASE_URL}/api/wellness/token/submit",
            json={
                "token": token_id,
                "athlete_id": athlete_id,
                "date": today,
                "sleep_hours": 4.0,
                "sleep_quality": 2,
                "fatigue": 9,
                "muscle_soreness": 9,
                "stress": 9,
                "mood": 2
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["feedback"]["status"] == "low"
        assert data["feedback"]["readiness_score"] < 5
        assert len(data["feedback"]["recommendations"]) > 0
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/athletes/{athlete_id}", headers=auth_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
