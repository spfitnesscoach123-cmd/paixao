"""
Test file for Team Dashboard Bug Fixes
Tests:
1. Position groups show GROUP AVERAGES (not individual athletes)
2. Session counting logic (unique session_name + date combinations)
3. position_summary structure has all required fields
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import uuid

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://no-duplication-gps.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "testuser@test.com"
TEST_PASSWORD = "Test123!"


class TestTeamDashboardBugFixes:
    """Test team dashboard bug fixes for position group averages and session counting"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Store created resources for cleanup
        self.created_athletes = []
        self.created_gps_data = []
        self.created_wellness = []
        
        yield
        
        # Cleanup
        for athlete_id in self.created_athletes:
            try:
                self.session.delete(f"{BASE_URL}/api/athletes/{athlete_id}")
            except:
                pass
    
    def test_position_summary_structure(self):
        """Test that position_summary has all required fields for group averages"""
        # Use unique position name to avoid conflicts with other test data
        unique_position = f"TestMidfielder_{uuid.uuid4().hex[:6]}"
        
        # Create test athletes in same position
        athletes = []
        for i in range(2):
            response = self.session.post(f"{BASE_URL}/api/athletes", json={
                "name": f"TEST_Midfielder_{i}_{uuid.uuid4().hex[:6]}",
                "birth_date": "2000-01-01",
                "position": unique_position
            })
            assert response.status_code == 200, f"Failed to create athlete: {response.text}"
            athlete = response.json()
            athlete_id = athlete.get("_id") or athlete.get("id")
            athletes.append({"id": athlete_id, **athlete})
            self.created_athletes.append(athlete_id)
        
        # Add GPS data for each athlete
        today = datetime.now().strftime("%Y-%m-%d")
        for i, athlete in enumerate(athletes):
            response = self.session.post(f"{BASE_URL}/api/gps-data", json={
                "athlete_id": athlete["id"],
                "date": today,
                "session_name": f"Training Session {i}",
                "period_name": "Full Session",
                "total_distance": 8000 + (i * 1000),  # 8000m and 9000m
                "high_intensity_distance": 1000 + (i * 200),
                "sprint_distance": 200 + (i * 50),
                "number_of_sprints": 10 + i,
                "number_of_accelerations": 20 + i,
                "number_of_decelerations": 18 + i,
                "max_speed": 28 + i
            })
            assert response.status_code == 200, f"Failed to create GPS data: {response.text}"
        
        # Get team dashboard
        response = self.session.get(f"{BASE_URL}/api/dashboard/team?lang=en")
        assert response.status_code == 200, f"Failed to get team dashboard: {response.text}"
        
        data = response.json()
        position_summary = data.get("position_summary", {})
        
        # Check our unique position exists
        assert unique_position in position_summary, f"{unique_position} not in position_summary: {position_summary.keys()}"
        
        position_stats = position_summary[unique_position]
        
        # Verify all required fields exist
        required_fields = [
            "count", "avg_acwr", "avg_wellness", "avg_fatigue",
            "avg_distance", "avg_sprints", "avg_max_speed", "high_risk_count"
        ]
        
        for field in required_fields:
            assert field in position_stats, f"Missing field '{field}' in position_summary"
        
        # Verify count is correct
        assert position_stats["count"] == 2, f"Expected 2 athletes, got {position_stats['count']}"
        
        # Verify avg_distance is an average (should be between 8000 and 9000)
        avg_dist = position_stats["avg_distance"]
        assert 8000 <= avg_dist <= 9000, f"avg_distance {avg_dist} should be between 8000-9000"
        
        # Verify avg_sprints is an average (should be between 10 and 11)
        avg_sprints = position_stats["avg_sprints"]
        assert 10 <= avg_sprints <= 11, f"avg_sprints {avg_sprints} should be between 10-11"
        
        # Verify avg_max_speed is an average (should be between 28 and 29)
        avg_max_speed = position_stats["avg_max_speed"]
        assert 28 <= avg_max_speed <= 29, f"avg_max_speed {avg_max_speed} should be between 28-29"
        
        print(f"✓ Position summary structure verified with all required fields")
        print(f"  - count: {position_stats['count']}")
        print(f"  - avg_distance: {avg_dist}")
        print(f"  - avg_sprints: {avg_sprints}")
        print(f"  - avg_max_speed: {avg_max_speed}")
    
    def test_session_counting_unique_sessions(self):
        """Test that session count counts unique session_name + date combinations, not GPS periods"""
        # Create test athlete
        response = self.session.post(f"{BASE_URL}/api/athletes", json={
            "name": f"TEST_SessionCount_{uuid.uuid4().hex[:6]}",
            "birth_date": "2000-01-01",
            "position": "Forward"
        })
        assert response.status_code == 200
        athlete = response.json()
        athlete_id = athlete.get("_id") or athlete.get("id")
        self.created_athletes.append(athlete_id)
        
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Create ONE session with MULTIPLE periods (should count as 1 session)
        session_id = str(uuid.uuid4())
        periods = ["1st Half", "2nd Half", "Session"]
        
        for period in periods:
            response = self.session.post(f"{BASE_URL}/api/gps-data", json={
                "athlete_id": athlete_id,
                "date": today,
                "session_id": session_id,
                "session_name": "Match vs Team A",
                "period_name": period,
                "total_distance": 3000,
                "high_intensity_distance": 500,
                "sprint_distance": 100,
                "number_of_sprints": 5,
                "number_of_accelerations": 10,
                "number_of_decelerations": 8,
                "max_speed": 30
            })
            assert response.status_code == 200
        
        # Create ANOTHER session on different day (should count as 2nd session)
        session_id_2 = str(uuid.uuid4())
        response = self.session.post(f"{BASE_URL}/api/gps-data", json={
            "athlete_id": athlete_id,
            "date": yesterday,
            "session_id": session_id_2,
            "session_name": "Training",
            "period_name": "Full Session",
            "total_distance": 6000,
            "high_intensity_distance": 800,
            "sprint_distance": 150,
            "number_of_sprints": 8,
            "number_of_accelerations": 15,
            "number_of_decelerations": 12,
            "max_speed": 28
        })
        assert response.status_code == 200
        
        # Get team dashboard
        response = self.session.get(f"{BASE_URL}/api/dashboard/team?lang=en")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find our test athlete
        test_athlete = None
        for a in data["athletes"]:
            if a["id"] == athlete_id:
                test_athlete = a
                break
        
        assert test_athlete is not None, "Test athlete not found in dashboard"
        
        # The athlete should have 2 sessions (not 4 GPS records)
        # Note: total_sessions_7d counts unique sessions in last 7 days
        sessions_7d = test_athlete.get("total_sessions_7d", 0)
        
        # We created 2 unique sessions (Match vs Team A on today, Training on yesterday)
        # Even though Match has 3 periods, it should count as 1 session
        assert sessions_7d == 2, f"Expected 2 unique sessions, got {sessions_7d}. Session counting may be counting periods instead of sessions."
        
        print(f"✓ Session counting verified: {sessions_7d} unique sessions (not counting periods)")
    
    def test_position_group_averages_not_individual(self):
        """Test that position groups show GROUP AVERAGES, not individual athlete data"""
        # Create 3 athletes in same position with different metrics
        athletes_data = [
            {"name": f"TEST_Defender_A_{uuid.uuid4().hex[:6]}", "distance": 6000, "sprints": 5, "max_speed": 25},
            {"name": f"TEST_Defender_B_{uuid.uuid4().hex[:6]}", "distance": 7000, "sprints": 8, "max_speed": 27},
            {"name": f"TEST_Defender_C_{uuid.uuid4().hex[:6]}", "distance": 8000, "sprints": 11, "max_speed": 29},
        ]
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        for data in athletes_data:
            # Create athlete
            response = self.session.post(f"{BASE_URL}/api/athletes", json={
                "name": data["name"],
                "birth_date": "2000-01-01",
                "position": "Defender"
            })
            assert response.status_code == 200
            athlete = response.json()
            athlete_id = athlete.get("_id") or athlete.get("id")
            self.created_athletes.append(athlete_id)
            
            # Add GPS data
            response = self.session.post(f"{BASE_URL}/api/gps-data", json={
                "athlete_id": athlete_id,
                "date": today,
                "session_name": "Training",
                "period_name": "Full Session",
                "total_distance": data["distance"],
                "high_intensity_distance": 500,
                "sprint_distance": 100,
                "number_of_sprints": data["sprints"],
                "number_of_accelerations": 15,
                "number_of_decelerations": 12,
                "max_speed": data["max_speed"]
            })
            assert response.status_code == 200
        
        # Get team dashboard
        response = self.session.get(f"{BASE_URL}/api/dashboard/team?lang=en")
        assert response.status_code == 200
        
        data = response.json()
        position_summary = data.get("position_summary", {})
        
        assert "Defender" in position_summary, "Defender position not found"
        
        defender_stats = position_summary["Defender"]
        
        # Expected averages:
        # avg_distance: (6000 + 7000 + 8000) / 3 = 7000
        # avg_sprints: (5 + 8 + 11) / 3 = 8
        # avg_max_speed: (25 + 27 + 29) / 3 = 27
        
        expected_avg_distance = 7000
        expected_avg_sprints = 8
        expected_avg_max_speed = 27
        
        # Allow some tolerance for rounding
        assert abs(defender_stats["avg_distance"] - expected_avg_distance) < 100, \
            f"avg_distance {defender_stats['avg_distance']} should be ~{expected_avg_distance}"
        
        assert abs(defender_stats["avg_sprints"] - expected_avg_sprints) < 1, \
            f"avg_sprints {defender_stats['avg_sprints']} should be ~{expected_avg_sprints}"
        
        assert abs(defender_stats["avg_max_speed"] - expected_avg_max_speed) < 1, \
            f"avg_max_speed {defender_stats['avg_max_speed']} should be ~{expected_avg_max_speed}"
        
        print(f"✓ Position group averages verified:")
        print(f"  - avg_distance: {defender_stats['avg_distance']} (expected ~{expected_avg_distance})")
        print(f"  - avg_sprints: {defender_stats['avg_sprints']} (expected ~{expected_avg_sprints})")
        print(f"  - avg_max_speed: {defender_stats['avg_max_speed']} (expected ~{expected_avg_max_speed})")


class TestWellnessColorLogic:
    """Test wellness color logic - low fatigue/stress/pain should be green (good)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        self.created_athletes = []
        yield
        
        for athlete_id in self.created_athletes:
            try:
                self.session.delete(f"{BASE_URL}/api/athletes/{athlete_id}")
            except:
                pass
    
    def test_wellness_data_structure(self):
        """Test that wellness data is returned correctly for color coding"""
        # Create athlete
        response = self.session.post(f"{BASE_URL}/api/athletes", json={
            "name": f"TEST_Wellness_{uuid.uuid4().hex[:6]}",
            "birth_date": "2000-01-01",
            "position": "Goalkeeper"
        })
        assert response.status_code == 200
        athlete = response.json()
        athlete_id = athlete.get("_id") or athlete.get("id")
        self.created_athletes.append(athlete_id)
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Create wellness data with LOW fatigue (good condition)
        response = self.session.post(f"{BASE_URL}/api/wellness", json={
            "athlete_id": athlete_id,
            "date": today,
            "fatigue": 2,  # Low fatigue = good
            "stress": 3,   # Low stress = good
            "mood": 8,     # High mood = good
            "sleep_quality": 9,  # High sleep quality = good
            "sleep_hours": 8.5,
            "muscle_soreness": 2,  # Low soreness = good
            "hydration": 8
        })
        assert response.status_code == 200
        wellness = response.json()
        
        # Verify wellness score is calculated
        assert "wellness_score" in wellness, "wellness_score not in response"
        assert "readiness_score" in wellness, "readiness_score not in response"
        
        # With low fatigue/stress/soreness and high mood/sleep, scores should be high
        assert wellness["wellness_score"] > 6, f"Wellness score {wellness['wellness_score']} should be > 6 for good condition"
        
        print(f"✓ Wellness data structure verified")
        print(f"  - fatigue: {wellness['fatigue']} (low = good)")
        print(f"  - wellness_score: {wellness['wellness_score']}")
        print(f"  - readiness_score: {wellness['readiness_score']}")


class TestDecimalInputForVelocity:
    """Test that velocity fields accept decimal input"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        
        token = response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        self.created_athletes = []
        yield
        
        for athlete_id in self.created_athletes:
            try:
                self.session.delete(f"{BASE_URL}/api/athletes/{athlete_id}")
            except:
                pass
    
    def test_vbt_decimal_velocity_input(self):
        """Test that VBT endpoint accepts decimal velocity values (m/s)"""
        # Create athlete
        response = self.session.post(f"{BASE_URL}/api/athletes", json={
            "name": f"TEST_VBT_{uuid.uuid4().hex[:6]}",
            "birth_date": "2000-01-01",
            "position": "Midfielder"
        })
        assert response.status_code == 200
        athlete = response.json()
        athlete_id = athlete.get("_id") or athlete.get("id")
        self.created_athletes.append(athlete_id)
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Submit VBT data with decimal velocity values
        response = self.session.post(f"{BASE_URL}/api/vbt/data", json={
            "athlete_id": athlete_id,
            "date": today,
            "provider": "manual",
            "exercise": "Back Squat",
            "sets": [
                {
                    "reps": 5,
                    "mean_velocity": 0.85,  # Decimal m/s
                    "peak_velocity": 1.25,  # Decimal m/s
                    "load_kg": 100,
                    "power_watts": 800
                },
                {
                    "reps": 5,
                    "mean_velocity": 0.72,  # Decimal m/s
                    "peak_velocity": 1.10,  # Decimal m/s
                    "load_kg": 120,
                    "power_watts": 900
                }
            ]
        })
        
        assert response.status_code == 200, f"VBT data submission failed: {response.text}"
        vbt_data = response.json()
        
        # Verify decimal values were stored correctly
        assert "sets" in vbt_data, "sets not in response"
        assert len(vbt_data["sets"]) == 2, "Expected 2 sets"
        
        # Check first set has correct decimal velocity
        first_set = vbt_data["sets"][0]
        assert first_set["mean_velocity"] == 0.85, f"mean_velocity should be 0.85, got {first_set['mean_velocity']}"
        assert first_set["peak_velocity"] == 1.25, f"peak_velocity should be 1.25, got {first_set['peak_velocity']}"
        
        print(f"✓ VBT decimal velocity input verified")
        print(f"  - mean_velocity: {first_set['mean_velocity']} m/s")
        print(f"  - peak_velocity: {first_set['peak_velocity']} m/s")
    
    def test_strength_assessment_decimal_speed(self):
        """Test that strength assessment accepts decimal speed values"""
        # Create athlete
        response = self.session.post(f"{BASE_URL}/api/athletes", json={
            "name": f"TEST_Strength_{uuid.uuid4().hex[:6]}",
            "birth_date": "2000-01-01",
            "position": "Forward"
        })
        assert response.status_code == 200
        athlete = response.json()
        athlete_id = athlete.get("_id") or athlete.get("id")
        self.created_athletes.append(athlete_id)
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Submit strength assessment with decimal speed values
        response = self.session.post(f"{BASE_URL}/api/assessments", json={
            "athlete_id": athlete_id,
            "date": today,
            "assessment_type": "strength",
            "metrics": {
                "mean_power": 2200,
                "peak_power": 3500,
                "mean_speed": 1.35,  # Decimal m/s
                "peak_speed": 2.65,  # Decimal m/s
                "rsi": 2.1
            }
        })
        
        assert response.status_code == 200, f"Strength assessment failed: {response.text}"
        assessment = response.json()
        
        # Verify decimal values were stored
        metrics = assessment.get("metrics", {})
        assert metrics.get("mean_speed") == 1.35, f"mean_speed should be 1.35, got {metrics.get('mean_speed')}"
        assert metrics.get("peak_speed") == 2.65, f"peak_speed should be 2.65, got {metrics.get('peak_speed')}"
        
        print(f"✓ Strength assessment decimal speed input verified")
        print(f"  - mean_speed: {metrics.get('mean_speed')} m/s")
        print(f"  - peak_speed: {metrics.get('peak_speed')} m/s")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
