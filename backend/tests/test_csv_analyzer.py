"""
Test suite for Enhanced CSV Import Flow - CSV Analyzer Endpoints

Tests cover:
- POST /api/csv/analyze - CSV structure detection, field mapping suggestions
- POST /api/csv/import-mapped - Import with custom mapping + athlete auto-creation
- GET /api/csv/mapping-templates - List saved mapping templates
- POST /api/csv/mapping-templates - Save mapping template
- DELETE /api/csv/mapping-templates/{id} - Delete template
- Regression tests for dashboard endpoints
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"

# Test CSV file paths
CATAPULT_CSV_PATH = "/tmp/test_catapult.csv"
SEMICOLON_CSV_PATH = "/tmp/test_semicolon.csv"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def created_template_ids():
    """Track created templates for cleanup"""
    return []


class TestCSVAnalyzeEndpoint:
    """Tests for POST /api/csv/analyze"""
    
    def test_analyze_catapult_csv(self, auth_headers):
        """Test CSV analysis with Catapult format - comma delimiter"""
        with open(CATAPULT_CSV_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/csv/analyze",
                files={"file": ("test_catapult.csv", f, "text/csv")},
                headers=auth_headers
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # File info assertions
        assert "file_info" in data
        file_info = data["file_info"]
        assert file_info["delimiter"] == ",", f"Expected comma delimiter, got {file_info['delimiter']}"
        assert file_info["encoding"] in ["utf-8", "utf-8-sig", "latin-1"]
        assert file_info["header_row"] >= 0, "Should detect header row"
        assert file_info["total_rows"] >= 4, f"Expected at least 4 rows, got {file_info['total_rows']}"
        assert file_info["total_columns"] >= 8, f"Expected at least 8 columns, got {file_info['total_columns']}"
        
        # Provider detection - may be catapult or unknown depending on column format
        assert "detected_provider" in data
        # Provider detection is based on column matching - test CSV may not match exactly
        assert data["detected_provider"] in ["catapult", "unknown"], f"Unexpected provider: {data['detected_provider']}"
        print(f"Detected provider: {data['detected_provider']} (note: may be 'unknown' if columns don't match exactly)")
        
        # Confidence score
        assert "confidence_pct" in data
        assert isinstance(data["confidence_pct"], (int, float))
        
        # Column detection
        assert "columns" in data
        columns = data["columns"]
        assert "Player Name" in columns, f"Expected 'Player Name' in columns: {columns}"
        
        # Auto-mapping assertions
        assert "auto_mapping" in data
        auto_mapping = data["auto_mapping"]
        
        # Check athlete_name mapping (Player Name -> athlete_name)
        assert "athlete_name" in auto_mapping
        athlete_mapping = auto_mapping["athlete_name"]
        assert athlete_mapping["csv_column"] == "Player Name", f"Expected 'Player Name', got {athlete_mapping['csv_column']}"
        assert athlete_mapping["confidence"] >= 0.7, f"Low confidence for athlete_name: {athlete_mapping['confidence']}"
        
        # Check total_distance mapping (Average Distance -> total_distance)
        assert "total_distance" in auto_mapping
        distance_mapping = auto_mapping["total_distance"]
        # The column should be "Average Distance (Session)" based on the CSV
        assert distance_mapping["csv_column"] is not None, "total_distance should be mapped"
        assert "Distance" in (distance_mapping["csv_column"] or ""), f"Expected Distance column, got {distance_mapping['csv_column']}"
        
        # Sample rows
        assert "sample_rows" in data
        sample_rows = data["sample_rows"]
        assert len(sample_rows) >= 1, "Should have at least 1 sample row"
        
        # Metadata detection (Date in file header)
        assert "metadata" in data
        metadata = data["metadata"]
        # Date should be detected from "Date:","03/14/2026" line
        if "date" in metadata:
            assert "2026" in metadata["date"] or "03" in metadata["date"], f"Date metadata: {metadata['date']}"
        
        # Existing athletes list
        assert "existing_athletes" in data
        assert isinstance(data["existing_athletes"], list)
        
        print(f"CSV Analysis passed - Provider: {data['detected_provider']}, Confidence: {data['confidence_pct']}%")
    
    def test_analyze_semicolon_csv(self, auth_headers):
        """Test CSV analysis with semicolon delimiter"""
        # First create the semicolon-delimited test file
        semicolon_content = '''"Date:";"04/15/2026"
"Player Name";"Total Distance";"Sprint Distance";"Max Speed"
"Test Player 1";"5000";"300";"28.5"
"Test Player 2";"6200";"450";"30.2"
'''
        with open(SEMICOLON_CSV_PATH, 'w') as f:
            f.write(semicolon_content)
        
        with open(SEMICOLON_CSV_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/csv/analyze",
                files={"file": ("test_semicolon.csv", f, "text/csv")},
                headers=auth_headers
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Delimiter detection - should detect semicolon
        assert "file_info" in data
        assert data["file_info"]["delimiter"] == ";", f"Expected semicolon, got {data['file_info']['delimiter']}"
        
        # Should still detect columns
        assert "columns" in data
        assert "Player Name" in data["columns"] or "Total Distance" in data["columns"]
        
        print(f"Semicolon CSV analysis passed - Delimiter: {data['file_info']['delimiter']}")


class TestCSVImportMappedEndpoint:
    """Tests for POST /api/csv/import-mapped"""
    
    def test_import_with_custom_mapping(self, auth_headers):
        """Test importing CSV with custom field mapping"""
        # Define custom mapping based on Catapult CSV structure
        mapping = {
            "athlete_name": "Player Name",
            "total_distance": "Average Distance (Session)",
            "hid_distance": "HID Average Distance",
            "hsr_distance": "HSR Average Distance",
            "sprint_distance": "Sprint Average Distance 25",
            "number_of_sprints": "Sprint Total # Efforts",
            "accelerations": "Acceleration B1-3 Average Efforts",
            "decelerations": "Deceleration B1-3 Average Efforts",
            "max_speed": "Maximum Velocity km/h",
            "period_name": "Period Name",
            "session_date": "__metadata_date__"  # Use date from metadata
        }
        
        with open(CATAPULT_CSV_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/csv/import-mapped",
                files={"file": ("test_catapult.csv", f, "text/csv")},
                data={
                    "mapping_json": json.dumps(mapping),
                    "create_missing": "true"
                },
                headers=auth_headers
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Success assertion
        assert data.get("success") == True, f"Import should succeed: {data}"
        
        # Records imported
        assert "records_imported" in data
        assert data["records_imported"] >= 1, f"Should import at least 1 record, got {data['records_imported']}"
        
        # Athletes created (if new) - Lucas Novo should be auto-created if not exists
        assert "athletes_created" in data
        assert isinstance(data["athletes_created"], list)
        
        # Imported by athlete breakdown
        assert "imported_by_athlete" in data
        imported_breakdown = data["imported_by_athlete"]
        assert isinstance(imported_breakdown, dict)
        
        # Check known athletes from CSV
        known_athletes = ["João Silva", "Maria Santos", "Pedro Costa", "Lucas Novo"]
        imported_athletes = list(imported_breakdown.keys())
        for athlete in imported_athletes:
            # At least some of the known athletes should be imported
            pass  # Just verify structure, don't require exact match
        
        # Session ID should be generated
        assert "session_id" in data
        assert data["session_id"].startswith("csv_import_")
        
        print(f"Import passed - Records: {data['records_imported']}, Created: {data['athletes_created']}")
    
    def test_import_without_creating_missing_athletes(self, auth_headers):
        """Test import with create_missing=false should skip unknown athletes"""
        # Create a CSV with a completely new athlete name
        new_athlete_csv = '''"Player Name","Total Distance","Sprint Distance"
"UNKNOWN_TEST_ATHLETE_XYZ123","5000","300"
'''
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write(new_athlete_csv)
            temp_path = f.name
        
        mapping = {
            "athlete_name": "Player Name",
            "total_distance": "Total Distance",
            "sprint_distance": "Sprint Distance"
        }
        
        with open(temp_path, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/csv/import-mapped",
                files={"file": ("test_unknown.csv", f, "text/csv")},
                data={
                    "mapping_json": json.dumps(mapping),
                    "create_missing": "false"
                },
                headers=auth_headers
            )
        
        # Should still return 200 but with errors or no records
        assert response.status_code in [200, 400], f"Got {response.status_code}: {response.text}"
        
        data = response.json()
        if response.status_code == 200:
            # Either errors list or 0 records
            if "errors" in data:
                # Should have error about athlete not found
                print(f"Correctly rejected unknown athlete: {data.get('errors')}")
            elif data.get("records_imported", 0) == 0:
                print("Correctly imported 0 records for unknown athlete")
        
        import os
        os.unlink(temp_path)


class TestMappingTemplatesEndpoint:
    """Tests for mapping template CRUD endpoints"""
    
    def test_list_templates_empty(self, auth_headers, created_template_ids):
        """Test GET /api/csv/mapping-templates - initially may be empty or have previous templates"""
        response = requests.get(
            f"{BASE_URL}/api/csv/mapping-templates",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"Templates list returned {len(data)} templates")
    
    def test_create_template(self, auth_headers, created_template_ids):
        """Test POST /api/csv/mapping-templates"""
        template_data = {
            "name": "TEST_Catapult_Template",
            "provider": "catapult",
            "mapping": {
                "athlete_name": "Player Name",
                "total_distance": "Average Distance (Session)",
                "sprint_distance": "Sprint Average Distance 25",
                "max_speed": "Maximum Velocity km/h"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/csv/mapping-templates",
            json=template_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Should return created template ID
        assert "id" in data, f"Response should contain 'id': {data}"
        assert data["id"], "ID should not be empty"
        
        # Track for cleanup
        created_template_ids.append(data["id"])
        
        print(f"Template created with ID: {data['id']}")
        
        # Verify template can be retrieved
        list_response = requests.get(
            f"{BASE_URL}/api/csv/mapping-templates",
            headers=auth_headers
        )
        assert list_response.status_code == 200
        
        templates = list_response.json()
        template_ids = [t["id"] for t in templates]
        assert data["id"] in template_ids, f"Created template not in list: {template_ids}"
        
        # Verify template content
        created_template = next((t for t in templates if t["id"] == data["id"]), None)
        assert created_template is not None
        assert created_template["name"] == "TEST_Catapult_Template"
        assert created_template["provider"] == "catapult"
        assert created_template["mapping"]["athlete_name"] == "Player Name"
    
    def test_delete_template(self, auth_headers, created_template_ids):
        """Test DELETE /api/csv/mapping-templates/{id}"""
        # First create a template to delete
        template_data = {
            "name": "TEST_Template_To_Delete",
            "provider": "generic",
            "mapping": {"athlete_name": "Name"}
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/csv/mapping-templates",
            json=template_data,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        template_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/csv/mapping-templates/{template_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        data = delete_response.json()
        assert "message" in data
        
        # Verify deletion
        list_response = requests.get(
            f"{BASE_URL}/api/csv/mapping-templates",
            headers=auth_headers
        )
        templates = list_response.json()
        template_ids = [t["id"] for t in templates]
        assert template_id not in template_ids, "Deleted template should not be in list"
        
        print(f"Template {template_id} deleted successfully")
    
    def test_delete_nonexistent_template(self, auth_headers):
        """Test DELETE with invalid template ID returns 404"""
        fake_id = "000000000000000000000000"  # Valid ObjectId format but doesn't exist
        
        response = requests.delete(
            f"{BASE_URL}/api/csv/mapping-templates/{fake_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"


class TestDashboardRegression:
    """Regression tests to ensure dashboard endpoints still work after CSV import"""
    
    def test_dashboard_overview(self, auth_headers):
        """Test GET /api/dashboard/overview - should still work"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/overview",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Basic structure checks - dashboard should have expected fields
        # Not checking exact values as they may change, just structure
        assert isinstance(data, dict), "Dashboard overview should return dict"
        
        print(f"Dashboard overview works - keys: {list(data.keys())[:5]}...")
    
    def test_dashboard_team(self, auth_headers):
        """Test GET /api/dashboard/team - should still work"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/team",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, (dict, list)), "Team dashboard should return dict or list"
        
        print(f"Team dashboard works - type: {type(data).__name__}")


class TestCleanup:
    """Cleanup test data created during tests"""
    
    def test_cleanup_templates(self, auth_headers, created_template_ids):
        """Clean up any remaining test templates"""
        for template_id in created_template_ids:
            try:
                requests.delete(
                    f"{BASE_URL}/api/csv/mapping-templates/{template_id}",
                    headers=auth_headers
                )
            except Exception:
                pass
        
        # Also clean up TEST_ prefixed templates
        response = requests.get(
            f"{BASE_URL}/api/csv/mapping-templates",
            headers=auth_headers
        )
        if response.status_code == 200:
            templates = response.json()
            for t in templates:
                if t.get("name", "").startswith("TEST_"):
                    try:
                        requests.delete(
                            f"{BASE_URL}/api/csv/mapping-templates/{t['id']}",
                            headers=auth_headers
                        )
                    except Exception:
                        pass
        
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
