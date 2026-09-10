"""
Pydantic Models for Identity Resolution
=======================================

Data models for athlete aliases and resolution workflow.
"""

from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field
from enum import Enum


class AthleteAlias(BaseModel):
    """
    Persistent mapping between a name variation and an athlete_id.
    
    This is the core persistence model for identity resolution.
    Once created, this mapping is automatically used for future imports.
    """
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str = Field(..., description="Internal athlete ID (immutable)")
    coach_id: str = Field(..., description="Owner of this mapping")
    alias_normalized: str = Field(..., description="Normalized name for matching")
    alias_original: str = Field(..., description="Original name as found in CSV")
    source_system: str = Field(..., description="Origin: gps, jump_data, manual, etc.")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(None, description="User who created this alias")
    
    class Config:
        populate_by_name = True


class AliasCreate(BaseModel):
    """Request model for creating a new alias."""
    athlete_id: str = Field(..., description="Target athlete ID")
    alias_original: str = Field(..., description="Name as it appears in CSV")
    source_system: str = Field(default="manual", description="Origin system")


class ResolutionCandidate(BaseModel):
    """
    A potential match for an unresolved name.
    
    Presented to the coach as a suggestion during resolution.
    """
    athlete_id: str
    athlete_name: str
    similarity_score: float = Field(..., ge=0, le=100, description="Match confidence 0-100")
    match_reason: str = Field(..., description="Why this candidate was suggested")
    existing_aliases: List[str] = Field(default_factory=list, description="Known aliases for this athlete")


class UnresolvedAthlete(BaseModel):
    """
    Represents a name from CSV that could not be automatically resolved.
    
    Contains the original name, row numbers where it appears,
    and candidate matches for manual resolution.
    """
    original_name: str = Field(..., description="Name as found in CSV")
    normalized_name: str = Field(..., description="Normalized version for display")
    row_numbers: List[int] = Field(default_factory=list, description="CSV rows with this name")
    row_count: int = Field(0, description="Number of affected rows")
    candidates: List[ResolutionCandidate] = Field(default_factory=list)
    resolution_required: bool = Field(True, description="Must be resolved before import")
    suggested_action: str = Field("select_or_create", description="Recommended action")
    
    def to_dict(self):
        return {
            "original_name": self.original_name,
            "normalized_name": self.normalized_name,
            "row_numbers": self.row_numbers,
            "row_count": self.row_count,
            "candidates": [c.model_dump() for c in self.candidates],
            "resolution_required": self.resolution_required,
            "suggested_action": self.suggested_action,
        }


class ResolutionStatus(str, Enum):
    """Status of a resolution attempt."""
    RESOLVED = "resolved"              # Successfully matched to existing athlete
    ALIAS_CREATED = "alias_created"    # New alias created for existing athlete
    NEEDS_CONFIRMATION = "needs_confirmation"  # Multiple candidates, needs manual choice
    NOT_FOUND = "not_found"            # No candidates found, must create athlete
    ERROR = "error"                    # Resolution failed


class ResolutionResult(BaseModel):
    """Result of attempting to resolve a name."""
    status: ResolutionStatus
    original_name: str
    normalized_name: str
    athlete_id: Optional[str] = None
    athlete_name: Optional[str] = None
    candidates: List[Any] = Field(default_factory=list)
    message: str = ""
    alias_id: Optional[str] = None  # If alias was created/used


class BulkResolutionRequest(BaseModel):
    """Request to resolve multiple names at once."""
    names: List[str] = Field(..., description="List of names to resolve")
    source_system: str = Field(default="csv", description="Origin system")


class ConfirmAliasRequest(BaseModel):
    """Request to confirm a name -> athlete mapping."""
    original_name: str = Field(..., description="Name as found in CSV")
    athlete_id: str = Field(..., description="Confirmed athlete ID")
    source_system: str = Field(default="manual", description="Origin system")
