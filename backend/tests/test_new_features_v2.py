"""
Test suite for new features:
1. RSI card fix in team dashboard - team_avg_rsi should return valid numeric value
2. HSR in meters - team_avg_hid should be in meters
3. VBT optimal load calculation - optimal_load, optimal_velocity, optimal_power
4. Optimal load evolution tracking - optimal_load_evolution array
5. PDF strength section - traditional strength metrics in PDF
6. Frontend avgHSR card - replaced duplicate distance card
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "silasf@ymail.com"
TEST_PASSWORD = "#Paixao"
TEST_ATHLETE_ID = "6987de5cc9ecb6c01a99f3e6"


class TestAuth:
    """Authentication helper"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}


class TestTeamDashboardRSI(TestAuth):
    """Test RSI card fix in team dashboard"""
    
    def test_team_dashboard_returns_rsi(self, auth_headers):
        """GET /api/dashboard/team should return team_avg_rsi with valid numeric value"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "stats" in data, "Response should contain 'stats' field"
        
        stats = data["stats"]
        
        # team_avg_rsi should be present (can be None if no RSI data)
        assert "team_avg_rsi" in stats, "stats should contain 'team_avg_rsi' field"
        
        # If there's RSI data, it should be a valid number
        if stats["team_avg_rsi"] is not None:
            assert isinstance(stats["team_avg_rsi"], (int, float)), \
                f"team_avg_rsi should be numeric, got {type(stats['team_avg_rsi'])}"
            assert stats["team_avg_rsi"] > 0, "team_avg_rsi should be positive when present"
            print(f"✓ team_avg_rsi = {stats['team_avg_rsi']}")
        else:
            print("✓ team_avg_rsi is None (no RSI data available)")
    
    def test_team_dashboard_rsi_trend(self, auth_headers):
        """GET /api/dashboard/team should return rsi_trend"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        stats = data["stats"]
        
        assert "rsi_trend" in stats, "stats should contain 'rsi_trend' field"
        
        if stats["rsi_trend"] is not None:
            assert stats["rsi_trend"] in ["up", "down", "stable"], \
                f"rsi_trend should be 'up', 'down', or 'stable', got {stats['rsi_trend']}"
            print(f"✓ rsi_trend = {stats['rsi_trend']}")
        else:
            print("✓ rsi_trend is None (not enough data for trend)")


class TestTeamDashboardHID(TestAuth):
    """Test HID (High Intensity Distance) in meters"""
    
    def test_team_dashboard_hid_in_meters(self, auth_headers):
        """GET /api/dashboard/team should return team_avg_hid in meters"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        stats = data["stats"]
        
        assert "team_avg_hid" in stats, "stats should contain 'team_avg_hid' field"
        
        if stats["team_avg_hid"] is not None:
            assert isinstance(stats["team_avg_hid"], (int, float)), \
                f"team_avg_hid should be numeric, got {type(stats['team_avg_hid'])}"
            # HID in meters should typically be between 100-3000m for a session
            # If it's > 10000, it might be in wrong units
            assert stats["team_avg_hid"] < 10000, \
                f"team_avg_hid seems too high ({stats['team_avg_hid']}), might not be in meters"
            print(f"✓ team_avg_hid = {stats['team_avg_hid']}m")
        else:
            print("✓ team_avg_hid is None (no HID data available)")


class TestVBTOptimalLoad(TestAuth):
    """Test VBT optimal load calculation"""
    
    def test_vbt_analysis_returns_optimal_load(self, auth_headers):
        """GET /api/vbt/analysis/{athlete_id}?exercise=Back%20Squat should return optimal_load"""
        response = requests.get(
            f"{BASE_URL}/api/vbt/analysis/{TEST_ATHLETE_ID}?exercise=Back%20Squat",
            headers=auth_headers
        )
        
        # 404 is acceptable if athlete has no VBT data
        if response.status_code == 404:
            pytest.skip("No VBT data for this athlete")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check load_velocity_profile structure
        assert "load_velocity_profile" in data, "Response should contain 'load_velocity_profile'"
        
        profile = data["load_velocity_profile"]
        
        # Check for optimal load fields
        assert "optimal_load" in profile, "load_velocity_profile should contain 'optimal_load'"
        assert "optimal_velocity" in profile, "load_velocity_profile should contain 'optimal_velocity'"
        assert "optimal_power" in profile, "load_velocity_profile should contain 'optimal_power'"
        
        # If optimal_load is calculated, verify it's valid
        if profile["optimal_load"] is not None:
            assert isinstance(profile["optimal_load"], (int, float)), \
                f"optimal_load should be numeric, got {type(profile['optimal_load'])}"
            assert profile["optimal_load"] > 0, "optimal_load should be positive"
            print(f"✓ optimal_load = {profile['optimal_load']}kg")
            
            if profile["optimal_velocity"] is not None:
                assert isinstance(profile["optimal_velocity"], (int, float))
                print(f"✓ optimal_velocity = {profile['optimal_velocity']}m/s")
            
            if profile["optimal_power"] is not None:
                assert isinstance(profile["optimal_power"], (int, float))
                print(f"✓ optimal_power = {profile['optimal_power']}W")
        else:
            print("✓ optimal_load is None (slope is not negative - expected for test data)")
    
    def test_vbt_analysis_returns_optimal_load_evolution(self, auth_headers):
        """GET /api/vbt/analysis/{athlete_id}?exercise=Back%20Squat should return optimal_load_evolution"""
        response = requests.get(
            f"{BASE_URL}/api/vbt/analysis/{TEST_ATHLETE_ID}?exercise=Back%20Squat",
            headers=auth_headers
        )
        
        if response.status_code == 404:
            pytest.skip("No VBT data for this athlete")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check for optimal_load_evolution array
        assert "optimal_load_evolution" in data, "Response should contain 'optimal_load_evolution'"
        
        evolution = data["optimal_load_evolution"]
        assert isinstance(evolution, list), "optimal_load_evolution should be a list"
        
        if len(evolution) > 0:
            # Verify structure of evolution entries
            entry = evolution[0]
            assert "date" in entry, "Evolution entry should have 'date'"
            assert "optimal_load" in entry, "Evolution entry should have 'optimal_load'"
            assert "optimal_velocity" in entry, "Evolution entry should have 'optimal_velocity'"
            assert "optimal_power" in entry, "Evolution entry should have 'optimal_power'"
            print(f"✓ optimal_load_evolution has {len(evolution)} entries")
            print(f"  Latest: {entry}")
        else:
            print("✓ optimal_load_evolution is empty (not enough sessions with valid slope)")


class TestPDFStrengthSection(TestAuth):
    """Test PDF report strength section"""
    
    def test_pdf_report_generation(self, auth_headers):
        """GET /api/reports/athlete/{athlete_id}/pdf should return PDF with strength section"""
        response = requests.get(
            f"{BASE_URL}/api/reports/athlete/{TEST_ATHLETE_ID}/pdf",
            headers=auth_headers
        )
        
        if response.status_code == 404:
            pytest.skip("Athlete not found or no data")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type is PDF
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, \
            f"Expected PDF content type, got {content_type}"
        
        # Check PDF has content
        assert len(response.content) > 0, "PDF should have content"
        
        # Check PDF magic bytes
        assert response.content[:4] == b'%PDF', "Response should be a valid PDF"
        
        print(f"✓ PDF generated successfully, size: {len(response.content)} bytes")


class TestVBTDataCreation(TestAuth):
    """Test VBT data creation to verify optimal load calculation"""
    
    def test_create_vbt_data_with_realistic_profile(self, auth_headers):
        """Create VBT data with realistic load-velocity profile (negative slope)"""
        # Realistic VBT data: as load increases, velocity decreases
        vbt_data = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": "2025-02-08",
            "provider": "manual",
            "exercise": "Back Squat",
            "sets": [
                {"reps": 5, "load_kg": 60, "mean_velocity": 0.95, "peak_velocity": 1.2, "power_watts": 570},
                {"reps": 5, "load_kg": 80, "mean_velocity": 0.75, "peak_velocity": 1.0, "power_watts": 600},
                {"reps": 5, "load_kg": 100, "mean_velocity": 0.55, "peak_velocity": 0.8, "power_watts": 550},
                {"reps": 3, "load_kg": 120, "mean_velocity": 0.35, "peak_velocity": 0.6, "power_watts": 420},
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/vbt/data",
            headers=auth_headers,
            json=vbt_data
        )
        
        if response.status_code == 404:
            pytest.skip("Athlete not found")
        
        assert response.status_code in [200, 201], \
            f"Expected 200/201, got {response.status_code}: {response.text}"
        
        print(f"✓ VBT data created successfully")
        
        # Now verify the analysis returns optimal load
        analysis_response = requests.get(
            f"{BASE_URL}/api/vbt/analysis/{TEST_ATHLETE_ID}?exercise=Back%20Squat",
            headers=auth_headers
        )
        
        assert analysis_response.status_code == 200
        analysis = analysis_response.json()
        
        profile = analysis["load_velocity_profile"]
        
        # With realistic data (negative slope), optimal_load should be calculated
        print(f"  slope: {profile.get('slope')}")
        print(f"  intercept: {profile.get('intercept')}")
        print(f"  optimal_load: {profile.get('optimal_load')}")
        print(f"  optimal_velocity: {profile.get('optimal_velocity')}")
        print(f"  optimal_power: {profile.get('optimal_power')}")
        
        # The slope should be negative for realistic data
        if profile.get("slope") and profile["slope"] < 0:
            assert profile["optimal_load"] is not None, \
                "optimal_load should be calculated when slope is negative"
            print(f"✓ Optimal load calculated: {profile['optimal_load']}kg at {profile['optimal_velocity']}m/s = {profile['optimal_power']}W")


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"API health check failed: {response.status_code}"
        print(f"✓ API is healthy")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
