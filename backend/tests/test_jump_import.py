"""
Unit Tests for Jump Import Module
==================================

Tests for:
- CSV parsing with different formats and encodings
- Manufacturer detection from headers
- Column mapping for different manufacturers
- Metric calculations (jump height, RSI, takeoff velocity)
- Business rule validation (contact time rules)
- Empty field handling (null vs zero)
"""

import pytest
from datetime import datetime
from io import BytesIO

# Import module components
from jump_import import (
    JumpCSVParser,
    JumpValidator,
    JumpCalculator,
    JumpRecord,
    JumpValidationError,
    process_jump_csv,
)
from jump_import.mappers import (
    GenericMapper,
    ChronojumpMapper,
    ForceDecksMapper,
    AxonJumpMapper,
    CustomMapper,
    get_mapper,
    detect_manufacturer_from_headers,
)


# ============= CALCULATOR TESTS =============

class TestJumpCalculator:
    """Tests for derived metrics calculations."""
    
    def test_calculate_jump_height_from_flight_time(self):
        """Test jump height calculation using h = (g × t²) / 8"""
        calculator = JumpCalculator()
        
        # Known values: 0.5s flight time should give ~30.66 cm
        # h = (9.81 × 0.5²) / 8 = (9.81 × 0.25) / 8 = 2.4525 / 8 = 0.3066m = 30.66cm
        height = calculator.calculate_jump_height(0.5)
        assert abs(height - 30.66) < 0.1
        
        # 0.6s flight time
        # h = (9.81 × 0.36) / 8 = 3.5316 / 8 = 0.4415m = 44.15cm
        height = calculator.calculate_jump_height(0.6)
        assert abs(height - 44.15) < 0.1
    
    def test_calculate_rsi(self):
        """Test RSI calculation: RSI = jump_height_cm / contact_time_s"""
        calculator = JumpCalculator()
        
        # RSI = 30 cm / 0.2 s = 150
        rsi = calculator.calculate_rsi(30.0, 0.2)
        assert abs(rsi - 150.0) < 0.1
        
        # RSI = 40 cm / 0.25 s = 160
        rsi = calculator.calculate_rsi(40.0, 0.25)
        assert abs(rsi - 160.0) < 0.1
    
    def test_calculate_rsi_division_by_zero(self):
        """Test RSI returns 0 when contact time is 0."""
        calculator = JumpCalculator()
        rsi = calculator.calculate_rsi(30.0, 0.0)
        assert rsi == 0.0
    
    def test_calculate_takeoff_velocity(self):
        """Test takeoff velocity calculation: v = √(2gh)"""
        calculator = JumpCalculator()
        
        # v = √(2 × 9.81 × 0.30) = √5.886 = 2.426 m/s
        velocity = calculator.calculate_takeoff_velocity(30.0)
        assert abs(velocity - 2.43) < 0.05
    
    def test_calculate_row_with_missing_height(self):
        """Test that height is calculated from flight time if missing."""
        calculator = JumpCalculator()
        
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'CMJ',
            'flight_time_s': 0.5,
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        result = calculator.calculate(row)
        
        assert 'jump_height_cm' in result
        assert result['jump_height_cm'] is not None
        assert abs(result['jump_height_cm'] - 30.66) < 0.1
        assert 'jump_height_cm' in calculator.calculated_fields
    
    def test_calculate_row_preserves_existing_height(self):
        """Test that existing height is not overwritten."""
        calculator = JumpCalculator()
        
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'CMJ',
            'flight_time_s': 0.5,
            'jump_height_cm': 35.0,  # Provided explicitly
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        result = calculator.calculate(row)
        
        # Should preserve the provided value
        assert result['jump_height_cm'] == 35.0
        assert 'jump_height_cm' not in calculator.calculated_fields
    
    def test_empty_string_treated_as_none(self):
        """Test that empty strings are treated as None, not as invalid."""
        calculator = JumpCalculator()
        
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'CMJ',
            'flight_time_s': 0.5,
            'jump_height_cm': '',  # Empty string
            'contact_time_s': '',
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        result = calculator.calculate(row)
        
        # Empty string should be treated as missing, so height should be calculated
        assert result['jump_height_cm'] is not None
        assert result['jump_height_cm'] > 0


# ============= VALIDATOR TESTS =============

class TestJumpValidator:
    """Tests for validation logic."""
    
    def test_valid_cmj_record(self):
        """Test validation of a valid CMJ record."""
        validator = JumpValidator({'ATH001'})
        
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'CMJ',
            'jump_height_cm': 35.0,
            'flight_time_s': 0.54,
            'contact_time_s': None,
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        is_valid, result = validator.validate(row, 2)
        assert is_valid is True
        assert isinstance(result, JumpRecord)
    
    def test_cmj_with_contact_time_fails(self):
        """Test that CMJ with contact_time fails validation."""
        validator = JumpValidator({'ATH001'})
        
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'CMJ',
            'jump_height_cm': 35.0,
            'flight_time_s': 0.54,
            'contact_time_s': 0.2,  # Not allowed for CMJ!
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        is_valid, result = validator.validate(row, 2)
        assert is_valid is False
        assert isinstance(result, JumpValidationError)
        assert 'contact_time_s' in result.field
    
    def test_dj_requires_contact_time(self):
        """Test that DJ requires contact_time."""
        validator = JumpValidator({'ATH001'})
        
        # Missing contact_time for DJ
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'DJ',
            'jump_height_cm': 30.0,
            'flight_time_s': 0.48,
            'contact_time_s': None,  # Required for DJ!
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        is_valid, result = validator.validate(row, 2)
        assert is_valid is False
        assert 'contact_time_s' in result.field
    
    def test_dj_with_contact_time_valid(self):
        """Test that DJ with contact_time is valid."""
        validator = JumpValidator({'ATH001'})
        
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'DJ',
            'jump_height_cm': 30.0,
            'flight_time_s': 0.48,
            'contact_time_s': 0.2,  # Provided
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        is_valid, result = validator.validate(row, 2)
        assert is_valid is True
    
    def test_athlete_not_found(self):
        """Test validation fails when athlete is not in system."""
        validator = JumpValidator({'ATH001', 'ATH002'})  # Only these exist
        
        row = {
            'athlete_id': 'ATH999',  # Doesn't exist
            'jump_type': 'CMJ',
            'jump_height_cm': 35.0,
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        is_valid, result = validator.validate(row, 2)
        assert is_valid is False
        assert 'ATH999' in validator.athletes_not_found
    
    def test_missing_required_fields(self):
        """Test validation fails with missing required fields."""
        validator = JumpValidator({'ATH001'})
        
        # Missing jump_type
        row = {
            'athlete_id': 'ATH001',
            'jump_height_cm': 35.0,
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        is_valid, result = validator.validate(row, 2)
        assert is_valid is False
        assert 'jump_type' in result.field
    
    def test_needs_flight_time_or_height(self):
        """Test validation fails without flight_time or jump_height."""
        validator = JumpValidator({'ATH001'})
        
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'CMJ',
            # No flight_time_s or jump_height_cm!
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        is_valid, result = validator.validate(row, 2)
        assert is_valid is False
    
    def test_invalid_jump_type(self):
        """Test validation fails with invalid jump type."""
        validator = JumpValidator({'ATH001'})
        
        row = {
            'athlete_id': 'ATH001',
            'jump_type': 'INVALID_TYPE',  # Not a valid jump type
            'jump_height_cm': 35.0,
            'jump_date': '2026-01-15',
            'source_system': 'generic'
        }
        
        is_valid, result = validator.validate(row, 2)
        assert is_valid is False


# ============= PARSER TESTS =============

class TestJumpCSVParser:
    """Tests for CSV parsing."""
    
    def test_parse_basic_csv(self):
        """Test parsing a basic CSV file."""
        csv_content = b"""athlete_id,jump_type,jump_height_cm,flight_time_s,jump_date,source_system
ATH001,CMJ,35.0,0.54,2026-01-15,generic
ATH002,SJ,30.0,0.48,2026-01-15,generic
"""
        parser = JumpCSVParser()
        rows, errors = parser.parse(csv_content, "test.csv")
        
        assert len(rows) == 2
        assert len(errors) == 0
        assert rows[0]['athlete_id'] == 'ATH001'
        assert rows[1]['jump_type'] == 'SJ'
    
    def test_parse_semicolon_delimiter(self):
        """Test parsing CSV with semicolon delimiter."""
        csv_content = b"""athlete_id;jump_type;jump_height_cm;flight_time_s;jump_date;source_system
ATH001;CMJ;35.0;0.54;2026-01-15;generic
"""
        parser = JumpCSVParser()
        rows, errors = parser.parse(csv_content, "test.csv")
        
        assert len(rows) == 1
        assert rows[0]['athlete_id'] == 'ATH001'
    
    def test_parse_empty_values_as_none(self):
        """Test that empty CSV values become None."""
        csv_content = b"""athlete_id,jump_type,jump_height_cm,flight_time_s,contact_time_s,jump_date,source_system
ATH001,CMJ,35.0,0.54,,2026-01-15,generic
"""
        parser = JumpCSVParser()
        rows, errors = parser.parse(csv_content, "test.csv")
        
        assert len(rows) == 1
        # Empty contact_time_s should be None
        assert rows[0].get('contact_time_s') is None
    
    def test_detect_manufacturer_generic(self):
        """Test manufacturer detection returns generic for standard headers."""
        # Use clearly generic headers that don't match any specific manufacturer
        headers = ['subject_id', 'measurement_type', 'value_cm', 'duration_s', 'measurement_date', 'system']
        manufacturer = detect_manufacturer_from_headers(headers, "my_custom_data.csv")
        
        assert manufacturer == 'generic'
    
    def test_detect_manufacturer_chronojump(self):
        """Test manufacturer detection for Chronojump headers."""
        headers = ['uniqueID', 'personID', 'sessionID', 'type', 'tv', 'tc']
        manufacturer = detect_manufacturer_from_headers(headers, "data.csv")
        
        assert manufacturer == 'chronojump'
    
    def test_detect_manufacturer_from_filename(self):
        """Test manufacturer detection from filename."""
        headers = ['id', 'type', 'height', 'time']  # Generic headers
        manufacturer = detect_manufacturer_from_headers(headers, "chronojump_export.csv")
        
        assert manufacturer == 'chronojump'


# ============= MAPPER TESTS =============

class TestMappers:
    """Tests for manufacturer-specific mappers."""
    
    def test_generic_mapper_basic(self):
        """Test generic mapper with standard column names."""
        mapper = GenericMapper()
        
        raw_row = {
            'athlete_id': 'ATH001',
            'jump_type': 'CMJ',
            'jump_height_cm': '35.0',
            'flight_time_s': '0.54',
            'jump_date': '2026-01-15'
        }
        
        result = mapper.map_row(raw_row)
        
        assert result['athlete_id'] == 'ATH001'
        assert result['jump_type'] == 'CMJ'
        assert result['jump_height_cm'] == 35.0
    
    def test_generic_mapper_aliases(self):
        """Test generic mapper with column aliases."""
        mapper = GenericMapper()
        
        raw_row = {
            'atleta_id': 'ATH001',  # Portuguese alias
            'tipo_salto': 'CMJ',
            'altura_cm': '35.0',
            'tempo_voo': '0.54',
            'data': '2026-01-15'
        }
        
        result = mapper.map_row(raw_row)
        
        assert result.get('athlete_id') == 'ATH001'
        assert result.get('jump_type') == 'CMJ'
    
    def test_chronojump_mapper(self):
        """Test Chronojump mapper."""
        mapper = ChronojumpMapper()
        
        raw_row = {
            'personID': 'ATH001',
            'type': 'cmj',  # lowercase
            'tv': '0.54',
            'tc': '-1',  # Chronojump uses -1 for missing
            'datetime': '2026-01-15 10:30:00'
        }
        
        result = mapper.map_row(raw_row)
        
        assert result['athlete_id'] == 'ATH001'
        assert result['jump_type'] == 'CMJ'  # Should be normalized to uppercase
        assert result['flight_time_s'] == 0.54
        assert result.get('contact_time_s') is None  # -1 should be None
    
    def test_custom_mapper(self):
        """Test custom mapper with user-defined mappings."""
        custom_map = {
            'my_athlete': 'athlete_id',
            'my_type': 'jump_type',
            'my_height': 'jump_height_cm',
            'my_date': 'jump_date'
        }
        
        mapper = CustomMapper(custom_map=custom_map)
        
        raw_row = {
            'my_athlete': 'ATH001',
            'my_type': 'CMJ',
            'my_height': '35.0',
            'my_date': '2026-01-15'
        }
        
        result = mapper.map_row(raw_row)
        
        assert result['athlete_id'] == 'ATH001'
        assert result['jump_type'] == 'CMJ'
        assert result['jump_height_cm'] == 35.0


# ============= INTEGRATION TESTS =============

class TestProcessJumpCSV:
    """Integration tests for the complete processing pipeline."""
    
    def test_process_csv_complete_pipeline(self):
        """Test complete CSV processing with valid data."""
        csv_content = b"""athlete_id,jump_type,flight_time_s,jump_date,source_system
ATH001,CMJ,0.54,2026-01-15,generic
ATH001,CMJ,0.52,2026-01-15,generic
"""
        result = process_jump_csv(csv_content, "test.csv", {'ATH001'})
        
        assert result.total_rows == 2
        assert result.valid_count == 2
        assert result.error_count == 0
        assert len(result.valid_records) == 2
        
        # Check that height was calculated
        for record in result.valid_records:
            assert record.jump_height_cm is not None
            assert record.jump_height_cm > 0
    
    def test_process_csv_with_validation_errors(self):
        """Test CSV processing with some invalid rows."""
        csv_content = b"""athlete_id,jump_type,flight_time_s,jump_date,source_system
ATH001,CMJ,0.54,2026-01-15,generic
ATH999,CMJ,0.52,2026-01-15,generic
"""
        # ATH999 doesn't exist
        result = process_jump_csv(csv_content, "test.csv", {'ATH001'})
        
        assert result.total_rows == 2
        assert result.valid_count == 1
        assert result.error_count == 1
    
    def test_process_csv_dj_validation(self):
        """Test DJ validation in complete pipeline."""
        csv_content = b"""athlete_id,jump_type,flight_time_s,contact_time_s,jump_date,source_system
ATH001,DJ,0.48,0.20,2026-01-15,generic
ATH001,DJ,0.48,,2026-01-15,generic
"""
        result = process_jump_csv(csv_content, "test.csv", {'ATH001'})
        
        # First row is valid (has contact_time), second is invalid
        assert result.valid_count == 1
        assert result.error_count == 1


# ============= BUSINESS RULES TESTS =============

class TestBusinessRules:
    """Tests for specific business rules."""
    
    def test_empty_field_is_null_not_zero(self):
        """Test that empty CSV fields become null, not zero."""
        csv_content = b"""athlete_id,jump_type,jump_height_cm,flight_time_s,contact_time_s,jump_date,source_system
ATH001,DJ,30.0,0.48,,2026-01-15,generic
"""
        parser = JumpCSVParser()
        rows, _ = parser.parse(csv_content, "test.csv")
        
        # Empty contact_time should be None, not 0
        assert rows[0].get('contact_time_s') is None
    
    def test_explicit_zero_is_preserved(self):
        """Test that explicit zero values are preserved."""
        csv_content = b"""athlete_id,jump_type,jump_height_cm,load_kg,jump_date,source_system
ATH001,CMJ,30.0,0,2026-01-15,generic
"""
        parser = JumpCSVParser()
        rows, _ = parser.parse(csv_content, "test.csv")
        
        # Explicit 0 should remain as 0
        # Note: After transformation, 0 becomes 0.0 (float)
        mapper = GenericMapper()
        mapped = mapper.map_row(rows[0])
        
        assert mapped.get('load_kg') == 0.0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
