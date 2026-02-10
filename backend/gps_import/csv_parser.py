"""
GPS Import Module - CSV Parser

Robust CSV parsing logic that handles various file formats, encodings,
delimiters, and decimal separators from different GPS manufacturers.

Features:
- Automatic delimiter detection (, or ;)
- Header normalization (lowercase, trim, remove accents)
- Multiple decimal format support (dot and comma)
- BOM and encoding handling
- Unknown column handling (logged but not rejected)

Author: Sports Performance System
Version: 1.0.0
"""

import csv
import io
import re
import unicodedata
import codecs
from typing import List, Dict, Any, Optional, Tuple, Iterator
from dataclasses import dataclass
from datetime import datetime
import logging

from .manufacturer_aliases import (
    Manufacturer,
    detect_manufacturer_from_columns,
    build_column_mapping
)
from .canonical_metrics import (
    CANONICAL_METRICS,
    REQUIRED_METRICS,
    validate_metric_value
)

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class ParseError:
    """Represents an error encountered during parsing"""
    row_number: int
    column: str
    message: str
    severity: str  # 'error' or 'warning'
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "row": self.row_number,
            "column": self.column,
            "message": self.message,
            "severity": self.severity
        }


@dataclass
class ParseResult:
    """Result of parsing a CSV file"""
    success: bool
    manufacturer: Manufacturer
    records: List[Dict[str, Any]]
    errors: List[ParseError]
    warnings: List[ParseError]
    column_mapping: Dict[str, str]
    unmapped_columns: List[str]
    total_rows: int
    valid_rows: int
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "manufacturer": self.manufacturer.value,
            "records_count": len(self.records),
            "total_rows": self.total_rows,
            "valid_rows": self.valid_rows,
            "errors": [e.to_dict() for e in self.errors],
            "warnings": [w.to_dict() for w in self.warnings],
            "column_mapping": self.column_mapping,
            "unmapped_columns": self.unmapped_columns
        }


class GPSCSVParser:
    """
    Robust CSV parser for GPS data from multiple manufacturers.
    
    This parser handles various CSV formats including:
    - Different delimiters (, ; tab)
    - Different decimal separators (. ,)
    - BOM markers
    - Various encodings (UTF-8, Latin-1, etc.)
    - Inconsistent column naming
    """
    
    # Common BOM markers
    BOMS = [
        (codecs.BOM_UTF8, 'utf-8-sig'),
        (codecs.BOM_UTF16_LE, 'utf-16-le'),
        (codecs.BOM_UTF16_BE, 'utf-16-be'),
    ]
    
    # Possible delimiters to try
    DELIMITERS = [',', ';', '\t']
    
    # Encodings to try in order
    ENCODINGS = ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
    
    def __init__(self, strict_validation: bool = True):
        """
        Initialize the parser.
        
        Args:
            strict_validation: If True, reject rows with validation errors.
                             If False, log warnings but include the data.
        """
        self.strict_validation = strict_validation
        self.errors: List[ParseError] = []
        self.warnings: List[ParseError] = []
    
    def parse(self, file_content: bytes, filename: str = "unknown.csv") -> ParseResult:
        """
        Parse a CSV file from raw bytes.
        
        Args:
            file_content: Raw bytes of the CSV file
            filename: Original filename (for logging)
            
        Returns:
            ParseResult containing parsed records and any errors
        """
        self.errors = []
        self.warnings = []
        
        # Step 1: Decode the file
        text_content, encoding = self._decode_content(file_content)
        if text_content is None:
            return ParseResult(
                success=False,
                manufacturer=Manufacturer.UNKNOWN,
                records=[],
                errors=self.errors,
                warnings=self.warnings,
                column_mapping={},
                unmapped_columns=[],
                total_rows=0,
                valid_rows=0
            )
        
        logger.info(f"Decoded {filename} using encoding: {encoding}")
        
        # Step 2: Detect delimiter
        delimiter = self._detect_delimiter(text_content)
        logger.info(f"Detected delimiter: '{delimiter}'")
        
        # Step 3: Parse CSV
        try:
            reader = csv.DictReader(
                io.StringIO(text_content),
                delimiter=delimiter
            )
            
            # Get original headers
            if reader.fieldnames is None:
                self.errors.append(ParseError(
                    row_number=0,
                    column="",
                    message="No headers found in CSV file",
                    severity="error"
                ))
                return ParseResult(
                    success=False,
                    manufacturer=Manufacturer.UNKNOWN,
                    records=[],
                    errors=self.errors,
                    warnings=self.warnings,
                    column_mapping={},
                    unmapped_columns=[],
                    total_rows=0,
                    valid_rows=0
                )
            
            original_headers = list(reader.fieldnames)
            normalized_headers = [self._normalize_header(h) for h in original_headers]
            
            # Step 4: Detect manufacturer
            manufacturer = detect_manufacturer_from_columns(normalized_headers)
            logger.info(f"Detected manufacturer: {manufacturer.value}")
            
            # Step 5: Build column mapping
            column_mapping = build_column_mapping(original_headers, manufacturer)
            unmapped = [h for h in original_headers if h not in column_mapping]
            
            if unmapped:
                logger.warning(f"Unmapped columns: {unmapped}")
            
            # Check if required metrics can be mapped
            mapped_metrics = set(column_mapping.values())
            missing_required = [m for m in REQUIRED_METRICS if m not in mapped_metrics]
            
            if missing_required:
                self.errors.append(ParseError(
                    row_number=0,
                    column="",
                    message=f"Missing required metrics: {missing_required}",
                    severity="error"
                ))
                # Continue parsing but flag as potentially incomplete
            
            # Step 6: Parse rows
            records = []
            total_rows = 0
            valid_rows = 0
            
            for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
                total_rows += 1
                record, row_valid = self._parse_row(
                    row,
                    column_mapping,
                    row_num,
                    manufacturer
                )
                
                if record:
                    records.append(record)
                    if row_valid:
                        valid_rows += 1
            
            success = len(self.errors) == 0 or (len(records) > 0 and not self.strict_validation)
            
            return ParseResult(
                success=success,
                manufacturer=manufacturer,
                records=records,
                errors=self.errors,
                warnings=self.warnings,
                column_mapping=column_mapping,
                unmapped_columns=unmapped,
                total_rows=total_rows,
                valid_rows=valid_rows
            )
            
        except csv.Error as e:
            self.errors.append(ParseError(
                row_number=0,
                column="",
                message=f"CSV parsing error: {str(e)}",
                severity="error"
            ))
            return ParseResult(
                success=False,
                manufacturer=Manufacturer.UNKNOWN,
                records=[],
                errors=self.errors,
                warnings=self.warnings,
                column_mapping={},
                unmapped_columns=[],
                total_rows=0,
                valid_rows=0
            )
    
    def _decode_content(self, content: bytes) -> Tuple[Optional[str], Optional[str]]:
        """
        Attempt to decode byte content using various encodings.
        
        Returns:
            Tuple of (decoded_string, encoding_used) or (None, None) on failure
        """
        # Check for BOM first
        for bom, encoding in self.BOMS:
            if content.startswith(bom):
                try:
                    return content.decode(encoding), encoding
                except UnicodeDecodeError:
                    continue
        
        # Try each encoding
        for encoding in self.ENCODINGS:
            try:
                return content.decode(encoding), encoding
            except UnicodeDecodeError:
                continue
        
        self.errors.append(ParseError(
            row_number=0,
            column="",
            message="Unable to decode file with any supported encoding",
            severity="error"
        ))
        return None, None
    
    def _detect_delimiter(self, content: str) -> str:
        """
        Detect the delimiter used in the CSV content.
        
        Uses the csv.Sniffer or falls back to counting occurrences.
        """
        # Take first few lines for detection
        sample = '\n'.join(content.split('\n')[:5])
        
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
            return dialect.delimiter
        except csv.Error:
            pass
        
        # Fallback: count occurrences in first line
        first_line = content.split('\n')[0]
        counts = {d: first_line.count(d) for d in self.DELIMITERS}
        
        # Return delimiter with most occurrences
        return max(counts, key=counts.get)
    
    def _normalize_header(self, header: str) -> str:
        """
        Normalize a header string for matching.
        
        - Lowercase
        - Trim whitespace
        - Remove accents
        - Replace spaces and special chars with underscores
        """
        if header is None:
            return ""
        
        # Strip and lowercase
        normalized = header.strip().lower()
        
        # Remove accents
        normalized = unicodedata.normalize('NFKD', normalized)
        normalized = ''.join(c for c in normalized if not unicodedata.combining(c))
        
        # Replace spaces and special chars with underscores
        normalized = re.sub(r'[^\w]', '_', normalized)
        
        # Collapse multiple underscores
        normalized = re.sub(r'_+', '_', normalized)
        
        # Remove leading/trailing underscores
        normalized = normalized.strip('_')
        
        return normalized
    
    def _parse_numeric(self, value: str) -> Optional[float]:
        """
        Parse a numeric value, handling different decimal separators.
        
        Handles:
        - "1234.56" (dot decimal)
        - "1234,56" (comma decimal)
        - "1.234,56" (European thousands)
        - "1,234.56" (US thousands)
        """
        if value is None or value.strip() == '':
            return None
        
        # Clean the value
        value = value.strip()
        
        # Remove any spaces (thousand separator in some formats)
        value = value.replace(' ', '')
        
        # Determine decimal separator
        # If both . and , are present, the last one is likely the decimal
        has_dot = '.' in value
        has_comma = ',' in value
        
        if has_dot and has_comma:
            # Determine which is decimal separator based on position
            dot_pos = value.rfind('.')
            comma_pos = value.rfind(',')
            
            if dot_pos > comma_pos:
                # Format: 1,234.56 (US) - comma is thousands
                value = value.replace(',', '')
            else:
                # Format: 1.234,56 (EU) - dot is thousands, comma is decimal
                value = value.replace('.', '').replace(',', '.')
        elif has_comma:
            # Could be decimal separator (European)
            # Check if it looks like thousands separator
            parts = value.split(',')
            if len(parts) == 2 and len(parts[1]) != 3:
                # Likely decimal separator
                value = value.replace(',', '.')
            elif len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3):
                # Likely thousands separator
                value = value.replace(',', '')
        
        try:
            return float(value)
        except ValueError:
            return None
    
    def _parse_row(
        self,
        row: Dict[str, str],
        column_mapping: Dict[str, str],
        row_number: int,
        manufacturer: Manufacturer
    ) -> Tuple[Optional[Dict[str, Any]], bool]:
        """
        Parse a single row of data.
        
        Returns:
            Tuple of (parsed_record, is_valid)
        """
        record = {}
        is_valid = True
        
        # Map columns to canonical names
        for original_col, canonical_name in column_mapping.items():
            raw_value = row.get(original_col, '')
            
            # Handle special non-numeric fields
            if canonical_name in ['player_name', 'period_name', 'session_date']:
                record[canonical_name] = raw_value.strip() if raw_value else None
                continue
            
            # Parse numeric value
            parsed_value = self._parse_numeric(raw_value)
            
            if parsed_value is None:
                if canonical_name in REQUIRED_METRICS:
                    self.errors.append(ParseError(
                        row_number=row_number,
                        column=original_col,
                        message=f"Required metric '{canonical_name}' has invalid value: '{raw_value}'",
                        severity="error"
                    ))
                    is_valid = False
                continue
            
            # Validate against metric definition
            valid, error_msg = validate_metric_value(canonical_name, parsed_value)
            
            if not valid:
                if self.strict_validation:
                    self.warnings.append(ParseError(
                        row_number=row_number,
                        column=original_col,
                        message=error_msg,
                        severity="warning"
                    ))
                # Still include the value but flag as potentially invalid
            
            record[canonical_name] = parsed_value
        
        # Check for required metrics
        for required_metric in REQUIRED_METRICS:
            if required_metric not in record or record[required_metric] is None:
                # Only flag as error if we had a mapping for it
                if any(v == required_metric for v in column_mapping.values()):
                    is_valid = False
        
        # Add metadata
        record['_row_number'] = row_number
        record['_manufacturer'] = manufacturer.value
        record['_parsed_at'] = datetime.utcnow().isoformat()
        
        return record, is_valid
    
    def parse_file(self, file_path: str) -> ParseResult:
        """
        Parse a CSV file from a file path.
        
        Args:
            file_path: Path to the CSV file
            
        Returns:
            ParseResult containing parsed records and any errors
        """
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            return self.parse(content, filename=file_path)
        except IOError as e:
            self.errors.append(ParseError(
                row_number=0,
                column="",
                message=f"Failed to read file: {str(e)}",
                severity="error"
            ))
            return ParseResult(
                success=False,
                manufacturer=Manufacturer.UNKNOWN,
                records=[],
                errors=self.errors,
                warnings=self.warnings,
                column_mapping={},
                unmapped_columns=[],
                total_rows=0,
                valid_rows=0
            )


def parse_gps_csv(file_content: bytes, filename: str = "upload.csv", strict: bool = True) -> ParseResult:
    """
    Convenience function to parse a GPS CSV file.
    
    Args:
        file_content: Raw bytes of the CSV file
        filename: Original filename
        strict: Whether to use strict validation
        
    Returns:
        ParseResult containing parsed records and any errors
    """
    parser = GPSCSVParser(strict_validation=strict)
    return parser.parse(file_content, filename)
