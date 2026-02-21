"""
Test suite for Subscription System APIs
Tests: Plans listing with regional pricing, current subscription, subscribe, cancel
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://coach-athlete-hub-10.preview.emergentagent.com').rstrip('/')

class TestSubscriptionPlans:
    """Test subscription plans endpoint with regional pricing"""
    
    def test_plans_br_region_returns_brl_prices(self):
        """Plans for BR region should return BRL prices"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt&region=BR")
        assert response.status_code == 200
        
        plans = response.json()
        assert len(plans) == 3  # essencial, profissional, elite
        
        # Verify BRL pricing
        essencial = next(p for p in plans if p['id'] == 'essencial')
        assert essencial['price'] == 39.90
        assert essencial['currency'] == 'BRL'
        assert 'R$' in essencial['price_formatted']
        
        profissional = next(p for p in plans if p['id'] == 'profissional')
        assert profissional['price'] == 89.90
        assert profissional['currency'] == 'BRL'
        assert profissional['popular'] == True
        
        elite = next(p for p in plans if p['id'] == 'elite')
        assert elite['price'] == 159.90
        assert elite['currency'] == 'BRL'
    
    def test_plans_us_region_returns_usd_prices(self):
        """Plans for US/International region should return USD prices"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=en&region=US")
        assert response.status_code == 200
        
        plans = response.json()
        assert len(plans) == 3
        
        # Verify USD pricing
        essencial = next(p for p in plans if p['id'] == 'essencial')
        assert essencial['price'] == 7.99
        assert essencial['currency'] == 'USD'
        assert '$' in essencial['price_formatted']
        
        profissional = next(p for p in plans if p['id'] == 'profissional')
        assert profissional['price'] == 17.99
        assert profissional['currency'] == 'USD'
        
        elite = next(p for p in plans if p['id'] == 'elite')
        assert elite['price'] == 29.99
        assert elite['currency'] == 'USD'
    
    def test_plans_have_required_fields(self):
        """All plans should have required fields"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt&region=BR")
        assert response.status_code == 200
        
        plans = response.json()
        required_fields = ['id', 'name', 'price', 'price_formatted', 'currency', 
                          'max_athletes', 'history_months', 'features', 'trial_days',
                          'description', 'features_list', 'limitations']
        
        for plan in plans:
            for field in required_fields:
                assert field in plan, f"Plan {plan['id']} missing field: {field}"
    
    def test_plans_features_list_in_portuguese(self):
        """Plans with lang=pt should have Portuguese features"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt&region=BR")
        assert response.status_code == 200
        
        plans = response.json()
        essencial = next(p for p in plans if p['id'] == 'essencial')
        
        # Check Portuguese content
        assert 'atletas' in essencial['features_list'][0].lower()
        assert 'Ideal para treinadores' in essencial['description']
    
    def test_plans_features_list_in_english(self):
        """Plans with lang=en should have English features"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=en&region=US")
        assert response.status_code == 200
        
        plans = response.json()
        essencial = next(p for p in plans if p['id'] == 'essencial')
        
        # Check English content
        assert 'athletes' in essencial['features_list'][0].lower()
        assert 'Ideal for individual coaches' in essencial['description']


class TestCurrentSubscription:
    """Test current subscription endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_current_subscription_requires_auth(self):
        """Current subscription endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/subscription/current")
        assert response.status_code in [401, 403]
    
    def test_current_subscription_returns_valid_data(self, auth_token):
        """Current subscription returns valid subscription data"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/current?lang=pt&region=BR",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        required_fields = ['plan', 'plan_name', 'status', 'price', 'max_athletes',
                          'current_athletes', 'history_months', 'features', 'limits_reached']
        
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify features structure
        assert 'export_pdf' in data['features']
        assert 'ai_insights' in data['features']
        
        # Verify limits_reached structure
        assert 'athletes' in data['limits_reached']
    
    def test_trial_subscription_has_days_remaining(self, auth_token):
        """Trial subscription should have days_remaining field"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/current?lang=pt&region=BR",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        if data['status'] == 'trial':
            assert 'days_remaining' in data
            assert data['days_remaining'] is not None
            assert 'trial_end_date' in data


class TestSubscribeEndpoint:
    """Test subscribe endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_subscribe_requires_auth(self):
        """Subscribe endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/subscription/subscribe",
            json={"plan": "essencial"}
        )
        assert response.status_code in [401, 403]
    
    def test_subscribe_to_essencial_plan(self, auth_token):
        """Can subscribe to essencial plan"""
        response = requests.post(
            f"{BASE_URL}/api/subscription/subscribe",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"plan": "essencial"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['plan'] == 'essencial'
        assert data['status'] == 'trial'
        assert 'subscription_id' in data
        assert 'trial_end_date' in data
    
    def test_subscribe_to_profissional_plan(self, auth_token):
        """Can subscribe to profissional plan"""
        response = requests.post(
            f"{BASE_URL}/api/subscription/subscribe",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"plan": "profissional"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['plan'] == 'profissional'
    
    def test_subscribe_to_elite_plan(self, auth_token):
        """Can subscribe to elite plan"""
        response = requests.post(
            f"{BASE_URL}/api/subscription/subscribe",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"plan": "elite"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['plan'] == 'elite'


class TestCancelSubscription:
    """Test cancel subscription endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test"
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_cancel_requires_auth(self):
        """Cancel endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/subscription/cancel")
        assert response.status_code in [401, 403]
    
    def test_cancel_subscription(self, auth_token):
        """Can cancel active subscription"""
        # First subscribe to a plan
        requests.post(
            f"{BASE_URL}/api/subscription/subscribe",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"plan": "profissional"}
        )
        
        # Then cancel
        response = requests.post(
            f"{BASE_URL}/api/subscription/cancel",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert 'message' in data
        assert 'cancelled' in data['message'].lower() or 'cancelada' in data['message'].lower()


class TestPlanLimits:
    """Test plan limits and features"""
    
    def test_essencial_plan_limits(self):
        """Essencial plan has correct limits"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt&region=BR")
        plans = response.json()
        
        essencial = next(p for p in plans if p['id'] == 'essencial')
        assert essencial['max_athletes'] == 25
        assert essencial['history_months'] == 3
        assert essencial['export_pdf'] == False
        assert essencial['export_csv'] == False
        assert essencial['ai_insights'] == False
        assert essencial['trial_days'] == 7
    
    def test_profissional_plan_limits(self):
        """Profissional plan has correct limits"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt&region=BR")
        plans = response.json()
        
        profissional = next(p for p in plans if p['id'] == 'profissional')
        assert profissional['max_athletes'] == 50
        assert profissional['history_months'] == -1  # Unlimited
        assert profissional['export_pdf'] == True
        assert profissional['export_csv'] == True
        assert profissional['advanced_analytics'] == True
        assert profissional['ai_insights'] == False
        assert profissional['fatigue_alerts'] == True
    
    def test_elite_plan_limits(self):
        """Elite plan has correct limits"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt&region=BR")
        plans = response.json()
        
        elite = next(p for p in plans if p['id'] == 'elite')
        assert elite['max_athletes'] == -1  # Unlimited
        assert elite['history_months'] == -1  # Unlimited
        assert elite['export_pdf'] == True
        assert elite['export_csv'] == True
        assert elite['advanced_analytics'] == True
        assert elite['ai_insights'] == True
        assert elite['fatigue_alerts'] == True
        assert elite['multi_user'] == True
        assert elite['max_users'] == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
