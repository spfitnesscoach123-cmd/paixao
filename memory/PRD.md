# Jump Data Import System - PRD

## Overview

Sistema de importação de dados de saltos (jump data) via CSV, agnóstico ao hardware, com validação rigorosa, cálculo de métricas derivadas e conversão para um modelo canônico único.

## Fabricantes Suportados

| Fabricante | ID | Descrição |
|------------|-----|-----------|
| Generic | `generic` | Formato CSV padrão com colunas nomeadas |
| Chronojump | `chronojump` | Sistema open-source Chronojump |
| VALD Force Decks | `force_decks` | Plataformas de força VALD Performance |
| Axon Jump | `axon_jump` | Tapete de contato Axon Jump |
| Custom | `custom` | Mapeamento personalizado definido pelo usuário |

## Modelo Canônico (JumpRecord)

```json
{
  "athlete_id": "string (required)",
  "athlete_external_id": "string | null",
  "jump_type": "SJ | CMJ | DJ | RJ (required)",
  "jump_height_cm": "float | null",
  "flight_time_s": "float | null",
  "contact_time_s": "float | null",
  "reactive_strength_index": "float | null",
  "peak_power_w": "float | null",
  "takeoff_velocity_m_s": "float | null",
  "load_kg": "float | null",
  "jump_date": "datetime (required)",
  "source_system": "string (required)",
  "raw_row": "dict (audit trail)"
}
```

## Tipos de Salto

| Código | Nome | Descrição | contact_time_s |
|--------|------|-----------|----------------|
| SJ | Squat Jump | Salto estático | **Deve ser null** |
| CMJ | Countermovement Jump | Salto com contramovimento | **Deve ser null** |
| DJ | Drop Jump | Salto de queda | **Obrigatório** |
| RJ | Reactive Jump | Saltos reativos/repetidos | **Obrigatório** |

## Regras de Negócio

### 1. Tratamento de Campos Vazios
- Campos vazios no CSV → `null` (nunca zero)
- Zero explícito no CSV → preservado como `0`

### 2. Cálculo de Métricas Derivadas

#### Jump Height (se não fornecido)
```
h = (g × t²) / 8
```
- `g` = 9.81 m/s²
- `t` = flight_time_s
- Resultado em centímetros

#### Reactive Strength Index (RSI)
```
RSI = jump_height_cm / contact_time_s
```
- Só calculado quando ambos valores existem

#### Takeoff Velocity
```
v = √(2gh)
```
- `h` = jump_height_cm / 100 (em metros)

### 3. Validação de Atletas
- `athlete_id` **deve** referenciar atleta existente
- Nunca criar atletas automaticamente
- Erro claro se atleta não existir

## API Endpoints

### GET /api/jumps/providers
Lista fabricantes suportados.

### POST /api/jumps/upload/preview
Pré-visualização de importação (não salva dados).

**Request:** `multipart/form-data` com arquivo CSV

**Response:**
```json
{
  "success": true,
  "total_rows": 8,
  "valid_count": 8,
  "error_count": 0,
  "valid_records": [...],
  "errors": [],
  "detected_manufacturer": "generic",
  "calculated_metrics": ["jump_height_cm", "takeoff_velocity_m_s"],
  "athletes_not_found": [],
  "jump_types_found": ["CMJ", "DJ"]
}
```

### POST /api/jumps/upload/import
Importa dados validados para o banco.

**Request:** `multipart/form-data` com arquivo CSV

**Response:**
```json
{
  "success": true,
  "message": "8 registros importados com sucesso",
  "imported_count": 8,
  "rejected_count": 0,
  "created_ids": ["...", "..."],
  "errors": []
}
```

### GET /api/jumps/athlete/{athlete_id}
Recupera todos os saltos de um atleta.

### GET /api/jumps/analysis/{athlete_id}
Análise de performance de salto do atleta.

### DELETE /api/jumps/{jump_id}
Remove um registro de salto.

## Estrutura do Módulo

```
backend/jump_import/
├── __init__.py        # Exports e funções de conveniência
├── models.py          # Modelos Pydantic (JumpRecord, JumpValidationError)
├── parser.py          # Parser CSV tolerante
├── validator.py       # Validação de schema e regras
├── calculator.py      # Cálculos de métricas derivadas
└── mappers/
    ├── __init__.py    # Registry de mappers
    ├── base.py        # Classe base abstrata
    ├── generic.py     # Mapper genérico
    ├── chronojump.py  # Mapper Chronojump
    ├── force_decks.py # Mapper Force Decks
    ├── axon_jump.py   # Mapper Axon Jump
    └── custom.py      # Mapper customizável
```

## Adicionando Novos Fabricantes

1. **Criar arquivo mapper** em `mappers/new_manufacturer.py`:
```python
from .base import BaseMapper

class NewManufacturerMapper(BaseMapper):
    MANUFACTURER_NAME = "new_manufacturer"
    
    COLUMN_MAP = {
        'manufacturer_col': 'canonical_col',
        # ... mapeamentos
    }
```

2. **Registrar em `mappers/__init__.py`**:
```python
from .new_manufacturer import NewManufacturerMapper

MAPPER_REGISTRY['new_manufacturer'] = NewManufacturerMapper

HEADER_SIGNATURES['new_manufacturer'] = [
    'distinctive_header_1', 
    'distinctive_header_2'
]
```

## Exemplos de CSV

### Generic Format
```csv
athlete_id,jump_type,flight_time_s,contact_time_s,jump_date,source_system
ATH001,CMJ,0.52,,2026-01-15,generic
ATH001,DJ,0.42,0.21,2026-01-15,generic
```

### Chronojump Format
```csv
uniqueID,personID,sessionID,type,tv,tc,fall,weight,datetime
1001,ATH001,S001,CMJ,0.52,-1,,75.0,2026-01-15 09:30:00
```

## Database Schema

Coleção: `jump_data`

```json
{
  "_id": "ObjectId",
  "coach_id": "ObjectId",
  "athlete_id": "string",
  "jump_type": "SJ|CMJ|DJ|RJ",
  "jump_height_cm": "number",
  "flight_time_s": "number",
  "contact_time_s": "number|null",
  "reactive_strength_index": "number|null",
  "peak_power_w": "number|null",
  "takeoff_velocity_m_s": "number|null",
  "load_kg": "number|null",
  "jump_date": "ISODate",
  "jump_date_str": "string",
  "source_system": "string",
  "raw_row": "object",
  "created_at": "ISODate"
}
```

## Testes

- **30 testes unitários** cobrindo:
  - Cálculos de métricas (altura, RSI, velocidade)
  - Validação por tipo de salto
  - Parsing de CSV com diferentes formatos
  - Detecção de fabricantes
  - Mapeamento de colunas
  - Regras de negócio (empty → null, zero preservado)

## Status da Implementação

✅ **COMPLETO** - Sistema totalmente funcional

- [x] Módulo `jump_import/` com separação de responsabilidades
- [x] Mappers para 4 fabricantes + custom
- [x] Cálculos de métricas derivadas
- [x] Validação de regras de negócio
- [x] API endpoints (preview, import, athlete, analysis, delete)
- [x] Testes unitários
- [x] Arquivos CSV de exemplo
- [x] Documentação técnica
