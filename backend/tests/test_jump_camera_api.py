"""
Jump Camera API Tests
====================
Tests for the Jump Assessment API endpoints that support the camera pipeline:
- POST /api/jump/assessment (CMJ, DJ, SL-CMJ)
- GET /api/jump/protocols
- GET /api/jump/assessments/{athlete_id}

These tests verify the backend API works correctly for camera-based jump data.
"""

import pytest
import requests
import os
from datetime import datetime, timedelta
import random
import string

# Use the public backend URL for testing
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://vbt-debug-hide.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"


def generate_test_id():
    """Generate unique ID for test data"""
    return "TEST_" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


class TestJumpCameraAPI:
    """Test Jump Camera API Endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate and get test athlete"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        data = login_response.json()
        self.token = data.get("access_token")
        self.user = data.get("user")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get existing athletes to use for testing
        athletes_response = self.session.get(f"{BASE_URL}/api/athletes")
        if athletes_response.status_code == 200 and athletes_response.json():
            self.test_athlete = athletes_response.json()[0]
            self.athlete_id = self.test_athlete.get("_id") or self.test_athlete.get("id")
        else:
            pytest.skip("No athletes available for testing")
        
        yield
        
        # Cleanup: no cleanup needed as we're using existing data
    
    # ============================================================
    # Test GET /api/jump/protocols
    # ============================================================
    
    def test_get_jump_protocols_returns_all_protocols(self):
        """Test that /api/jump/protocols returns all 4 jump protocols"""
        response = self.session.get(f"{BASE_URL}/api/jump/protocols")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        protocols = response.json()
        assert isinstance(protocols, dict), "Expected dict of protocols"
        assert len(protocols) == 4, f"Expected 4 protocols, got {len(protocols)}"
        
        # Verify protocol types
        assert "cmj" in protocols, "Missing CMJ protocol"
        assert "sl_cmj_right" in protocols, "Missing SL-CMJ Right protocol"
        assert "sl_cmj_left" in protocols, "Missing SL-CMJ Left protocol"
        assert "dj" in protocols, "Missing DJ protocol"
        
        print(f"✅ All 4 protocols returned: {list(protocols.keys())}")
    
    def test_get_jump_protocols_has_required_fields(self):
        """Test that each protocol has required fields"""
        response = self.session.get(f"{BASE_URL}/api/jump/protocols")
        
        assert response.status_code == 200
        protocols = response.json()
        
        required_fields = ["id", "name", "description", "required_fields"]
        
        for protocol_key, protocol in protocols.items():
            for field in required_fields:
                assert field in protocol, f"Protocol {protocol_key} missing field: {field}"
            
            # Verify required_fields contains flight_time and contact_time
            req_fields = protocol.get("required_fields", [])
            assert "flight_time_ms" in req_fields, f"Protocol {protocol_key} missing flight_time_ms"
            assert "contact_time_ms" in req_fields, f"Protocol {protocol_key} missing contact_time_ms"
        
        print("✅ All protocols have required fields")
    
    # ============================================================
    # Test POST /api/jump/assessment - CMJ
    # ============================================================
    
    def test_create_cmj_assessment_with_camera_data(self):
        """Test creating a CMJ assessment with camera-derived data"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Simulate camera-derived metrics (typical values)
        # Flight time ~400-500ms corresponds to ~20-30cm jump height
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "cmj",
            "flight_time_ms": 450,       # 450ms flight time
            "contact_time_ms": 300,      # 300ms contact time (eccentric + concentric)
            "notes": "TEST_CMJ_CAMERA camera_data_source"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "assessment" in data, "Missing 'assessment' in response"
        assert "calculations" in data, "Missing 'calculations' in response"
        
        assessment = data["assessment"]
        calculations = data["calculations"]
        
        # Verify assessment data
        assert assessment.get("protocol") == "cmj", "Protocol mismatch"
        assert assessment.get("flight_time_ms") == 450, "Flight time mismatch"
        assert assessment.get("contact_time_ms") == 300, "Contact time mismatch"
        
        # Verify calculated metrics
        jump_height = calculations.get("jump_height_cm", 0)
        assert 15 <= jump_height <= 35, f"Jump height {jump_height}cm outside expected range 15-35cm"
        
        rsi = calculations.get("rsi", 0)
        assert 0.3 <= rsi <= 2.0, f"RSI {rsi} outside expected range 0.3-2.0"
        
        assert "rsi_classification" in calculations, "Missing RSI classification"
        assert "peak_power_w" in calculations, "Missing peak power"
        assert "peak_velocity_ms" in calculations, "Missing peak velocity"
        
        print(f"✅ CMJ Assessment created: height={jump_height:.1f}cm, RSI={rsi:.2f}")
        
        # Store assessment ID for cleanup
        self._last_assessment_id = assessment.get("_id") or assessment.get("id")
    
    def test_create_cmj_calculates_jump_height_from_flight_time(self):
        """Test that jump height is automatically calculated from flight time"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Send without jump_height_cm - should be calculated
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "cmj",
            "flight_time_ms": 500,  # 500ms = ~30.6cm jump height
            "contact_time_ms": 350,
            "notes": "TEST_CMJ_AUTO_HEIGHT"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200
        
        calculations = response.json().get("calculations", {})
        jump_height = calculations.get("jump_height_cm", 0)
        
        # h = (g * t^2) / 8, where t = 0.5s, g = 9.81
        # h = (9.81 * 0.25) / 8 = 0.306m = 30.6cm
        expected_height_approx = 30.6
        
        assert 28 <= jump_height <= 33, f"Auto-calculated height {jump_height}cm doesn't match expected ~{expected_height_approx}cm"
        
        print(f"✅ Jump height auto-calculated: {jump_height:.1f}cm (expected ~{expected_height_approx}cm)")
    
    # ============================================================
    # Test POST /api/jump/assessment - DJ (Drop Jump)
    # ============================================================
    
    def test_create_dj_assessment(self):
        """Test creating a Drop Jump assessment"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        # DJ typical values: shorter contact time, good flight time
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "dj",
            "flight_time_ms": 480,       # 480ms flight time
            "contact_time_ms": 180,      # 180ms ground contact (reactive)
            "box_height_cm": 40,         # 40cm box
            "notes": "TEST_DJ_CAMERA"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assessment = data.get("assessment", {})
        calculations = data.get("calculations", {})
        
        # Verify DJ-specific data
        assert assessment.get("protocol") == "dj", "Protocol should be 'dj'"
        assert assessment.get("box_height_cm") == 40, "Box height mismatch"
        
        # DJ should have higher RSI due to shorter contact time
        rsi = calculations.get("rsi", 0)
        assert rsi > 0.5, f"DJ RSI {rsi} seems too low"
        
        print(f"✅ DJ Assessment created: RSI={rsi:.2f}, contact={assessment.get('contact_time_ms')}ms")
    
    def test_create_dj_calculates_rsi_correctly(self):
        """Test that RSI is calculated correctly for DJ"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Known values for RSI calculation
        # RSI = jump_height_m / contact_time_s
        # flight_time = 400ms -> height = 19.6cm = 0.196m
        # contact_time = 200ms = 0.2s
        # RSI = 0.196 / 0.2 = 0.98
        
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "dj",
            "flight_time_ms": 400,
            "contact_time_ms": 200,
            "notes": "TEST_DJ_RSI_CALC"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200
        
        calculations = response.json().get("calculations", {})
        rsi = calculations.get("rsi", 0)
        
        # Expected RSI ≈ 0.98 (allow some tolerance)
        assert 0.8 <= rsi <= 1.2, f"RSI {rsi} doesn't match expected ~0.98"
        
        print(f"✅ DJ RSI calculated correctly: {rsi:.2f}")
    
    # ============================================================
    # Test POST /api/jump/assessment - SL-CMJ
    # ============================================================
    
    def test_create_sl_cmj_right_assessment(self):
        """Test creating a Single-Leg CMJ Right assessment"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "sl_cmj_right",
            "flight_time_ms": 380,       # Typically lower than bilateral
            "contact_time_ms": 320,
            "notes": "TEST_SLCMJ_RIGHT"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("assessment", {}).get("protocol") == "sl_cmj_right"
        
        print(f"✅ SL-CMJ Right Assessment created")
    
    def test_create_sl_cmj_left_assessment(self):
        """Test creating a Single-Leg CMJ Left assessment"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "sl_cmj_left",
            "flight_time_ms": 365,
            "contact_time_ms": 310,
            "notes": "TEST_SLCMJ_LEFT"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("assessment", {}).get("protocol") == "sl_cmj_left"
        
        print(f"✅ SL-CMJ Left Assessment created")
    
    # ============================================================
    # Test GET /api/jump/assessments/{athlete_id}
    # ============================================================
    
    def test_get_athlete_assessments(self):
        """Test retrieving assessments for an athlete"""
        response = self.session.get(f"{BASE_URL}/api/jump/assessments/{self.athlete_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        assessments = response.json()
        assert isinstance(assessments, list), "Expected list of assessments"
        
        print(f"✅ Retrieved {len(assessments)} assessments for athlete")
    
    def test_get_athlete_assessments_by_protocol(self):
        """Test filtering assessments by protocol"""
        response = self.session.get(
            f"{BASE_URL}/api/jump/assessments/{self.athlete_id}",
            params={"protocol": "cmj"}
        )
        
        assert response.status_code == 200
        
        assessments = response.json()
        
        # All returned should be CMJ
        for a in assessments:
            assert a.get("protocol") == "cmj", f"Expected 'cmj', got {a.get('protocol')}"
        
        print(f"✅ Filtered assessments by protocol: {len(assessments)} CMJ assessments")
    
    # ============================================================
    # Test Error Cases
    # ============================================================
    
    def test_create_assessment_invalid_athlete(self):
        """Test creating assessment with invalid athlete ID"""
        payload = {
            "athlete_id": "000000000000000000000000",  # Invalid ID
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "protocol": "cmj",
            "flight_time_ms": 400,
            "contact_time_ms": 300,
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 404, f"Expected 404 for invalid athlete, got {response.status_code}"
        
        print("✅ Invalid athlete correctly returns 404")
    
    def test_create_assessment_missing_required_fields(self):
        """Test creating assessment without required fields"""
        # Missing flight_time_ms and contact_time_ms
        payload = {
            "athlete_id": self.athlete_id,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "protocol": "cmj",
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        # Should fail validation (422)
        assert response.status_code == 422, f"Expected 422 for missing fields, got {response.status_code}"
        
        print("✅ Missing required fields correctly returns 422")


class TestJumpCalculations:
    """Test jump metric calculations (RSI, RSI modified, etc.)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip("Authentication failed")
        
        data = login_response.json()
        self.token = data.get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get test athlete
        athletes_response = self.session.get(f"{BASE_URL}/api/athletes")
        if athletes_response.status_code == 200 and athletes_response.json():
            self.athlete_id = athletes_response.json()[0].get("_id") or athletes_response.json()[0].get("id")
        else:
            pytest.skip("No athletes available")
    
    def test_rsi_modified_calculation(self):
        """Test RSI modified calculation: RSI_mod = flight_time / contact_time"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        # RSI_mod = flight_time_ms / contact_time_ms
        # 400 / 250 = 1.6
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "cmj",
            "flight_time_ms": 400,
            "contact_time_ms": 250,
            "notes": "TEST_RSI_MOD_CALC"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200
        
        calculations = response.json().get("calculations", {})
        rsi_mod = calculations.get("rsi_modified", 0)
        
        # Expected: 400/250 = 1.6
        assert 1.4 <= rsi_mod <= 1.8, f"RSI_mod {rsi_mod} doesn't match expected ~1.6"
        
        print(f"✅ RSI Modified calculated: {rsi_mod:.2f}")
    
    def test_peak_power_calculation(self):
        """Test peak power calculation using Sayers equation"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "cmj",
            "flight_time_ms": 450,
            "contact_time_ms": 300,
            "notes": "TEST_PEAK_POWER"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200
        
        calculations = response.json().get("calculations", {})
        peak_power = calculations.get("peak_power_w", 0)
        
        # Peak power should be positive and reasonable (1000-5000W typical)
        assert 500 <= peak_power <= 6000, f"Peak power {peak_power}W outside expected range"
        
        print(f"✅ Peak Power calculated: {peak_power:.0f}W")
    
    def test_peak_velocity_calculation(self):
        """Test peak velocity calculation"""
        test_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        payload = {
            "athlete_id": self.athlete_id,
            "date": test_date,
            "protocol": "cmj",
            "flight_time_ms": 500,  # ~30cm jump
            "contact_time_ms": 300,
            "notes": "TEST_PEAK_VELOCITY"
        }
        
        response = self.session.post(f"{BASE_URL}/api/jump/assessment", json=payload)
        
        assert response.status_code == 200
        
        calculations = response.json().get("calculations", {})
        peak_velocity = calculations.get("peak_velocity_ms", 0)
        
        # v = sqrt(2 * g * h), for 30cm: sqrt(2 * 9.81 * 0.3) ≈ 2.42 m/s
        assert 1.5 <= peak_velocity <= 3.5, f"Peak velocity {peak_velocity}m/s outside expected range"
        
        print(f"✅ Peak Velocity calculated: {peak_velocity:.2f} m/s")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
