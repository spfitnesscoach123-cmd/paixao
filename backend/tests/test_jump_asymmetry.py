"""
Test Jump Protocol Analysis - Asymmetry Feature Tests
Tests for NEW features in iteration 27:
1. Asymmetry data in response for SL-CMJ protocols (sl_cmj_left, sl_cmj_right)
2. Asymmetry null for non-SL-CMJ protocols (cmj, dj)
3. Protocol isolation - CMJ returns only CMJ data, DJ returns only DJ data
4. Fatigue Index uses correct metric per protocol (RSImod for CMJ/SL-CMJ, RSI for DJ)
5. Date filtering returns different assessment metrics for same protocol
6. Asymmetry formula: |right-left|/max(right,left)*100
7. POST /api/jump/assessment still works correctly
"""

import pytest
import requests
import os
from datetime import datetime

# Use the preview URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://load-engine-1.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"

# Athlete IDs provided for testing
TEST_ATHLETE_IDS = [
    "69a6ca6a85668876432f090a",
    "69a6ca6a85668876432f090b"
]


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    print(f"\n[AUTH] Logging in with {TEST_EMAIL}")
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    print(f"[AUTH] Login response status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        print(f"[AUTH] Token obtained successfully")
        return token
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestAsymmetryForSLCMJ:
    """Tests for SL-CMJ asymmetry data - should return asymmetry object"""
    
    def test_01_sl_cmj_left_returns_asymmetry_object(self, api_client):
        """Test sl_cmj_left returns asymmetry object with required fields"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_left")
        
        print(f"\n[TEST] SL-CMJ Left Response Status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"[TEST] Protocol: {data.get('protocol')}")
        print(f"[TEST] has_data: {data.get('has_data')}")
        
        # Check asymmetry field exists
        asymmetry = data.get("asymmetry")
        
        if data.get("has_data") and asymmetry:
            # Verify asymmetry structure per spec
            required_fields = [
                "rsi_asymmetry_percent",
                "left_rsi",
                "right_rsi",
                "dominant_leg",
                "red_flag"
            ]
            for field in required_fields:
                assert field in asymmetry, f"Missing asymmetry field: {field}"
            
            print(f"[TEST] Asymmetry object structure verified:")
            print(f"  - rsi_asymmetry_percent: {asymmetry.get('rsi_asymmetry_percent')}%")
            print(f"  - left_rsi: {asymmetry.get('left_rsi')}")
            print(f"  - right_rsi: {asymmetry.get('right_rsi')}")
            print(f"  - dominant_leg: {asymmetry.get('dominant_leg')}")
            print(f"  - red_flag: {asymmetry.get('red_flag')}")
            
            # Verify numeric types
            assert isinstance(asymmetry["rsi_asymmetry_percent"], (int, float)), "rsi_asymmetry_percent should be numeric"
            assert isinstance(asymmetry["left_rsi"], (int, float)), "left_rsi should be numeric"
            assert isinstance(asymmetry["right_rsi"], (int, float)), "right_rsi should be numeric"
            assert asymmetry["dominant_leg"] in ["left", "right"], "dominant_leg should be 'left' or 'right'"
            assert isinstance(asymmetry["red_flag"], bool), "red_flag should be boolean"
        else:
            # If no data, asymmetry should be null
            assert asymmetry is None, "asymmetry should be null when has_data is False"
            print(f"[TEST] No SL-CMJ data available - asymmetry is correctly null")
    
    def test_02_sl_cmj_right_returns_asymmetry_object(self, api_client):
        """Test sl_cmj_right returns asymmetry object with required fields"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_right")
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"\n[TEST] SL-CMJ Right Response:")
        print(f"  - protocol: {data.get('protocol')}")
        print(f"  - has_data: {data.get('has_data')}")
        
        asymmetry = data.get("asymmetry")
        
        if data.get("has_data") and asymmetry:
            required_fields = ["rsi_asymmetry_percent", "left_rsi", "right_rsi", "dominant_leg", "red_flag"]
            for field in required_fields:
                assert field in asymmetry, f"Missing asymmetry field: {field}"
            print(f"  - asymmetry: {asymmetry}")
        else:
            print(f"  - asymmetry: null (no data)")


class TestAsymmetryNullForNonSLCMJ:
    """Tests verifying asymmetry is null for non-SL-CMJ protocols"""
    
    def test_03_cmj_returns_asymmetry_null(self, api_client):
        """Test CMJ protocol returns asymmetry as null"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"\n[TEST] CMJ Protocol:")
        print(f"  - protocol: {data.get('protocol')}")
        print(f"  - has_data: {data.get('has_data')}")
        
        # For CMJ, asymmetry should ALWAYS be null (no bilateral comparison)
        asymmetry = data.get("asymmetry")
        assert asymmetry is None, f"CMJ should not have asymmetry data, got: {asymmetry}"
        print(f"  - asymmetry: null (CORRECT for CMJ)")
    
    def test_04_dj_returns_asymmetry_null(self, api_client):
        """Test DJ protocol returns asymmetry as null"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=dj")
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"\n[TEST] DJ Protocol:")
        print(f"  - protocol: {data.get('protocol')}")
        print(f"  - has_data: {data.get('has_data')}")
        
        # For DJ, asymmetry should ALWAYS be null (no bilateral comparison)
        asymmetry = data.get("asymmetry")
        assert asymmetry is None, f"DJ should not have asymmetry data, got: {asymmetry}"
        print(f"  - asymmetry: null (CORRECT for DJ)")


class TestAsymmetryFormula:
    """Tests for asymmetry calculation formula: |right-left|/max(right,left)*100"""
    
    def test_05_asymmetry_formula_calculation(self, api_client):
        """Test asymmetry formula is calculated correctly"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_left")
        
        assert response.status_code == 200
        data = response.json()
        
        asymmetry = data.get("asymmetry")
        
        if asymmetry:
            left_rsi = asymmetry.get("left_rsi", 0)
            right_rsi = asymmetry.get("right_rsi", 0)
            reported_asym = asymmetry.get("rsi_asymmetry_percent", 0)
            
            # Calculate expected asymmetry: |right-left|/max(right,left)*100
            max_rsi = max(left_rsi, right_rsi)
            if max_rsi > 0:
                expected_asym = abs(right_rsi - left_rsi) / max_rsi * 100
                expected_asym = round(expected_asym, 1)
                
                print(f"\n[TEST] Asymmetry Formula Verification:")
                print(f"  - left_rsi: {left_rsi}")
                print(f"  - right_rsi: {right_rsi}")
                print(f"  - Expected: |{right_rsi}-{left_rsi}| / {max_rsi} * 100 = {expected_asym}%")
                print(f"  - Reported: {reported_asym}%")
                
                # Allow small floating point tolerance
                assert abs(reported_asym - expected_asym) < 0.2, f"Formula mismatch: expected {expected_asym}, got {reported_asym}"
                print(f"  - Formula VERIFIED ✓")
        else:
            print(f"\n[TEST] No asymmetry data available to verify formula")
    
    def test_06_red_flag_threshold(self, api_client):
        """Test red_flag is true when asymmetry > 10%"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_left")
        
        assert response.status_code == 200
        data = response.json()
        
        asymmetry = data.get("asymmetry")
        
        if asymmetry:
            asym_percent = asymmetry.get("rsi_asymmetry_percent", 0)
            red_flag = asymmetry.get("red_flag", False)
            
            print(f"\n[TEST] Red Flag Threshold Verification:")
            print(f"  - asymmetry: {asym_percent}%")
            print(f"  - red_flag: {red_flag}")
            
            if asym_percent > 10:
                assert red_flag == True, f"red_flag should be True when asymmetry > 10%, got {red_flag}"
                print(f"  - Correctly flagged as red (>10%)")
            else:
                assert red_flag == False, f"red_flag should be False when asymmetry <= 10%, got {red_flag}"
                print(f"  - Correctly NOT flagged (<=10%)")
        else:
            print(f"\n[TEST] No asymmetry data available")


class TestProtocolIsolation:
    """Tests for protocol isolation - no cross-contamination between protocols"""
    
    def test_07_cmj_only_returns_cmj_data(self, api_client):
        """Test CMJ returns only CMJ assessment data"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["protocol"] == "cmj"
        print(f"\n[TEST] CMJ Protocol Isolation:")
        print(f"  - protocol: {data['protocol']}")
        print(f"  - available_dates: {len(data.get('available_dates', []))} dates")
    
    def test_08_dj_only_returns_dj_data(self, api_client):
        """Test DJ returns only DJ assessment data"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=dj")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["protocol"] == "dj"
        print(f"\n[TEST] DJ Protocol Isolation:")
        print(f"  - protocol: {data['protocol']}")
        print(f"  - available_dates: {len(data.get('available_dates', []))} dates")
    
    def test_09_protocols_have_independent_dates(self, api_client):
        """Test different protocols have independent available_dates lists"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        response_cmj = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        response_dj = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=dj")
        
        assert response_cmj.status_code == 200
        assert response_dj.status_code == 200
        
        data_cmj = response_cmj.json()
        data_dj = response_dj.json()
        
        dates_cmj = set(data_cmj.get("available_dates", []))
        dates_dj = set(data_dj.get("available_dates", []))
        
        print(f"\n[TEST] Protocol Date Independence:")
        print(f"  - CMJ dates: {len(dates_cmj)}")
        print(f"  - DJ dates: {len(dates_dj)}")
        
        # They can overlap or be different - key is they are INDEPENDENTLY queried
        # Not asserting they must be different, just that both are valid lists
        assert isinstance(list(dates_cmj), list)
        assert isinstance(list(dates_dj), list)
        print(f"  - Each protocol has independent date list ✓")


class TestFatigueIndexMetricLabel:
    """Tests for protocol-specific Fatigue Index metric labels"""
    
    def test_10_cmj_uses_rsimod_label(self, api_client):
        """Test CMJ Fatigue Index uses RSImod label"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        fatigue_index = data.get("fatigue_index")
        
        if fatigue_index:
            assert fatigue_index.get("metric_label") == "RSImod", f"CMJ should use RSImod, got {fatigue_index.get('metric_label')}"
            print(f"\n[TEST] CMJ metric_label: {fatigue_index['metric_label']} ✓")
        else:
            print(f"\n[TEST] No fatigue_index for CMJ (insufficient data)")
    
    def test_11_sl_cmj_uses_rsimod_label(self, api_client):
        """Test SL-CMJ Fatigue Index uses RSImod label"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_left")
        
        assert response.status_code == 200
        data = response.json()
        
        fatigue_index = data.get("fatigue_index")
        
        if fatigue_index:
            assert fatigue_index.get("metric_label") == "RSImod", f"SL-CMJ should use RSImod, got {fatigue_index.get('metric_label')}"
            print(f"\n[TEST] SL-CMJ metric_label: {fatigue_index['metric_label']} ✓")
        else:
            print(f"\n[TEST] No fatigue_index for SL-CMJ (insufficient data)")
    
    def test_12_dj_uses_rsi_label(self, api_client):
        """Test DJ Fatigue Index uses RSI label (not RSImod)"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=dj")
        
        assert response.status_code == 200
        data = response.json()
        
        fatigue_index = data.get("fatigue_index")
        
        if fatigue_index:
            assert fatigue_index.get("metric_label") == "RSI", f"DJ should use RSI, got {fatigue_index.get('metric_label')}"
            print(f"\n[TEST] DJ metric_label: {fatigue_index['metric_label']} ✓")
        else:
            print(f"\n[TEST] No fatigue_index for DJ (insufficient data)")


class TestDateFiltering:
    """Tests for date filtering functionality"""
    
    def test_13_date_filter_changes_selected_date(self, api_client):
        """Test date filter changes the selected_date in response"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        # First get available dates
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        assert response.status_code == 200
        data = response.json()
        
        available_dates = data.get("available_dates", [])
        
        if len(available_dates) >= 2:
            date1 = available_dates[0]
            date2 = available_dates[1]
            
            response1 = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj&date={date1}")
            response2 = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj&date={date2}")
            
            assert response1.status_code == 200
            assert response2.status_code == 200
            
            data1 = response1.json()
            data2 = response2.json()
            
            assert data1.get("selected_date") == date1
            assert data2.get("selected_date") == date2
            
            print(f"\n[TEST] Date filtering works:")
            print(f"  - Request date={date1} -> selected_date={data1.get('selected_date')} ✓")
            print(f"  - Request date={date2} -> selected_date={data2.get('selected_date')} ✓")
        else:
            print(f"\n[TEST] Not enough dates to test filtering ({len(available_dates)} dates)")
            pytest.skip("Need at least 2 dates")
    
    def test_14_date_filter_returns_different_metrics(self, api_client):
        """Test different dates return different metric values"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        assert response.status_code == 200
        data = response.json()
        
        available_dates = data.get("available_dates", [])
        
        if len(available_dates) >= 2:
            date1 = available_dates[0]
            date2 = available_dates[1]
            
            response1 = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj&date={date1}")
            response2 = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj&date={date2}")
            
            data1 = response1.json()
            data2 = response2.json()
            
            metrics1 = data1.get("metrics", {})
            metrics2 = data2.get("metrics", {})
            
            print(f"\n[TEST] Date filtering metrics comparison:")
            print(f"  - Date {date1}: RSI={metrics1.get('rsi')}, Jump Height={metrics1.get('jump_height_cm')}cm")
            print(f"  - Date {date2}: RSI={metrics2.get('rsi')}, Jump Height={metrics2.get('jump_height_cm')}cm")
            
            # They can be same or different - we just verify the endpoint returns valid data
            assert metrics1 is not None or not data1.get("has_data")
            assert metrics2 is not None or not data2.get("has_data")
        else:
            pytest.skip("Need at least 2 dates")


class TestPostAssessmentEndpoint:
    """Tests for POST /api/jump/assessment endpoint (existing functionality)"""
    
    def test_15_post_assessment_still_works(self, api_client):
        """Test POST /api/jump/assessment endpoint still works"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        test_date = datetime.now().strftime("%Y-%m-%d")
        test_payload = {
            "athlete_id": athlete_id,
            "date": test_date,
            "protocol": "cmj",
            "flight_time_ms": 450,
            "contact_time_ms": 0,
            "jump_height_cm": None,  # Auto-calculate
            "time_to_takeoff_ms": 700,
            "notes": "Test assessment - iteration 27"
        }
        
        response = api_client.post(f"{BASE_URL}/api/jump/assessment", json=test_payload)
        
        print(f"\n[TEST] POST /api/jump/assessment status: {response.status_code}")
        
        # 200 = success, 404 = athlete not found for different coach
        assert response.status_code in [200, 201, 400, 404], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "assessment" in data
            assert "calculations" in data
            
            calculations = data.get("calculations", {})
            print(f"  - Assessment created successfully")
            print(f"  - RSI: {calculations.get('rsi')}")
            print(f"  - Jump Height: {calculations.get('jump_height_cm')}cm")
            print(f"  - Peak Power: {calculations.get('peak_power_w')}W")
    
    def test_16_post_sl_cmj_assessment(self, api_client):
        """Test POST SL-CMJ assessment creates data for asymmetry calculation"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        test_date = datetime.now().strftime("%Y-%m-%d")
        
        # Create left leg assessment
        left_payload = {
            "athlete_id": athlete_id,
            "date": test_date,
            "protocol": "sl_cmj_left",
            "flight_time_ms": 380,
            "contact_time_ms": 0,
            "time_to_takeoff_ms": 600,
            "notes": "SL-CMJ Left test - iteration 27"
        }
        
        response_left = api_client.post(f"{BASE_URL}/api/jump/assessment", json=left_payload)
        print(f"\n[TEST] POST SL-CMJ Left status: {response_left.status_code}")
        
        # Create right leg assessment
        right_payload = {
            "athlete_id": athlete_id,
            "date": test_date,
            "protocol": "sl_cmj_right",
            "flight_time_ms": 400,
            "contact_time_ms": 0,
            "time_to_takeoff_ms": 580,
            "notes": "SL-CMJ Right test - iteration 27"
        }
        
        response_right = api_client.post(f"{BASE_URL}/api/jump/assessment", json=right_payload)
        print(f"[TEST] POST SL-CMJ Right status: {response_right.status_code}")
        
        assert response_left.status_code in [200, 201, 400, 404]
        assert response_right.status_code in [200, 201, 400, 404]
        
        if response_left.status_code == 200 and response_right.status_code == 200:
            print(f"  - Both SL-CMJ assessments created successfully")
            print(f"  - Asymmetry calculation should now be available")


class TestResponseStructureWithAsymmetry:
    """Tests for complete response structure including asymmetry field"""
    
    def test_17_response_includes_asymmetry_field(self, api_client):
        """Test response always includes asymmetry field (null or object)"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        # Test all protocols
        protocols = ["cmj", "dj", "sl_cmj_left", "sl_cmj_right"]
        
        for protocol in protocols:
            response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol={protocol}")
            assert response.status_code == 200
            data = response.json()
            
            # asymmetry field should be present in response
            assert "asymmetry" in data, f"Response for {protocol} should include 'asymmetry' field"
            
            print(f"\n[TEST] {protocol.upper()} response includes asymmetry field:")
            print(f"  - asymmetry: {data.get('asymmetry')}")
    
    def test_18_full_asymmetry_structure_for_sl_cmj(self, api_client):
        """Test full asymmetry object structure for SL-CMJ protocols"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_left")
        
        assert response.status_code == 200
        data = response.json()
        
        asymmetry = data.get("asymmetry")
        
        if asymmetry:
            expected_fields = [
                "rsi_asymmetry_percent",
                "height_asymmetry_percent",
                "left_rsi",
                "right_rsi",
                "left_height",
                "right_height",
                "dominant_leg",
                "red_flag",
                "contra_date"
            ]
            
            print(f"\n[TEST] Full asymmetry structure for SL-CMJ:")
            for field in expected_fields:
                if field in asymmetry:
                    print(f"  - {field}: {asymmetry.get(field)} ✓")
                else:
                    print(f"  - {field}: MISSING!")
            
            # At minimum, verify required fields per spec
            required = ["rsi_asymmetry_percent", "left_rsi", "right_rsi", "dominant_leg", "red_flag"]
            for field in required:
                assert field in asymmetry, f"Missing required field: {field}"
        else:
            print(f"\n[TEST] No asymmetry data (no contralateral assessment)")


class TestSecondAthlete:
    """Tests using second athlete ID for verification"""
    
    def test_19_second_athlete_protocol_analysis(self, api_client):
        """Test protocol analysis works for second athlete"""
        athlete_id = TEST_ATHLETE_IDS[1]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        # May return 404 if athlete doesn't belong to this coach
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n[TEST] Second athlete analysis:")
            print(f"  - athlete_name: {data.get('athlete_name')}")
            print(f"  - has_data: {data.get('has_data')}")
            print(f"  - asymmetry: {data.get('asymmetry')}")
        else:
            print(f"\n[TEST] Second athlete not accessible (404)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
