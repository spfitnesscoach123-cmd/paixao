#!/usr/bin/env python3
"""
Additional Backend API Testing for Analysis Endpoints
Testing the specific endpoints mentioned in the user request
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://barbell-velocity-ai.preview.emergentagent.com/api"
TEST_USER_EMAIL = "coach_test@test.com"
TEST_USER_PASSWORD = "test123456"
TEST_USER_NAME = "Coach Test"

class AnalysisEndpointTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.token = None
        self.user_id = None
        self.test_athlete_id = None
        
    def make_request(self, method: str, endpoint: str, data: dict = None, use_auth: bool = False) -> tuple:
        """Make HTTP request with optional authentication"""
        url = f"{self.base_url}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if use_auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        
        try:
            if method == "GET":
                response = self.session.get(url, headers=headers, timeout=30)
            elif method == "POST":
                response = self.session.post(url, json=data, headers=headers, timeout=30)
            elif method == "PUT":
                response = self.session.put(url, json=data, headers=headers, timeout=30)
            elif method == "DELETE":
                response = self.session.delete(url, headers=headers, timeout=30)
            
            try:
                return response.status_code, response.json() if response.text else {}
            except json.JSONDecodeError:
                return response.status_code, {"error": "Invalid JSON response", "text": response.text}
        except requests.exceptions.RequestException as e:
            return None, str(e)
    
    def authenticate_and_setup(self):
        """Authenticate and create test data"""
        print("🔐 Authenticating and setting up test data...")
        
        # Register/Login
        register_data = {
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "name": TEST_USER_NAME
        }
        
        # Try to register (might already exist)
        status_code, response = self.make_request("POST", "/auth/register", register_data)
        
        if status_code == 400:  # User exists, login instead
            login_data = {"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
            status_code, response = self.make_request("POST", "/auth/login", login_data)
        
        if "access_token" in response:
            self.token = response["access_token"]
            self.user_id = response["user"]["id"]
            print(f"✅ Authenticated as {response['user']['email']}")
        else:
            print("❌ Failed to authenticate")
            return False
        
        # Create test athlete
        athlete_data = {
            "name": "Jogador Teste",
            "birth_date": "2000-01-15",
            "position": "Atacante"
        }
        
        status_code, response = self.make_request("POST", "/athletes", athlete_data, use_auth=True)
        if status_code in [200, 201]:
            self.test_athlete_id = response.get("id") or response.get("_id")
            print(f"✅ Created test athlete: {self.test_athlete_id}")
            return True
        else:
            print(f"❌ Failed to create athlete: {response}")
            return False
    
    def test_analysis_endpoints(self):
        """Test the analysis endpoints as specified in user request"""
        print("\n📊 Testing Analysis Endpoints...")
        
        if not self.test_athlete_id:
            print("❌ No test athlete available")
            return
        
        # Test ACWR Analysis (should return error for insufficient data - expected)
        print("\nTesting ACWR Analysis:")
        status_code, response = self.make_request("GET", f"/analysis/acwr/{self.test_athlete_id}", use_auth=True)
        if status_code == 400:
            print(f"✅ ACWR Analysis - Expected error for insufficient data (HTTP {status_code})")
            print(f"   Response: {response.get('detail', 'Unknown error')}")
        else:
            print(f"⚠️ ACWR Analysis - Unexpected response (HTTP {status_code}): {response}")
        
        # Test Fatigue Analysis (should return error for insufficient data - expected)  
        print("\nTesting Fatigue Analysis:")
        status_code, response = self.make_request("GET", f"/analysis/fatigue/{self.test_athlete_id}", use_auth=True)
        if status_code == 400:
            print(f"✅ Fatigue Analysis - Expected error for insufficient data (HTTP {status_code})")
            print(f"   Response: {response.get('detail', 'Unknown error')}")
        else:
            print(f"⚠️ Fatigue Analysis - Unexpected response (HTTP {status_code}): {response}")
        
        # Test Comprehensive Analysis
        print("\nTesting Comprehensive Analysis:")
        status_code, response = self.make_request("GET", f"/analysis/comprehensive/{self.test_athlete_id}", use_auth=True)
        if status_code == 200:
            print(f"✅ Comprehensive Analysis - Success (HTTP {status_code})")
            print(f"   Athlete: {response.get('athlete_name', 'N/A')}")
            print(f"   Analysis Date: {response.get('analysis_date', 'N/A')}")
            print(f"   ACWR Available: {response.get('acwr') is not None}")
            print(f"   Fatigue Available: {response.get('fatigue') is not None}")
            print(f"   AI Insights Available: {response.get('ai_insights') is not None}")
        else:
            print(f"❌ Comprehensive Analysis - Failed (HTTP {status_code}): {response}")
    
    def test_complete_scenario(self):
        """Test the complete scenario as specified in the user request"""
        print("\n🏈 Testing Complete Scenario with Data...")
        
        if not self.test_athlete_id:
            print("❌ No test athlete available")
            return
        
        # Add GPS data
        print("Adding GPS data...")
        gps_data = {
            "athlete_id": self.test_athlete_id,
            "date": "2025-01-15",
            "total_distance": 8500.0,
            "high_intensity_distance": 1200.0,
            "sprint_distance": 150.0,
            "number_of_sprints": 12,
            "number_of_accelerations": 25,
            "number_of_decelerations": 20,
            "max_speed": 32.5,
            "notes": "High intensity training session"
        }
        
        status_code, response = self.make_request("POST", "/gps-data", gps_data, use_auth=True)
        if status_code in [200, 201]:
            print("✅ GPS data added successfully")
        else:
            print(f"❌ Failed to add GPS data: {response}")
        
        # Add wellness questionnaire
        print("Adding wellness questionnaire...")
        wellness_data = {
            "athlete_id": self.test_athlete_id,
            "date": "2025-01-15",
            "fatigue": 4,
            "stress": 3,
            "mood": 8,
            "sleep_quality": 7,
            "sleep_hours": 8.0,
            "muscle_soreness": 5,
            "hydration": 8,
            "notes": "Feeling good overall"
        }
        
        status_code, response = self.make_request("POST", "/wellness", wellness_data, use_auth=True)
        if status_code in [200, 201]:
            print(f"✅ Wellness questionnaire added - Wellness Score: {response.get('wellness_score', 'N/A')}, Readiness Score: {response.get('readiness_score', 'N/A')}")
        else:
            print(f"❌ Failed to add wellness data: {response}")
        
        # Test analysis endpoints again after adding data
        print("\nRe-testing analysis endpoints with data:")
        
        # Test comprehensive analysis again
        status_code, response = self.make_request("GET", f"/analysis/comprehensive/{self.test_athlete_id}", use_auth=True)
        if status_code == 200:
            print(f"✅ Comprehensive Analysis with data - Success (HTTP {status_code})")
            if response.get('ai_insights'):
                insights = response['ai_insights']
                print(f"   AI Summary: {insights.get('summary', 'N/A')[:100]}...")
                print(f"   Strengths: {len(insights.get('strengths', []))} identified")
                print(f"   Concerns: {len(insights.get('concerns', []))} identified")
                print(f"   Recommendations: {len(insights.get('recommendations', []))} provided")
        else:
            print(f"❌ Comprehensive Analysis with data - Failed (HTTP {status_code}): {response}")
    
    def cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up...")
        if self.test_athlete_id:
            status_code, response = self.make_request("DELETE", f"/athletes/{self.test_athlete_id}", use_auth=True)
            if status_code == 200:
                print("✅ Test athlete deleted successfully")
            else:
                print(f"❌ Failed to delete test athlete: {response}")
    
    def run_tests(self):
        """Run all tests"""
        print("🏈 Testing Additional Backend Analysis Endpoints")
        print(f"🌐 Base URL: {self.base_url}")
        print("="*80)
        
        if not self.authenticate_and_setup():
            return False
        
        self.test_analysis_endpoints()
        self.test_complete_scenario()
        self.cleanup()
        
        print("\n" + "="*80)
        print("🎯 Analysis Endpoint Testing Complete")
        print("="*80)
        return True

def main():
    """Main test execution"""
    tester = AnalysisEndpointTester()
    
    try:
        success = tester.run_tests()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test execution failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()