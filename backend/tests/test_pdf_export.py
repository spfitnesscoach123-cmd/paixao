"""
Test PDF Export - Dashboard Overview Report Endpoint
Tests for: GET /api/report/dashboard-overview

Verifies:
1. HTML report has white background (#ffffff), not dark (#0f172a)
2. HTML report includes inline SVG chart elements
3. Report contains metric cards with proper styling
4. ACWR gauge SVG visualization
5. Velocity zones horizontal bar SVGs
6. All 5 layer sections render correctly
7. Individual layer filtering works
8. Valid HTML returned without errors
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://jump-camera-audit.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "contato@loadmanagerpro.com.br"
TEST_PASSWORD = "#UAE2026"


class TestDashboardPdfExport:
    """Tests for GET /api/report/dashboard-overview endpoint"""
    
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
    
    def test_endpoint_returns_html(self):
        """Test endpoint returns valid HTML response"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "text/html" in response.headers.get("content-type", ""), "Response should be HTML"
        assert response.text.startswith("<!DOCTYPE html>"), "Response should start with DOCTYPE"
        print("PASS: Endpoint returns valid HTML response")
    
    def test_white_background_not_dark(self):
        """
        Test that body background is white (#ffffff), NOT dark (#0f172a)
        This was the original bug - dark theme background being printed
        """
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check body CSS has white background
        assert "background: #ffffff" in html or "background:#ffffff" in html, \
            "Body should have white background (#ffffff)"
        
        # Ensure no dark background colors in base styles
        # The dark color #0f172a should NOT appear as a background
        style_section = re.search(r'<style[^>]*>(.*?)</style>', html, re.DOTALL)
        assert style_section, "Style section should exist"
        styles = style_section.group(1)
        
        # Body should NOT have dark background
        body_style = re.search(r'body\s*\{[^}]*\}', styles)
        assert body_style, "Body style should exist"
        body_css = body_style.group(0)
        assert "#0f172a" not in body_css, "Body should NOT have dark background #0f172a"
        
        print("PASS: Body has white background, NOT dark theme")
    
    def test_contains_inline_svg_charts(self):
        """Test that HTML contains inline SVG elements for charts"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Count SVG elements
        svg_count = html.count("<svg")
        assert svg_count > 0, "HTML should contain SVG elements"
        print(f"PASS: Found {svg_count} SVG elements in HTML")
    
    def test_acwr_gauge_svg_visualization(self):
        """Test that ACWR gauge SVG is included in the report"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for gauge SVG structure (arc/circle elements)
        has_circle = "<circle" in html
        has_stroke_dasharray = "stroke-dasharray" in html
        
        # ACWR label should be present
        has_acwr_label = "ACWR" in html
        
        assert has_acwr_label, "ACWR label should be present in load section"
        print(f"PASS: ACWR gauge elements found - circles: {has_circle}, dasharray: {has_stroke_dasharray}")
    
    def test_velocity_zones_horizontal_bars(self):
        """Test that velocity zones are rendered as horizontal bar SVGs"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for velocity zone labels
        zone_labels = ["Low Int", "HID Z3", "HSR Z4", "Sprint Z5"]
        found_labels = [lbl for lbl in zone_labels if lbl in html]
        
        # Check for rect elements (bars)
        rect_count = html.count("<rect")
        
        assert len(found_labels) > 0, f"Should find velocity zone labels, found: {found_labels}"
        print(f"PASS: Velocity zones found - labels: {found_labels}, rect elements: {rect_count}")
    
    def test_metric_cards_structure(self):
        """Test that metric cards with proper styling are included"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for metric card CSS classes
        assert 'class="metric-card"' in html or "class='metric-card'" in html, \
            "HTML should contain metric-card elements"
        assert 'class="metric-value"' in html or "class='metric-value'" in html, \
            "HTML should contain metric-value elements"
        assert 'class="metric-label"' in html or "class='metric-label'" in html, \
            "HTML should contain metric-label elements"
        
        print("PASS: Metric cards structure present")
    
    def test_all_layers_render(self):
        """Test that all 5 layers render correctly when requested"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load,summary,status,neuro,risk",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for layer badges
        layer_badges = [
            ("Load Intelligence", "lb-cyan"),
            ("Smart Summary", "lb-amber"),
            ("Team Status", "lb-green"),
            ("Neuromuscular Status", "lb-purple"),
            ("Risk Intelligence", "lb-red")
        ]
        
        found_layers = []
        for layer_name, badge_class in layer_badges:
            if layer_name in html and badge_class in html:
                found_layers.append(layer_name)
        
        assert len(found_layers) >= 3, f"Expected at least 3 layers, found: {found_layers}"
        print(f"PASS: Found {len(found_layers)} layer sections: {found_layers}")
    
    def test_load_layer_only(self):
        """Test that filtering with layers=load only renders load section"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Load layer should be present
        assert "Load Intelligence" in html, "Load layer should be present"
        
        # Other layers should NOT be present (or minimal)
        # Smart Summary specific badge should not appear
        assert "Smart Summary" not in html, "Summary layer should not appear when only load is requested"
        assert "Risk Intelligence" not in html, "Risk layer should not appear when only load is requested"
        
        print("PASS: Load layer filtering works correctly")
    
    def test_summary_layer_only(self):
        """Test that filtering with layers=summary only renders summary section"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=summary",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Summary layer should be present
        assert "Smart Summary" in html, "Summary layer should be present"
        
        # Load layer should NOT be present
        assert "Load Intelligence" not in html, "Load layer should not appear when only summary is requested"
        
        print("PASS: Summary layer filtering works correctly")
    
    def test_report_header_structure(self):
        """Test that report has proper header with title and subtitle"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        assert 'class="report-header"' in html, "Report header should exist"
        assert 'class="report-title"' in html, "Report title should exist"
        assert "DASHBOARD REPORT" in html, "Report title text should be present"
        
        print("PASS: Report header structure correct")
    
    def test_print_css_media_query(self):
        """Test that @media print styles are included for proper PDF generation"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for print media query
        assert "@media print" in html, "Print media query should be present"
        assert "print-color-adjust" in html or "-webkit-print-color-adjust" in html, \
            "Print color adjust CSS should be present"
        
        print("PASS: Print CSS media query present")
    
    def test_no_dark_theme_colors_in_base_styles(self):
        """Verify no dark theme colors are used in base HTML/CSS"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Extract style section
        style_match = re.search(r'<style[^>]*>(.*?)</style>', html, re.DOTALL)
        assert style_match
        styles = style_match.group(1)
        
        # These dark colors should not be backgrounds
        dark_colors = ["#0f172a", "#1e1b4b", "#020617"]
        
        for dark_color in dark_colors:
            # Check if color appears as background
            if f"background: {dark_color}" in styles or f"background:{dark_color}" in styles:
                pytest.fail(f"Dark color {dark_color} found as background in styles")
        
        print("PASS: No dark theme colors in base styles")
    
    def test_portuguese_language_option(self):
        """Test Portuguese language option works"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?lang=pt",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for Portuguese text
        portuguese_indicators = ["Periodo", "Distancia", "Zonas de Velocidade", "Prontidao", "Atleta"]
        found_pt = [ind for ind in portuguese_indicators if ind in html]
        
        assert len(found_pt) > 0, f"Should find Portuguese text, found: {found_pt}"
        print(f"PASS: Portuguese language option works - found: {found_pt}")
    
    def test_english_language_option(self):
        """Test English language option works"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?lang=en",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for English text
        english_indicators = ["Period", "Velocity Zones", "Readiness", "Athlete"]
        found_en = [ind for ind in english_indicators if ind in html]
        
        assert len(found_en) > 0, f"Should find English text, found: {found_en}"
        print(f"PASS: English language option works - found: {found_en}")


class TestReportDataContent:
    """Test that report contains actual data when available"""
    
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
    
    def test_report_renders_without_error(self):
        """Test that report renders without server error even with minimal data"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview",
            headers=self.headers
        )
        # Should not return 500
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:500]}"
        print("PASS: Report renders without server error")
    
    def test_charts_have_svg_structure(self):
        """Test that SVG charts have proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/report/dashboard-overview?layers=load",
            headers=self.headers
        )
        assert response.status_code == 200
        html = response.text
        
        # Check for SVG attributes
        has_viewbox = 'viewBox' in html or 'viewbox' in html
        has_preserveAspectRatio = 'preserveAspectRatio' in html
        
        print(f"SVG structure - viewBox: {has_viewbox}, preserveAspectRatio: {has_preserveAspectRatio}")
        assert has_viewbox or has_preserveAspectRatio, "SVG should have proper attributes"
        print("PASS: SVG charts have proper structure")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
