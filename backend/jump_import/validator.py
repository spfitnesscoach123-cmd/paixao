"""
Jump Data Validator
===================

Validates jump records against:
1. Schema requirements (required fields, data types)
2. Business rules (jump type specific requirements)
3. Data integrity (athlete existence, value ranges)

Business Rules:
- DJ and RJ require contact_time_s
- CMJ and SJ must have contact_time_s as null
- athlete_id must reference an existing athlete
- Empty CSV fields → null (never zero)
"""

from typing import Dict, Any, Optional, Set, Tuple, Union, List
from datetime import datetime
from .models import JumpRecord, JumpValidationError, JumpType


class JumpValidator:
    """
    Validator for jump records with comprehensive business rule enforcement.
    """
    
    # Jump types that REQUIRE contact_time_s
    CONTACT_TIME_REQUIRED_TYPES = {JumpType.DJ, JumpType.RJ, "DJ", "RJ"}
    
    # Jump types that MUST NOT have contact_time_s
    CONTACT_TIME_FORBIDDEN_TYPES = {JumpType.CMJ, JumpType.SJ, "CMJ", "SJ"}
    
    # Required fields for all jump records
    REQUIRED_FIELDS = {
        'athlete_id',
        'jump_type',
        'jump_date',
        'source_system',
    }
    
    # At least one of these must be present
    PRIMARY_METRICS = {'flight_time_s', 'jump_height_cm'}
    
    def __init__(self, existing_athlete_ids: Set[str] = None):
        """
        Initialize validator.
        
        Args:
            existing_athlete_ids: Set of valid athlete IDs in the system.
                                 If None, athlete validation is skipped.
        """
        self._existing_athletes = existing_athlete_ids or set()
        self._athletes_not_found: Set[str] = set()
    
    @property
    def athletes_not_found(self) -> Set[str]:
        """Return set of athlete IDs that were not found in the system."""
        return self._athletes_not_found.copy()
    
    def validate(
        self,
        row_data: Dict[str, Any],
        row_number: int
    ) -> Tuple[bool, Union[JumpRecord, JumpValidationError]]:
        """
        Validate a single row and return either a valid record or an error.
        
        Args:
            row_data: Normalized row data from parser
            row_number: CSV row number for error reporting
            
        Returns:
            Tuple of (is_valid, JumpRecord or JumpValidationError)
        """
        errors = []
        
        # 1. Check required fields
        for field in self.REQUIRED_FIELDS:
            value = row_data.get(field)
            if value is None or (isinstance(value, str) and value.strip() == ''):
                errors.append(self._create_error(
                    row_number=row_number,
                    field=field,
                    error_type='required_field',
                    message=f"Campo obrigatório '{field}' está vazio ou ausente",
                    raw_value=value,
                    raw_row=row_data
                ))
        
        # 2. Check that at least one primary metric exists
        has_primary = any(
            row_data.get(field) is not None and 
            (not isinstance(row_data.get(field), str) or row_data.get(field).strip() != '')
            for field in self.PRIMARY_METRICS
        )
        if not has_primary:
            errors.append(self._create_error(
                row_number=row_number,
                field='flight_time_s/jump_height_cm',
                error_type='required_field',
                message="É necessário pelo menos 'flight_time_s' ou 'jump_height_cm'",
                raw_value=None,
                raw_row=row_data
            ))
        
        # 3. Validate athlete exists in system
        athlete_id = row_data.get('athlete_id')
        if athlete_id and self._existing_athletes:
            if str(athlete_id) not in self._existing_athletes:
                self._athletes_not_found.add(str(athlete_id))
                errors.append(self._create_error(
                    row_number=row_number,
                    field='athlete_id',
                    error_type='athlete_not_found',
                    message=f"Atleta '{athlete_id}' não encontrado no sistema. Cadastre o atleta antes de importar.",
                    raw_value=athlete_id,
                    raw_row=row_data
                ))
        
        # 4. Validate jump type
        jump_type = row_data.get('jump_type')
        if jump_type:
            jump_type_upper = str(jump_type).upper().strip()
            valid_types = {jt.value for jt in JumpType}
            if jump_type_upper not in valid_types:
                errors.append(self._create_error(
                    row_number=row_number,
                    field='jump_type',
                    error_type='invalid_value',
                    message=f"Tipo de salto '{jump_type}' inválido. Valores aceitos: {', '.join(valid_types)}",
                    raw_value=jump_type,
                    raw_row=row_data
                ))
            else:
                # 5. Validate contact_time rules based on jump type
                contact_time = self._get_numeric(row_data, 'contact_time_s')
                
                if jump_type_upper in {'DJ', 'RJ'}:
                    # Contact time is REQUIRED for DJ and RJ
                    if contact_time is None:
                        errors.append(self._create_error(
                            row_number=row_number,
                            field='contact_time_s',
                            error_type='business_rule',
                            message=f"contact_time_s é obrigatório para saltos do tipo {jump_type_upper}",
                            raw_value=row_data.get('contact_time_s'),
                            raw_row=row_data
                        ))
                
                elif jump_type_upper in {'CMJ', 'SJ'}:
                    # Contact time MUST BE NULL for CMJ and SJ
                    if contact_time is not None:
                        errors.append(self._create_error(
                            row_number=row_number,
                            field='contact_time_s',
                            error_type='business_rule',
                            message=f"contact_time_s deve ser nulo para saltos do tipo {jump_type_upper}. Valor recebido: {contact_time}",
                            raw_value=contact_time,
                            raw_row=row_data
                        ))
        
        # 6. Validate numeric ranges
        range_validations = [
            ('flight_time_s', 0, 2.0, 'segundos'),
            ('contact_time_s', 0, 2.0, 'segundos'),
            ('jump_height_cm', 0, 150, 'cm'),
            ('takeoff_velocity_m_s', 0, 10.0, 'm/s'),
            ('peak_power_w', 0, 10000, 'W'),
            ('load_kg', 0, 500, 'kg'),
        ]
        
        for field, min_val, max_val, unit in range_validations:
            value = self._get_numeric(row_data, field)
            if value is not None:
                if value < min_val or value > max_val:
                    errors.append(self._create_error(
                        row_number=row_number,
                        field=field,
                        error_type='value_range',
                        message=f"Valor de '{field}' ({value} {unit}) fora do intervalo aceitável [{min_val}, {max_val}]",
                        raw_value=value,
                        raw_row=row_data
                    ))
        
        # 7. Validate date format
        jump_date = row_data.get('jump_date')
        if jump_date:
            if not isinstance(jump_date, datetime):
                try:
                    self._parse_date(jump_date)
                except ValueError as e:
                    errors.append(self._create_error(
                        row_number=row_number,
                        field='jump_date',
                        error_type='invalid_format',
                        message=f"Formato de data inválido: {jump_date}. Use YYYY-MM-DD ou DD/MM/YYYY",
                        raw_value=jump_date,
                        raw_row=row_data
                    ))
        
        # Return first error if any exist
        if errors:
            return False, errors[0]
        
        # Create valid JumpRecord
        try:
            record = self._create_record(row_data)
            return True, record
        except Exception as e:
            return False, self._create_error(
                row_number=row_number,
                field=None,
                error_type='parse_error',
                message=f"Erro ao criar registro: {str(e)}",
                raw_value=None,
                raw_row=row_data
            )
    
    def validate_batch(
        self,
        rows: List[Dict[str, Any]]
    ) -> Tuple[List[JumpRecord], List[JumpValidationError]]:
        """
        Validate multiple rows and return valid records and errors.
        
        Args:
            rows: List of normalized row data
            
        Returns:
            Tuple of (valid_records, errors)
        """
        valid_records = []
        errors = []
        
        for i, row in enumerate(rows, start=2):  # Row 1 is header
            is_valid, result = self.validate(row, i)
            if is_valid:
                valid_records.append(result)
            else:
                errors.append(result)
        
        return valid_records, errors
    
    def _create_error(
        self,
        row_number: int,
        field: Optional[str],
        error_type: str,
        message: str,
        raw_value: Any,
        raw_row: Dict[str, Any]
    ) -> JumpValidationError:
        """Create a validation error object."""
        return JumpValidationError(
            row_number=row_number,
            field=field,
            error_type=error_type,
            message=message,
            raw_value=raw_value,
            raw_row=raw_row
        )
    
    def _get_numeric(self, data: Dict[str, Any], field: str) -> Optional[float]:
        """
        Safely extract numeric value.
        
        Returns None for empty strings, None, or non-numeric values.
        Returns actual 0.0 only if value is explicitly 0.
        """
        value = data.get(field)
        
        if value is None:
            return None
        
        if isinstance(value, str):
            value = value.strip()
            if value == '':
                return None
            try:
                return float(value)
            except ValueError:
                return None
        
        if isinstance(value, (int, float)):
            return float(value)
        
        return None
    
    def _parse_date(self, date_value: Any) -> datetime:
        """Parse various date formats to datetime."""
        if isinstance(date_value, datetime):
            return date_value
        
        if isinstance(date_value, str):
            date_str = date_value.strip()
            
            # Try ISO format first (YYYY-MM-DD)
            formats = [
                '%Y-%m-%d',
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M:%S.%f',
                '%Y-%m-%d %H:%M:%S',
                '%d/%m/%Y',
                '%d/%m/%Y %H:%M:%S',
                '%m/%d/%Y',
                '%d-%m-%Y',
            ]
            
            for fmt in formats:
                try:
                    return datetime.strptime(date_str, fmt)
                except ValueError:
                    continue
            
            raise ValueError(f"Unable to parse date: {date_str}")
        
        raise ValueError(f"Invalid date type: {type(date_value)}")
    
    def _create_record(self, row_data: Dict[str, Any]) -> JumpRecord:
        """Create a JumpRecord from validated row data."""
        # Parse date
        jump_date = row_data.get('jump_date')
        if not isinstance(jump_date, datetime):
            jump_date = self._parse_date(jump_date)
        
        # Build record dict with only non-None values
        record_data = {
            'athlete_id': str(row_data['athlete_id']),
            'jump_type': str(row_data['jump_type']).upper().strip(),
            'jump_date': jump_date,
            'source_system': str(row_data['source_system']),
            'raw_row': row_data.copy(),
        }
        
        # Optional fields
        optional_fields = [
            ('athlete_external_id', str),
            ('jump_height_cm', float),
            ('flight_time_s', float),
            ('contact_time_s', float),
            ('reactive_strength_index', float),
            ('peak_power_w', float),
            ('takeoff_velocity_m_s', float),
            ('load_kg', float),
            ('attempt_number', int),
            ('test_id', str),
            ('protocol', str),
            ('notes', str),
        ]
        
        for field, converter in optional_fields:
            value = row_data.get(field)
            if value is not None:
                if isinstance(value, str) and value.strip() == '':
                    continue
                try:
                    record_data[field] = converter(value)
                except (ValueError, TypeError):
                    pass
        
        return JumpRecord(**record_data)


# Module-level convenience function
def validate_jump_record(
    row_data: Dict[str, Any],
    row_number: int,
    existing_athlete_ids: Set[str] = None
) -> Tuple[bool, Union[JumpRecord, JumpValidationError]]:
    """
    Validate a single jump record.
    
    Convenience function for use without instantiating JumpValidator.
    
    Args:
        row_data: Normalized row data
        row_number: CSV row number
        existing_athlete_ids: Set of valid athlete IDs
        
    Returns:
        Tuple of (is_valid, JumpRecord or JumpValidationError)
    """
    validator = JumpValidator(existing_athlete_ids)
    return validator.validate(row_data, row_number)
