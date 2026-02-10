"""
Identity Resolver Module
========================

Resolves athlete identity across multiple data sources where
the same athlete may appear with different name variations.

Core Principles:
1. athlete_id is the ONLY unique identifier
2. Names are descriptive attributes, NOT identifiers
3. Ambiguous matches ALWAYS require manual confirmation
4. Aliases are persisted for future automatic resolution

Author: Load Manager Team
Version: 1.0.0
"""

from .normalizer import (
    normalize_name,
    normalize_for_comparison,
)
from .matcher import (
    NameMatcher,
    MatchResult,
    MatchConfidence,
    find_candidates,
)
from .resolver import (
    IdentityResolver,
    ResolutionResult,
    ResolutionStatus,
    resolve_athlete_name,
)
from .models import (
    AthleteAlias,
    AliasCreate,
    UnresolvedAthlete,
    ResolutionCandidate,
    ConfirmAliasRequest,
    BulkResolutionRequest,
)


__all__ = [
    # Normalizer
    'normalize_name',
    'normalize_for_comparison',
    # Matcher
    'NameMatcher',
    'MatchResult',
    'MatchConfidence',
    'find_candidates',
    # Resolver
    'IdentityResolver',
    'ResolutionResult',
    'ResolutionStatus',
    'resolve_athlete_name',
    # Models
    'AthleteAlias',
    'AliasCreate',
    'UnresolvedAthlete',
    'ResolutionCandidate',
    'ConfirmAliasRequest',
    'BulkResolutionRequest',
]
