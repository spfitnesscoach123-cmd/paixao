"""
Test CMJ RSI Bug Fix - Two specific bugs being validated:

Bug 1: RSImod calculation incorrectly used contactTime for CMJ (should use timeToTakeoff)
- POST /api/jump/assessment with contact_time_ms=0 for CMJ protocol should save without error
- GET /api/jump/analysis/{athlete_id} should return RSI=0 when contact_time_ms=0 (CMJ protocol)

Bug 2: Frontend useFocusEffect for chart refetch (validated in code review, not API testable)

This test validates the BACKEND correctly handles contact_time_ms=0 for CMJ assessments.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://vbt-jump-bodyscan.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def authenticated_session(auth_token):
    """Create session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


@pytest.fixture(scope="module")
def test_athlete_id(authenticated_session):
    """Get or create a test athlete for jump assessments"""
    # First, try to get existing athletes
    response = authenticated_session.get(f"{BASE_URL}/api/athletes")
    assert response.status_code == 200
    athletes = response.json()
    
    # Use first athlete if available
    if athletes:
        return athletes[0]["_id"]
    
    # Create test athlete
    response = authenticated_session.post(f"{BASE_URL}/api/athletes", json={
        "name": "TEST_CMJ_RSI_Athlete",
        "birth_date": "2000-01-01",
        "position": "Forward",
        "height": 180,
        "weight": 75
    })
    assert response.status_code == 200
    return response.json()["_id"]


class TestCMJContactTimeZeroBugFix:
    """
    Bug 1: CMJ assessment with contact_time_ms=0 should work correctly.
    
    The jump camera now sends contact_time_ms=0 for CMJ protocol because
    CMJ doesn't have reactive contact time (only Drop Jump does).
    The backend should handle this gracefully.
    """
    
    def test_cmj_assessment_with_contact_time_zero_saves_without_error(self, authenticated_session, test_athlete_id):
        """
        POST /api/jump/assessment with contact_time_ms=0 for CMJ should save without error.
        This is the core fix - CMJ protocol now sends contactTimeMs=0 from the camera.
        """
        response = authenticated_session.post(f"{BASE_URL}/api/jump/assessment", json={
            "athlete_id": test_athlete_id,
            "date": "2026-01-15",
            "protocol": "cmj",
            "flight_time_ms": 450,  # ~25cm jump height
            "contact_time_ms": 0,   # BUG FIX: CMJ now sends 0 for contact time
            "jump_height_cm": None,  # Auto-calculate from flight time
            "box_height_cm": None,
            "notes": "TEST_CMJ_CONTACT_ZERO"
        })
        
        # MUST succeed without error
        assert response.status_code == 200, f"CMJ assessment with contact_time=0 failed: {response.text}"
        
        data = response.json()
        assert "assessment" in data
        assert "calculations" in data
        
        # RSI should be 0 when contact_time is 0
        assert data["calculations"]["rsi"] == 0, "RSI should be 0 when contact_time_ms=0"
        
        # But jump height and other metrics should still calculate
        assert data["calculations"]["jump_height_cm"] > 0, "Jump height should still be calculated"
        assert data["calculations"]["peak_power_w"] > 0, "Peak power should still be calculated"
        assert data["calculations"]["peak_velocity_ms"] > 0, "Peak velocity should still be calculated"
        
        print(f"✓ CMJ with contact_time=0 saved successfully")
        print(f"  RSI: {data['calculations']['rsi']} (expected: 0)")
        print(f"  Jump Height: {data['calculations']['jump_height_cm']}cm")
        print(f"  Peak Power: {data['calculations']['peak_power_w']}W")
    
    def test_cmj_rsi_is_zero_when_contact_time_is_zero(self, authenticated_session, test_athlete_id):
        """
        GET /api/jump/analysis/{athlete_id} should return RSI=0 for CMJ with contact_time=0.
        This validates the backend RSI calculation handles zero contact time correctly.
        """
        response = authenticated_session.get(f"{BASE_URL}/api/jump/analysis/{test_athlete_id}?lang=en")
        
        assert response.status_code == 200, f"Get analysis failed: {response.text}"
        
        data = response.json()
        
        # If CMJ data exists, verify RSI handling
        if data.get("protocols", {}).get("cmj", {}).get("latest"):
            cmj_latest = data["protocols"]["cmj"]["latest"]
            
            # If contact_time_ms is 0 or missing, RSI should be 0
            contact_time = cmj_latest.get("contact_time_ms", 0)
            if contact_time == 0:
                assert cmj_latest["rsi"] == 0, f"RSI should be 0 when contact_time=0, got {cmj_latest['rsi']}"
                print(f"✓ CMJ analysis returns RSI=0 when contact_time=0")
            else:
                print(f"  CMJ contact_time={contact_time}ms, RSI={cmj_latest.get('rsi')}")
        else:
            print("  No CMJ data found - creating assessment should add it")


class TestDropJumpStillUsesContactTime:
    """
    Regression test: Drop Jump (DJ) protocol should still use contact time.
    
    The bug fix for CMJ should NOT affect DJ protocol, which still needs
    contact time for RSI calculation (RSI = jumpHeight / contactTime).
    """
    
    def test_dj_assessment_with_contact_time_calculates_rsi(self, authenticated_session, test_athlete_id):
        """
        Drop Jump with proper contact time should calculate RSI normally.
        This ensures the CMJ bug fix doesn't break DJ.
        """
        response = authenticated_session.post(f"{BASE_URL}/api/jump/assessment", json={
            "athlete_id": test_athlete_id,
            "date": "2026-01-15",
            "protocol": "dj",
            "flight_time_ms": 450,
            "contact_time_ms": 180,  # DJ has actual contact time
            "jump_height_cm": None,
            "box_height_cm": 40,
            "notes": "TEST_DJ_CONTACT_TIME"
        })
        
        assert response.status_code == 200, f"DJ assessment failed: {response.text}"
        
        data = response.json()
        
        # DJ should have non-zero RSI calculated
        rsi = data["calculations"]["rsi"]
        assert rsi > 0, f"DJ RSI should be > 0 when contact_time > 0, got {rsi}"
        
        # Calculate expected RSI: jump_height (m) / contact_time (s)
        jump_height_cm = data["calculations"]["jump_height_cm"]
        expected_rsi = round((jump_height_cm / 100) / (180 / 1000), 2)
        
        # Allow small floating point tolerance
        assert abs(rsi - expected_rsi) < 0.1, f"DJ RSI mismatch: got {rsi}, expected ~{expected_rsi}"
        
        print(f"✓ DJ assessment with contact_time=180ms calculates RSI correctly")
        print(f"  RSI: {rsi} (expected: ~{expected_rsi})")
        print(f"  Jump Height: {jump_height_cm}cm")


class TestJumpAnalysisEndpoint:
    """
    Test the analysis endpoint returns correct RSI values.
    """
    
    def test_analysis_endpoint_returns_data(self, authenticated_session, test_athlete_id):
        """Basic test that analysis endpoint returns valid data"""
        response = authenticated_session.get(f"{BASE_URL}/api/jump/analysis/{test_athlete_id}?lang=en")
        
        assert response.status_code == 200, f"Analysis failed: {response.text}"
        
        data = response.json()
        assert "athlete_id" in data
        assert "protocols" in data
        
        print(f"✓ Analysis endpoint returns valid data")
        print(f"  Protocols: {list(data.get('protocols', {}).keys())}")


class TestJumpProtocolsEndpoint:
    """
    Test that jump protocols endpoint works correctly.
    """
    
    def test_get_protocols(self, authenticated_session):
        """Test protocols endpoint returns all protocols"""
        response = authenticated_session.get(f"{BASE_URL}/api/jump/protocols?lang=en")
        
        assert response.status_code == 200, f"Get protocols failed: {response.text}"
        
        data = response.json()
        assert "cmj" in data
        assert "dj" in data
        
        # Verify CMJ still has contact_time_ms as required (for manual entry compatibility)
        # Even though camera sends 0, manual entry might still use it
        assert "contact_time_ms" in data["cmj"]["required_fields"]
        
        print(f"✓ Protocols endpoint returns all protocols")
        print(f"  CMJ required fields: {data['cmj']['required_fields']}")
        print(f"  DJ required fields: {data['dj']['required_fields']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
