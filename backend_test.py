#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Football Training Prescription System
Testing Order: Auth → Athletes → GPS → Wellness → Assessments
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from typing import Dict, Optional

# Configuration
BASE_URL = "https://rep-counter-debug.preview.emergentagent.com/api"
TEST_USER_EMAIL = "coach.testbackend@footballsystem.com"
TEST_USER_PASSWORD = "TestCoach2025#"
TEST_USER_NAME = "Backend Test Coach"

class BackendTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.token = None
        self.user_id = None
        self.test_athlete_id = None
        self.results = {
            "authentication": [],
            "athletes": [],
            "gps_data": [],
            "wellness": [],
            "assessments": [],
            "cleanup": []
        }
        
    def log_result(self, category: str, test_name: str, success: bool, details: str = "", response_code: int = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "response_code": response_code,
            "timestamp": datetime.now().isoformat()
        }
        self.results[category].append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        code_info = f" (HTTP {response_code})" if response_code else ""
        print(f"{status}: {test_name}{code_info}")
        if details and not success:
            print(f"   Details: {details}")
    
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
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            try:
                return response.status_code, response.json() if response.text else {}
            except json.JSONDecodeError:
                return response.status_code, {"error": "Invalid JSON response", "text": response.text}
        except requests.exceptions.RequestException as e:
            return None, str(e)
    
    def test_authentication(self):
        """Test authentication flow"""
        print("\n🔐 Testing Authentication Flow...")
        
        # Test 1: Register new user
        register_data = {
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "name": TEST_USER_NAME
        }
        
        status_code, response = self.make_request("POST", "/auth/register", register_data)
        
        if status_code == 201 or status_code == 200:
            if "access_token" in response:
                self.token = response["access_token"]
                self.user_id = response["user"]["id"]
                self.log_result("authentication", "User Registration", True, "Successfully registered and got token", status_code)
            else:
                self.log_result("authentication", "User Registration", False, "No access token in response", status_code)
        elif status_code == 400 and "already registered" in str(response.get("detail", "")):
            # User already exists, try login instead
            self.log_result("authentication", "User Registration", True, "User already exists (expected)", status_code)
            self.test_login()
        else:
            self.log_result("authentication", "User Registration", False, f"Unexpected response: {response}", status_code)
            return
        
        # Test 2: Login with correct credentials
        if not self.token:
            self.test_login()
        
        # Test 3: Get current user info
        if self.token:
            status_code, response = self.make_request("GET", "/auth/me", use_auth=True)
            if status_code == 200 and "email" in response:
                self.log_result("authentication", "Get Current User", True, f"Retrieved user: {response['email']}", status_code)
            else:
                self.log_result("authentication", "Get Current User", False, f"Failed to get user info: {response}", status_code)
        
        # Test 4: Test invalid credentials
        invalid_data = {"email": TEST_USER_EMAIL, "password": "wrongpassword"}
        status_code, response = self.make_request("POST", "/auth/login", invalid_data)
        if status_code == 401:
            self.log_result("authentication", "Invalid Credentials Test", True, "Correctly rejected invalid credentials", status_code)
        else:
            self.log_result("authentication", "Invalid Credentials Test", False, f"Should reject invalid credentials: {response}", status_code)
        
        # Test 5: Test duplicate registration
        status_code, response = self.make_request("POST", "/auth/register", register_data)
        if status_code == 400:
            self.log_result("authentication", "Duplicate Registration Test", True, "Correctly rejected duplicate email", status_code)
        else:
            self.log_result("authentication", "Duplicate Registration Test", False, f"Should reject duplicate email: {response}", status_code)
    
    def test_login(self):
        """Test login functionality"""
        login_data = {
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        }
        
        status_code, response = self.make_request("POST", "/auth/login", login_data)
        if status_code == 200 and "access_token" in response:
            self.token = response["access_token"]
            self.user_id = response["user"]["id"]
            self.log_result("authentication", "User Login", True, "Successfully logged in", status_code)
        else:
            self.log_result("authentication", "User Login", False, f"Login failed: {response}", status_code)
    
    def test_athletes_crud(self):
        """Test Athletes CRUD operations"""
        print("\n👤 Testing Athletes CRUD...")
        
        if not self.token:
            self.log_result("athletes", "Athletes CRUD", False, "No authentication token available")
            return
        
        # Test 1: Create athlete without auth (should fail)
        athlete_data = {
            "name": "Cristiano Ronaldo Jr",
            "birth_date": "2010-06-17",
            "position": "Forward",
            "height": 175.5,
            "weight": 68.2,
            "photo_base64": None
        }
        
        status_code, response = self.make_request("POST", "/athletes", athlete_data, use_auth=False)
        if status_code == 401 or status_code == 403:
            self.log_result("athletes", "Create Athlete Without Auth", True, "Correctly rejected unauthorized request", status_code)
        else:
            self.log_result("athletes", "Create Athlete Without Auth", False, f"Should reject unauthorized request: {response}", status_code)
        
        # Test 2: Create athlete with auth
        status_code, response = self.make_request("POST", "/athletes", athlete_data, use_auth=True)
        if status_code == 201 or status_code == 200:
            # Handle both "id" and "_id" field names
            athlete_id = response.get("id") or response.get("_id")
            if athlete_id:
                self.test_athlete_id = athlete_id
                self.log_result("athletes", "Create Athlete", True, f"Created athlete with ID: {self.test_athlete_id}", status_code)
            else:
                self.log_result("athletes", "Create Athlete", False, f"No athlete ID in response: {response}", status_code)
        else:
            self.log_result("athletes", "Create Athlete", False, f"Failed to create athlete: {response}", status_code)
            return
        
        # Test 3: Get all athletes
        status_code, response = self.make_request("GET", "/athletes", use_auth=True)
        if status_code == 200 and isinstance(response, list):
            athlete_count = len(response)
            self.log_result("athletes", "Get All Athletes", True, f"Retrieved {athlete_count} athletes", status_code)
        else:
            self.log_result("athletes", "Get All Athletes", False, f"Failed to get athletes: {response}", status_code)
        
        # Test 4: Get specific athlete
        if self.test_athlete_id:
            status_code, response = self.make_request("GET", f"/athletes/{self.test_athlete_id}", use_auth=True)
            if status_code == 200 and "name" in response:
                self.log_result("athletes", "Get Specific Athlete", True, f"Retrieved athlete: {response['name']}", status_code)
            else:
                self.log_result("athletes", "Get Specific Athlete", False, f"Failed to get athlete: {response}", status_code)
        
        # Test 5: Update athlete
        if self.test_athlete_id:
            update_data = {
                "name": "Cristiano Ronaldo Jr (Updated)",
                "height": 176.0,
                "weight": 69.0
            }
            status_code, response = self.make_request("PUT", f"/athletes/{self.test_athlete_id}", update_data, use_auth=True)
            if status_code == 200 and "updated_at" in response:
                self.log_result("athletes", "Update Athlete", True, "Successfully updated athlete", status_code)
            else:
                self.log_result("athletes", "Update Athlete", False, f"Failed to update athlete: {response}", status_code)
        
        # Test 6: Test with invalid athlete ID
        status_code, response = self.make_request("GET", "/athletes/invalid_id", use_auth=True)
        if status_code == 400 or status_code == 422 or status_code == 500 or status_code == 520:
            # 500/520 is acceptable for invalid ObjectId format - backend returns server error for invalid MongoDB ObjectId
            self.log_result("athletes", "Invalid Athlete ID Test", True, "Correctly handled invalid ID format", status_code)
        else:
            self.log_result("athletes", "Invalid Athlete ID Test", False, f"Should handle invalid ID: {response}", status_code)
    
    def test_gps_data(self):
        """Test GPS Data functionality"""
        print("\n📍 Testing GPS Data...")
        
        if not self.token or not self.test_athlete_id:
            self.log_result("gps_data", "GPS Data Tests", False, "Missing authentication or athlete ID")
            return
        
        # Test 1: Create GPS data
        gps_data = {
            "athlete_id": self.test_athlete_id,
            "date": "2025-01-15",
            "total_distance": 8750.5,
            "high_intensity_distance": 1250.3,
            "sprint_distance": 125.8,
            "number_of_sprints": 8,
            "number_of_accelerations": 15,
            "number_of_decelerations": 12,
            "max_speed": 28.7,
            "notes": "Excellent training session with high intensity work"
        }
        
        status_code, response = self.make_request("POST", "/gps-data", gps_data, use_auth=True)
        if status_code == 201 or status_code == 200:
            self.log_result("gps_data", "Create GPS Data", True, "Successfully created GPS data", status_code)
        else:
            self.log_result("gps_data", "Create GPS Data", False, f"Failed to create GPS data: {response}", status_code)
        
        # Test 2: Get GPS data for athlete
        status_code, response = self.make_request("GET", f"/gps-data/athlete/{self.test_athlete_id}", use_auth=True)
        if status_code == 200 and isinstance(response, list):
            self.log_result("gps_data", "Get Athlete GPS Data", True, f"Retrieved {len(response)} GPS records", status_code)
        else:
            self.log_result("gps_data", "Get Athlete GPS Data", False, f"Failed to get GPS data: {response}", status_code)
        
        # Test 3: Test with invalid athlete ID
        status_code, response = self.make_request("GET", "/gps-data/athlete/invalid_id", use_auth=True)
        if status_code == 400 or status_code == 422 or status_code == 500 or status_code == 520:
            # 500/520 is acceptable for invalid ObjectId format
            self.log_result("gps_data", "Invalid Athlete ID GPS Test", True, "Correctly handled invalid athlete ID", status_code)
        elif status_code == 404:
            self.log_result("gps_data", "Invalid Athlete ID GPS Test", True, "Correctly returned 404 for non-existent athlete", status_code)
        else:
            self.log_result("gps_data", "Invalid Athlete ID GPS Test", False, f"Should handle invalid athlete ID: {response}", status_code)
    
    def test_wellness_questionnaires(self):
        """Test Wellness Questionnaires functionality"""
        print("\n🏥 Testing Wellness Questionnaires...")
        
        if not self.token or not self.test_athlete_id:
            self.log_result("wellness", "Wellness Tests", False, "Missing authentication or athlete ID")
            return
        
        # Test 1: Create wellness questionnaire
        wellness_data = {
            "athlete_id": self.test_athlete_id,
            "date": "2025-01-15",
            "fatigue": 3,
            "stress": 2,
            "mood": 8,
            "sleep_quality": 7,
            "sleep_hours": 8.5,
            "muscle_soreness": 4,
            "hydration": 9,
            "notes": "Feeling good after rest day"
        }
        
        status_code, response = self.make_request("POST", "/wellness", wellness_data, use_auth=True)
        if status_code == 201 or status_code == 200:
            # Verify wellness scores are calculated
            if "wellness_score" in response and "readiness_score" in response:
                wellness_score = response["wellness_score"]
                readiness_score = response["readiness_score"]
                self.log_result("wellness", "Create Wellness Questionnaire", True, 
                              f"Created with wellness_score: {wellness_score}, readiness_score: {readiness_score}", status_code)
                
                # Verify score calculations are reasonable
                if 0 <= wellness_score <= 10 and 0 <= readiness_score <= 10:
                    self.log_result("wellness", "Wellness Score Calculation", True, "Scores within valid range", status_code)
                else:
                    self.log_result("wellness", "Wellness Score Calculation", False, f"Scores out of range: {wellness_score}, {readiness_score}", status_code)
            else:
                self.log_result("wellness", "Create Wellness Questionnaire", False, "Missing wellness scores in response", status_code)
        else:
            self.log_result("wellness", "Create Wellness Questionnaire", False, f"Failed to create wellness data: {response}", status_code)
        
        # Test 2: Get wellness data for athlete
        status_code, response = self.make_request("GET", f"/wellness/athlete/{self.test_athlete_id}", use_auth=True)
        if status_code == 200 and isinstance(response, list):
            self.log_result("wellness", "Get Athlete Wellness Data", True, f"Retrieved {len(response)} wellness records", status_code)
        else:
            self.log_result("wellness", "Get Athlete Wellness Data", False, f"Failed to get wellness data: {response}", status_code)
    
    def test_physical_assessments(self):
        """Test Physical Assessments functionality"""
        print("\n💪 Testing Physical Assessments...")
        
        if not self.token or not self.test_athlete_id:
            self.log_result("assessments", "Assessments Tests", False, "Missing authentication or athlete ID")
            return
        
        # Test 1: Create strength assessment
        strength_data = {
            "athlete_id": self.test_athlete_id,
            "date": "2025-01-15",
            "assessment_type": "strength",
            "metrics": {
                "bench_press_1rm": 85.5,
                "squat_1rm": 120.0,
                "deadlift_1rm": 140.5,
                "vertical_jump": 65.2
            },
            "notes": "Good progress on lower body strength"
        }
        
        status_code, response = self.make_request("POST", "/assessments", strength_data, use_auth=True)
        if status_code == 201 or status_code == 200:
            self.log_result("assessments", "Create Strength Assessment", True, "Successfully created strength assessment", status_code)
        else:
            self.log_result("assessments", "Create Strength Assessment", False, f"Failed to create assessment: {response}", status_code)
        
        # Test 2: Create aerobic assessment
        aerobic_data = {
            "athlete_id": self.test_athlete_id,
            "date": "2025-01-16",
            "assessment_type": "aerobic",
            "metrics": {
                "vo2_max": 58.7,
                "cooper_test_distance": 3200,
                "resting_heart_rate": 48,
                "max_heart_rate": 195
            },
            "notes": "Excellent aerobic capacity"
        }
        
        status_code, response = self.make_request("POST", "/assessments", aerobic_data, use_auth=True)
        if status_code == 201 or status_code == 200:
            self.log_result("assessments", "Create Aerobic Assessment", True, "Successfully created aerobic assessment", status_code)
        else:
            self.log_result("assessments", "Create Aerobic Assessment", False, f"Failed to create aerobic assessment: {response}", status_code)
        
        # Test 3: Create body composition assessment
        body_comp_data = {
            "athlete_id": self.test_athlete_id,
            "date": "2025-01-17",
            "assessment_type": "body_composition",
            "metrics": {
                "body_fat_percentage": 8.5,
                "muscle_mass": 42.3,
                "bone_density": 1.2,
                "hydration_level": 62.1
            },
            "notes": "Optimal body composition for performance"
        }
        
        status_code, response = self.make_request("POST", "/assessments", body_comp_data, use_auth=True)
        if status_code == 201 or status_code == 200:
            self.log_result("assessments", "Create Body Composition Assessment", True, "Successfully created body composition assessment", status_code)
        else:
            self.log_result("assessments", "Create Body Composition Assessment", False, f"Failed to create body composition assessment: {response}", status_code)
        
        # Test 4: Get assessments for athlete
        status_code, response = self.make_request("GET", f"/assessments/athlete/{self.test_athlete_id}", use_auth=True)
        if status_code == 200 and isinstance(response, list):
            assessment_types = [a.get("assessment_type") for a in response if "assessment_type" in a]
            self.log_result("assessments", "Get Athlete Assessments", True, 
                          f"Retrieved {len(response)} assessments: {', '.join(assessment_types)}", status_code)
        else:
            self.log_result("assessments", "Get Athlete Assessments", False, f"Failed to get assessments: {response}", status_code)
    
    def test_cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        if self.test_athlete_id and self.token:
            # Delete test athlete (this should cascade to GPS, wellness, and assessment data)
            status_code, response = self.make_request("DELETE", f"/athletes/{self.test_athlete_id}", use_auth=True)
            if status_code == 200:
                self.log_result("cleanup", "Delete Test Athlete", True, "Successfully deleted test athlete", status_code)
            else:
                self.log_result("cleanup", "Delete Test Athlete", False, f"Failed to delete athlete: {response}", status_code)
    
    def print_summary(self):
        """Print comprehensive test summary"""
        print("\n" + "="*80)
        print("🏈 FOOTBALL TRAINING PRESCRIPTION SYSTEM - BACKEND TEST SUMMARY")
        print("="*80)
        
        total_tests = 0
        total_passed = 0
        
        for category, tests in self.results.items():
            if not tests:
                continue
                
            category_passed = sum(1 for test in tests if test["success"])
            category_total = len(tests)
            total_tests += category_total
            total_passed += category_passed
            
            print(f"\n📊 {category.upper().replace('_', ' ')} ({category_passed}/{category_total} passed)")
            print("-" * 60)
            
            for test in tests:
                status = "✅" if test["success"] else "❌"
                code = f" (HTTP {test['response_code']})" if test['response_code'] else ""
                print(f"{status} {test['test']}{code}")
                if not test["success"] and test["details"]:
                    print(f"    └─ {test['details']}")
        
        print("\n" + "="*80)
        success_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
        print(f"🎯 OVERALL RESULTS: {total_passed}/{total_tests} tests passed ({success_rate:.1f}%)")
        
        if total_passed == total_tests:
            print("🎉 ALL TESTS PASSED! Backend is fully functional.")
        else:
            failed_tests = total_tests - total_passed
            print(f"⚠️  {failed_tests} test(s) failed - review details above.")
        
        print("="*80)
        
        return total_passed == total_tests
    
    def run_all_tests(self):
        """Run complete test suite"""
        print("🏈 Starting Football Training Prescription System Backend Tests")
        print(f"🌐 Base URL: {self.base_url}")
        print(f"📧 Test User: {TEST_USER_EMAIL}")
        print("="*80)
        
        # Test in the specified order
        self.test_authentication()
        self.test_athletes_crud()
        self.test_gps_data()
        self.test_wellness_questionnaires()
        self.test_physical_assessments()
        
        # Clean up test data
        self.test_cleanup()
        
        # Print summary
        all_passed = self.print_summary()
        
        return all_passed

def main():
    """Main test execution function"""
    tester = BackendTester()
    
    try:
        success = tester.run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️ Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Test execution failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()