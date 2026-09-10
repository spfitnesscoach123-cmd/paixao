"""
Name Normalizer
===============

Aggressive string normalization for name comparison.

Transformations applied:
1. Lowercase conversion
2. Accent/diacritic removal
3. Punctuation removal
4. Extra whitespace removal
5. Name order standardization (first last)

This ensures "João Vitor", "JOAO VITOR", "J. Vitor" 
all normalize to comparable forms.
"""

import unicodedata
import re
from typing import Optional


def normalize_name(name: str) -> str:
    """
    Normalize a name for storage and display.
    
    Less aggressive than normalize_for_comparison.
    Preserves readability while removing obvious variations.
    
    Args:
        name: Original name string
        
    Returns:
        Normalized name (still human-readable)
    """
    if not name:
        return ""
    
    # Strip whitespace
    result = name.strip()
    
    # Normalize unicode (NFC form)
    result = unicodedata.normalize('NFC', result)
    
    # Remove extra whitespace
    result = re.sub(r'\s+', ' ', result)
    
    # Title case for readability
    result = result.title()
    
    return result


def normalize_for_comparison(name: str) -> str:
    """
    Aggressively normalize a name for comparison/matching.
    
    This produces a canonical form where variations of the 
    same name should produce identical output.
    
    Args:
        name: Original name string
        
    Returns:
        Normalized comparison string (not human-readable)
    
    Examples:
        "João Vitor" -> "joao vitor"
        "JOAO VITOR" -> "joao vitor"
        "J. Vitor" -> "j vitor"
        "Vitor, João" -> "joao vitor" (reordered)
        "  João   Vitor  " -> "joao vitor"
    """
    if not name:
        return ""
    
    # Start with basic normalization
    result = name.strip().lower()
    
    # Normalize unicode to decomposed form
    result = unicodedata.normalize('NFD', result)
    
    # Remove accents/diacritics (combining characters)
    result = ''.join(
        char for char in result 
        if unicodedata.category(char) != 'Mn'
    )
    
    # Remove punctuation except spaces
    result = re.sub(r'[^\w\s]', '', result)
    
    # Remove numbers
    result = re.sub(r'\d', '', result)
    
    # Normalize whitespace
    result = re.sub(r'\s+', ' ', result).strip()
    
    # Handle "Lastname, Firstname" format
    if ',' in name:
        parts = [p.strip() for p in name.split(',')]
        if len(parts) == 2:
            # Reverse: "Vitor, João" -> "João Vitor"
            result = normalize_for_comparison(f"{parts[1]} {parts[0]}")
            return result
    
    # Sort name parts alphabetically for consistent ordering
    # This handles "João Vitor" vs "Vitor João"
    # NOTE: This is aggressive - may not always be desired
    # parts = result.split()
    # result = ' '.join(sorted(parts))
    
    return result


def extract_initials(name: str) -> str:
    """
    Extract initials from a name.
    
    Args:
        name: Full name
        
    Returns:
        Initials string (e.g., "jv" for "João Vitor")
    """
    normalized = normalize_for_comparison(name)
    if not normalized:
        return ""
    
    parts = normalized.split()
    return ''.join(p[0] for p in parts if p)


def extract_first_name(name: str) -> str:
    """Extract the first name from a full name."""
    normalized = normalize_for_comparison(name)
    parts = normalized.split()
    return parts[0] if parts else ""


def extract_last_name(name: str) -> str:
    """Extract the last name from a full name."""
    normalized = normalize_for_comparison(name)
    parts = normalized.split()
    return parts[-1] if parts else ""


def expand_abbreviation(name: str) -> Optional[str]:
    """
    Attempt to detect abbreviated names.
    
    Args:
        name: Potentially abbreviated name like "J. Vitor"
        
    Returns:
        Pattern for matching or None if not abbreviated
    """
    normalized = normalize_for_comparison(name)
    parts = normalized.split()
    
    # Check for single letter followed by name
    if len(parts) >= 2:
        first_part = parts[0]
        if len(first_part) == 1:
            # "j vitor" could match "joao vitor", "jose vitor", etc.
            return f"{first_part}* {' '.join(parts[1:])}"
    
    return None


def names_are_compatible(name1: str, name2: str) -> bool:
    """
    Quick check if two names could potentially be the same person.
    
    This is a fast pre-filter before running expensive similarity.
    
    Args:
        name1: First name
        name2: Second name
        
    Returns:
        True if names could potentially match
    """
    n1 = normalize_for_comparison(name1)
    n2 = normalize_for_comparison(name2)
    
    if not n1 or not n2:
        return False
    
    # Exact match
    if n1 == n2:
        return True
    
    # Share at least one name part
    parts1 = set(n1.split())
    parts2 = set(n2.split())
    
    if parts1 & parts2:
        return True
    
    # Check for initial match (J matches João)
    for p1 in parts1:
        for p2 in parts2:
            if len(p1) == 1 and p2.startswith(p1):
                return True
            if len(p2) == 1 and p1.startswith(p2):
                return True
    
    return False
