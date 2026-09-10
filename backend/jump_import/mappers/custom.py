"""
Custom Mapper
=============

Mapper for user-defined custom CSV formats.

This mapper allows users to define their own column mappings
when using non-standard or proprietary contact mat systems.

The custom mapping can be provided at runtime via a configuration
dictionary that maps source columns to canonical columns.
"""

from typing import Dict, Any, Optional, List
from .base import BaseMapper


class CustomMapper(BaseMapper):
    """
    Customizable mapper for user-defined CSV formats.
    
    Usage:
        mapper = CustomMapper()
        mapper.set_column_map({
            'my_athlete_col': 'athlete_id',
            'my_height_col': 'jump_height_cm',
            ...
        })
        result = mapper.map_row(raw_row)
    
    Or:
        mapper = CustomMapper(custom_map={...})
    """
    
    MANUFACTURER_NAME = "custom"
    
    # Default column map (same as generic for base compatibility)
    COLUMN_MAP: Dict[str, str] = {
        'athlete_id': 'athlete_id',
        'jump_type': 'jump_type',
        'jump_height_cm': 'jump_height_cm',
        'flight_time_s': 'flight_time_s',
        'contact_time_s': 'contact_time_s',
        'reactive_strength_index': 'reactive_strength_index',
        'peak_power_w': 'peak_power_w',
        'takeoff_velocity_m_s': 'takeoff_velocity_m_s',
        'load_kg': 'load_kg',
        'jump_date': 'jump_date',
        'source_system': 'source_system',
        'attempt_number': 'attempt_number',
        'test_id': 'test_id',
        'protocol': 'protocol',
        'notes': 'notes',
    }
    
    def __init__(self, custom_map: Dict[str, str] = None):
        """
        Initialize custom mapper.
        
        Args:
            custom_map: Optional dictionary mapping source columns to canonical columns
        """
        super().__init__()
        if custom_map:
            self.set_column_map(custom_map)
    
    def set_column_map(self, column_map: Dict[str, str]) -> None:
        """
        Set a custom column mapping.
        
        Args:
            column_map: Dictionary mapping source columns to canonical columns
                        Format: {'source_column': 'canonical_column'}
        """
        self.COLUMN_MAP = column_map.copy()
        
        # Rebuild lookup table
        self._column_lookup = {}
        for src_col, canonical_col in self.COLUMN_MAP.items():
            self._column_lookup[src_col.lower().strip()] = canonical_col
    
    def add_column_mapping(self, source_column: str, canonical_column: str) -> None:
        """
        Add a single column mapping.
        
        Args:
            source_column: Column name in the source CSV
            canonical_column: Canonical column name
        """
        self.COLUMN_MAP[source_column] = canonical_column
        self._column_lookup[source_column.lower().strip()] = canonical_column
    
    def remove_column_mapping(self, source_column: str) -> None:
        """
        Remove a column mapping.
        
        Args:
            source_column: Column name to remove
        """
        self.COLUMN_MAP.pop(source_column, None)
        self._column_lookup.pop(source_column.lower().strip(), None)
    
    def get_column_map(self) -> Dict[str, str]:
        """
        Get the current column mapping.
        
        Returns:
            Current column map dictionary
        """
        return self.COLUMN_MAP.copy()
    
    @classmethod
    def from_template(cls, template_name: str) -> 'CustomMapper':
        """
        Create a custom mapper from a predefined template.
        
        Available templates:
        - 'basic': Minimal required fields only
        - 'full': All canonical fields
        - 'portuguese': Portuguese column names
        - 'spanish': Spanish column names
        
        Args:
            template_name: Name of the template to use
            
        Returns:
            CustomMapper configured with template mappings
        """
        templates = {
            'basic': {
                'atleta': 'athlete_id',
                'tipo': 'jump_type',
                'altura': 'jump_height_cm',
                'tempo_voo': 'flight_time_s',
                'data': 'jump_date',
            },
            'full': {
                'athlete_id': 'athlete_id',
                'athlete_external_id': 'athlete_external_id',
                'jump_type': 'jump_type',
                'jump_height_cm': 'jump_height_cm',
                'flight_time_s': 'flight_time_s',
                'contact_time_s': 'contact_time_s',
                'reactive_strength_index': 'reactive_strength_index',
                'peak_power_w': 'peak_power_w',
                'takeoff_velocity_m_s': 'takeoff_velocity_m_s',
                'load_kg': 'load_kg',
                'jump_date': 'jump_date',
                'source_system': 'source_system',
                'attempt_number': 'attempt_number',
                'test_id': 'test_id',
                'protocol': 'protocol',
                'notes': 'notes',
            },
            'portuguese': {
                'id_atleta': 'athlete_id',
                'atleta': 'athlete_name',
                'tipo_salto': 'jump_type',
                'altura_cm': 'jump_height_cm',
                'tempo_voo_s': 'flight_time_s',
                'tempo_contato_s': 'contact_time_s',
                'rsi': 'reactive_strength_index',
                'potencia_w': 'peak_power_w',
                'velocidade_ms': 'takeoff_velocity_m_s',
                'carga_kg': 'load_kg',
                'data': 'jump_date',
                'sistema': 'source_system',
                'tentativa': 'attempt_number',
                'id_teste': 'test_id',
                'protocolo': 'protocol',
                'observacoes': 'notes',
            },
            'spanish': {
                'id_atleta': 'athlete_id',
                'atleta': 'athlete_name',
                'tipo_salto': 'jump_type',
                'altura_cm': 'jump_height_cm',
                'tiempo_vuelo_s': 'flight_time_s',
                'tiempo_contacto_s': 'contact_time_s',
                'rsi': 'reactive_strength_index',
                'potencia_w': 'peak_power_w',
                'velocidad_ms': 'takeoff_velocity_m_s',
                'carga_kg': 'load_kg',
                'fecha': 'jump_date',
                'sistema': 'source_system',
                'intento': 'attempt_number',
                'id_prueba': 'test_id',
                'protocolo': 'protocol',
                'notas': 'notes',
            },
        }
        
        if template_name not in templates:
            raise ValueError(f"Unknown template: {template_name}. "
                           f"Available: {list(templates.keys())}")
        
        return cls(custom_map=templates[template_name])
    
    @staticmethod
    def list_templates() -> List[Dict[str, str]]:
        """
        List available mapping templates.
        
        Returns:
            List of template info dictionaries
        """
        return [
            {
                'name': 'basic',
                'description': 'Campos mínimos obrigatórios (PT-BR)',
            },
            {
                'name': 'full',
                'description': 'Todos os campos canônicos (EN)',
            },
            {
                'name': 'portuguese',
                'description': 'Colunas em português brasileiro',
            },
            {
                'name': 'spanish',
                'description': 'Columnas en español',
            },
        ]
