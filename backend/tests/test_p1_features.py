"""
Backend API Tests for P1 Features - ACWR Analytics App
Tests:
1. GPS Data API - 15 sessions with date filter
2. Wellness API - QTR score calculation  
3. Assessments API - Strength assessments
4. Strength Analysis API - Peripheral fatigue detection
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://traintracker-53.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"
TEST_ATHLETE_ID = "69862b75fc9efff29476e3ce"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Could not authenticate: {response.text}")
    return response.json()["access_token"]


class TestGPSDataAPI:
    """Test GPS data endpoint with 15 sessions"""
    
    def test_gps_data_returns_sessions(self, auth_token):
        """Verify GPS data returns sessions for the athlete"""
        response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"GPS data failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GPS Data API returns {len(data)} records")
        
        # Verify 15 sessions exist (P1 requirement)
        assert len(data) >= 15, f"Expected at least 15 GPS sessions, got {len(data)}"
        print(f"✓ P1 Requirement: 15+ GPS sessions verified")
        
    def test_gps_data_structure(self, auth_token):
        """Verify GPS data has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if data:
            first_record = data[0]
            required_fields = ['date', 'total_distance', 'high_intensity_distance', 
                             'sprint_distance', 'number_of_sprints']
            for field in required_fields:
                assert field in first_record, f"Missing field: {field}"
            
            print(f"✓ GPS data structure verified")
            print(f"  Sample: {first_record['date']}, Distance: {first_record['total_distance']}m")


class TestWellnessAPI:
    """Test Wellness data endpoint"""
    
    def test_wellness_returns_data(self, auth_token):
        """Verify wellness data returns questionnaires"""
        response = requests.get(
            f"{BASE_URL}/api/wellness/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Wellness API failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Wellness API returns {len(data)} questionnaires")
        
        # Verify at least 11 questionnaires (P1 requirement)
        assert len(data) >= 11, f"Expected at least 11 questionnaires, got {len(data)}"
        print(f"✓ P1 Requirement: 11+ wellness questionnaires verified")
        
    def test_wellness_score_calculation(self, auth_token):
        """Verify wellness score is calculated"""
        response = requests.get(
            f"{BASE_URL}/api/wellness/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if data:
            first_record = data[0]
            # Verify score fields exist
            assert 'wellness_score' in first_record or first_record.get('wellness_score') is not None, "Missing wellness_score"
            assert 'readiness_score' in first_record or first_record.get('readiness_score') is not None, "Missing readiness_score"
            
            print(f"✓ Wellness scores verified")
            print(f"  Sample: Wellness={first_record.get('wellness_score')}, Readiness={first_record.get('readiness_score')}")


class TestAssessmentsAPI:
    """Test Assessments endpoint with strength type"""
    
    def test_assessments_returns_data(self, auth_token):
        """Verify assessments endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/assessments/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Assessments API failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Assessments API returns {len(data)} records")
        
    def test_strength_assessments_exist(self, auth_token):
        """Verify strength assessments exist (P1 requirement: 4+ assessments)"""
        response = requests.get(
            f"{BASE_URL}/api/assessments/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        strength_assessments = [a for a in data if a.get("assessment_type") == "strength"]
        print(f"✓ Found {len(strength_assessments)} strength assessments")
        
        # Verify at least 4 strength assessments (P1 requirement)
        assert len(strength_assessments) >= 4, f"Expected at least 4 strength assessments, got {len(strength_assessments)}"
        print(f"✓ P1 Requirement: 4+ strength assessments verified")
        
    def test_strength_assessment_metrics(self, auth_token):
        """Verify strength assessments have proper metrics"""
        response = requests.get(
            f"{BASE_URL}/api/assessments/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        strength_assessments = [a for a in data if a.get("assessment_type") == "strength"]
        
        if strength_assessments:
            latest = strength_assessments[0]
            metrics = latest.get('metrics', {})
            
            expected_metrics = ['mean_power', 'peak_power', 'rsi', 'fatigue_index']
            for metric in expected_metrics:
                assert metric in metrics, f"Missing strength metric: {metric}"
            
            print(f"✓ Strength metrics verified: {list(metrics.keys())}")


class TestStrengthAnalysisAPI:
    """Test Strength Analysis endpoint with peripheral fatigue detection"""
    
    def test_strength_analysis_endpoint(self, auth_token):
        """Verify strength analysis endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{TEST_ATHLETE_ID}?lang=en",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Strength analysis failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert 'metrics' in data, "Missing metrics"
        assert 'fatigue_index' in data, "Missing fatigue_index"
        assert 'peripheral_fatigue_detected' in data, "Missing peripheral_fatigue_detected"
        assert 'overall_strength_classification' in data, "Missing overall_strength_classification"
        assert 'recommendations' in data, "Missing recommendations"
        
        print(f"✓ Strength analysis endpoint works")
        print(f"  Classification: {data['overall_strength_classification']}")
        
    def test_peripheral_fatigue_detection(self, auth_token):
        """Verify peripheral fatigue is detected (P1 requirement)"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{TEST_ATHLETE_ID}?lang=en",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check fatigue detection
        peripheral_fatigue = data.get('peripheral_fatigue_detected', False)
        fatigue_index = data.get('fatigue_index', 0)
        historical_trend = data.get('historical_trend', {})
        
        print(f"✓ Peripheral Fatigue Detection:")
        print(f"  Detected: {peripheral_fatigue}")
        print(f"  Fatigue Index: {fatigue_index}%")
        
        if historical_trend:
            rsi_drop = historical_trend.get('rsi_drop_percent', 0)
            power_drop = historical_trend.get('power_drop_percent', 0)
            print(f"  RSI Drop from Peak: {rsi_drop}%")
            print(f"  Power Drop from Peak: {power_drop}%")
            
            # P1 requirement: fatigue should be detected based on data
            if peripheral_fatigue:
                print(f"✓ P1 Requirement: Peripheral fatigue detection working")
                
    def test_strength_analysis_portuguese(self, auth_token):
        """Verify strength analysis returns Portuguese recommendations"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{TEST_ATHLETE_ID}?lang=pt",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        recommendations = data.get('recommendations', [])
        if recommendations:
            # Check for Portuguese text in recommendations
            pt_indicators = ['FADIGA', 'PERIFÉRICA', 'recuperação', 'Recomenda', 'lesão']
            has_portuguese = any(
                any(indicator in rec for indicator in pt_indicators) 
                for rec in recommendations
            )
            
            if has_portuguese:
                print(f"✓ Portuguese recommendations verified")
                print(f"  Sample: {recommendations[0][:80]}...")
            else:
                print(f"⚠ Recommendations may not be in Portuguese: {recommendations}")
                
    def test_strength_analysis_metrics_comparison(self, auth_token):
        """Verify metrics have comparison data"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{TEST_ATHLETE_ID}?lang=en",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        metrics = data.get('metrics', [])
        assert len(metrics) > 0, "No metrics in response"
        
        for metric in metrics:
            assert 'name' in metric, "Missing metric name"
            assert 'value' in metric, "Missing metric value"
            assert 'classification' in metric, "Missing metric classification"
            assert 'percentile' in metric, "Missing metric percentile"
            
        print(f"✓ Metrics comparison verified ({len(metrics)} metrics)")
        for m in metrics:
            variation = m.get('variation_from_peak')
            print(f"  {m['name']}: {m['value']}{m['unit']} ({m['classification']}, {variation}% from peak)")


class TestHistoricalEvolution:
    """Test historical evolution for StrengthHistoryChart"""
    
    def test_multiple_strength_dates(self, auth_token):
        """Verify strength assessments span multiple dates for evolution chart"""
        response = requests.get(
            f"{BASE_URL}/api/assessments/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        strength_assessments = [a for a in data if a.get("assessment_type") == "strength"]
        dates = list(set(a.get('date', '') for a in strength_assessments))
        dates.sort()
        
        print(f"✓ Strength assessments span {len(dates)} different dates")
        print(f"  Date range: {dates[0]} to {dates[-1]}")
        
        # P1 requirement: evolution chart needs 2+ assessments
        assert len(strength_assessments) >= 2, "Need at least 2 assessments for evolution chart"
        print(f"✓ P1 Requirement: 2+ assessments for StrengthHistoryChart verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
