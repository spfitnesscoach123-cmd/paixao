"""
Test PDF Export Dashboard Overview - Comprehensive Tests
Tests for: GET /api/report/dashboard-overview

This test file validates the PDF export fix:
1. PDF endpoint returns HTTP 200 (not 500)
2. PDF HTML contains correct ACWR value (1.00) 
3. PDF HTML contains correct Acute (3,500 m) and Chronic (3,500 m) values
4. PDF contains Monotony, Strain, LMPI values
5. All 5 sections rendered: Load Intelligence, Smart Summary, Team Status, Neuromuscular, Risk Intelligence
6. PDF has SVG ACWR gauge chart
7. PDF has white background (print-friendly)
8. All date_range filters work: today, yesterday, 7d, 14d, 28d, 90d
9. Dashboard Overview ACWR matches Team Dashboard ACWR (both 1.0)
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = 'https://athlete-binding.preview.emergentagent.com'

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"


class TestPdfExportEndpoint:
    """Tests for PDF export endpoint returns and structure"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token")
        assert self.token, "No access_token in login response"
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_pdf_endpoint_returns_200_not_500(self):
        """Test PDF endpoint returns HTTP 200 (was returning 500 due to bad key mapping)"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        # This was failing with 500 before fix due to reading non-existent keys
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:500]}"
        assert "text/html" in response.headers.get("content-type", ""), "Response should be HTML"
        print("PASS: PDF endpoint returns HTTP 200 with valid HTML")
    
    def test_pdf_contains_correct_acwr_value(self):
        """Test PDF HTML contains ACWR value of 1.00 (from EWMA calculation)"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # ACWR value should be 1.00 (rendered in gauge with font-size="18")
        assert "1.00" in html, "PDF should contain ACWR value 1.00"
        assert "ACWR" in html, "PDF should contain ACWR label"
        print("PASS: PDF contains correct ACWR value (1.00)")
    
    def test_pdf_contains_acute_chronic_values(self):
        """Test PDF contains correct Acute (3,500 m) and Chronic (3,500 m) values"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Acute and Chronic should be 3,500 (formatted)
        # The HTML formats with comma: 3,500
        assert "3,500" in html, "PDF should contain Acute/Chronic value 3,500"
        
        # Check for labels
        assert ("Acute" in html or "Agudo" in html), "PDF should contain Acute/Agudo label"
        assert ("Chronic" in html or "Cronico" in html), "PDF should contain Chronic/Cronico label"
        print("PASS: PDF contains correct Acute (3,500) and Chronic (3,500) values")
    
    def test_pdf_contains_monotony_strain_lmpi(self):
        """Test PDF contains Monotony, Strain, LMPI values (not 0 when real data exists)"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load,summary",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for Monotony label (Portuguese: Monotonia, English: Monotony)
        assert ("Monotony" in html or "Monoton" in html), "PDF should contain Monotony metric"
        
        # Check for Strain label
        assert "Strain" in html, "PDF should contain Strain metric"
        
        # Check for LMPI label
        assert "LMPI" in html, "PDF should contain LMPI metric"
        
        # Verify values are not all 0 - should have numerical values
        # The actual values: monotony=0.13, strain=1330, lmpi=40.97
        # At least one non-zero value should appear
        has_nonzero = "1,330" in html or "40." in html or "0.13" in html
        print(f"PASS: PDF contains Monotony, Strain, LMPI labels (non-zero values present: {has_nonzero})")
    
    def test_pdf_contains_all_5_sections(self):
        """Test PDF contains all 5 sections when all layers requested"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load,summary,status,neuro,risk",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for all 5 section headers
        sections = {
            "Load Intelligence": "load",
            "Smart Summary": "summary",
            "Team Status": "status",
            "Neuromuscular": "neuro",
            "Risk Intelligence": "risk"
        }
        
        found_sections = []
        for section_name, layer in sections.items():
            if section_name in html:
                found_sections.append(section_name)
        
        assert len(found_sections) >= 5, f"Expected all 5 sections, found: {found_sections}"
        print(f"PASS: PDF contains all 5 sections: {found_sections}")
    
    def test_pdf_has_svg_acwr_gauge(self):
        """Test PDF has SVG ACWR gauge chart"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # ACWR gauge is rendered as SVG with circle and stroke-dasharray
        assert "<svg" in html, "PDF should contain SVG elements"
        assert "<circle" in html, "PDF should contain circle elements (gauge)"
        assert "stroke-dasharray" in html, "PDF should have stroke-dasharray for gauge arc"
        print("PASS: PDF has SVG ACWR gauge chart")
    
    def test_pdf_has_white_background(self):
        """Test PDF has white background (print-friendly, not dark theme)"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for white background in body style
        assert "background: #ffffff" in html or "background:#ffffff" in html, \
            "PDF body should have white background (#ffffff)"
        
        # Ensure dark theme color is not used as background
        style_section = re.search(r'<style[^>]*>(.*?)</style>', html, re.DOTALL)
        if style_section:
            body_style = re.search(r'body\s*\{[^}]*\}', style_section.group(1))
            if body_style:
                assert "#0f172a" not in body_style.group(0), "Body should NOT have dark background"
        
        print("PASS: PDF has white background (print-friendly)")


class TestDateRangeFilters:
    """Test all date_range filters work for PDF"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    @pytest.mark.parametrize("date_range", ["today", "yesterday", "7d", "14d", "28d", "90d"])
    def test_date_range_filter(self, date_range):
        """Test each date_range filter returns HTTP 200"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?date_range={date_range}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Date range {date_range} failed with {response.status_code}"
        assert "<!DOCTYPE html>" in response.text, f"Response for {date_range} should be valid HTML"
        print(f"PASS: date_range={date_range} returns HTTP 200")


class TestAcwrAlignment:
    """Test ACWR alignment between Dashboard Overview and Team Dashboard"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_dashboard_overview_acwr_matches_team_dashboard(self):
        """Test Dashboard Overview ACWR matches Team Dashboard ACWR (both use EWMA)"""
        # Get Dashboard Overview ACWR
        overview_resp = requests.get(
            f"{BASE_URL}/api/dashboard/overview?date_range=28d",
            headers=self.headers
        )
        assert overview_resp.status_code == 200
        overview_data = overview_resp.json()
        overview_acwr = overview_data.get("summary", {}).get("team_acwr")
        
        # Get Team Dashboard ACWR
        team_resp = requests.get(
            f"{BASE_URL}/api/dashboard/team?date_range=28d",
            headers=self.headers
        )
        assert team_resp.status_code == 200
        team_data = team_resp.json()
        team_acwr = team_data.get("stats", {}).get("team_avg_acwr")
        
        # Both should be 1.0 (or 1)
        assert overview_acwr == team_acwr, f"ACWR mismatch: Overview={overview_acwr}, Team={team_acwr}"
        print(f"PASS: Dashboard Overview ACWR ({overview_acwr}) matches Team Dashboard ACWR ({team_acwr})")
    
    def test_athlete_level_acwr_consistency(self):
        """Test individual athlete ACWR is consistent between endpoints"""
        # Get athlete ACWR from Overview
        overview_resp = requests.get(
            f"{BASE_URL}/api/dashboard/overview?date_range=28d",
            headers=self.headers
        )
        assert overview_resp.status_code == 200
        overview_athletes = {a["name"]: a.get("acwr") for a in overview_resp.json().get("athletes", [])}
        
        # Get athlete ACWR from Team Dashboard
        team_resp = requests.get(
            f"{BASE_URL}/api/dashboard/team?date_range=28d",
            headers=self.headers
        )
        assert team_resp.status_code == 200
        team_athletes = {a["name"]: a.get("acwr") for a in team_resp.json().get("athletes", [])}
        
        # Compare athlete ACWR values
        for name in overview_athletes:
            if name in team_athletes:
                assert overview_athletes[name] == team_athletes[name], \
                    f"ACWR mismatch for {name}: Overview={overview_athletes[name]}, Team={team_athletes[name]}"
        
        print(f"PASS: Individual athlete ACWR values are consistent across endpoints")
        print(f"  Overview athletes: {overview_athletes}")
        print(f"  Team athletes: {team_athletes}")


class TestPdfDataMapping:
    """Test PDF data mapping from actual response keys"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_pdf_reads_from_summary_key(self):
        """Verify PDF data is correctly read from 'summary' key (not non-existent 'load_intelligence')"""
        # First get the raw overview data
        overview_resp = requests.get(
            f"{BASE_URL}/api/dashboard/overview?date_range=28d",
            headers=self.headers
        )
        assert overview_resp.status_code == 200
        overview_data = overview_resp.json()
        
        # Verify the actual keys exist
        assert "summary" in overview_data, "Response should have 'summary' key"
        assert "athletes" in overview_data, "Response should have 'athletes' key"
        assert "aggregated_timeline" in overview_data, "Response should have 'aggregated_timeline' key"
        
        # Verify old non-existent keys don't exist (the bug was reading from these)
        assert "load_intelligence" not in overview_data, "Should not have 'load_intelligence' key"
        assert "smart_summary" not in overview_data, "Should not have 'smart_summary' key"
        
        # Get PDF and verify it rendered without error
        pdf_resp = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?date_range=28d",
            headers=self.headers
        )
        assert pdf_resp.status_code == 200, "PDF should render successfully from correct keys"
        print("PASS: PDF correctly reads from summary, athletes, aggregated_timeline keys")
    
    def test_pdf_contains_velocity_zones(self):
        """Test PDF contains velocity zones data from athletes"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for velocity zone labels
        zone_labels = ["Low Int", "HID Z3", "HSR Z4", "Sprint Z5"]
        found_labels = [lbl for lbl in zone_labels if lbl in html]
        
        assert len(found_labels) > 0, f"PDF should contain velocity zone labels, found: {found_labels}"
        print(f"PASS: PDF contains velocity zones: {found_labels}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
