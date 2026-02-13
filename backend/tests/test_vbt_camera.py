"""
Test VBT Camera Feature - Backend API Tests
Tests for VBT (Velocity Based Training) camera integration endpoints
"""
import pytest
import requests
import os
from datetime import datetime

# Use public URL for testing
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://expo-camera-build.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "coach_test@test.com"
TEST_PASSWORD = "password"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for coach"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    # Try to register if user doesn't exist
    if response.status_code == 401:
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "name": "Coach Test"
        })
        if reg_response.status_code == 200:
            return reg_response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def athlete_id(auth_token):
    """Get or create a test athlete"""
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Get existing athletes
    response = requests.get(f"{BASE_URL}/api/athletes", headers=headers)
    if response.status_code == 200:
        athletes = response.json()
        if athletes and len(athletes) > 0:
            return athletes[0].get("_id") or athletes[0].get("id")
    
    # Create a new athlete if none exist
    create_response = requests.post(f"{BASE_URL}/api/athletes", headers=headers, json={
        "name": "Atleta Um",
        "birth_date": "2000-01-01",
        "position": "Forward"
    })
    if create_response.status_code in [200, 201]:
        data = create_response.json()
        return data.get("_id") or data.get("id")
    
    pytest.skip(f"Could not get or create athlete: {create_response.status_code}")


class TestVBTProvidersEndpoint:
    """Test GET /api/vbt/providers endpoint"""
    
    def test_vbt_providers_returns_success(self):
        """Test that VBT providers endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/vbt/providers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_vbt_providers_includes_camera(self):
        """Test that camera provider is included in VBT providers"""
        response = requests.get(f"{BASE_URL}/api/vbt/providers")
        assert response.status_code == 200
        
        data = response.json()
        assert "providers" in data, "Response should have 'providers' key"
        
        provider_ids = [p.get("id") for p in data["providers"]]
        assert "camera" in provider_ids, f"Camera provider not found. Available: {provider_ids}"
    
    def test_camera_provider_has_correct_details(self):
        """Test camera provider has correct metadata"""
        response = requests.get(f"{BASE_URL}/api/vbt/providers")
        data = response.json()
        
        camera_provider = next((p for p in data["providers"] if p.get("id") == "camera"), None)
        assert camera_provider is not None, "Camera provider not found"
        
        # Verify camera provider details
        assert camera_provider.get("name") == "Camera Tracking"
        assert "videocam" in camera_provider.get("icon", "")
        assert "import_format" in camera_provider
        assert camera_provider["import_format"] == "camera"
        assert "velocity_drop" in camera_provider.get("metrics", [])


class TestVBTDataEndpoint:
    """Test POST /api/vbt/data endpoint with camera provider"""
    
    def test_vbt_data_accepts_camera_provider(self, auth_token, athlete_id):
        """Test that VBT data endpoint accepts 'camera' provider"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        vbt_data = {
            "athlete_id": athlete_id,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "provider": "camera",
            "exercise": "Back Squat",
            "sets": [
                {
                    "reps": 1,
                    "mean_velocity": 0.85,
                    "peak_velocity": 1.05,
                    "load_kg": 80,
                    "power_watts": 668,
                    "velocity_drop": 0
                },
                {
                    "reps": 1,
                    "mean_velocity": 0.78,
                    "peak_velocity": 0.98,
                    "load_kg": 80,
                    "power_watts": 612,
                    "velocity_drop": 8
                },
                {
                    "reps": 1,
                    "mean_velocity": 0.70,
                    "peak_velocity": 0.88,
                    "load_kg": 80,
                    "power_watts": 549,
                    "velocity_drop": 18
                }
            ],
            "camera_config": {
                "height_cm": 100,
                "distance_cm": 150
            }
        }
        
        response = requests.post(f"{BASE_URL}/api/vbt/data", headers=headers, json=vbt_data)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        # Verify response data
        data = response.json()
        assert data.get("provider") == "camera", f"Provider should be 'camera', got: {data.get('provider')}"
        assert data.get("exercise") == "Back Squat"
        assert "_id" in data or "id" in data, "Response should have ID"
    
    def test_vbt_data_rejects_invalid_provider(self, auth_token, athlete_id):
        """Test that VBT data endpoint rejects invalid provider"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        vbt_data = {
            "athlete_id": athlete_id,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "provider": "invalid_provider",
            "exercise": "Back Squat",
            "sets": [
                {"reps": 1, "mean_velocity": 0.85, "load_kg": 80}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/vbt/data", headers=headers, json=vbt_data)
        assert response.status_code == 422, f"Expected 422 for invalid provider, got {response.status_code}"
    
    def test_vbt_data_manual_provider_still_works(self, auth_token, athlete_id):
        """Test that manual provider still works"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        vbt_data = {
            "athlete_id": athlete_id,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "provider": "manual",
            "exercise": "Bench Press",
            "sets": [
                {"reps": 5, "mean_velocity": 0.65, "load_kg": 60, "power_watts": 350}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/vbt/data", headers=headers, json=vbt_data)
        assert response.status_code in [200, 201], f"Manual provider should work: {response.status_code}: {response.text}"


class TestCoachLogin:
    """Test coach authentication"""
    
    def test_coach_login_success(self):
        """Test coach login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        # If user doesn't exist, try to register
        if response.status_code == 401:
            reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "name": "Coach Test"
            })
            if reg_response.status_code == 200:
                response = requests.post(f"{BASE_URL}/api/auth/login", json={
                    "email": TEST_EMAIL,
                    "password": TEST_PASSWORD
                })
        
        assert response.status_code == 200, f"Login failed: {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Should return access_token"
        assert "user" in data, "Should return user info"


class TestAthletesEndpoint:
    """Test athletes listing endpoint"""
    
    def test_athletes_list_after_login(self, auth_token):
        """Test that athletes can be listed after login"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(f"{BASE_URL}/api/athletes", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Athletes should be a list"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
