"""
Test suite for server.py modularization verification.
Tests all endpoints to ensure they work identically after code reorganization.
Original server.py (~12,500 lines) was split into 16 route files, 17 model files, 3 utils files.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://preview-ux-audit.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"


class TestAuthEndpoints:
    """Test authentication endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    def test_login_success(self):
        """POST /api/auth/login - Authentication works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Login successful, user: {data['user']['name']}")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login - Invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")
    
    def test_get_me(self, auth_token):
        """GET /api/auth/me - Token validation works"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert data["email"] == TEST_EMAIL
        print(f"✓ /api/auth/me returns user: {data['name']}")


class TestAthleteEndpoints:
    """Test athlete endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_athletes(self, auth_token):
        """GET /api/athletes - Returns athlete list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/athletes", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ /api/athletes returns {len(data)} athletes")
        if data:
            # Verify athlete structure
            athlete = data[0]
            assert "name" in athlete
            assert "position" in athlete
            print(f"  First athlete: {athlete['name']} ({athlete['position']})")


class TestDashboardEndpoints:
    """Test dashboard endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_team_dashboard(self, auth_token):
        """GET /api/dashboard/team?lang=pt - Team dashboard returns data"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/team?lang=pt", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Verify expected structure
        assert "stats" in data
        assert "athletes" in data
        assert "risk_distribution" in data
        print(f"✓ /api/dashboard/team returns stats for {data['stats']['total_athletes']} athletes")
        print(f"  Team avg ACWR: {data['stats']['team_avg_acwr']}")
    
    def test_team_table(self, auth_token):
        """GET /api/dashboard/team-table?lang=pt - Team table returns rows"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/team-table?lang=pt", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "rows" in data
        assert "period_label" in data
        print(f"✓ /api/dashboard/team-table returns {len(data['rows'])} rows")
    
    def test_dashboard_overview(self, auth_token):
        """GET /api/dashboard/overview?lang=pt - Overview returns summary"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/overview?lang=pt", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "mode" in data
        assert "athletes" in data  # Contains athlete data
        assert "insights" in data  # Contains insights
        print(f"✓ /api/dashboard/overview returns mode: {data['mode']}, {len(data.get('athletes', []))} athletes")


class TestLoadMetricsEndpoints:
    """Test load metrics endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_team_load_metrics_latest(self, auth_token):
        """GET /api/load-metrics/team/latest - Load metrics for team"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/load-metrics/team/latest", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "metrics" in data
        print(f"✓ /api/load-metrics/team/latest returns {data['count']} athlete metrics")


class TestAnalysisEndpoints:
    """Test analysis endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_team_acwr_analysis(self, auth_token):
        """GET /api/analysis/team-acwr?lang=pt - Team ACWR analysis"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/analysis/team-acwr?lang=pt", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "team_size" in data
        assert "metrics" in data
        assert "overall_risk" in data
        print(f"✓ /api/analysis/team-acwr returns team_size: {data['team_size']}, overall_risk: {data['overall_risk']}")


class TestSubscriptionEndpoints:
    """Test subscription endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_subscription_plans(self, auth_token):
        """GET /api/subscription/plans - Returns plans"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict) or isinstance(data, list)
        print(f"✓ /api/subscription/plans returns subscription plans")
    
    def test_subscription_current(self, auth_token):
        """GET /api/subscription/current - Returns subscription status"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/subscription/current?lang=pt", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "plan" in data or "status" in data
        print(f"✓ /api/subscription/current returns subscription status")


class TestVBTEndpoints:
    """Test VBT endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_vbt_providers(self, auth_token):
        """GET /api/vbt/providers - VBT providers list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/vbt/providers", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict) or isinstance(data, list)
        print(f"✓ /api/vbt/providers returns VBT providers")


class TestJumpEndpoints:
    """Test jump endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_jump_protocols(self, auth_token):
        """GET /api/jump/protocols - Jump protocols"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/jump/protocols", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "cmj" in data
        print(f"✓ /api/jump/protocols returns {len(data)} protocols")


class TestWearablesEndpoints:
    """Test wearables endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_wearables_supported(self, auth_token):
        """GET /api/wearables/supported - Supported wearables"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/wearables/supported", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict) or isinstance(data, list)
        print(f"✓ /api/wearables/supported returns supported wearables")


class TestPeriodizationEndpoints:
    """Test periodization endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_periodization_notifications(self, auth_token):
        """GET /api/periodization/notifications - Peak value notifications"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/periodization/notifications", headers=headers)
        assert response.status_code == 200
        data = response.json()
        print(f"✓ /api/periodization/notifications returns notifications")


class TestAccountEndpoints:
    """Test account endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_account_deletion_status(self, auth_token):
        """GET /api/account/deletion-status - Account status"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/account/deletion-status", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "account_deletion_status" in data
        print(f"✓ /api/account/deletion-status returns status: {data['account_deletion_status']}")


class TestCSVEndpoints:
    """Test CSV import endpoints after modularization"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_csv_mapping_templates(self, auth_token):
        """GET /api/csv/mapping-templates - CSV templates"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/csv/mapping-templates", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ /api/csv/mapping-templates returns {len(data)} templates")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
