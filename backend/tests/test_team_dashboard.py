"""
Test Team Dashboard and Strength Analysis with Fatigue Index Calculation
Tests P1/P2 features: Team Dashboard, Fatigue Index auto-calculation, Subscription plans
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://periodization-gps.preview.emergentagent.com')

class TestTeamDashboard:
    """Team Dashboard endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.athlete_id = "69862b75fc9efff29476e3ce"
    
    def test_team_dashboard_returns_stats(self):
        """Test /api/dashboard/team returns aggregated stats"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team?lang=pt", headers=self.headers)
        assert response.status_code == 200, f"Team dashboard failed: {response.text}"
        
        data = response.json()
        
        # Verify stats structure
        assert "stats" in data
        stats = data["stats"]
        assert "total_athletes" in stats
        assert "athletes_high_risk" in stats
        assert "athletes_optimal" in stats
        assert "athletes_fatigued" in stats
        assert "team_avg_acwr" in stats
        assert "team_avg_wellness" in stats
        assert "team_avg_fatigue" in stats
        assert "sessions_this_week" in stats
        assert "total_distance_this_week" in stats
        
        # Verify data types
        assert isinstance(stats["total_athletes"], int)
        assert isinstance(stats["team_avg_acwr"], (int, float))
        assert isinstance(stats["team_avg_fatigue"], (int, float))
        
        print(f"✓ Team stats: {stats['total_athletes']} athletes, avg ACWR: {stats['team_avg_acwr']}")
    
    def test_team_dashboard_returns_athletes_list(self):
        """Test /api/dashboard/team returns list of athletes with status"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team?lang=pt", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "athletes" in data
        athletes = data["athletes"]
        
        assert isinstance(athletes, list)
        if len(athletes) > 0:
            athlete = athletes[0]
            assert "id" in athlete
            assert "name" in athlete
            assert "position" in athlete
            assert "acwr" in athlete
            assert "risk_level" in athlete
            assert "fatigue_score" in athlete
            assert "injury_risk" in athlete
            assert "peripheral_fatigue" in athlete
            
            print(f"✓ First athlete: {athlete['name']}, ACWR: {athlete['acwr']}, Risk: {athlete['risk_level']}")
    
    def test_team_dashboard_returns_risk_distribution(self):
        """Test /api/dashboard/team returns risk distribution"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team?lang=pt", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "risk_distribution" in data
        risk_dist = data["risk_distribution"]
        
        # Verify all risk levels are present
        assert "low" in risk_dist
        assert "optimal" in risk_dist
        assert "moderate" in risk_dist
        assert "high" in risk_dist
        assert "unknown" in risk_dist
        
        print(f"✓ Risk distribution: {risk_dist}")
    
    def test_team_dashboard_returns_alerts(self):
        """Test /api/dashboard/team returns alerts"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team?lang=pt", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "alerts" in data
        alerts = data["alerts"]
        
        assert isinstance(alerts, list)
        print(f"✓ Alerts count: {len(alerts)}")
        for alert in alerts[:3]:
            print(f"  - {alert}")
    
    def test_team_dashboard_english_language(self):
        """Test /api/dashboard/team with English language"""
        response = requests.get(f"{BASE_URL}/api/dashboard/team?lang=en", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "stats" in data
        assert "athletes" in data
        print("✓ English language response works")


class TestStrengthAnalysisFatigueIndex:
    """Strength Analysis with automatic fatigue_index calculation tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test"
        })
        assert response.status_code == 200
        data = response.json()
        self.token = data["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.athlete_id = "69862b75fc9efff29476e3ce"
    
    def test_strength_analysis_returns_fatigue_index(self):
        """Test /api/analysis/strength returns fatigue_index"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{self.athlete_id}?lang=pt", 
            headers=self.headers
        )
        assert response.status_code == 200, f"Strength analysis failed: {response.text}"
        
        data = response.json()
        
        # Verify fatigue_index is present
        assert "fatigue_index" in data
        assert isinstance(data["fatigue_index"], (int, float))
        
        # Verify fatigue_alert
        assert "fatigue_alert" in data
        assert isinstance(data["fatigue_alert"], bool)
        
        # Verify peripheral_fatigue_detected
        assert "peripheral_fatigue_detected" in data
        
        print(f"✓ Fatigue index: {data['fatigue_index']}%, Alert: {data['fatigue_alert']}")
    
    def test_fatigue_index_auto_calculation_power_drop_30_percent(self):
        """Test fatigue_index is automatically calculated when power_drop > 30%"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{self.athlete_id}?lang=pt", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify historical_trend contains power_drop
        assert "historical_trend" in data
        trend = data["historical_trend"]
        assert "power_drop_percent" in trend
        
        power_drop = trend["power_drop_percent"]
        fatigue_index = data["fatigue_index"]
        
        # According to the logic: power_drop > 30% => fatigue_index > 80%
        if power_drop > 30:
            assert fatigue_index >= 80, f"Expected fatigue_index >= 80 for power_drop {power_drop}%, got {fatigue_index}%"
            print(f"✓ Power drop {power_drop}% => Fatigue index {fatigue_index}% (correctly > 80%)")
        elif power_drop >= 20:
            assert fatigue_index >= 70, f"Expected fatigue_index >= 70 for power_drop {power_drop}%, got {fatigue_index}%"
            print(f"✓ Power drop {power_drop}% => Fatigue index {fatigue_index}% (correctly >= 70%)")
        else:
            print(f"✓ Power drop {power_drop}% => Fatigue index {fatigue_index}%")
    
    def test_strength_analysis_returns_metrics(self):
        """Test /api/analysis/strength returns all metrics"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{self.athlete_id}?lang=pt", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify metrics array
        assert "metrics" in data
        metrics = data["metrics"]
        assert isinstance(metrics, list)
        assert len(metrics) > 0
        
        # Verify each metric has required fields
        for metric in metrics:
            assert "name" in metric
            assert "value" in metric
            assert "unit" in metric
            assert "classification" in metric
            
        print(f"✓ Metrics count: {len(metrics)}")
    
    def test_strength_analysis_returns_recommendations(self):
        """Test /api/analysis/strength returns recommendations"""
        response = requests.get(
            f"{BASE_URL}/api/analysis/strength/{self.athlete_id}?lang=pt", 
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        assert "recommendations" in data
        recommendations = data["recommendations"]
        assert isinstance(recommendations, list)
        
        print(f"✓ Recommendations count: {len(recommendations)}")
        for rec in recommendations[:2]:
            print(f"  - {rec[:80]}...")


class TestSubscriptionPlans:
    """Subscription plans API tests"""
    
    def test_subscription_plans_br_region(self):
        """Test /api/subscription/plans returns BRL pricing for BR region"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt&region=BR")
        assert response.status_code == 200
        
        plans = response.json()
        assert isinstance(plans, list)
        assert len(plans) == 3  # Essencial, Profissional, Elite
        
        # Verify BRL pricing
        essencial = next(p for p in plans if p["id"] == "essencial")
        profissional = next(p for p in plans if p["id"] == "profissional")
        elite = next(p for p in plans if p["id"] == "elite")
        
        assert essencial["price"] == 39.90
        assert essencial["currency"] == "BRL"
        assert "R$" in essencial["price_formatted"]
        
        assert profissional["price"] == 89.90
        assert profissional["currency"] == "BRL"
        
        assert elite["price"] == 159.90
        assert elite["currency"] == "BRL"
        
        print(f"✓ BR Plans: Essencial R${essencial['price']}, Profissional R${profissional['price']}, Elite R${elite['price']}")
    
    def test_subscription_plans_us_region(self):
        """Test /api/subscription/plans returns USD pricing for US region"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=en&region=US")
        assert response.status_code == 200
        
        plans = response.json()
        assert len(plans) == 3
        
        # Verify USD pricing
        essencial = next(p for p in plans if p["id"] == "essencial")
        profissional = next(p for p in plans if p["id"] == "profissional")
        elite = next(p for p in plans if p["id"] == "elite")
        
        assert essencial["price"] == 7.99
        assert essencial["currency"] == "USD"
        assert "$" in essencial["price_formatted"]
        
        assert profissional["price"] == 17.99
        assert profissional["currency"] == "USD"
        
        assert elite["price"] == 29.99
        assert elite["currency"] == "USD"
        
        print(f"✓ US Plans: Essential ${essencial['price']}, Professional ${profissional['price']}, Elite ${elite['price']}")
    
    def test_subscription_plans_features(self):
        """Test subscription plans have correct features"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans?lang=pt&region=BR")
        assert response.status_code == 200
        
        plans = response.json()
        
        essencial = next(p for p in plans if p["id"] == "essencial")
        profissional = next(p for p in plans if p["id"] == "profissional")
        elite = next(p for p in plans if p["id"] == "elite")
        
        # Essencial limitations
        assert essencial["export_pdf"] == False
        assert essencial["ai_insights"] == False
        assert essencial["max_athletes"] == 25
        
        # Profissional features
        assert profissional["export_pdf"] == True
        assert profissional["advanced_analytics"] == True
        assert profissional["max_athletes"] == 50
        assert profissional["popular"] == True
        
        # Elite features
        assert elite["ai_insights"] == True
        assert elite["multi_user"] == True
        assert elite["max_athletes"] == -1  # Unlimited
        
        print("✓ Plan features verified correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
