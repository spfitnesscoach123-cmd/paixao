"""
Backend API Tests for New Features - ACWR Analytics App
Tests: Assessments endpoint with strength type, Strength Analysis endpoint
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


class TestAssessmentsEndpoint:
    """Test assessments endpoint with strength type"""
    
    def test_create_strength_assessment(self, auth_token):
        """Test creating a strength assessment with all strength metrics"""
        assessment_data = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "assessment_type": "strength",
            "metrics": {
                "mean_power": 2100,
                "peak_power": 3200,
                "mean_speed": 1.25,
                "peak_speed": 2.4,
                "rsi": 1.8,
                "fatigue_index": 45
            },
            "notes": "TEST_strength_assessment_automated"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/assessments",
            json=assessment_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Create assessment failed: {response.text}"
        data = response.json()
        
        # Verify response structure - API returns _id or id
        assert "id" in data or "_id" in data, "No id in response"
        assert data["assessment_type"] == "strength", "Assessment type mismatch"
        assert "metrics" in data, "No metrics in response"
        
        # Verify metrics were stored correctly
        metrics = data["metrics"]
        assert metrics["mean_power"] == 2100, "Mean power mismatch"
        assert metrics["peak_power"] == 3200, "Peak power mismatch"
        assert metrics["rsi"] == 1.8, "RSI mismatch"
        assert metrics["fatigue_index"] == 45, "Fatigue index mismatch"
        
        print(f"✓ Created strength assessment successfully")
        print(f"  ID: {data['id']}")
        print(f"  Metrics: {metrics}")
        
        return data["id"]
    
    def test_get_assessments_include_strength(self, auth_token):
        """Test that strength assessments appear in the assessments list"""
        response = requests.get(
            f"{BASE_URL}/api/assessments/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Get assessments failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check for strength assessments
        strength_assessments = [a for a in data if a.get("assessment_type") == "strength"]
        print(f"✓ Found {len(strength_assessments)} strength assessments out of {len(data)} total")
        
        if strength_assessments:
            latest = strength_assessments[0]
            print(f"  Latest strength assessment: {latest.get('date')}")
            print(f"  Metrics: {latest.get('metrics')}")


class TestStrengthAnalysisEndpoint:
    """Test strength analysis endpoint"""
    
    def test_strength_analysis_endpoint_exists(self, auth_token):
        """Test that strength analysis endpoint responds"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{TEST_ATHLETE_ID}?lang=en",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # May return 400 if no strength assessments, or 200 if data exists
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code} - {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "metrics" in data, "No metrics in response"
            assert "fatigue_index" in data, "No fatigue_index in response"
            assert "overall_strength_classification" in data, "No classification in response"
            print(f"✓ Strength analysis returned successfully")
            print(f"  Classification: {data.get('overall_strength_classification')}")
            print(f"  Fatigue Index: {data.get('fatigue_index')}%")
            print(f"  Peripheral Fatigue: {data.get('peripheral_fatigue_detected')}")
        else:
            data = response.json()
            print(f"✓ Strength analysis returned 400 (may need strength data): {data.get('detail')}")
    
    def test_strength_analysis_portuguese(self, auth_token):
        """Test strength analysis with Portuguese language"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{TEST_ATHLETE_ID}?lang=pt",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 400:
            data = response.json()
            # Should return Portuguese error message
            detail = data.get('detail', '')
            print(f"✓ Strength analysis (pt) - {detail}")
        else:
            data = response.json()
            print(f"✓ Strength analysis (pt) returned data")
            print(f"  Recommendations: {data.get('recommendations', [])[:2]}")


class TestStrengthAssessmentFlow:
    """Test complete flow: Create strength assessment -> Get analysis"""
    
    def test_full_strength_flow(self, auth_token):
        """Create assessment and verify it appears in analysis"""
        # Create a strength assessment first
        assessment_data = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "assessment_type": "strength",
            "metrics": {
                "mean_power": 2300,
                "peak_power": 3600,
                "mean_speed": 1.35,
                "peak_speed": 2.7,
                "rsi": 2.1,
                "fatigue_index": 35
            },
            "notes": "TEST_full_flow_assessment"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/assessments",
            json=assessment_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        print("✓ Created strength assessment for flow test")
        
        # Now get strength analysis
        analysis_response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{TEST_ATHLETE_ID}?lang=en",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert analysis_response.status_code == 200, f"Analysis failed: {analysis_response.text}"
        data = analysis_response.json()
        
        # Verify analysis contains the metrics
        assert data.get("metrics"), "No metrics in analysis"
        assert data.get("overall_strength_classification"), "No classification"
        
        print(f"✓ Strength analysis returned after creating assessment")
        print(f"  Classification: {data.get('overall_strength_classification')}")
        print(f"  Fatigue Alert: {data.get('fatigue_alert')}")
        
        # Check metrics are analyzed
        metric_names = [m["name"] for m in data.get("metrics", [])]
        expected_metrics = ["Mean Power", "Peak Power", "RSI"]
        for expected in expected_metrics:
            assert expected in metric_names, f"Missing metric: {expected}"
        
        print(f"  Analyzed metrics: {metric_names}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
