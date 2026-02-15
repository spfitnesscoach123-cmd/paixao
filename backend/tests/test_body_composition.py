"""
Body Composition API Tests
Tests for the new Body Composition feature including:
- Protocol retrieval
- Body composition creation with different protocols
- Calculation verification (body_fat_percentage, lean_mass_kg, fat_mass_kg, bone_mass_kg, bmi)
- CRUD operations
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://vbt-fix-verify.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "password"
TEST_ATHLETE_ID = "69862b75fc9efff29476e3ce"


class TestBodyCompositionAPI:
    """Body Composition API endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    def test_get_protocols(self):
        """Test GET /api/body-composition/protocols - should return all available protocols"""
        response = self.session.get(f"{BASE_URL}/api/body-composition/protocols")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify all expected protocols are present
        expected_protocols = ["guedes", "pollock_jackson_7", "pollock_jackson_9", "faulkner_4"]
        for protocol in expected_protocols:
            assert protocol in data, f"Protocol {protocol} not found in response"
        
        # Verify protocol structure
        guedes = data["guedes"]
        assert "name" in guedes
        assert "name_en" in guedes
        assert "description_pt" in guedes
        assert "description_en" in guedes
        assert "sites_count" in guedes
        
        # Verify Guedes has gender-specific sites
        assert "sites_male" in guedes
        assert "sites_female" in guedes
        assert guedes["sites_count"] == 3
        
        # Verify Pollock Jackson 7 has 7 sites
        pj7 = data["pollock_jackson_7"]
        assert pj7["sites_count"] == 7
        assert "sites" in pj7
        assert len(pj7["sites"]) == 7
        
        # Verify Faulkner 4 has 4 sites
        f4 = data["faulkner_4"]
        assert f4["sites_count"] == 4
        
        print(f"✓ All {len(expected_protocols)} protocols returned correctly")
    
    def test_create_body_composition_guedes_male(self):
        """Test POST /api/body-composition with Guedes protocol for male"""
        payload = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "guedes",
            "weight": 75.0,
            "height": 178.0,
            "age": 25,
            "gender": "male",
            "triceps": 10.0,
            "suprailiac": 12.0,
            "abdominal": 15.0,
            "notes": "Test Guedes male assessment"
        }
        
        response = self.session.post(f"{BASE_URL}/api/body-composition", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all calculated fields are present
        assert "body_fat_percentage" in data, "body_fat_percentage not in response"
        assert "lean_mass_kg" in data, "lean_mass_kg not in response"
        assert "fat_mass_kg" in data, "fat_mass_kg not in response"
        assert "bone_mass_kg" in data, "bone_mass_kg not in response"
        assert "bmi" in data, "bmi not in response"
        assert "bmi_classification" in data, "bmi_classification not in response"
        
        # Verify calculations are reasonable
        assert 3 <= data["body_fat_percentage"] <= 60, f"Body fat {data['body_fat_percentage']}% out of range"
        assert data["lean_mass_kg"] > 0, "Lean mass should be positive"
        assert data["fat_mass_kg"] > 0, "Fat mass should be positive"
        assert data["bone_mass_kg"] > 0, "Bone mass should be positive"
        
        # Verify mass calculations add up
        total_mass = data["lean_mass_kg"] + data["fat_mass_kg"]
        assert abs(total_mass - payload["weight"]) < 0.1, f"Mass doesn't add up: {total_mass} vs {payload['weight']}"
        
        # Verify BMI calculation
        expected_bmi = payload["weight"] / ((payload["height"] / 100) ** 2)
        assert abs(data["bmi"] - expected_bmi) < 0.1, f"BMI mismatch: {data['bmi']} vs {expected_bmi}"
        
        # Store ID for cleanup (API returns _id)
        self.created_id = data.get("id") or data.get("_id")
        
        print(f"✓ Guedes male: BF={data['body_fat_percentage']:.1f}%, Lean={data['lean_mass_kg']:.1f}kg, Fat={data['fat_mass_kg']:.1f}kg, BMI={data['bmi']:.1f}")
        
        # Cleanup
        if self.created_id:
            self.session.delete(f"{BASE_URL}/api/body-composition/{self.created_id}")
    
    def test_create_body_composition_pollock_jackson_7(self):
        """Test POST /api/body-composition with Pollock & Jackson 7 protocol"""
        payload = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "pollock_jackson_7",
            "weight": 80.0,
            "height": 180.0,
            "age": 30,
            "gender": "male",
            "chest": 8.0,
            "midaxillary": 10.0,
            "triceps": 9.0,
            "subscapular": 12.0,
            "abdominal": 18.0,
            "suprailiac": 14.0,
            "thigh": 15.0,
            "notes": "Test PJ7 assessment"
        }
        
        response = self.session.post(f"{BASE_URL}/api/body-composition", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all calculated fields
        assert "body_fat_percentage" in data
        assert "lean_mass_kg" in data
        assert "fat_mass_kg" in data
        assert "bone_mass_kg" in data
        assert "bmi" in data
        assert "body_density" in data  # PJ7 uses density calculation
        
        # Verify body density is reasonable (typically 1.0 - 1.1 g/cm³)
        if data["body_density"]:
            assert 1.0 <= data["body_density"] <= 1.1, f"Body density {data['body_density']} out of range"
        
        # Verify fat distribution is calculated
        assert "fat_distribution" in data
        if data["fat_distribution"]:
            assert "upper_arm" in data["fat_distribution"]
            assert "trunk_front" in data["fat_distribution"]
        
        print(f"✓ PJ7: BF={data['body_fat_percentage']:.1f}%, Density={data.get('body_density', 'N/A')}")
        
        # Cleanup (API returns _id)
        comp_id = data.get("id") or data.get("_id")
        if comp_id:
            self.session.delete(f"{BASE_URL}/api/body-composition/{comp_id}")
    
    def test_create_body_composition_faulkner_4(self):
        """Test POST /api/body-composition with Faulkner 4 protocol"""
        payload = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "faulkner_4",
            "weight": 70.0,
            "height": 175.0,
            "age": 22,
            "gender": "female",
            "triceps": 12.0,
            "subscapular": 10.0,
            "suprailiac": 14.0,
            "abdominal": 16.0,
            "notes": "Test Faulkner 4 assessment"
        }
        
        response = self.session.post(f"{BASE_URL}/api/body-composition", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Faulkner calculates body fat directly (not via density)
        assert "body_fat_percentage" in data
        assert data["body_density"] is None, "Faulkner should not have body_density"
        
        # Verify Faulkner formula: %BF = (sum_4 * 0.153) + 5.783
        sum_4 = 12.0 + 10.0 + 14.0 + 16.0  # 52
        expected_bf = (sum_4 * 0.153) + 5.783  # ~13.74%
        assert abs(data["body_fat_percentage"] - expected_bf) < 0.5, f"Faulkner BF mismatch: {data['body_fat_percentage']} vs {expected_bf}"
        
        print(f"✓ Faulkner 4: BF={data['body_fat_percentage']:.1f}% (expected ~{expected_bf:.1f}%)")
        
        # Cleanup (API returns _id)
        comp_id = data.get("id") or data.get("_id")
        if comp_id:
            self.session.delete(f"{BASE_URL}/api/body-composition/{comp_id}")
    
    def test_get_athlete_body_compositions(self):
        """Test GET /api/body-composition/athlete/{athlete_id}"""
        # First create a body composition
        payload = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "guedes",
            "weight": 75.0,
            "height": 178.0,
            "age": 25,
            "gender": "male",
            "triceps": 10.0,
            "suprailiac": 12.0,
            "abdominal": 15.0,
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/body-composition", json=payload)
        assert create_response.status_code == 200
        # API returns _id instead of id
        created_id = create_response.json().get("id") or create_response.json().get("_id")
        
        # Get all body compositions for athlete
        response = self.session.get(f"{BASE_URL}/api/body-composition/athlete/{TEST_ATHLETE_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify the created composition is in the list (check both id and _id)
        found = any((bc.get("id") == created_id or bc.get("_id") == created_id) for bc in data)
        assert found, "Created body composition not found in list"
        
        print(f"✓ Retrieved {len(data)} body composition(s) for athlete")
        
        # Cleanup
        if created_id:
            self.session.delete(f"{BASE_URL}/api/body-composition/{created_id}")
    
    def test_delete_body_composition(self):
        """Test DELETE /api/body-composition/{composition_id}"""
        # Create a body composition to delete
        payload = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "guedes",
            "weight": 75.0,
            "height": 178.0,
            "age": 25,
            "gender": "male",
            "triceps": 10.0,
            "suprailiac": 12.0,
            "abdominal": 15.0,
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/body-composition", json=payload)
        assert create_response.status_code == 200
        # API returns _id instead of id
        created_id = create_response.json().get("id") or create_response.json().get("_id")
        assert created_id, "No ID returned from create"
        
        # Delete the body composition
        delete_response = self.session.delete(f"{BASE_URL}/api/body-composition/{created_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        # Verify it's deleted by trying to get it
        get_response = self.session.get(f"{BASE_URL}/api/body-composition/{created_id}")
        assert get_response.status_code == 404, "Deleted composition should return 404"
        
        print(f"✓ Body composition deleted successfully")
    
    def test_bmi_classification(self):
        """Test BMI classification for different weight/height combinations"""
        test_cases = [
            {"weight": 50.0, "height": 175.0, "expected_class": "underweight"},  # BMI ~16.3
            {"weight": 70.0, "height": 175.0, "expected_class": "normal"},  # BMI ~22.9
            {"weight": 85.0, "height": 175.0, "expected_class": "overweight"},  # BMI ~27.8
            {"weight": 100.0, "height": 175.0, "expected_class": "obese_class_1"},  # BMI ~32.7
        ]
        
        for tc in test_cases:
            payload = {
                "athlete_id": TEST_ATHLETE_ID,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "protocol": "guedes",
                "weight": tc["weight"],
                "height": tc["height"],
                "age": 25,
                "gender": "male",
                "triceps": 10.0,
                "suprailiac": 12.0,
                "abdominal": 15.0,
            }
            
            response = self.session.post(f"{BASE_URL}/api/body-composition", json=payload)
            assert response.status_code == 200
            
            data = response.json()
            assert data["bmi_classification"] == tc["expected_class"], \
                f"BMI {data['bmi']:.1f} should be {tc['expected_class']}, got {data['bmi_classification']}"
            
            print(f"✓ BMI {data['bmi']:.1f} classified as {data['bmi_classification']}")
            
            # Cleanup (API returns _id)
            comp_id = data.get("id") or data.get("_id")
            if comp_id:
                self.session.delete(f"{BASE_URL}/api/body-composition/{comp_id}")
    
    def test_invalid_athlete_id(self):
        """Test creating body composition with invalid athlete ID"""
        payload = {
            "athlete_id": "000000000000000000000000",  # Invalid ID
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "guedes",
            "weight": 75.0,
            "height": 178.0,
            "age": 25,
            "gender": "male",
            "triceps": 10.0,
            "suprailiac": 12.0,
            "abdominal": 15.0,
        }
        
        response = self.session.post(f"{BASE_URL}/api/body-composition", json=payload)
        assert response.status_code == 404, f"Expected 404 for invalid athlete, got {response.status_code}"
        
        print("✓ Invalid athlete ID correctly returns 404")


class TestBodyCompositionCalculations:
    """Test body composition calculation accuracy"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_lean_mass_fat_mass_sum(self):
        """Verify lean_mass + fat_mass = total weight"""
        payload = {
            "athlete_id": TEST_ATHLETE_ID,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "protocol": "pollock_jackson_7",
            "weight": 82.5,
            "height": 182.0,
            "age": 28,
            "gender": "male",
            "chest": 9.0,
            "midaxillary": 11.0,
            "triceps": 10.0,
            "subscapular": 13.0,
            "abdominal": 20.0,
            "suprailiac": 15.0,
            "thigh": 16.0,
        }
        
        response = self.session.post(f"{BASE_URL}/api/body-composition", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify mass calculations
        total_calculated = data["lean_mass_kg"] + data["fat_mass_kg"]
        assert abs(total_calculated - payload["weight"]) < 0.01, \
            f"Mass sum {total_calculated} doesn't match weight {payload['weight']}"
        
        # Verify fat mass matches body fat percentage
        expected_fat_mass = payload["weight"] * (data["body_fat_percentage"] / 100)
        assert abs(data["fat_mass_kg"] - expected_fat_mass) < 0.01, \
            f"Fat mass {data['fat_mass_kg']} doesn't match expected {expected_fat_mass}"
        
        print(f"✓ Mass calculations verified: {data['lean_mass_kg']:.1f} + {data['fat_mass_kg']:.1f} = {total_calculated:.1f}kg")
        
        # Cleanup (API returns _id)
        comp_id = data.get("id") or data.get("_id")
        if comp_id:
            self.session.delete(f"{BASE_URL}/api/body-composition/{comp_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
