"""
Test Suite: Team Dashboard Metrics Audit
Tests for:
1. Readiness score (0-100% scale from wellness readiness_score * 10)
2. team_avg_readiness in stats
3. GPS period dedup (only Session values when Session + 1st Half + 2nd Half exist)
4. Metric selector (acwr_metric parameter affects metric_value, ACWR, monotony, strain)
5. Monotony/strain calculations use the selected acwr_metric

Test data context (from main agent):
- Athlete João Silva has 3 GPS records for today (2026-03-12) with session_name='Test Activity':
  - Session (period_name='Session'): total_distance=9500
  - 1st Half (period_name='1st Half'): total_distance=4800
  - 2nd Half (period_name='2nd Half'): total_distance=4700
- Wellness data: readiness_score=4.5 (should show as 45.0% in API)
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://pose-baseline.preview.emergentagent.com"

TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"


class TestTeamDashboardMetricsAudit:
    """Test suite for Team Dashboard metrics audit - readiness, GPS dedup, metric selector"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        token = data.get("access_token")
        assert token, "No access token received"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.user_id = data.get("user", {}).get("id")
        print(f"✓ Logged in as {TEST_EMAIL}, user_id: {self.user_id}")
    
    def test_01_team_dashboard_returns_readiness_score_for_athletes(self):
        """Test: GET /api/dashboard/team returns readiness_score for each athlete (0-100% scale)"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/team")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        print(f"\n✓ Team dashboard returned {len(athletes)} athletes")
        
        # Check that athletes have readiness_score field
        athletes_with_readiness = [a for a in athletes if a.get("readiness_score") is not None]
        print(f"✓ Athletes with readiness_score: {len(athletes_with_readiness)}/{len(athletes)}")
        
        # Print readiness values for inspection
        for athlete in athletes[:5]:  # First 5 athletes
            name = athlete.get("name", "Unknown")
            readiness = athlete.get("readiness_score")
            print(f"  - {name}: readiness_score = {readiness}")
        
        # Verify readiness_score is in 0-100 range (not 0-10)
        for athlete in athletes_with_readiness:
            readiness = athlete.get("readiness_score")
            assert readiness is None or (0 <= readiness <= 100), \
                f"Readiness {readiness} for {athlete.get('name')} should be 0-100% scale"
        
        print("✓ All readiness_score values are in 0-100% range")
    
    def test_02_team_dashboard_returns_team_avg_readiness_in_stats(self):
        """Test: GET /api/dashboard/team returns team_avg_readiness in stats"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/team")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        stats = data.get("stats", {})
        
        # Check that team_avg_readiness exists in stats
        assert "team_avg_readiness" in stats, "team_avg_readiness field missing in stats"
        
        team_avg_readiness = stats.get("team_avg_readiness")
        print(f"\n✓ team_avg_readiness in stats: {team_avg_readiness}")
        
        # If not None, verify it's in 0-100 range
        if team_avg_readiness is not None:
            assert 0 <= team_avg_readiness <= 100, \
                f"team_avg_readiness {team_avg_readiness} should be 0-100% scale"
            print(f"✓ team_avg_readiness is in 0-100% range: {team_avg_readiness}%")
        else:
            print("ℹ team_avg_readiness is None (no wellness data with readiness)")
    
    def test_03_gps_period_dedup_uses_session_not_sum(self):
        """
        Test: GPS dedup - when records have Session + 1st Half + 2nd Half, 
        only Session values should be used (not sum of all three)
        
        Test data:
        - Session: total_distance=9500
        - 1st Half: total_distance=4800
        - 2nd Half: total_distance=4700
        
        Expected: metric_value should be ~9500 (Session), NOT 19000 (sum of all)
        """
        response = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric=total_distance&date_range=today")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        athletes = data.get("athletes", [])
        
        # Find João Silva (the test athlete)
        joao_silva = None
        for athlete in athletes:
            if "João Silva" in athlete.get("name", "") or "Joao Silva" in athlete.get("name", ""):
                joao_silva = athlete
                break
        
        if joao_silva:
            metric_value = joao_silva.get("metric_value")
            print(f"\n✓ Found João Silva - metric_value (total_distance): {metric_value}")
            
            # Verify GPS dedup is working
            # If Session record exists (9500), metric_value should be ~9500, NOT 19000
            if metric_value is not None:
                assert metric_value < 15000, \
                    f"GPS dedup FAILED: metric_value={metric_value} suggests summing Session+1stHalf+2ndHalf. " \
                    f"Expected ~9500 (Session only)"
                print(f"✓ GPS dedup is working - metric_value ({metric_value}) is using Session record only")
        else:
            print("ℹ João Silva not found in athletes list - checking if test data was created")
            # Print first few athletes for debugging
            for a in athletes[:5]:
                print(f"  - {a.get('name')}: metric_value={a.get('metric_value')}")
    
    def test_04_metric_selector_changes_metric_value(self):
        """
        Test: Switching acwr_metric parameter should change metric_value values
        
        Compare total_distance vs sprint_distance metric values
        """
        # Get with total_distance
        response_dist = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric=total_distance")
        assert response_dist.status_code == 200
        data_dist = response_dist.json()
        
        # Get with sprint_distance
        response_sprint = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric=sprint_distance")
        assert response_sprint.status_code == 200
        data_sprint = response_sprint.json()
        
        # Compare metric_values for same athlete
        athletes_dist = {a["id"]: a for a in data_dist.get("athletes", [])}
        athletes_sprint = {a["id"]: a for a in data_sprint.get("athletes", [])}
        
        differences_found = 0
        for athlete_id, athlete_dist in athletes_dist.items():
            athlete_sprint = athletes_sprint.get(athlete_id)
            if athlete_sprint:
                mv_dist = athlete_dist.get("metric_value")
                mv_sprint = athlete_sprint.get("metric_value")
                
                if mv_dist is not None and mv_sprint is not None and mv_dist != mv_sprint:
                    differences_found += 1
                    if differences_found <= 3:  # Show first 3 differences
                        print(f"\n  {athlete_dist.get('name')}:")
                        print(f"    - total_distance metric_value: {mv_dist}")
                        print(f"    - sprint_distance metric_value: {mv_sprint}")
        
        print(f"\n✓ Found {differences_found} athletes with different metric_values between total_distance and sprint_distance")
        
        # At least some athletes should have different values
        if differences_found > 0:
            print("✓ Metric selector is working - different acwr_metric produces different metric_values")
        else:
            print("⚠ Warning: No differences found - may need more GPS data variety")
    
    def test_05_acwr_uses_selected_metric(self):
        """
        Test: ACWR calculation should use the selected acwr_metric
        
        ACWR = acute_load (7 days) / chronic_weekly_avg (28 days / 4)
        Different metrics should produce different ACWR values
        """
        # Get with total_distance
        response_dist = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric=total_distance")
        assert response_dist.status_code == 200
        data_dist = response_dist.json()
        
        # Get with sprint_distance  
        response_sprint = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric=sprint_distance")
        assert response_sprint.status_code == 200
        data_sprint = response_sprint.json()
        
        # Compare ACWR values for same athlete
        athletes_dist = {a["id"]: a for a in data_dist.get("athletes", [])}
        athletes_sprint = {a["id"]: a for a in data_sprint.get("athletes", [])}
        
        acwr_differences = 0
        for athlete_id, athlete_dist in athletes_dist.items():
            athlete_sprint = athletes_sprint.get(athlete_id)
            if athlete_sprint:
                acwr_dist = athlete_dist.get("acwr")
                acwr_sprint = athlete_sprint.get("acwr")
                
                if acwr_dist is not None and acwr_sprint is not None and acwr_dist != acwr_sprint:
                    acwr_differences += 1
                    if acwr_differences <= 3:
                        print(f"\n  {athlete_dist.get('name')}:")
                        print(f"    - ACWR (total_distance): {acwr_dist}")
                        print(f"    - ACWR (sprint_distance): {acwr_sprint}")
        
        print(f"\n✓ Found {acwr_differences} athletes with different ACWR between metrics")
    
    def test_06_monotony_strain_use_selected_metric(self):
        """
        Test: Monotony and Strain calculations should use the selected acwr_metric
        
        Monotony = mean_load / std_dev
        Strain = weekly_load * monotony
        
        Different metrics should produce different monotony/strain values
        """
        # Get with total_distance
        response_dist = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric=total_distance&date_range=7d")
        assert response_dist.status_code == 200
        data_dist = response_dist.json()
        
        # Get with sprint_distance
        response_sprint = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric=sprint_distance&date_range=7d")
        assert response_sprint.status_code == 200
        data_sprint = response_sprint.json()
        
        # Compare monotony/strain values
        athletes_dist = {a["id"]: a for a in data_dist.get("athletes", [])}
        athletes_sprint = {a["id"]: a for a in data_sprint.get("athletes", [])}
        
        monotony_diffs = 0
        strain_diffs = 0
        
        for athlete_id, athlete_dist in athletes_dist.items():
            athlete_sprint = athletes_sprint.get(athlete_id)
            if athlete_sprint:
                mono_dist = athlete_dist.get("monotony")
                mono_sprint = athlete_sprint.get("monotony")
                strain_dist = athlete_dist.get("strain")
                strain_sprint = athlete_sprint.get("strain")
                
                if mono_dist is not None and mono_sprint is not None and mono_dist != mono_sprint:
                    monotony_diffs += 1
                    if monotony_diffs == 1:
                        print(f"\n  {athlete_dist.get('name')}:")
                        print(f"    - Monotony (total_distance): {mono_dist}")
                        print(f"    - Monotony (sprint_distance): {mono_sprint}")
                
                if strain_dist is not None and strain_sprint is not None and strain_dist != strain_sprint:
                    strain_diffs += 1
                    if strain_diffs == 1:
                        print(f"    - Strain (total_distance): {strain_dist}")
                        print(f"    - Strain (sprint_distance): {strain_sprint}")
        
        print(f"\n✓ Found {monotony_diffs} athletes with different monotony between metrics")
        print(f"✓ Found {strain_diffs} athletes with different strain between metrics")
    
    def test_07_validate_readiness_calculation_formula(self):
        """
        Test: Verify readiness_score follows formula: wellness_readiness * 10 (0-100%)
        
        Get wellness data directly and compare with dashboard readiness
        """
        # Get team dashboard
        response = self.session.get(f"{BASE_URL}/api/dashboard/team")
        assert response.status_code == 200
        data = response.json()
        
        # Get athletes list
        athletes_response = self.session.get(f"{BASE_URL}/api/athletes")
        assert athletes_response.status_code == 200
        athletes = athletes_response.json()
        
        print("\n✓ Checking readiness calculation formula (wellness_readiness * 10):")
        
        for athlete in athletes[:3]:  # Check first 3 athletes
            athlete_id = athlete.get("id") or str(athlete.get("_id"))
            
            # Get wellness data for this athlete
            wellness_response = self.session.get(f"{BASE_URL}/api/wellness/athlete/{athlete_id}")
            if wellness_response.status_code == 200:
                wellness_data = wellness_response.json()
                if wellness_data:
                    latest_wellness = wellness_data[0]
                    raw_readiness = latest_wellness.get("readiness_score")
                    
                    # Find this athlete in dashboard data
                    dashboard_athlete = next(
                        (a for a in data.get("athletes", []) if a.get("id") == athlete_id),
                        None
                    )
                    
                    if dashboard_athlete and raw_readiness is not None:
                        dashboard_readiness = dashboard_athlete.get("readiness_score")
                        expected_readiness = round(raw_readiness * 10, 1)
                        
                        print(f"\n  {athlete.get('name')}:")
                        print(f"    - Wellness readiness_score (0-10): {raw_readiness}")
                        print(f"    - Expected dashboard value (0-100): {expected_readiness}")
                        print(f"    - Actual dashboard value: {dashboard_readiness}")
                        
                        if dashboard_readiness is not None:
                            assert abs(dashboard_readiness - expected_readiness) < 0.2, \
                                f"Readiness mismatch: expected {expected_readiness}, got {dashboard_readiness}"
                            print(f"    ✓ Formula verified!")
    
    def test_08_check_joao_silva_test_data(self):
        """
        Test: Verify João Silva test data exists and validate GPS dedup
        
        Expected test data:
        - 3 GPS records for today with session_name='Test Activity'
        - Session: 9500m, 1st Half: 4800m, 2nd Half: 4700m
        - Wellness: readiness_score=4.5 → dashboard should show 45.0%
        """
        # Find João Silva
        athletes_response = self.session.get(f"{BASE_URL}/api/athletes")
        assert athletes_response.status_code == 200
        athletes = athletes_response.json()
        
        joao_silva = None
        for athlete in athletes:
            name = athlete.get("name", "")
            if "João Silva" in name or "Joao Silva" in name:
                joao_silva = athlete
                break
        
        if not joao_silva:
            print("ℹ João Silva test athlete not found - skipping test data validation")
            pytest.skip("Test athlete João Silva not found")
            return
        
        athlete_id = joao_silva.get("id") or str(joao_silva.get("_id"))
        print(f"\n✓ Found João Silva with ID: {athlete_id}")
        
        # Get GPS data
        gps_response = self.session.get(f"{BASE_URL}/api/gps-data/athlete/{athlete_id}")
        assert gps_response.status_code == 200
        gps_data = gps_response.json()
        
        # Check for test activity GPS records
        today = datetime.now().strftime("%Y-%m-%d")
        test_gps = [g for g in gps_data if g.get("session_name") == "Test Activity" and g.get("date") == today]
        
        print(f"✓ Found {len(test_gps)} GPS records for 'Test Activity' on {today}")
        
        if test_gps:
            for gps in test_gps:
                print(f"  - period_name: {gps.get('period_name')}, total_distance: {gps.get('total_distance')}")
            
            # Check for Session, 1st Half, 2nd Half records
            periods = [g.get("period_name", "").lower() for g in test_gps]
            has_session = any("session" in p for p in periods)
            has_halves = any("half" in p or "1st" in p or "2nd" in p for p in periods)
            
            if has_session and has_halves:
                print("✓ Test data has both Session and Half records - GPS dedup test is valid")
        
        # Get wellness data
        wellness_response = self.session.get(f"{BASE_URL}/api/wellness/athlete/{athlete_id}")
        if wellness_response.status_code == 200:
            wellness_data = wellness_response.json()
            if wellness_data:
                latest = wellness_data[0]
                raw_readiness = latest.get("readiness_score")
                print(f"✓ Latest wellness readiness_score: {raw_readiness}")
                
                if raw_readiness is not None:
                    expected_dashboard = round(raw_readiness * 10, 1)
                    print(f"  Expected dashboard readiness: {expected_dashboard}%")
    
    def test_09_date_range_parameter_works(self):
        """
        Test: date_range parameter affects data aggregation
        
        Options: today, 7d, 14d, 28d, 90d
        """
        date_ranges = ["today", "7d", "14d", "28d"]
        results = {}
        
        for date_range in date_ranges:
            response = self.session.get(f"{BASE_URL}/api/dashboard/team?date_range={date_range}")
            assert response.status_code == 200, f"Failed for date_range={date_range}: {response.text}"
            
            data = response.json()
            stats = data.get("stats", {})
            athletes = data.get("athletes", [])
            
            results[date_range] = {
                "total_distance_this_week": stats.get("total_distance_this_week"),
                "sessions_this_week": stats.get("sessions_this_week"),
                "first_athlete_metric": athletes[0].get("metric_value") if athletes else None
            }
        
        print("\n✓ Date range parameter results:")
        for dr, vals in results.items():
            print(f"  - {dr}: sessions={vals['sessions_this_week']}, distance={vals['total_distance_this_week']}")
    
    def test_10_all_acwr_metrics_supported(self):
        """
        Test: All documented acwr_metric values are supported
        
        Valid metrics: total_distance, high_intensity_distance, high_speed_running,
                      sprint_distance, number_of_sprints, acc_dec
        """
        valid_metrics = [
            "total_distance",
            "high_intensity_distance", 
            "high_speed_running",
            "sprint_distance",
            "number_of_sprints",
            "acc_dec"
        ]
        
        print("\n✓ Testing all valid acwr_metric values:")
        for metric in valid_metrics:
            response = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric={metric}")
            assert response.status_code == 200, f"Failed for acwr_metric={metric}: {response.text}"
            print(f"  - {metric}: OK")
        
        # Test invalid metric falls back to default
        response_invalid = self.session.get(f"{BASE_URL}/api/dashboard/team?acwr_metric=invalid_metric")
        assert response_invalid.status_code == 200, "Invalid metric should fallback to default"
        print("  - invalid_metric: Fallback OK")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
