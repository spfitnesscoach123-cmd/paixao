"""
Canonical Data Models for Jump Import
=====================================

Defines the standardized data structures for jump data,
regardless of the source hardware manufacturer.

All data from any contact mat or force plate system is
normalized to these canonical models before storage.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List, Literal
from pydantic import BaseModel, Field, field_validator
from enum import Enum


class JumpType(str, Enum):
    """
    Supported jump types in the canonical model.
    
    SJ  - Squat Jump (no countermovement, from static squat position)
    CMJ - Countermovement Jump (with arm swing or hands on hips)
    DJ  - Drop Jump (reactive jump from elevated platform)
    RJ  - Repeated Jumps / Reactive Jumps (multiple consecutive jumps)
    """
    SJ = "SJ"
    CMJ = "CMJ"
    DJ = "DJ"
    RJ = "RJ"


class JumpRecord(BaseModel):
    """
    Canonical jump record model.
    
    All imported jump data is normalized to this structure.
    Units are standardized:
    - jump_height_cm: centimeters
    - flight_time_s: seconds
    - contact_time_s: seconds
    - takeoff_velocity_m_s: meters per second
    - peak_power_w: watts (absolute)
    - load_kg: kilograms
    """
    
    # Athlete identification (required)
    athlete_id: str = Field(
        ...,
        description="Internal athlete ID (must exist in system)"
    )
    
    # Optional external ID for traceability
    athlete_external_id: Optional[str] = Field(
        None,
        description="External athlete ID from source system"
    )
    
    # Jump classification (required)
    jump_type: JumpType = Field(
        ...,
        description="Type of jump performed"
    )
    
    # Primary metrics (at least one of flight_time or jump_height required)
    jump_height_cm: Optional[float] = Field(
        None,
        ge=0,
        le=150,  # World record is ~46cm for CMJ, allow margin
        description="Jump height in centimeters"
    )
    
    flight_time_s: Optional[float] = Field(
        None,
        ge=0,
        le=2.0,  # Physical limit ~1.5s for elite athletes
        description="Flight time in seconds"
    )
    
    contact_time_s: Optional[float] = Field(
        None,
        ge=0,
        le=2.0,
        description="Ground contact time in seconds (DJ/RJ only)"
    )
    
    # Derived/calculated metrics
    reactive_strength_index: Optional[float] = Field(
        None,
        ge=0,
        description="RSI = jump_height_cm / contact_time_s"
    )
    
    # Power metrics
    peak_power_w: Optional[float] = Field(
        None,
        ge=0,
        description="Peak power in watts (absolute)"
    )
    
    takeoff_velocity_m_s: Optional[float] = Field(
        None,
        ge=0,
        le=10.0,  # Physical limit ~5 m/s for elite
        description="Takeoff velocity in m/s"
    )
    
    # Load/weight metrics
    load_kg: Optional[float] = Field(
        None,
        ge=0,
        description="External load in kg (for loaded jumps)"
    )
    
    # Temporal data (required)
    jump_date: datetime = Field(
        ...,
        description="Date and time of the jump"
    )
    
    # Source tracking (required)
    source_system: str = Field(
        ...,
        description="Manufacturer/system that produced this data"
    )
    
    # Raw data preservation for audit
    raw_row: Dict[str, Any] = Field(
        default_factory=dict,
        description="Original CSV row data for audit trail"
    )
    
    # Optional metadata
    attempt_number: Optional[int] = Field(
        None,
        ge=1,
        description="Attempt number within a test session"
    )
    
    test_id: Optional[str] = Field(
        None,
        description="Test session identifier"
    )
    
    protocol: Optional[str] = Field(
        None,
        description="Test protocol used"
    )
    
    notes: Optional[str] = Field(
        None,
        description="Additional notes or comments"
    )
    
    @field_validator('jump_type', mode='before')
    @classmethod
    def normalize_jump_type(cls, v):
        """Normalize jump type strings to enum values."""
        if isinstance(v, JumpType):
            return v
        if isinstance(v, str):
            v_upper = v.upper().strip()
            # Handle common aliases
            aliases = {
                "SQUAT JUMP": "SJ",
                "SQUAT_JUMP": "SJ",
                "COUNTERMOVEMENT JUMP": "CMJ",
                "COUNTERMOVEMENT_JUMP": "CMJ",
                "COUNTER MOVEMENT JUMP": "CMJ",
                "DROP JUMP": "DJ",
                "DROP_JUMP": "DJ",
                "DEPTH JUMP": "DJ",
                "REACTIVE JUMP": "RJ",
                "REACTIVE_JUMP": "RJ",
                "REPEATED JUMP": "RJ",
                "REPEATED JUMPS": "RJ",
            }
            return aliases.get(v_upper, v_upper)
        return v


class JumpValidationError(BaseModel):
    """
    Validation error for a jump record.
    
    Contains detailed information about why a row failed validation,
    including the row number, field name, error type, and message.
    """
    
    row_number: int = Field(
        ...,
        description="CSV row number (1-indexed, excluding header)"
    )
    
    field: Optional[str] = Field(
        None,
        description="Field that caused the error"
    )
    
    error_type: str = Field(
        ...,
        description="Category of error (parse, validation, business_rule)"
    )
    
    message: str = Field(
        ...,
        description="Human-readable error description"
    )
    
    raw_value: Optional[Any] = Field(
        None,
        description="The problematic value from the CSV"
    )
    
    raw_row: Optional[Dict[str, Any]] = Field(
        None,
        description="Complete raw row for context"
    )


class JumpImportResult(BaseModel):
    """
    Result of processing a jump CSV file.
    
    Contains both valid records ready for import and
    detailed validation errors for failed rows.
    """
    
    valid_records: List[JumpRecord] = Field(
        default_factory=list,
        description="Successfully validated jump records"
    )
    
    errors: List[JumpValidationError] = Field(
        default_factory=list,
        description="Validation errors by row"
    )
    
    total_rows: int = Field(
        ...,
        description="Total number of data rows in CSV"
    )
    
    valid_count: int = Field(
        ...,
        description="Number of valid records"
    )
    
    error_count: int = Field(
        ...,
        description="Number of rows with errors"
    )


class JumpPreviewResult(BaseModel):
    """
    Preview result for jump CSV upload.
    
    Used by the preview endpoint to show what will be imported
    without actually saving to the database.
    """
    
    valid_records: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Preview of valid records (as dicts)"
    )
    
    errors: List[JumpValidationError] = Field(
        default_factory=list,
        description="Validation errors"
    )
    
    total_rows: int = Field(
        ...,
        description="Total rows in CSV"
    )
    
    valid_count: int = Field(
        ...,
        description="Number of valid records"
    )
    
    error_count: int = Field(
        ...,
        description="Number of errors"
    )
    
    detected_manufacturer: str = Field(
        ...,
        description="Detected source system/manufacturer"
    )
    
    calculated_metrics: List[str] = Field(
        default_factory=list,
        description="List of metrics that will be auto-calculated"
    )
    
    athletes_not_found: List[str] = Field(
        default_factory=list,
        description="List of athlete IDs not found in system"
    )
    
    jump_types_found: List[str] = Field(
        default_factory=list,
        description="Unique jump types found in the data"
    )
