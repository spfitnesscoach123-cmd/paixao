"""
Identity Resolver
=================

Main resolution engine that orchestrates:
1. Alias lookup (exact match from previous resolutions)
2. Fuzzy matching (suggestions based on similarity)
3. Resolution confirmation (persisting new aliases)

This is the primary interface for all import pipelines.
"""

from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum

from .models import (
    AthleteAlias,
    AliasCreate,
    UnresolvedAthlete,
    ResolutionCandidate,
    ResolutionStatus,
    ResolutionResult,
)
from .normalizer import normalize_name, normalize_for_comparison
from .matcher import NameMatcher, MatchConfidence


class IdentityResolver:
    """
    Core identity resolution engine.
    
    Resolves athlete names from CSV to internal athlete_ids.
    Uses a three-step process:
    
    1. **Alias Lookup**: Check if name has been previously resolved
    2. **Fuzzy Match**: Find candidates by similarity
    3. **Manual Confirmation**: Require coach decision for ambiguous cases
    
    Attributes:
        similarity_threshold: Minimum score to suggest a candidate (default 85)
    """
    
    SIMILARITY_THRESHOLD = 85  # Default threshold for suggestions
    
    def __init__(self, similarity_threshold: int = None):
        self.similarity_threshold = similarity_threshold or self.SIMILARITY_THRESHOLD
        self.matcher = NameMatcher(threshold_medium=self.similarity_threshold)
    
    async def resolve_names(
        self,
        names: List[str],
        athletes: List[Dict[str, Any]],
        aliases: List[Dict[str, Any]],
        coach_id: str,
        source_system: str = "csv"
    ) -> Tuple[Dict[str, str], List[UnresolvedAthlete]]:
        """
        Resolve a list of names to athlete IDs.
        
        Args:
            names: List of names from CSV
            athletes: List of athlete documents (with _id and name)
            aliases: List of existing alias documents
            coach_id: Current coach's ID
            source_system: Origin system (gps, jump_data, etc.)
            
        Returns:
            Tuple of:
            - Dict mapping resolved names to athlete_ids
            - List of UnresolvedAthlete requiring manual resolution
        """
        # Build aliases lookup
        aliases_by_normalized = {}
        aliases_by_athlete = {}
        
        for alias in aliases:
            if alias.get('coach_id') != coach_id:
                continue
            normalized = alias.get('alias_normalized', '')
            athlete_id = alias.get('athlete_id', '')
            original = alias.get('alias_original', '')
            
            if normalized and athlete_id:
                aliases_by_normalized[normalized] = athlete_id
                if athlete_id not in aliases_by_athlete:
                    aliases_by_athlete[athlete_id] = []
                aliases_by_athlete[athlete_id].append(original)
        
        # Build athletes lookup
        athletes_by_name = {}
        for athlete in athletes:
            aid = str(athlete.get('_id', ''))
            name = athlete.get('name', '')
            if aid and name:
                normalized = normalize_for_comparison(name)
                athletes_by_name[normalized] = aid
                # Also add athlete's own name as an alias
                if aid not in aliases_by_athlete:
                    aliases_by_athlete[aid] = []
                aliases_by_athlete[aid].append(name)
        
        resolved = {}
        unresolved = []
        
        # Track unique names for batch processing
        unique_names = list(set(names))
        name_to_rows = {}
        for i, name in enumerate(names):
            if name not in name_to_rows:
                name_to_rows[name] = []
            name_to_rows[name].append(i + 1)  # 1-indexed rows
        
        for name in unique_names:
            result = self._resolve_single(
                name=name,
                athletes=athletes,
                aliases_by_normalized=aliases_by_normalized,
                aliases_by_athlete=aliases_by_athlete,
                athletes_by_name=athletes_by_name,
            )
            
            if result.status == ResolutionStatus.RESOLVED:
                resolved[name] = result.athlete_id
            else:
                unresolved.append(UnresolvedAthlete(
                    original_name=name,
                    normalized_name=result.normalized_name,
                    row_numbers=name_to_rows.get(name, []),
                    row_count=len(name_to_rows.get(name, [])),
                    candidates=[
                        ResolutionCandidate(
                            athlete_id=c.candidate_id,
                            athlete_name=c.candidate_name,
                            similarity_score=c.similarity_score,
                            match_reason=c.match_reason,
                            existing_aliases=c.existing_aliases,
                        )
                        for c in result.candidates
                    ],
                    resolution_required=True,
                    suggested_action=self._suggest_action(result),
                ))
        
        return resolved, unresolved
    
    def _resolve_single(
        self,
        name: str,
        athletes: List[Dict[str, Any]],
        aliases_by_normalized: Dict[str, str],
        aliases_by_athlete: Dict[str, List[str]],
        athletes_by_name: Dict[str, str],
    ) -> ResolutionResult:
        """Resolve a single name."""
        normalized = normalize_for_comparison(name)
        
        if not normalized:
            return ResolutionResult(
                status=ResolutionStatus.ERROR,
                original_name=name,
                normalized_name="",
                message="Nome vazio ou inválido",
            )
        
        # Step 1: Check for exact alias match
        if normalized in aliases_by_normalized:
            athlete_id = aliases_by_normalized[normalized]
            # Find athlete name
            athlete_name = None
            for athlete in athletes:
                if str(athlete.get('_id', '')) == athlete_id:
                    athlete_name = athlete.get('name', '')
                    break
            
            return ResolutionResult(
                status=ResolutionStatus.RESOLVED,
                original_name=name,
                normalized_name=normalized,
                athlete_id=athlete_id,
                athlete_name=athlete_name,
                message="Resolvido via alias existente",
            )
        
        # Step 2: Check for exact athlete name match
        if normalized in athletes_by_name:
            athlete_id = athletes_by_name[normalized]
            athlete_name = None
            for athlete in athletes:
                if str(athlete.get('_id', '')) == athlete_id:
                    athlete_name = athlete.get('name', '')
                    break
            
            return ResolutionResult(
                status=ResolutionStatus.RESOLVED,
                original_name=name,
                normalized_name=normalized,
                athlete_id=athlete_id,
                athlete_name=athlete_name,
                message="Resolvido via nome exato",
            )
        
        # Step 3: Fuzzy matching
        matches = self.matcher.match(name, athletes, aliases_by_athlete)
        
        # Filter to only medium+ confidence
        good_matches = [
            m for m in matches 
            if m.confidence in [MatchConfidence.EXACT, MatchConfidence.HIGH, MatchConfidence.MEDIUM]
        ]
        
        if not matches:
            return ResolutionResult(
                status=ResolutionStatus.NOT_FOUND,
                original_name=name,
                normalized_name=normalized,
                candidates=[],
                message="Nenhum candidato encontrado. Criar novo atleta?",
            )
        
        # Single high-confidence match could be auto-resolved
        # But we NEVER auto-resolve - always require confirmation
        return ResolutionResult(
            status=ResolutionStatus.NEEDS_CONFIRMATION,
            original_name=name,
            normalized_name=normalized,
            candidates=matches[:5],  # Top 5 candidates
            message=f"{len(matches)} candidato(s) encontrado(s). Confirme a associação.",
        )
    
    def _suggest_action(self, result: ResolutionResult) -> str:
        """Suggest action based on resolution result."""
        if result.status == ResolutionStatus.NOT_FOUND:
            return "create_athlete"
        
        if result.candidates:
            best = result.candidates[0]
            if best.confidence == MatchConfidence.HIGH:
                return f"confirm_{best.candidate_id}"
        
        return "select_or_create"


async def resolve_athlete_name(
    name: str,
    athletes: List[Dict[str, Any]],
    aliases: List[Dict[str, Any]],
    coach_id: str,
    source_system: str = "csv",
    similarity_threshold: int = 85
) -> ResolutionResult:
    """
    Convenience function to resolve a single athlete name.
    
    Args:
        name: Name to resolve
        athletes: List of athlete documents
        aliases: List of alias documents
        coach_id: Current coach's ID
        source_system: Origin system
        similarity_threshold: Minimum similarity for suggestions
        
    Returns:
        ResolutionResult with status and candidates
    """
    resolver = IdentityResolver(similarity_threshold=similarity_threshold)
    resolved, unresolved = await resolver.resolve_names(
        names=[name],
        athletes=athletes,
        aliases=aliases,
        coach_id=coach_id,
        source_system=source_system,
    )
    
    if name in resolved:
        # Find athlete details
        athlete_name = None
        for athlete in athletes:
            if str(athlete.get('_id', '')) == resolved[name]:
                athlete_name = athlete.get('name', '')
                break
        
        return ResolutionResult(
            status=ResolutionStatus.RESOLVED,
            original_name=name,
            normalized_name=normalize_for_comparison(name),
            athlete_id=resolved[name],
            athlete_name=athlete_name,
            message="Resolvido com sucesso",
        )
    
    if unresolved:
        u = unresolved[0]
        return ResolutionResult(
            status=ResolutionStatus.NEEDS_CONFIRMATION,
            original_name=u.original_name,
            normalized_name=u.normalized_name,
            candidates=[
                type('MatchResult', (), {
                    'candidate_id': c.athlete_id,
                    'candidate_name': c.athlete_name,
                    'similarity_score': c.similarity_score,
                    'confidence': MatchConfidence.MEDIUM,
                    'match_reason': c.match_reason,
                    'existing_aliases': c.existing_aliases,
                })()
                for c in u.candidates
            ],
            message="Confirmação necessária",
        )
    
    return ResolutionResult(
        status=ResolutionStatus.NOT_FOUND,
        original_name=name,
        normalized_name=normalize_for_comparison(name),
        message="Nome não encontrado",
    )
