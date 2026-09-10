"""
Name Matcher
============

Fuzzy matching engine for athlete names.

Uses thefuzz library with multiple strategies:
1. Token set ratio (handles word order differences)
2. Partial ratio (handles abbreviations)
3. Custom weighting for name parts

Threshold: 85% similarity for automatic suggestion
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
from thefuzz import fuzz, process

from .normalizer import (
    normalize_for_comparison,
    extract_first_name,
    extract_last_name,
    names_are_compatible,
)


class MatchConfidence(str, Enum):
    """Confidence level of a match."""
    EXACT = "exact"           # 100% - Direct alias lookup
    HIGH = "high"             # ≥95% - Very likely same person
    MEDIUM = "medium"         # 85-94% - Probable match, confirmation suggested
    LOW = "low"               # 70-84% - Possible match, confirmation required
    NONE = "none"             # <70% - Unlikely match


@dataclass
class MatchResult:
    """Result of matching a name against a candidate."""
    candidate_id: str
    candidate_name: str
    original_name: str
    similarity_score: float
    confidence: MatchConfidence
    match_reason: str
    existing_aliases: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "candidate_name": self.candidate_name,
            "original_name": self.original_name,
            "similarity_score": self.similarity_score,
            "confidence": self.confidence.value,
            "match_reason": self.match_reason,
            "existing_aliases": self.existing_aliases,
        }


class NameMatcher:
    """
    Fuzzy matching engine for athlete names.
    
    Implements a multi-strategy approach:
    1. Exact normalized match (fastest)
    2. Token set ratio (word order independent)
    3. Partial ratio (handles abbreviations)
    4. First/last name boosting
    
    Attributes:
        threshold_high: Score for HIGH confidence (default 95)
        threshold_medium: Score for MEDIUM confidence (default 85)
        threshold_low: Score for LOW confidence (default 70)
    """
    
    THRESHOLD_HIGH = 95
    THRESHOLD_MEDIUM = 85
    THRESHOLD_LOW = 70
    
    def __init__(
        self,
        threshold_high: int = None,
        threshold_medium: int = None,
        threshold_low: int = None
    ):
        self.threshold_high = threshold_high or self.THRESHOLD_HIGH
        self.threshold_medium = threshold_medium or self.THRESHOLD_MEDIUM
        self.threshold_low = threshold_low or self.THRESHOLD_LOW
    
    def match(
        self,
        query_name: str,
        candidates: List[Dict[str, Any]],
        existing_aliases: Dict[str, List[str]] = None
    ) -> List[MatchResult]:
        """
        Find matches for a query name among candidates.
        
        Args:
            query_name: Name to match (from CSV)
            candidates: List of dicts with 'id' and 'name' keys
            existing_aliases: Dict mapping athlete_id to list of known aliases
            
        Returns:
            List of MatchResult sorted by similarity (highest first)
        """
        if not query_name or not candidates:
            return []
        
        existing_aliases = existing_aliases or {}
        query_normalized = normalize_for_comparison(query_name)
        
        if not query_normalized:
            return []
        
        results = []
        
        for candidate in candidates:
            candidate_id = str(candidate.get('id') or candidate.get('_id', ''))
            candidate_name = candidate.get('name', '')
            
            if not candidate_name:
                continue
            
            # Get aliases for this candidate
            aliases = existing_aliases.get(candidate_id, [])
            
            # Check for exact alias match first
            if query_normalized in [normalize_for_comparison(a) for a in aliases]:
                results.append(MatchResult(
                    candidate_id=candidate_id,
                    candidate_name=candidate_name,
                    original_name=query_name,
                    similarity_score=100.0,
                    confidence=MatchConfidence.EXACT,
                    match_reason="Alias exato previamente confirmado",
                    existing_aliases=aliases,
                ))
                continue
            
            # Quick compatibility check
            if not names_are_compatible(query_name, candidate_name):
                # Still calculate but with lower threshold
                pass
            
            # Calculate similarity using multiple strategies
            score, reason = self._calculate_similarity(query_name, candidate_name)
            
            if score < self.threshold_low:
                continue
            
            confidence = self._score_to_confidence(score)
            
            results.append(MatchResult(
                candidate_id=candidate_id,
                candidate_name=candidate_name,
                original_name=query_name,
                similarity_score=round(score, 1),
                confidence=confidence,
                match_reason=reason,
                existing_aliases=aliases,
            ))
        
        # Sort by similarity (highest first)
        results.sort(key=lambda x: x.similarity_score, reverse=True)
        
        return results
    
    def _calculate_similarity(self, query: str, candidate: str) -> tuple:
        """
        Calculate similarity score using multiple strategies.
        
        Returns:
            Tuple of (score, reason)
        """
        query_norm = normalize_for_comparison(query)
        candidate_norm = normalize_for_comparison(candidate)
        
        # Strategy 1: Exact normalized match
        if query_norm == candidate_norm:
            return 100.0, "Correspondência exata (normalizada)"
        
        # Strategy 2: Token set ratio (handles word order)
        # "João Vitor" vs "Vitor João" = 100
        token_set_score = fuzz.token_set_ratio(query_norm, candidate_norm)
        
        # Strategy 3: Token sort ratio
        # Sorts tokens before comparing
        token_sort_score = fuzz.token_sort_ratio(query_norm, candidate_norm)
        
        # Strategy 4: Partial ratio (handles abbreviations)
        # "J Vitor" vs "João Vitor" can score high
        partial_score = fuzz.partial_ratio(query_norm, candidate_norm)
        
        # Strategy 5: Simple ratio
        simple_score = fuzz.ratio(query_norm, candidate_norm)
        
        # Weighted combination
        # Token set is most important (handles reordering)
        # Partial helps with abbreviations
        weighted_score = (
            token_set_score * 0.35 +
            token_sort_score * 0.25 +
            partial_score * 0.25 +
            simple_score * 0.15
        )
        
        # Bonus for matching first or last name exactly
        query_first = extract_first_name(query)
        query_last = extract_last_name(query)
        cand_first = extract_first_name(candidate)
        cand_last = extract_last_name(candidate)
        
        name_bonus = 0
        bonus_reason = []
        
        if query_last == cand_last and query_last:
            name_bonus += 5
            bonus_reason.append("sobrenome")
        
        if query_first == cand_first and query_first:
            name_bonus += 3
            bonus_reason.append("primeiro nome")
        
        final_score = min(100, weighted_score + name_bonus)
        
        # Determine reason
        best_strategy = "similaridade combinada"
        if token_set_score >= 95:
            best_strategy = "tokens correspondentes"
        elif partial_score >= 90:
            best_strategy = "correspondência parcial"
        
        if bonus_reason:
            best_strategy += f" + {' e '.join(bonus_reason)} idêntico(s)"
        
        return final_score, best_strategy
    
    def _score_to_confidence(self, score: float) -> MatchConfidence:
        """Convert numeric score to confidence level."""
        if score >= 100:
            return MatchConfidence.EXACT
        elif score >= self.threshold_high:
            return MatchConfidence.HIGH
        elif score >= self.threshold_medium:
            return MatchConfidence.MEDIUM
        elif score >= self.threshold_low:
            return MatchConfidence.LOW
        else:
            return MatchConfidence.NONE


def find_candidates(
    query_name: str,
    athletes: List[Dict[str, Any]],
    aliases_map: Dict[str, List[str]] = None,
    threshold: int = 70
) -> List[Dict[str, Any]]:
    """
    Convenience function to find matching candidates.
    
    Args:
        query_name: Name to match
        athletes: List of athlete dicts with 'id'/'_id' and 'name'
        aliases_map: Dict of athlete_id -> list of aliases
        threshold: Minimum similarity score (default 70)
        
    Returns:
        List of candidate dicts with match info
    """
    matcher = NameMatcher(threshold_low=threshold)
    results = matcher.match(query_name, athletes, aliases_map)
    
    return [r.to_dict() for r in results]
