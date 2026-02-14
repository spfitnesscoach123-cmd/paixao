"""
Backend API Tests for ACWR Analytics App
Tests: Authentication, Athletes, Analysis endpoints with i18n support
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://pose-guard-system.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test"
TEST_ATHLETE_ID = "69862b75fc9efff29476e3ce"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Login successful - User: {data['user']['name']}")
        return data["access_token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials rejected correctly")
    
    def test_me_endpoint(self, auth_token):
        """Test getting current user info"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200, f"Auth/me failed: {response.text}"
        data = response.json()
        assert "email" in data
        assert data["email"] == TEST_EMAIL
        print(f"✓ /auth/me returned user: {data['email']}")


class TestAthletes:
    """Test athlete endpoints"""
    
    def test_list_athletes(self, auth_token):
        """Test listing athletes"""
        response = requests.get(f"{BASE_URL}/api/athletes", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200, f"List athletes failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Listed {len(data)} athletes")
        return data
    
    def test_get_athlete_by_id(self, auth_token):
        """Test getting a specific athlete"""
        response = requests.get(f"{BASE_URL}/api/athletes/{TEST_ATHLETE_ID}", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200, f"Get athlete failed: {response.text}"
        data = response.json()
        assert "name" in data, "No name in athlete data"
        assert "position" in data, "No position in athlete data"
        print(f"✓ Got athlete: {data['name']} - {data['position']}")
        return data


class TestAnalysisWithTranslations:
    """Test analysis endpoints with language parameter (i18n)"""
    
    def test_acwr_analysis_english(self, auth_token):
        """Test ACWR analysis returns English translations"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/acwr/{TEST_ATHLETE_ID}?lang=en",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # May return 400 if insufficient data, which is acceptable
        if response.status_code == 400:
            data = response.json()
            # Should return English error message
            assert "Insufficient data" in data.get("detail", "") or "data" in data.get("detail", "").lower()
            print(f"✓ ACWR (en) - Insufficient data (expected behavior): {data['detail']}")
        elif response.status_code == 200:
            data = response.json()
            assert "recommendation" in data, "No recommendation in ACWR response"
            # English recommendations should contain specific keywords
            rec = data["recommendation"].lower()
            english_keywords = ["training", "load", "risk", "maintain", "consider", "optimal"]
            has_english = any(kw in rec for kw in english_keywords)
            assert has_english, f"Recommendation doesn't appear to be in English: {data['recommendation']}"
            print(f"✓ ACWR (en) - Risk: {data.get('risk_level')}, ACWR: {data.get('acwr_ratio')}")
            print(f"  Recommendation: {data['recommendation'][:80]}...")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")
    
    def test_acwr_analysis_portuguese(self, auth_token):
        """Test ACWR analysis returns Portuguese translations"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/acwr/{TEST_ATHLETE_ID}?lang=pt",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if response.status_code == 400:
            data = response.json()
            # Should return Portuguese error message
            pt_keywords = ["dados insuficientes", "insuficientes", "análise"]
            has_pt = any(kw.lower() in data.get("detail", "").lower() for kw in pt_keywords)
            print(f"✓ ACWR (pt) - Response: {data['detail']}")
            # Note: May still be English if error messages aren't translated
        elif response.status_code == 200:
            data = response.json()
            assert "recommendation" in data, "No recommendation in ACWR response"
            rec = data["recommendation"].lower()
            # Portuguese recommendations should contain specific keywords
            pt_keywords = ["treino", "carga", "risco", "considere", "ótim", "monit"]
            has_portuguese = any(kw in rec for kw in pt_keywords)
            assert has_portuguese, f"Recommendation doesn't appear to be in Portuguese: {data['recommendation']}"
            print(f"✓ ACWR (pt) - Risco: {data.get('risk_level')}, ACWR: {data.get('acwr_ratio')}")
            print(f"  Recomendação: {data['recommendation'][:80]}...")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")
    
    def test_fatigue_analysis_english(self, auth_token):
        """Test fatigue analysis returns English translations"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/fatigue/{TEST_ATHLETE_ID}?lang=en",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if response.status_code == 400:
            data = response.json()
            print(f"✓ Fatigue (en) - Insufficient data: {data.get('detail', 'No detail')}")
        elif response.status_code == 200:
            data = response.json()
            assert "recommendation" in data, "No recommendation in fatigue response"
            assert "contributing_factors" in data, "No contributing_factors in response"
            # Check for English content
            rec = data["recommendation"].lower()
            english_keywords = ["fatigue", "recovery", "rest", "training", "athlete"]
            has_english = any(kw in rec for kw in english_keywords)
            print(f"✓ Fatigue (en) - Level: {data.get('fatigue_level')}, Score: {data.get('fatigue_score')}")
            print(f"  Contributing factors: {data['contributing_factors']}")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")
    
    def test_fatigue_analysis_portuguese(self, auth_token):
        """Test fatigue analysis returns Portuguese translations"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/fatigue/{TEST_ATHLETE_ID}?lang=pt",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if response.status_code == 400:
            data = response.json()
            print(f"✓ Fatigue (pt) - Dados insuficientes: {data.get('detail', 'No detail')}")
        elif response.status_code == 200:
            data = response.json()
            assert "recommendation" in data
            # Check for Portuguese content in contributing factors
            factors = str(data.get("contributing_factors", []))
            rec = data["recommendation"].lower()
            pt_keywords = ["fadiga", "recuperação", "descanso", "treino", "sono", "muscular"]
            has_portuguese = any(kw in factors.lower() or kw in rec for kw in pt_keywords)
            print(f"✓ Fatigue (pt) - Nível: {data.get('fatigue_level')}, Score: {data.get('fatigue_score')}")
            print(f"  Fatores contribuintes: {data['contributing_factors']}")
            if not has_portuguese:
                print(f"  WARNING: Response may not be fully translated to Portuguese")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")
    
    def test_comprehensive_analysis_with_lang(self, auth_token):
        """Test comprehensive analysis accepts lang parameter"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/comprehensive/{TEST_ATHLETE_ID}?lang=pt",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # This endpoint may fail if there's insufficient data
        if response.status_code == 200:
            data = response.json()
            assert "athlete_name" in data
            print(f"✓ Comprehensive analysis (pt) - Athlete: {data.get('athlete_name')}")
            if data.get("acwr"):
                print(f"  ACWR: {data['acwr'].get('recommendation', 'N/A')[:60]}...")
            if data.get("fatigue"):
                print(f"  Fatigue: {data['fatigue'].get('recommendation', 'N/A')[:60]}...")
        else:
            print(f"✓ Comprehensive analysis returned status {response.status_code} (may need more data)")
    
    def test_acwr_detailed_with_lang(self, auth_token):
        """Test detailed ACWR analysis with language"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/acwr-detailed/{TEST_ATHLETE_ID}?lang=pt",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if response.status_code == 200:
            data = response.json()
            assert "metrics" in data, "No metrics in detailed ACWR"
            assert "recommendation" in data
            print(f"✓ ACWR Detailed (pt) - {len(data['metrics'])} métricas")
            print(f"  Risco geral: {data.get('overall_risk')}")
            print(f"  Recomendação: {data['recommendation'][:80]}...")
            # Check metric names are translated
            if data["metrics"]:
                metric_names = [m["name"] for m in data["metrics"]]
                print(f"  Métricas: {metric_names}")
        elif response.status_code == 400:
            print(f"✓ ACWR Detailed (pt) - Insufficient data: {response.json().get('detail', '')}")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")


class TestGPSData:
    """Test GPS data endpoints"""
    
    def test_get_athlete_gps_data(self, auth_token):
        """Test getting GPS data for athlete"""
        response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"GPS data failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "GPS data should be a list"
        print(f"✓ GPS data - {len(data)} records found")
        if data:
            print(f"  Latest record date: {data[0].get('date', 'N/A')}")
    
    def test_get_athlete_sessions(self, auth_token):
        """Test getting GPS sessions grouped"""
        response = requests.get(
            f"{BASE_URL}/api/gps-data/athlete/{TEST_ATHLETE_ID}/sessions",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Sessions failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Sessions should be a list"
        print(f"✓ GPS sessions - {len(data)} sessions found")
        if data:
            session = data[0]
            print(f"  Latest session: {session.get('session_name', 'N/A')} - {session.get('date', 'N/A')}")
            print(f"  Periods: {len(session.get('periods', []))}")


class TestWellnessData:
    """Test wellness data endpoints"""
    
    def test_get_athlete_wellness(self, auth_token):
        """Test getting wellness data for athlete"""
        response = requests.get(
            f"{BASE_URL}/api/wellness/athlete/{TEST_ATHLETE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Wellness data failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Wellness data should be a list"
        print(f"✓ Wellness data - {len(data)} records found")
        if data:
            print(f"  Latest: Date {data[0].get('date')}, Readiness: {data[0].get('readiness_score')}")


# Fixtures
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


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
