"""
Jump CSV Parser
===============

Safe and tolerant CSV parsing for jump data from various manufacturers.
Handles heterogeneous data formats, different separators, and encoding issues.

Features:
- Auto-detect CSV delimiter (comma, semicolon, tab)
- Handle BOM markers and various encodings
- Detect manufacturer from headers/content
- Map manufacturer-specific columns to canonical names
"""

import csv
import io
from typing import Dict, Any, List, Tuple, Optional
from .models import JumpValidationError
from .mappers import get_mapper, detect_manufacturer_from_headers


class JumpCSVParser:
    """
    Tolerant CSV parser for jump data.
    
    Handles various CSV formats from different contact mat manufacturers.
    """
    
    # Common encodings to try
    ENCODINGS = ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
    
    # Possible delimiters
    DELIMITERS = [',', ';', '\t', '|']
    
    def __init__(self):
        """Initialize parser."""
        self._detected_manufacturer: Optional[str] = None
        self._detected_delimiter: Optional[str] = None
        self._original_headers: List[str] = []
    
    @property
    def detected_manufacturer(self) -> Optional[str]:
        """Return the detected manufacturer/source system."""
        return self._detected_manufacturer
    
    @property
    def original_headers(self) -> List[str]:
        """Return the original CSV headers."""
        return self._original_headers.copy()
    
    def parse(
        self,
        file_content: bytes,
        filename: str = "upload.csv"
    ) -> Tuple[List[Dict[str, Any]], List[JumpValidationError]]:
        """
        Parse CSV content into normalized rows.
        
        Args:
            file_content: Raw CSV file bytes
            filename: Original filename (used for manufacturer detection)
            
        Returns:
            Tuple of (normalized_rows, parse_errors)
        """
        errors = []
        
        # Try to decode with various encodings
        text_content = None
        used_encoding = None
        
        for encoding in self.ENCODINGS:
            try:
                text_content = file_content.decode(encoding)
                used_encoding = encoding
                break
            except UnicodeDecodeError:
                continue
        
        if text_content is None:
            errors.append(JumpValidationError(
                row_number=0,
                field=None,
                error_type='encoding_error',
                message='Não foi possível decodificar o arquivo CSV. Verifique a codificação.',
                raw_value=None,
                raw_row=None
            ))
            return [], errors
        
        # Detect delimiter
        delimiter = self._detect_delimiter(text_content)
        self._detected_delimiter = delimiter
        
        # Parse CSV
        reader = csv.DictReader(io.StringIO(text_content), delimiter=delimiter)
        
        # Get headers
        try:
            self._original_headers = reader.fieldnames or []
        except Exception as e:
            errors.append(JumpValidationError(
                row_number=0,
                field=None,
                error_type='parse_error',
                message=f'Erro ao ler cabeçalhos do CSV: {str(e)}',
                raw_value=None,
                raw_row=None
            ))
            return [], errors
        
        if not self._original_headers:
            errors.append(JumpValidationError(
                row_number=0,
                field=None,
                error_type='parse_error',
                message='CSV não contém cabeçalhos válidos.',
                raw_value=None,
                raw_row=None
            ))
            return [], errors
        
        # Detect manufacturer from headers
        self._detected_manufacturer = detect_manufacturer_from_headers(
            self._original_headers,
            filename
        )
        
        # Get appropriate mapper
        mapper = get_mapper(self._detected_manufacturer)
        
        # Parse rows
        normalized_rows = []
        row_num = 1  # Header is row 1
        
        for raw_row in reader:
            row_num += 1
            
            try:
                # Normalize the row using the mapper
                normalized = mapper.map_row(raw_row)
                
                # Convert empty strings to None (business rule: empty → null)
                for key, value in normalized.items():
                    if isinstance(value, str) and value.strip() == '':
                        normalized[key] = None
                
                # Add source system if not present
                if 'source_system' not in normalized or not normalized['source_system']:
                    normalized['source_system'] = self._detected_manufacturer
                
                # Preserve raw row for audit
                normalized['raw_row'] = dict(raw_row)
                
                normalized_rows.append(normalized)
                
            except Exception as e:
                errors.append(JumpValidationError(
                    row_number=row_num,
                    field=None,
                    error_type='parse_error',
                    message=f'Erro ao processar linha: {str(e)}',
                    raw_value=None,
                    raw_row=dict(raw_row) if raw_row else None
                ))
        
        return normalized_rows, errors
    
    def _detect_delimiter(self, text: str) -> str:
        """
        Auto-detect the CSV delimiter.
        
        Uses csv.Sniffer first, then falls back to counting occurrences.
        """
        # Try csv.Sniffer first
        try:
            sample = text[:4096]  # First 4KB
            dialect = csv.Sniffer().sniff(sample, delimiters=',;\t|')
            return dialect.delimiter
        except csv.Error:
            pass
        
        # Fallback: count occurrences in first line
        first_line = text.split('\n')[0] if '\n' in text else text
        
        counts = {d: first_line.count(d) for d in self.DELIMITERS}
        
        # Return delimiter with most occurrences (minimum 1)
        best_delimiter = max(counts.items(), key=lambda x: x[1])
        
        if best_delimiter[1] > 0:
            return best_delimiter[0]
        
        # Default to comma
        return ','


def parse_jump_csv(
    file_content: bytes,
    filename: str = "upload.csv"
) -> Tuple[List[Dict[str, Any]], List[JumpValidationError], str]:
    """
    Parse jump CSV file.
    
    Convenience function for use without instantiating JumpCSVParser.
    
    Args:
        file_content: Raw CSV file bytes
        filename: Original filename
        
    Returns:
        Tuple of (normalized_rows, errors, detected_manufacturer)
    """
    parser = JumpCSVParser()
    rows, errors = parser.parse(file_content, filename)
    return rows, errors, parser.detected_manufacturer or 'generic'


def detect_manufacturer(
    file_content: bytes,
    filename: str = "upload.csv"
) -> str:
    """
    Detect the manufacturer from CSV content without full parsing.
    
    Args:
        file_content: Raw CSV file bytes
        filename: Original filename
        
    Returns:
        Detected manufacturer name
    """
    # Try to decode
    text = None
    for encoding in JumpCSVParser.ENCODINGS:
        try:
            text = file_content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    
    if not text:
        return 'generic'
    
    # Get first line (headers)
    first_line = text.split('\n')[0] if '\n' in text else text
    
    # Detect delimiter
    delimiter = ','
    for d in [';', '\t', '|']:
        if d in first_line and first_line.count(d) > first_line.count(','):
            delimiter = d
            break
    
    headers = [h.strip().strip('"') for h in first_line.split(delimiter)]
    
    return detect_manufacturer_from_headers(headers, filename)
