"""
Manufacturer Mappers
====================

Column mapping modules for different contact mat and force plate manufacturers.
Each mapper converts manufacturer-specific column names to the canonical model.

Supported Manufacturers:
- generic: Standard/generic CSV format
- chronojump: Chronojump open-source system
- force_decks: VALD Force Decks
- axon_jump: Axon Jump contact mat
- custom: User-defined mappings

Adding New Manufacturers:
1. Create a new file in mappers/ (e.g., new_manufacturer.py)
2. Create a mapper class extending BaseMapper
3. Define COLUMN_MAP with manufacturer columns → canonical columns
4. Add detection patterns in HEADER_SIGNATURES
5. Register in MAPPER_REGISTRY below
"""

from typing import Dict, List, Optional, Type

from .base import BaseMapper
from .generic import GenericMapper
from .chronojump import ChronojumpMapper
from .force_decks import ForceDecksMapper
from .axon_jump import AxonJumpMapper
from .custom import CustomMapper


# Registry of all available mappers
MAPPER_REGISTRY: Dict[str, Type[BaseMapper]] = {
    'generic': GenericMapper,
    'chronojump': ChronojumpMapper,
    'force_decks': ForceDecksMapper,
    'axon_jump': AxonJumpMapper,
    'custom': CustomMapper,
}

# Header signatures for manufacturer detection
# Format: manufacturer -> list of distinctive header patterns
HEADER_SIGNATURES: Dict[str, List[str]] = {
    'chronojump': [
        'uniqueID', 'personID', 'sessionID', 'type', 'tv', 'tc',
        'fall', 'weight', 'description', 'angle', 'simulated'
    ],
    'force_decks': [
        'Test ID', 'Athlete ID', 'Jump Height (Flight Time)', 'Peak Landing Force',
        'RSI', 'Contraction Time', 'Flight Time', 'Contact Time',
        'Peak Propulsive Force', 'Mean Propulsive Force'
    ],
    'axon_jump': [
        'Athlete', 'Test', 'Date', 'Time', 'Flight Time (s)', 'Contact Time (s)',
        'Height (cm)', 'RSI', 'Stiffness', 'Jump Type'
    ],
}

# Filename patterns for detection
FILENAME_PATTERNS: Dict[str, List[str]] = {
    'chronojump': ['chronojump', 'chrono'],
    'force_decks': ['forcedecks', 'force_decks', 'vald'],
    'axon_jump': ['axon', 'axonjump'],
}


def get_mapper(manufacturer: str) -> BaseMapper:
    """
    Get the appropriate mapper for a manufacturer.
    
    Args:
        manufacturer: Manufacturer name (lowercase)
        
    Returns:
        Instantiated mapper for the manufacturer
    """
    manufacturer_lower = manufacturer.lower() if manufacturer else 'generic'
    mapper_class = MAPPER_REGISTRY.get(manufacturer_lower, GenericMapper)
    return mapper_class()


def detect_manufacturer_from_headers(
    headers: List[str],
    filename: str = ""
) -> str:
    """
    Detect manufacturer from CSV headers and filename.
    
    Args:
        headers: List of CSV column headers
        filename: Original filename
        
    Returns:
        Detected manufacturer name
    """
    # Normalize headers for comparison
    headers_lower = [h.lower().strip() for h in headers]
    filename_lower = filename.lower()
    
    # Check filename patterns first
    for manufacturer, patterns in FILENAME_PATTERNS.items():
        for pattern in patterns:
            if pattern in filename_lower:
                return manufacturer
    
    # Check header signatures
    best_match = 'generic'
    best_score = 0
    
    for manufacturer, signatures in HEADER_SIGNATURES.items():
        # Count matching signatures
        score = 0
        for sig in signatures:
            sig_lower = sig.lower()
            for header in headers_lower:
                if sig_lower in header or header in sig_lower:
                    score += 1
                    break
        
        if score > best_score:
            best_score = score
            best_match = manufacturer
    
    # Require at least 2 matching signatures to claim a specific manufacturer
    if best_score >= 2:
        return best_match
    
    return 'generic'


def list_supported_manufacturers() -> List[Dict[str, str]]:
    """
    List all supported manufacturers with descriptions.
    
    Returns:
        List of manufacturer info dicts
    """
    return [
        {
            'id': 'generic',
            'name': 'Generic / Standard',
            'description': 'Formato CSV padrão com colunas nomeadas'
        },
        {
            'id': 'chronojump',
            'name': 'Chronojump',
            'description': 'Sistema open-source Chronojump'
        },
        {
            'id': 'force_decks',
            'name': 'VALD Force Decks',
            'description': 'Plataformas de força VALD Performance'
        },
        {
            'id': 'axon_jump',
            'name': 'Axon Jump',
            'description': 'Tapete de contato Axon Jump'
        },
        {
            'id': 'custom',
            'name': 'Custom / User-Defined',
            'description': 'Mapeamento personalizado definido pelo usuário'
        },
    ]


__all__ = [
    'BaseMapper',
    'GenericMapper',
    'ChronojumpMapper',
    'ForceDecksMapper',
    'AxonJumpMapper',
    'CustomMapper',
    'get_mapper',
    'detect_manufacturer_from_headers',
    'list_supported_manufacturers',
    'MAPPER_REGISTRY',
]
