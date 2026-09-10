"""
Tests for Identity Resolver Module
==================================

Tests for name normalization, fuzzy matching, and resolution workflow.
"""

import pytest
from identity_resolver import (
    normalize_name,
    normalize_for_comparison,
    NameMatcher,
    MatchConfidence,
    IdentityResolver,
    ResolutionStatus,
)


# ============= NORMALIZATION TESTS =============

class TestNormalization:
    """Tests for name normalization."""
    
    def test_normalize_removes_accents(self):
        """Accents should be removed for comparison."""
        assert normalize_for_comparison("João") == "joao"
        assert normalize_for_comparison("José") == "jose"
        assert normalize_for_comparison("André") == "andre"
    
    def test_normalize_lowercase(self):
        """Names should be converted to lowercase."""
        assert normalize_for_comparison("JOAO VITOR") == "joao vitor"
        assert normalize_for_comparison("Pedro Santos") == "pedro santos"
    
    def test_normalize_removes_punctuation(self):
        """Punctuation should be removed."""
        assert normalize_for_comparison("J. Vitor") == "j vitor"
        assert normalize_for_comparison("O'Connor") == "oconnor"
    
    def test_normalize_handles_comma_format(self):
        """'Last, First' format should be normalized."""
        assert normalize_for_comparison("Vitor, João") == "joao vitor"
        assert normalize_for_comparison("Silva, Pedro") == "pedro silva"
    
    def test_normalize_removes_extra_spaces(self):
        """Extra spaces should be removed."""
        assert normalize_for_comparison("  João   Vitor  ") == "joao vitor"
    
    def test_normalize_empty_string(self):
        """Empty string should return empty."""
        assert normalize_for_comparison("") == ""
        assert normalize_for_comparison("   ") == ""


# ============= MATCHER TESTS =============

class TestMatcher:
    """Tests for fuzzy name matching."""
    
    @pytest.fixture
    def sample_athletes(self):
        return [
            {"_id": "A001", "name": "João Vitor Silva"},
            {"_id": "A002", "name": "Pedro Santos Costa"},
            {"_id": "A003", "name": "José Carlos Ferreira"},
        ]
    
    def test_exact_match(self, sample_athletes):
        """Exact matches should have 100% score."""
        matcher = NameMatcher()
        results = matcher.match("João Vitor Silva", sample_athletes)
        
        assert len(results) > 0
        assert results[0].similarity_score == 100.0
        assert results[0].candidate_id == "A001"
    
    def test_case_insensitive_match(self, sample_athletes):
        """Matching should be case insensitive."""
        matcher = NameMatcher()
        results = matcher.match("JOAO VITOR SILVA", sample_athletes)
        
        assert len(results) > 0
        assert results[0].candidate_id == "A001"
        assert results[0].similarity_score >= 95
    
    def test_partial_match(self, sample_athletes):
        """Partial names should find candidates."""
        matcher = NameMatcher()
        results = matcher.match("João Vitor", sample_athletes)
        
        assert len(results) > 0
        assert results[0].candidate_id == "A001"
        assert results[0].similarity_score >= 85
    
    def test_abbreviation_match(self, sample_athletes):
        """Abbreviated names should find candidates."""
        matcher = NameMatcher()
        results = matcher.match("J. Vitor", sample_athletes)
        
        assert len(results) > 0
        # Should suggest João Vitor Silva
        assert any(r.candidate_id == "A001" for r in results)
    
    def test_no_match(self, sample_athletes):
        """Unknown names should not match."""
        matcher = NameMatcher()
        results = matcher.match("Zé Ninguém", sample_athletes)
        
        # Either no results or very low scores
        high_confidence = [r for r in results if r.similarity_score >= 70]
        assert len(high_confidence) == 0
    
    def test_confidence_levels(self, sample_athletes):
        """Confidence levels should be assigned correctly."""
        matcher = NameMatcher()
        
        # Exact match = HIGH or EXACT
        exact = matcher.match("João Vitor Silva", sample_athletes)
        assert exact[0].confidence in [MatchConfidence.EXACT, MatchConfidence.HIGH]
        
        # Partial match = MEDIUM
        partial = matcher.match("João Vitor", sample_athletes)
        if partial:
            assert partial[0].confidence in [MatchConfidence.HIGH, MatchConfidence.MEDIUM]


# ============= RESOLVER TESTS =============

class TestResolver:
    """Tests for identity resolution workflow."""
    
    @pytest.fixture
    def sample_athletes(self):
        return [
            {"_id": "A001", "name": "João Vitor Silva"},
            {"_id": "A002", "name": "Pedro Santos Costa"},
        ]
    
    @pytest.fixture
    def sample_aliases(self):
        return [
            {
                "athlete_id": "A001",
                "coach_id": "C001",
                "alias_normalized": "jv",
                "alias_original": "JV",
            }
        ]
    
    @pytest.mark.asyncio
    async def test_resolve_exact_name(self, sample_athletes, sample_aliases):
        """Exact name should resolve automatically."""
        resolver = IdentityResolver()
        resolved, unresolved = await resolver.resolve_names(
            names=["João Vitor Silva"],
            athletes=sample_athletes,
            aliases=sample_aliases,
            coach_id="C001",
        )
        
        assert "João Vitor Silva" in resolved
        assert resolved["João Vitor Silva"] == "A001"
        assert len(unresolved) == 0
    
    @pytest.mark.asyncio
    async def test_resolve_via_alias(self, sample_athletes, sample_aliases):
        """Name should resolve via existing alias."""
        resolver = IdentityResolver()
        resolved, unresolved = await resolver.resolve_names(
            names=["JV"],
            athletes=sample_athletes,
            aliases=sample_aliases,
            coach_id="C001",
        )
        
        assert "JV" in resolved
        assert resolved["JV"] == "A001"
    
    @pytest.mark.asyncio
    async def test_unresolved_needs_confirmation(self, sample_athletes, sample_aliases):
        """Fuzzy match should require confirmation."""
        resolver = IdentityResolver()
        resolved, unresolved = await resolver.resolve_names(
            names=["JOAO VITOR"],
            athletes=sample_athletes,
            aliases=sample_aliases,
            coach_id="C001",
        )
        
        # Should NOT auto-resolve
        assert "JOAO VITOR" not in resolved
        assert len(unresolved) == 1
        assert unresolved[0].original_name == "JOAO VITOR"
        assert len(unresolved[0].candidates) > 0
    
    @pytest.mark.asyncio
    async def test_unknown_name_not_found(self, sample_athletes, sample_aliases):
        """Unknown name should be flagged as not found."""
        resolver = IdentityResolver()
        resolved, unresolved = await resolver.resolve_names(
            names=["Atleta Desconhecido"],
            athletes=sample_athletes,
            aliases=sample_aliases,
            coach_id="C001",
        )
        
        assert "Atleta Desconhecido" not in resolved
        assert len(unresolved) == 1
        assert unresolved[0].suggested_action == "create_athlete"
    
    @pytest.mark.asyncio
    async def test_multiple_names(self, sample_athletes, sample_aliases):
        """Multiple names should be processed together."""
        resolver = IdentityResolver()
        resolved, unresolved = await resolver.resolve_names(
            names=["João Vitor Silva", "JV", "Pedro Santos", "Unknown"],
            athletes=sample_athletes,
            aliases=sample_aliases,
            coach_id="C001",
        )
        
        # Exact + alias should resolve
        assert "João Vitor Silva" in resolved
        assert "JV" in resolved
        
        # Fuzzy + unknown should not
        assert len(unresolved) >= 1


# ============= INTEGRATION TESTS =============

class TestIntegration:
    """End-to-end integration tests."""
    
    def test_full_workflow(self):
        """Test complete resolution workflow."""
        # This test would require database mocking
        # For now, just verify the module imports work
        from identity_resolver import (
            IdentityResolver,
            normalize_for_comparison,
            NameMatcher,
        )
        
        assert IdentityResolver is not None
        assert normalize_for_comparison("João") == "joao"
        assert NameMatcher is not None
    
    def test_algorithm_documented_threshold(self):
        """Verify the 85% threshold is documented."""
        # The threshold should be 85% as specified in requirements
        matcher = NameMatcher()
        assert matcher.THRESHOLD_MEDIUM == 85
