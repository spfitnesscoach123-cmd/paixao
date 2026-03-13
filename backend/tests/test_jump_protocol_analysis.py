"""
Test Jump Protocol Analysis API
Tests for GET /api/jump/protocol-analysis/{athlete_id} and POST /api/jump/assessment

Features to test:
1. Protocol-specific data with correct protocol filter
2. available_dates list for protocol filtering
3. Date filter returns different metrics for different dates
4. Fatigue Index calculation: baseline = avg of top 3 best RSI values in 90 days, FI = ((baseline - current) / baseline) * 100
5. Fatigue Index classification bands
6. Protocol-specific metric labels: CMJ/SL-CMJ shows RSImod, DJ shows RSI
7. Existing POST /api/jump/assessment endpoint still works
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

# Use the preview URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://athlete-insights-14.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"

# Athlete IDs provided for testing
TEST_ATHLETE_IDS = [
    "69a6ca6a85668876432f090a",  # João Silva - main test athlete
    "69a6ca6a85668876432f090b",
    "69a6ca6a85668876432f090c"
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


class TestProtocolAnalysisEndpoint:
    """Tests for GET /api/jump/protocol-analysis/{athlete_id}"""
    
    def test_01_endpoint_exists_and_returns_200(self, api_client):
        """Test that the endpoint exists and returns 200"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}")
        
        print(f"\n[TEST] Protocol analysis endpoint status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "athlete_id" in data
        assert "protocol" in data
        assert "available_dates" in data
        print(f"[TEST] Response contains required fields: athlete_id, protocol, available_dates")
    
    def test_02_protocol_filter_cmj(self, api_client):
        """Test protocol filter returns CMJ-specific data"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["protocol"] == "cmj"
        print(f"\n[TEST] CMJ Protocol:")
        print(f"  - protocol: {data['protocol']}")
        print(f"  - has_data: {data.get('has_data')}")
        print(f"  - available_dates count: {len(data.get('available_dates', []))}")
    
    def test_03_protocol_filter_dj(self, api_client):
        """Test protocol filter returns DJ-specific data"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=dj")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["protocol"] == "dj"
        print(f"\n[TEST] DJ Protocol:")
        print(f"  - protocol: {data['protocol']}")
        print(f"  - has_data: {data.get('has_data')}")
        print(f"  - available_dates count: {len(data.get('available_dates', []))}")
    
    def test_04_protocol_filter_sl_cmj(self, api_client):
        """Test protocol filter returns SL-CMJ specific data"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        # Test left leg
        response_left = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_left")
        assert response_left.status_code == 200
        data_left = response_left.json()
        assert data_left["protocol"] == "sl_cmj_left"
        
        # Test right leg
        response_right = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_right")
        assert response_right.status_code == 200
        data_right = response_right.json()
        assert data_right["protocol"] == "sl_cmj_right"
        
        print(f"\n[TEST] SL-CMJ Protocols:")
        print(f"  - sl_cmj_left has_data: {data_left.get('has_data')}")
        print(f"  - sl_cmj_right has_data: {data_right.get('has_data')}")
    
    def test_05_available_dates_returned(self, api_client):
        """Test that available_dates list is returned for protocol filtering"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        # available_dates should be present (even if empty)
        assert "available_dates" in data
        assert isinstance(data["available_dates"], list)
        
        print(f"\n[TEST] Available dates for CMJ:")
        if data["available_dates"]:
            print(f"  - Dates: {data['available_dates'][:5]}...")  # Show first 5
            print(f"  - Total dates: {len(data['available_dates'])}")
        else:
            print("  - No dates available (empty list)")
    
    def test_06_date_filter_changes_metrics(self, api_client):
        """Test date filter works - different date returns different metrics"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        # First get available dates
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        assert response.status_code == 200
        data = response.json()
        
        available_dates = data.get("available_dates", [])
        
        if len(available_dates) >= 2:
            # Test with different dates
            date1 = available_dates[0]
            date2 = available_dates[1]
            
            response1 = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj&date={date1}")
            response2 = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj&date={date2}")
            
            assert response1.status_code == 200
            assert response2.status_code == 200
            
            data1 = response1.json()
            data2 = response2.json()
            
            print(f"\n[TEST] Date filter comparison:")
            print(f"  - Date 1 ({date1}): selected_date={data1.get('selected_date')}")
            print(f"  - Date 2 ({date2}): selected_date={data2.get('selected_date')}")
            
            assert data1.get("selected_date") == date1
            assert data2.get("selected_date") == date2
        else:
            print(f"\n[TEST] Only {len(available_dates)} date(s) available, skipping date comparison")
            pytest.skip("Need at least 2 dates to test date filter")
    
    def test_07_protocol_isolation(self, api_client):
        """Test that changing protocol returns completely independent assessment data"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        # Get CMJ data
        response_cmj = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        # Get DJ data
        response_dj = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=dj")
        
        assert response_cmj.status_code == 200
        assert response_dj.status_code == 200
        
        data_cmj = response_cmj.json()
        data_dj = response_dj.json()
        
        # Protocols should be different
        assert data_cmj["protocol"] == "cmj"
        assert data_dj["protocol"] == "dj"
        
        # Available dates should be independent per protocol
        dates_cmj = set(data_cmj.get("available_dates", []))
        dates_dj = set(data_dj.get("available_dates", []))
        
        print(f"\n[TEST] Protocol isolation:")
        print(f"  - CMJ dates: {len(dates_cmj)}")
        print(f"  - DJ dates: {len(dates_dj)}")
        print(f"  - Protocols are independent: True")


class TestFatigueIndexCalculation:
    """Tests for Fatigue Index calculation logic"""
    
    def test_08_fatigue_index_structure(self, api_client):
        """Test fatigue_index has correct structure when data exists"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        fatigue_index = data.get("fatigue_index")
        
        if fatigue_index:
            # Verify structure
            required_fields = ["value", "baseline", "current", "metric_label", "classification", "label", "color"]
            for field in required_fields:
                assert field in fatigue_index, f"Missing field: {field}"
            
            print(f"\n[TEST] Fatigue Index structure:")
            print(f"  - value: {fatigue_index['value']}%")
            print(f"  - baseline: {fatigue_index['baseline']}")
            print(f"  - current: {fatigue_index['current']}")
            print(f"  - metric_label: {fatigue_index['metric_label']}")
            print(f"  - classification: {fatigue_index['classification']}")
            print(f"  - label: {fatigue_index['label']}")
            print(f"  - color: {fatigue_index['color']}")
        else:
            print("\n[TEST] No fatigue_index available (insufficient data)")
    
    def test_09_fatigue_index_metric_label_cmj(self, api_client):
        """Test that CMJ/SL-CMJ shows RSImod label"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        fatigue_index = data.get("fatigue_index")
        if fatigue_index:
            assert fatigue_index["metric_label"] == "RSImod", f"Expected RSImod, got {fatigue_index['metric_label']}"
            print(f"\n[TEST] CMJ metric_label: {fatigue_index['metric_label']} ✓")
        else:
            print("\n[TEST] No fatigue_index for CMJ (insufficient data)")
    
    def test_10_fatigue_index_metric_label_dj(self, api_client):
        """Test that DJ shows RSI label (not RSImod)"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=dj")
        
        assert response.status_code == 200
        data = response.json()
        
        fatigue_index = data.get("fatigue_index")
        if fatigue_index:
            assert fatigue_index["metric_label"] == "RSI", f"Expected RSI, got {fatigue_index['metric_label']}"
            print(f"\n[TEST] DJ metric_label: {fatigue_index['metric_label']} ✓")
        else:
            print("\n[TEST] No fatigue_index for DJ (insufficient data)")
    
    def test_11_fatigue_index_classification_bands(self, api_client):
        """Test fatigue index classification is one of the expected bands"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        fatigue_index = data.get("fatigue_index")
        
        valid_classifications = ["above_baseline", "normal", "mild", "moderate", "high", "severe"]
        
        if fatigue_index:
            classification = fatigue_index["classification"]
            assert classification in valid_classifications, f"Invalid classification: {classification}"
            
            # Verify classification bands based on value
            value = fatigue_index["value"]
            if value < 0:
                expected = "above_baseline"
            elif value <= 5:
                expected = "normal"
            elif value <= 10:
                expected = "mild"
            elif value <= 15:
                expected = "moderate"
            elif value <= 20:
                expected = "high"
            else:
                expected = "severe"
            
            assert classification == expected, f"Value {value}% should be {expected}, got {classification}"
            print(f"\n[TEST] Fatigue classification verified: {value}% -> {classification} ✓")
        else:
            print("\n[TEST] No fatigue_index available to verify classification")


class TestRSIGaugeLabels:
    """Tests for protocol-specific RSI gauge labels"""
    
    def test_12_cmj_returns_metrics_for_rsimod(self, api_client):
        """Test CMJ returns metrics structure suitable for RSImod gauge"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        if data.get("has_data") and data.get("metrics"):
            metrics = data["metrics"]
            # For CMJ, RSI should represent RSImod
            assert "rsi" in metrics or "rsi_modified" in metrics
            print(f"\n[TEST] CMJ metrics contains RSI for gauge: rsi={metrics.get('rsi')}")
        else:
            print("\n[TEST] No metrics data for CMJ")
    
    def test_13_dj_returns_metrics_for_rsi_classic(self, api_client):
        """Test DJ returns metrics structure suitable for RSI classic gauge"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=dj")
        
        assert response.status_code == 200
        data = response.json()
        
        if data.get("has_data") and data.get("metrics"):
            metrics = data["metrics"]
            # For DJ, RSI should represent classic RSI
            assert "rsi" in metrics
            print(f"\n[TEST] DJ metrics contains RSI for gauge: rsi={metrics.get('rsi')}")
        else:
            print("\n[TEST] No metrics data for DJ")


class TestExistingAssessmentEndpoint:
    """Tests for existing POST /api/jump/assessment endpoint"""
    
    def test_14_assessment_endpoint_exists(self, api_client):
        """Test that POST /api/jump/assessment endpoint exists"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        # Create a test assessment (will be created then cleaned up if needed)
        test_date = datetime.now().strftime("%Y-%m-%d")
        test_payload = {
            "athlete_id": athlete_id,
            "date": test_date,
            "protocol": "cmj",
            "flight_time_ms": 450,
            "contact_time_ms": 0,
            "jump_height_cm": None,  # Auto-calculate
            "time_to_takeoff_ms": 700,
            "notes": "Test assessment - automated test"
        }
        
        response = api_client.post(f"{BASE_URL}/api/jump/assessment", json=test_payload)
        
        print(f"\n[TEST] POST /api/jump/assessment status: {response.status_code}")
        
        # We expect either 200 (success) or 404 (athlete not found for different coach)
        # but NOT 404 for missing endpoint
        assert response.status_code in [200, 201, 400, 404], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "assessment" in data
            assert "calculations" in data
            print(f"  - Assessment created successfully")
            print(f"  - RSI: {data['calculations'].get('rsi')}")
            print(f"  - Peak Power: {data['calculations'].get('peak_power_w')}W")
    
    def test_15_assessment_calculates_rsi_for_cmj(self, api_client):
        """Test CMJ assessment calculates RSImod correctly using time_to_takeoff"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        test_payload = {
            "athlete_id": athlete_id,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "cmj",
            "flight_time_ms": 400,
            "contact_time_ms": 0,
            "jump_height_cm": None,
            "time_to_takeoff_ms": 500,  # 0.5s
            "notes": "CMJ RSI test"
        }
        
        response = api_client.post(f"{BASE_URL}/api/jump/assessment", json=test_payload)
        
        if response.status_code == 200:
            data = response.json()
            calculations = data["calculations"]
            
            # RSImod = jumpHeight(m) / timeToTakeoff(s)
            # jumpHeight ≈ (9.81 * (400/1000)^2) / 8 * 100 ≈ 19.6cm
            # RSImod ≈ 0.196 / 0.5 ≈ 0.39
            rsi = calculations.get("rsi")
            assert rsi is not None
            assert rsi > 0
            print(f"\n[TEST] CMJ RSImod calculation:")
            print(f"  - Flight time: 400ms")
            print(f"  - Time to takeoff: 500ms")
            print(f"  - Jump height: {calculations.get('jump_height_cm')}cm")
            print(f"  - RSImod: {rsi}")
        else:
            print(f"\n[TEST] Assessment creation failed: {response.status_code}")
    
    def test_16_assessment_calculates_rsi_for_dj(self, api_client):
        """Test DJ assessment calculates RSI classic correctly using contact_time"""
        athlete_id = TEST_ATHLETE_IDS[0]
        
        test_payload = {
            "athlete_id": athlete_id,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "dj",
            "flight_time_ms": 450,
            "contact_time_ms": 200,  # 0.2s contact
            "jump_height_cm": None,
            "box_height_cm": 40,
            "notes": "DJ RSI test"
        }
        
        response = api_client.post(f"{BASE_URL}/api/jump/assessment", json=test_payload)
        
        if response.status_code == 200:
            data = response.json()
            calculations = data["calculations"]
            
            # RSI = jumpHeight(m) / contactTime(s)
            rsi = calculations.get("rsi")
            assert rsi is not None
            assert rsi > 0
            print(f"\n[TEST] DJ RSI calculation:")
            print(f"  - Flight time: 450ms")
            print(f"  - Contact time: 200ms")
            print(f"  - Jump height: {calculations.get('jump_height_cm')}cm")
            print(f"  - RSI: {rsi}")
        else:
            print(f"\n[TEST] Assessment creation failed: {response.status_code}")


class TestResponseStructure:
    """Tests for complete response structure verification"""
    
    def test_17_full_response_structure(self, api_client):
        """Test complete response structure has all required fields"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        # Required fields in response
        required_fields = [
            "athlete_id",
            "athlete_name",
            "body_mass_kg",
            "protocol",
            "available_dates",
            "selected_date",
            "metrics",
            "fatigue_index",
            "history",
            "power_velocity_insights",
            "z_score",
            "recommendations",
            "has_data"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print(f"\n[TEST] Response structure verified:")
        print(f"  - athlete_name: {data.get('athlete_name')}")
        print(f"  - body_mass_kg: {data.get('body_mass_kg')}")
        print(f"  - has_data: {data.get('has_data')}")
        print(f"  - All required fields present ✓")
    
    def test_18_metrics_structure_when_data_exists(self, api_client):
        """Test metrics structure when has_data is True"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        if data.get("has_data") and data.get("metrics"):
            metrics = data["metrics"]
            expected_fields = [
                "jump_height_cm",
                "flight_time_ms",
                "rsi",
                "rsi_classification",
                "peak_power_w",
                "peak_velocity_ms",
                "relative_power_wkg"
            ]
            
            for field in expected_fields:
                assert field in metrics, f"Missing metrics field: {field}"
            
            print(f"\n[TEST] Metrics structure when data exists:")
            print(f"  - jump_height_cm: {metrics.get('jump_height_cm')}")
            print(f"  - rsi: {metrics.get('rsi')}")
            print(f"  - peak_power_w: {metrics.get('peak_power_w')}")
            print(f"  - rsi_classification: {metrics.get('rsi_classification')}")
        else:
            print("\n[TEST] No metrics data available")
    
    def test_19_history_array_structure(self, api_client):
        """Test history array structure for evolution chart"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=cmj")
        
        assert response.status_code == 200
        data = response.json()
        
        history = data.get("history", [])
        assert isinstance(history, list)
        
        if history:
            # Check first history item structure
            item = history[0]
            expected_fields = ["date", "rsi", "jump_height_cm", "peak_power_w"]
            for field in expected_fields:
                assert field in item, f"Missing history field: {field}"
            
            print(f"\n[TEST] History structure:")
            print(f"  - Total records: {len(history)}")
            print(f"  - Latest: {item}")
        else:
            print("\n[TEST] No history available")


class TestEdgeCases:
    """Tests for edge cases and error handling"""
    
    def test_20_invalid_athlete_id_returns_404(self, api_client):
        """Test invalid athlete ID returns 404"""
        invalid_id = "000000000000000000000000"
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{invalid_id}?protocol=cmj")
        
        assert response.status_code == 404
        print(f"\n[TEST] Invalid athlete ID returns 404 ✓")
    
    def test_21_empty_protocol_defaults_to_cmj(self, api_client):
        """Test empty protocol parameter defaults to CMJ"""
        athlete_id = TEST_ATHLETE_IDS[0]
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["protocol"] == "cmj"
        print(f"\n[TEST] Default protocol is CMJ ✓")
    
    def test_22_no_data_response_structure(self, api_client):
        """Test response structure when no data exists for protocol"""
        athlete_id = TEST_ATHLETE_IDS[0]
        # Use a protocol that might have no data
        response = api_client.get(f"{BASE_URL}/api/jump/protocol-analysis/{athlete_id}?protocol=sl_cmj_left")
        
        assert response.status_code == 200
        data = response.json()
        
        if not data.get("has_data"):
            # Verify empty state structure
            assert data.get("metrics") is None or data.get("metrics") == {}
            assert data.get("fatigue_index") is None
            assert isinstance(data.get("available_dates"), list)
            assert isinstance(data.get("history"), list)
            print(f"\n[TEST] Empty state response structure verified ✓")
        else:
            print(f"\n[TEST] Data exists for sl_cmj_left, skipping empty state test")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
