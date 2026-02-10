"""
Jump Data Import Module
=======================

Hardware-agnostic CSV import system for jump data from contact mats.
Supports multiple manufacturers through dedicated mappers.

Architecture:
- models.py: Pydantic canonical data models (JumpRecord, ValidationError)
- parser.py: Safe CSV parsing with heterogeneous data tolerance
- validator.py: Schema + business rules validation
- calculator.py: Derived metrics calculation (jump height, RSI)
- mappers/: Manufacturer-specific column mappings

Supported Manufacturers:
- Generic: Standard CSV format
- Chronojump: Open-source timing system
- Force Decks: Force plate system
- Axon Jump: Contact mat system
- Custom: User-defined mappings

Usage:
    from jump_import import process_jump_csv, JumpRecord, JumpValidationError

Adding New Manufacturers:
1. Create new mapper in mappers/ following the BaseMapper interface
2. Register mapper in mappers/__init__.py
3. Add detection logic in parser.py

Author: Load Manager Team
Version: 1.0.0
"""

from .models import (
    JumpRecord,
    JumpValidationError,
    JumpImportResult,
    JumpPreviewResult,
    JumpType,
)
from .parser import JumpCSVParser, parse_jump_csv, detect_manufacturer
from .validator import JumpValidator, validate_jump_record
from .calculator import JumpCalculator, calculate_derived_metrics

# Convenience function for complete CSV processing
def process_jump_csv(
    file_content: bytes,
    filename: str = "upload.csv",
    existing_athlete_ids: set = None,
) -> JumpImportResult:
    """
    Process a jump data CSV file through the complete pipeline.
    
    Args:
        file_content: Raw CSV file bytes
        filename: Original filename (used for manufacturer detection)
        existing_athlete_ids: Set of valid athlete IDs in the system
        
    Returns:
        JumpImportResult with valid records and validation errors
    """
    parser = JumpCSVParser()
    validator = JumpValidator(existing_athlete_ids or set())
    calculator = JumpCalculator()
    
    # Parse CSV
    raw_rows, parse_errors = parser.parse(file_content, filename)
    
    valid_records = []
    all_errors = list(parse_errors)
    
    for row_num, raw_row in enumerate(raw_rows, start=2):  # Start at 2 (1 = header)
        # Calculate derived metrics
        row_with_metrics = calculator.calculate(raw_row)
        
        # Validate
        is_valid, record_or_error = validator.validate(row_with_metrics, row_num)
        
        if is_valid:
            valid_records.append(record_or_error)
        else:
            all_errors.append(record_or_error)
    
    return JumpImportResult(
        valid_records=valid_records,
        errors=all_errors,
        total_rows=len(raw_rows),
        valid_count=len(valid_records),
        error_count=len(all_errors),
    )


__all__ = [
    # Models
    "JumpRecord",
    "JumpValidationError", 
    "JumpImportResult",
    "JumpPreviewResult",
    "JumpType",
    # Parser
    "JumpCSVParser",
    "parse_jump_csv",
    "detect_manufacturer",
    # Validator
    "JumpValidator",
    "validate_jump_record",
    # Calculator
    "JumpCalculator",
    "calculate_derived_metrics",
    # Convenience
    "process_jump_csv",
]
