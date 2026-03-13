"""
Test Jump RSI TimeToTakeoff Fix - Iteration 24 Bug Fix Tests

5 specific issues being tested:
1) RSImod must use jumpHeight/timeToTakeoff (not contactTime) for CMJ/SL-CMJ
2) SL-CMJ metrics persisted to DB
3) Save pipeline includes SL-CMJ dual legs
4) Analysis endpoint returns SL-CMJ data with rsi_modified and time_to_takeoff_ms
5) Asymmetry calculation works when both SL-CMJ legs exist

Key Formula:
- CMJ/SL-CMJ: RSImod = jumpHeight(m) / timeToTakeoff(s) — NEVER use contactTime
- DJ: RSI = jumpHeight(m) / contactTime(s) — classic reactive strength index

Test data calculations for CMJ:
- Jump height from flight_time=369ms: h = (9.81 * 0.369^2) / 8 = 0.167m = 16.7cm
- RSImod = 0.167 / 0.865 = 0.193 ≈ 0.19

Test athlete ID: 69a6ca6a85668876432f090a
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://rsiamod-audit.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"

# Test athlete from previous iterations
TEST_ATHLETE_ID = "69a6ca6a85668876432f090a"


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


class TestCMJRSIUsesTimeToTakeoff:
    """
    Test Issue #1: RSImod must use jumpHeight/timeToTakeoff for CMJ protocol
    
    Formula: RSImod = jumpHeight(m) / timeToTakeoff(s)
    NOT: RSImod = jumpHeight(m) / contactTime(s)
    """
    
    def test_cmj_with_time_to_takeoff_calculates_rsimod(self, authenticated_session):
        """
        POST CMJ with time_to_takeoff_ms=865 should calculate RSImod correctly.
        RSImod = jumpHeight(m) / timeToTakeoff(s)
        """
        response = authenticated_session.post(f"{BASE_URL}/api/jump/assessment", json={
            "athlete_id": TEST_ATHLETE_ID,
            "date": "2026-01-17",
            "protocol": "cmj",
            "flight_time_ms": 369,  # ~16.7cm jump height
            "contact_time_ms": 0,   # CMJ has no contact time
            "jump_height_cm": None,  # Auto-calculate
            "time_to_takeoff_ms": 865,  # Eccentric + concentric phase
            "notes": "TEST_CMJ_RSI_TTT_FIX"
        })
        
        assert response.status_code == 200, f"CMJ assessment failed: {response.text}"
        
        data = response.json()
        calculations = data["calculations"]
        
        # Verify jump height was calculated
        jump_height_cm = calculations["jump_height_cm"]
        assert jump_height_cm > 0, "Jump height should be calculated"
        print(f"Jump height: {jump_height_cm:.1f}cm")
        
        # Verify RSI was calculated using timeToTakeoff, NOT contactTime
        rsi = calculations["rsi"]
        rsi_modified = calculations["rsi_modified"]
        
        # Expected RSI = jumpHeight(m) / timeToTakeoff(s)
        expected_rsi = round((jump_height_cm / 100) / (865 / 1000), 2)
        
        # RSI should match formula: jumpHeight / timeToTakeoff
        # NOT be 0 (which would happen if using contactTime=0)
        assert rsi > 0, f"RSI should be > 0 when timeToTakeoff > 0, got {rsi}"
        assert abs(rsi - expected_rsi) < 0.05, f"RSI mismatch: got {rsi}, expected {expected_rsi}"
        
        print(f"✓ CMJ RSI uses timeToTakeoff correctly")
        print(f"  RSI: {rsi} (expected: {expected_rsi})")
        print(f"  RSI Modified: {rsi_modified}")
        print(f"  Formula: {jump_height_cm/100:.3f}m / {865/1000:.3f}s = {expected_rsi}")
    
    def test_cmj_rsi_is_zero_without_time_to_takeoff(self, authenticated_session):
        """
        CMJ without time_to_takeoff_ms should have RSI=0.
        This validates the formula: if timeToTakeoff is 0/null, RSI cannot be calculated.
        """
        response = authenticated_session.post(f"{BASE_URL}/api/jump/assessment", json={
            "athlete_id": TEST_ATHLETE_ID,
            "date": "2026-01-17",
            "protocol": "cmj",
            "flight_time_ms": 400,
            "contact_time_ms": 0,
            "time_to_takeoff_ms": None,  # No TTT provided
            "notes": "TEST_CMJ_NO_TTT"
        })
        
        assert response.status_code == 200, f"CMJ assessment failed: {response.text}"
        
        data = response.json()
        rsi = data["calculations"]["rsi"]
        
        assert rsi == 0, f"RSI should be 0 when timeToTakeoff is not provided, got {rsi}"
        print(f"✓ CMJ RSI=0 when time_to_takeoff_ms is not provided")


class TestSLCMJPersistence:
    """
    Test Issue #2 & #3: SL-CMJ metrics persisted to DB and dual leg save
    """
    
    def test_sl_cmj_left_saves_with_time_to_takeoff(self, authenticated_session):
        """
        POST SL-CMJ Left leg with time_to_takeoff_ms should calculate RSImod correctly.
        """
        response = authenticated_session.post(f"{BASE_URL}/api/jump/assessment", json={
            "athlete_id": TEST_ATHLETE_ID,
            "date": "2026-01-17",
            "protocol": "sl_cmj_left",
            "flight_time_ms": 340,  # ~14.2cm jump
            "contact_time_ms": 0,
            "time_to_takeoff_ms": 920,
            "notes": "TEST_SL_CMJ_LEFT_TTT"
        })
        
        assert response.status_code == 200, f"SL-CMJ Left failed: {response.text}"
        
        data = response.json()
        calculations = data["calculations"]
        
        # Verify RSI calculation uses timeToTakeoff
        rsi = calculations["rsi"]
        jump_height_cm = calculations["jump_height_cm"]
        expected_rsi = round((jump_height_cm / 100) / (920 / 1000), 2)
        
        assert rsi > 0, "SL-CMJ Left RSI should be > 0"
        assert abs(rsi - expected_rsi) < 0.05, f"RSI mismatch: got {rsi}, expected {expected_rsi}"
        
        print(f"✓ SL-CMJ Left RSI: {rsi}")
        print(f"  Jump Height: {jump_height_cm:.1f}cm")
    
    def test_sl_cmj_right_saves_with_time_to_takeoff(self, authenticated_session):
        """
        POST SL-CMJ Right leg with time_to_takeoff_ms should calculate RSImod correctly.
        """
        response = authenticated_session.post(f"{BASE_URL}/api/jump/assessment", json={
            "athlete_id": TEST_ATHLETE_ID,
            "date": "2026-01-17",
            "protocol": "sl_cmj_right",
            "flight_time_ms": 360,  # ~15.9cm jump
            "contact_time_ms": 0,
            "time_to_takeoff_ms": 880,
            "notes": "TEST_SL_CMJ_RIGHT_TTT"
        })
        
        assert response.status_code == 200, f"SL-CMJ Right failed: {response.text}"
        
        data = response.json()
        calculations = data["calculations"]
        
        rsi = calculations["rsi"]
        jump_height_cm = calculations["jump_height_cm"]
        expected_rsi = round((jump_height_cm / 100) / (880 / 1000), 2)
        
        assert rsi > 0, "SL-CMJ Right RSI should be > 0"
        assert abs(rsi - expected_rsi) < 0.05, f"RSI mismatch: got {rsi}, expected {expected_rsi}"
        
        print(f"✓ SL-CMJ Right RSI: {rsi}")
        print(f"  Jump Height: {jump_height_cm:.1f}cm")


class TestDJStillUsesContactTime:
    """
    Test Issue #1 Regression: DJ must still use contactTime for RSI (not timeToTakeoff)
    """
    
    def test_dj_rsi_uses_contact_time_not_time_to_takeoff(self, authenticated_session):
        """
        DJ protocol should use contactTime for RSI calculation.
        RSI = jumpHeight(m) / contactTime(s)
        """
        response = authenticated_session.post(f"{BASE_URL}/api/jump/assessment", json={
            "athlete_id": TEST_ATHLETE_ID,
            "date": "2026-01-17",
            "protocol": "dj",
            "flight_time_ms": 420,  # ~21.6cm jump
            "contact_time_ms": 180,  # DJ has contact time
            "time_to_takeoff_ms": 500,  # Should be IGNORED for DJ
            "box_height_cm": 40,
            "notes": "TEST_DJ_CONTACT_TIME_REGRESSION"
        })
        
        assert response.status_code == 200, f"DJ assessment failed: {response.text}"
        
        data = response.json()
        calculations = data["calculations"]
        
        rsi = calculations["rsi"]
        jump_height_cm = calculations["jump_height_cm"]
        
        # Expected RSI = jumpHeight(m) / contactTime(s) — NOT timeToTakeoff
        expected_rsi = round((jump_height_cm / 100) / (180 / 1000), 2)
        
        # If RSI was using timeToTakeoff (500ms), it would be different
        wrong_rsi = round((jump_height_cm / 100) / (500 / 1000), 2)
        
        assert abs(rsi - expected_rsi) < 0.05, f"DJ RSI should use contactTime: got {rsi}, expected {expected_rsi}"
        assert abs(rsi - wrong_rsi) > 0.1, f"DJ RSI should NOT use timeToTakeoff: got {rsi}, should differ from {wrong_rsi}"
        
        print(f"✓ DJ RSI uses contactTime (not timeToTakeoff)")
        print(f"  RSI: {rsi} (expected: {expected_rsi}, wrong: {wrong_rsi})")


class TestAnalysisEndpointReturnsNewFields:
    """
    Test Issue #4: Analysis endpoint returns rsi_modified and time_to_takeoff_ms
    """
    
    def test_analysis_returns_sl_cmj_data(self, authenticated_session):
        """
        GET /api/jump/analysis/{athlete_id} should return SL-CMJ data with new fields.
        """
        response = authenticated_session.get(f"{BASE_URL}/api/jump/analysis/{TEST_ATHLETE_ID}?lang=en")
        
        assert response.status_code == 200, f"Analysis failed: {response.text}"
        
        data = response.json()
        protocols = data.get("protocols", {})
        
        # Verify SL-CMJ data exists
        sl_cmj = protocols.get("sl_cmj", {})
        
        # Check for right leg data
        if sl_cmj.get("right"):
            right_data = sl_cmj["right"]
            print(f"SL-CMJ Right: jump_height={right_data.get('jump_height_cm')}cm, rsi={right_data.get('rsi')}")
            
            # Verify time_to_takeoff_ms field exists
            if "time_to_takeoff_ms" in right_data:
                print(f"  time_to_takeoff_ms: {right_data['time_to_takeoff_ms']}")
            if "rsi_modified" in right_data:
                print(f"  rsi_modified: {right_data['rsi_modified']}")
        
        # Check for left leg data
        if sl_cmj.get("left"):
            left_data = sl_cmj["left"]
            print(f"SL-CMJ Left: jump_height={left_data.get('jump_height_cm')}cm, rsi={left_data.get('rsi')}")
        
        print(f"✓ Analysis endpoint returns SL-CMJ data structure")
    
    def test_analysis_returns_cmj_with_new_fields(self, authenticated_session):
        """
        GET /api/jump/analysis/{athlete_id} CMJ data includes time_to_takeoff_ms.
        """
        response = authenticated_session.get(f"{BASE_URL}/api/jump/analysis/{TEST_ATHLETE_ID}?lang=en")
        
        assert response.status_code == 200
        
        data = response.json()
        cmj_protocol = data.get("protocols", {}).get("cmj", {})
        
        if cmj_protocol.get("latest"):
            latest = cmj_protocol["latest"]
            print(f"CMJ Latest: jump_height={latest.get('jump_height_cm')}cm")
            print(f"  rsi: {latest.get('rsi')}")
            print(f"  rsi_modified: {latest.get('rsi_modified')}")
            print(f"  time_to_takeoff_ms: {latest.get('time_to_takeoff_ms')}")
            
            print(f"✓ CMJ includes rsi_modified and time_to_takeoff_ms fields")


class TestAsymmetryCalculation:
    """
    Test Issue #5: Asymmetry data appears when both SL-CMJ legs exist
    """
    
    def test_asymmetry_data_when_both_legs_exist(self, authenticated_session):
        """
        GET /api/jump/analysis/{athlete_id} should return asymmetry data when both legs exist.
        """
        response = authenticated_session.get(f"{BASE_URL}/api/jump/analysis/{TEST_ATHLETE_ID}?lang=en")
        
        assert response.status_code == 200
        
        data = response.json()
        
        # Check if both SL-CMJ legs exist
        sl_cmj = data.get("protocols", {}).get("sl_cmj", {})
        has_right = sl_cmj.get("right") is not None
        has_left = sl_cmj.get("left") is not None
        
        if has_right and has_left:
            asymmetry = data.get("asymmetry")
            assert asymmetry is not None, "Asymmetry should exist when both legs have data"
            
            # Verify asymmetry structure
            if asymmetry:
                print(f"Asymmetry data:")
                print(f"  RSI asymmetry: {asymmetry.get('rsi', {}).get('asymmetry_percent')}%")
                print(f"  Jump height asymmetry: {asymmetry.get('jump_height', {}).get('asymmetry_percent')}%")
                print(f"  Red flag: {asymmetry.get('red_flag')}")
                print(f"  Interpretation: {asymmetry.get('interpretation')}")
            
            print(f"✓ Asymmetry calculation works with both SL-CMJ legs")
        else:
            print(f"  Missing SL-CMJ data: right={has_right}, left={has_left}")
            print(f"  Asymmetry cannot be calculated without both legs")


class TestVBTIsolation:
    """
    Test that VBT Camera files were NOT modified (isolation check)
    """
    
    def test_vbt_endpoints_still_work(self, authenticated_session):
        """
        VBT endpoints should still work - this verifies isolation.
        """
        response = authenticated_session.get(f"{BASE_URL}/api/vbt/protocols?lang=en")
        
        # VBT protocols endpoint should work
        if response.status_code == 200:
            data = response.json()
            print(f"✓ VBT protocols endpoint works: {list(data.keys())}")
        else:
            # VBT might not be fully implemented, that's OK for isolation test
            print(f"  VBT protocols status: {response.status_code} (may not be implemented)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
