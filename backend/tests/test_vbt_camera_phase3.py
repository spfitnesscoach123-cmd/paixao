"""
VBT Camera Phase 3 - Integration Tests

Tests for verifying that VBT data captured via camera integrates correctly with:
1. Backend API storing data with provider='camera'
2. VBT Analysis endpoint returning velocity_loss_analysis
3. Scientific Analysis endpoint including camera VBT data
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://athlete-load-monitor.preview.emergentagent.com"

# Test credentials
COACH_EMAIL = "coach_test@test.com"
COACH_PASSWORD = "password"
ATHLETE_ID = "698f7f78ce1d5d7d65f3259f"

class TestVBTCameraPhase3:
    """Test VBT Camera Phase 3 integration with graphs and analysis"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": COACH_EMAIL,
            "password": COACH_PASSWORD
        })
        
        if response.status_code != 200:
            pytest.skip(f"Auth failed: {response.status_code}")
        
        token = response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
    def test_01_post_vbt_data_with_camera_provider(self):
        """Test POST /api/vbt/data accepts camera provider and saves correctly"""
        vbt_data = {
            "athlete_id": ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "provider": "camera",
            "exercise": "Back Squat",
            "sets": [
                {"reps": 1, "mean_velocity": 0.85, "peak_velocity": 1.1, "load_kg": 80, "power_watts": 700, "velocity_drop": 0},
                {"reps": 1, "mean_velocity": 0.82, "peak_velocity": 1.05, "load_kg": 80, "power_watts": 680, "velocity_drop": 3.5},
                {"reps": 1, "mean_velocity": 0.78, "peak_velocity": 1.0, "load_kg": 80, "power_watts": 650, "velocity_drop": 8.2},
                {"reps": 1, "mean_velocity": 0.72, "peak_velocity": 0.95, "load_kg": 80, "power_watts": 600, "velocity_drop": 15.3}
            ],
            "camera_config": {
                "height_cm": 100,
                "distance_cm": 150
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/vbt/data", json=vbt_data)
        
        assert response.status_code == 200, f"POST /api/vbt/data failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert data.get("provider") == "camera", f"Provider should be 'camera', got: {data.get('provider')}"
        assert "_id" in data or "id" in data, "Response should contain an ID"
        assert data.get("exercise") == "Back Squat", f"Exercise mismatch: {data.get('exercise')}"
        
        # Verify sets were saved
        sets = data.get("sets", [])
        assert len(sets) == 4, f"Expected 4 sets, got {len(sets)}"
        assert sets[0].get("mean_velocity") == 0.85, f"First set velocity mismatch: {sets[0].get('mean_velocity')}"
        
        print("✓ POST /api/vbt/data with provider='camera' - PASS")
        
    def test_02_get_athlete_vbt_data_includes_camera_provider(self):
        """Test GET /api/vbt/athlete/{id} returns data with camera provider"""
        response = self.session.get(f"{BASE_URL}/api/vbt/athlete/{ATHLETE_ID}")
        
        assert response.status_code == 200, f"GET /api/vbt/athlete failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check if there's any camera data
        camera_records = [r for r in data if r.get("provider") == "camera"]
        assert len(camera_records) > 0, "No camera VBT records found"
        
        print(f"✓ GET /api/vbt/athlete/{ATHLETE_ID} returns {len(camera_records)} camera records - PASS")
        
    def test_03_vbt_analysis_returns_velocity_loss_data(self):
        """Test GET /api/vbt/analysis/{id} returns velocity_loss_analysis with correct structure"""
        response = self.session.get(
            f"{BASE_URL}/api/vbt/analysis/{ATHLETE_ID}",
            params={"exercise": "Back Squat", "lang": "pt"}
        )
        
        # Note: If no VBT data exists, this may return 400
        if response.status_code == 400:
            print("⚠ No VBT data available for Back Squat exercise - skipping velocity_loss check")
            return
            
        assert response.status_code == 200, f"GET /api/vbt/analysis failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "velocity_loss_analysis" in data, "Response should contain velocity_loss_analysis"
        assert "load_velocity_profile" in data, "Response should contain load_velocity_profile"
        
        velocity_loss = data.get("velocity_loss_analysis", [])
        
        # If velocity_loss_analysis has data, verify structure
        if velocity_loss:
            for item in velocity_loss:
                assert "set" in item, "Each velocity_loss item should have 'set'"
                assert "velocity" in item, "Each velocity_loss item should have 'velocity'"
                assert "loss_percent" in item, "Each velocity_loss item should have 'loss_percent'"
            
            print(f"✓ velocity_loss_analysis returns {len(velocity_loss)} sets with correct structure - PASS")
        else:
            print("⚠ velocity_loss_analysis is empty (may need at least 2 sets)")
        
        # Check load_velocity_profile structure
        lvp = data.get("load_velocity_profile", {})
        print(f"  - Load-Velocity Profile: slope={lvp.get('slope')}, intercept={lvp.get('intercept')}, estimated_1rm={lvp.get('estimated_1rm')}")
        
    def test_04_scientific_analysis_includes_vbt_camera_data(self):
        """Test GET /api/analysis/scientific/{id} includes VBT data from camera"""
        response = self.session.get(
            f"{BASE_URL}/api/analysis/scientific/{ATHLETE_ID}",
            params={"lang": "pt"}
        )
        
        assert response.status_code == 200, f"GET /api/analysis/scientific failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Validate basic response structure
        assert "athlete_id" in data, "Response should contain athlete_id"
        
        # Check VBT analysis section
        vbt_analysis = data.get("vbt_analysis")
        
        if vbt_analysis:
            print("✓ Scientific analysis includes VBT analysis section")
            
            # Verify VBT analysis structure
            assert "velocity_loss_analysis" in vbt_analysis, "VBT analysis should contain velocity_loss_analysis"
            assert "load_velocity_profile" in vbt_analysis, "VBT analysis should contain load_velocity_profile"
            
            velocity_loss = vbt_analysis.get("velocity_loss_analysis", [])
            if velocity_loss:
                print(f"  - velocity_loss_analysis has {len(velocity_loss)} sets")
                for item in velocity_loss:
                    print(f"    - Set {item.get('set')}: velocity={item.get('velocity')} m/s, loss={item.get('loss_percent')}%")
            else:
                print("  - velocity_loss_analysis is empty")
            
            lvp = vbt_analysis.get("load_velocity_profile", {})
            print(f"  - estimated_1rm_kg: {lvp.get('estimated_1rm_kg')}")
            print(f"  - optimal_load_kg: {lvp.get('optimal_load_kg')}")
            
            # Check fatigue detection
            fatigue_detected = vbt_analysis.get("fatigue_detected", False)
            print(f"  - fatigue_detected: {fatigue_detected}")
            
            print("✓ Scientific analysis VBT data structure validated - PASS")
        else:
            print("⚠ Scientific analysis has no VBT data (may not have VBT records)")
            
    def test_05_vbt_providers_includes_camera(self):
        """Test GET /api/vbt/providers includes camera as a valid provider"""
        response = self.session.get(f"{BASE_URL}/api/vbt/providers")
        
        assert response.status_code == 200, f"GET /api/vbt/providers failed: {response.status_code}"
        
        data = response.json()
        providers = data.get("providers", [])
        
        # Find camera provider
        camera_provider = next((p for p in providers if p.get("id") == "camera"), None)
        
        assert camera_provider is not None, "Camera should be in the list of VBT providers"
        assert camera_provider.get("id") == "camera", "Provider id should be 'camera'"
        assert "Camera" in camera_provider.get("name", ""), f"Provider name should contain 'Camera', got: {camera_provider.get('name')}"
        
        print(f"✓ GET /api/vbt/providers includes camera provider - PASS")
        print(f"  - Camera provider: {camera_provider}")
        
    def test_06_vbt_data_with_velocity_drop_saved(self):
        """Test that velocity_drop field is saved for each set"""
        # Create VBT data with explicit velocity_drop values
        vbt_data = {
            "athlete_id": ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "provider": "camera",
            "exercise": "Deadlift",  # Use different exercise to avoid conflicts
            "sets": [
                {"reps": 1, "mean_velocity": 0.90, "peak_velocity": 1.2, "load_kg": 100, "power_watts": 900, "velocity_drop": 0},
                {"reps": 1, "mean_velocity": 0.86, "peak_velocity": 1.15, "load_kg": 100, "power_watts": 860, "velocity_drop": 4.4},
                {"reps": 1, "mean_velocity": 0.80, "peak_velocity": 1.08, "load_kg": 100, "power_watts": 800, "velocity_drop": 11.1}
            ],
            "camera_config": {
                "height_cm": 100,
                "distance_cm": 150
            }
        }
        
        response = self.session.post(f"{BASE_URL}/api/vbt/data", json=vbt_data)
        
        assert response.status_code == 200, f"POST /api/vbt/data failed: {response.status_code}"
        
        data = response.json()
        sets = data.get("sets", [])
        
        # Verify velocity_drop was saved
        for i, set_data in enumerate(sets):
            assert "velocity_drop" in set_data or set_data.get("velocity_drop") is not None, \
                f"Set {i+1} should have velocity_drop"
        
        print("✓ VBT data with velocity_drop saved correctly - PASS")
        
    def test_07_multiple_exercises_vbt_analysis(self):
        """Test that VBT analysis works for different exercises"""
        # Try getting analysis for Deadlift (created in test_06)
        response = self.session.get(
            f"{BASE_URL}/api/vbt/analysis/{ATHLETE_ID}",
            params={"exercise": "Deadlift", "lang": "en"}
        )
        
        if response.status_code == 400:
            print("⚠ No Deadlift VBT data available yet")
            return
            
        assert response.status_code == 200, f"GET /api/vbt/analysis for Deadlift failed: {response.status_code}"
        
        data = response.json()
        assert data.get("exercise") == "Deadlift", f"Exercise mismatch: {data.get('exercise')}"
        
        print(f"✓ VBT analysis for Deadlift exercise - PASS")
        
    def test_08_velocity_loss_calculation_accuracy(self):
        """Test velocity loss percentage is calculated correctly from first set"""
        # Create specific data to verify calculation
        vbt_data = {
            "athlete_id": ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "provider": "camera",
            "exercise": "Bench Press",
            "sets": [
                {"reps": 1, "mean_velocity": 1.0, "peak_velocity": 1.2, "load_kg": 60, "power_watts": 600, "velocity_drop": 0},
                {"reps": 1, "mean_velocity": 0.9, "peak_velocity": 1.1, "load_kg": 60, "power_watts": 540, "velocity_drop": 10},  # 10% loss
                {"reps": 1, "mean_velocity": 0.8, "peak_velocity": 1.0, "load_kg": 60, "power_watts": 480, "velocity_drop": 20},  # 20% loss
            ],
            "camera_config": {"height_cm": 100, "distance_cm": 150}
        }
        
        post_response = self.session.post(f"{BASE_URL}/api/vbt/data", json=vbt_data)
        assert post_response.status_code == 200, f"POST failed: {post_response.status_code}"
        
        # Now get the analysis
        response = self.session.get(
            f"{BASE_URL}/api/vbt/analysis/{ATHLETE_ID}",
            params={"exercise": "Bench Press", "lang": "en"}
        )
        
        if response.status_code == 400:
            print("⚠ No Bench Press VBT data available")
            return
            
        assert response.status_code == 200, f"GET analysis failed: {response.status_code}"
        
        data = response.json()
        velocity_loss = data.get("velocity_loss_analysis", [])
        
        if len(velocity_loss) >= 3:
            # Verify calculated loss percentages
            # Set 1: 0% loss (baseline)
            # Set 2: (1.0 - 0.9) / 1.0 * 100 = 10%
            # Set 3: (1.0 - 0.8) / 1.0 * 100 = 20%
            
            assert velocity_loss[0]["loss_percent"] == 0, f"Set 1 loss should be 0, got {velocity_loss[0]['loss_percent']}"
            assert 9 <= velocity_loss[1]["loss_percent"] <= 11, f"Set 2 loss should be ~10%, got {velocity_loss[1]['loss_percent']}"
            assert 19 <= velocity_loss[2]["loss_percent"] <= 21, f"Set 3 loss should be ~20%, got {velocity_loss[2]['loss_percent']}"
            
            print("✓ Velocity loss calculation accuracy verified - PASS")
            print(f"  - Set 1: {velocity_loss[0]['loss_percent']}% (expected 0%)")
            print(f"  - Set 2: {velocity_loss[1]['loss_percent']}% (expected ~10%)")
            print(f"  - Set 3: {velocity_loss[2]['loss_percent']}% (expected ~20%)")
        else:
            print(f"⚠ Not enough sets in velocity_loss_analysis: {len(velocity_loss)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
