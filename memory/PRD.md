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

---

## API Endpoints - Jump Import

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

### GET /api/jumps/athlete/{athlete_id}
Recupera todos os saltos de um atleta.

### GET /api/jumps/analysis/{athlete_id}
Análise básica de performance de salto.

### DELETE /api/jumps/{jump_id}
Remove um registro de salto.

---

## API Endpoints - Jump Analysis (NOVO)

### GET /api/jumps/report/{athlete_id}
Gera um relatório completo de performance de salto.

**Query Parameters:**
- `jump_type`: Tipo de salto (CMJ, SJ, DJ, RJ). Padrão: CMJ
- `window_days`: Janela de análise em dias. Padrão: 14

**Response:**
```json
{
  "athlete_id": "...",
  "athlete_name": "João Silva",
  "generated_at": "2026-02-10T21:00:00",
  "status": "ok|warning|alert|critical",
  "readiness": "optimal|good|moderate|low|poor|unknown",
  "readiness_score": 77,
  "cmj_trend": -2.58,
  "rsi_trend": null,
  "fatigue_flag": false,
  "status_emoji": "🟢",
  "headline": "Prontidão normal - pode treinar conforme planejado",
  "recommendation": "Atleta em bom estado...",
  "training_load_modifier": 1.0,
  "data_quality": "good",
  "jumps_analyzed": 10,
  "baseline": { ... },
  "trends": { ... },
  "fatigue": { ... },
  "readiness_detail": { ... }
}
```

### GET /api/jumps/compare
Compara performance de múltiplos atletas.

**Query Parameters:**
- `athlete_ids`: IDs separados por vírgula (ex: "id1,id2,id3")
- `jump_type`: Tipo de salto. Padrão: CMJ
- `metric`: Métrica de comparação (z_height, pct_best_height, pct_career_height). Padrão: z_height

**Response:**
```json
{
  "jump_type": "CMJ",
  "metric": "pct_best_height",
  "athlete_count": 2,
  "comparison": {
    "athletes": [
      {
        "athlete_id": "...",
        "athlete_name": "Pedro Santos",
        "value": 98.73,
        "raw_height_cm": 39.0,
        "pct_best_height": 98.73,
        "rank": 1,
        "percentile": 100.0
      },
      ...
    ],
    "group_mean": 96.455,
    "group_std": 3.217
  }
}
```

---

## Módulo Jump Analysis

### Estrutura

```
backend/jump_analysis/
├── __init__.py        # Exports públicos
├── baselines.py       # Cálculo de baselines (best, avg, CV%)
├── trends.py          # Análise de tendências (slope, deltas)
├── fatigue.py         # Detecção de fadiga neuromuscular
├── readiness.py       # Avaliação de prontidão
├── comparisons.py     # Comparações entre atletas/dispositivos
└── report.py          # Geração de relatórios estruturados
```

### Funcionalidades

#### 1. Baseline Calculator (`baselines.py`)
- **Historical Best**: Melhor performance de todos os tempos
- **Rolling Averages**: Médias de 7, 14 e 28 dias
- **Career Average**: Média de carreira
- **CV%**: Coeficiente de variação (consistência)

#### 2. Trend Analysis (`trends.py`)
- **Delta vs Baseline**: % mudança em relação à referência
- **Weekly Slope**: Regressão linear (cm/semana)
- **Direction**: improving, stable, declining

#### 3. Fatigue Detection (`fatigue.py`)
Baseado em evidência científica:
- CMJ height drop ≥ 5% = threshold breach
- RSI drop ≥ 10% = threshold breach
- Sustained ≥ 2 sessões = fatigue confirmed

**Níveis**: none, low, moderate, high, critical

#### 4. Readiness Assessment (`readiness.py`)
Score composto (0-100):
- Fatigue Score: 50% peso
- Trend Score: 30% peso
- Consistency Score: 20% peso

**Níveis**: optimal (≥85), good (≥70), moderate (≥55), low (≥40), poor (<40)

#### 5. Comparisons (`comparisons.py`)
- **Z-Score**: Normalização intra-atleta
- **Percent of Best**: % do melhor pessoal
- **Percentile**: Ranking entre grupo
- **Device Correction**: Ajuste por dispositivo

---

## Testes

### Jump Import (30 testes)
- Cálculos de métricas (altura, RSI, velocidade)
- Validação por tipo de salto
- Parsing de CSV
- Detecção de fabricantes
- Mapeamento de colunas

### Jump Analysis (27 testes)
- Cálculo de baselines
- Análise de tendências
- Detecção de fadiga
- Avaliação de prontidão
- Geração de relatórios
- Comparação entre atletas
- Análise de RSI

**Total: 57 testes passando**

---

## Status da Implementação

### ✅ COMPLETO - Jump Import
- [x] Módulo `jump_import/` com separação de responsabilidades
- [x] Mappers para 4 fabricantes + custom
- [x] Cálculos de métricas derivadas
- [x] Validação de regras de negócio
- [x] API endpoints (preview, import, athlete, analysis, delete)
- [x] 30 testes unitários

### ✅ COMPLETO - Jump Analysis
- [x] Módulo `jump_analysis/` com análise esportiva
- [x] Cálculo de baselines (best, rolling, CV%)
- [x] Análise de tendências (slope, direction)
- [x] Detecção de fadiga neuromuscular
- [x] Avaliação de prontidão (score 0-100)
- [x] Comparação entre atletas (z-score, percentil)
- [x] API endpoint de relatório (/api/jumps/report/{id})
- [x] API endpoint de comparação (/api/jumps/compare)
- [x] 27 testes unitários

### ✅ COMPLETO - Identity Resolver (Resolução de Identidade de Atletas)
- [x] Módulo `identity_resolver/` com arquitetura limpa
- [x] Normalização agressiva de nomes (acentos, pontuação, ordem)
- [x] Fuzzy matching com threshold de 85% (thefuzz library)
- [x] Persistência de aliases (`athlete_aliases` collection)
- [x] API endpoints:
  - `POST /api/athletes/resolve-name` - Resolver nome único
  - `POST /api/athletes/resolve-bulk` - Resolver múltiplos nomes
  - `POST /api/athletes/confirm-alias` - Confirmar associação
  - `GET /api/athletes/{id}/aliases` - Listar aliases
  - `DELETE /api/athletes/aliases/{id}` - Remover alias
- [x] 19 testes unitários

---

## Módulo Identity Resolver

### Problema Resolvido
O mesmo atleta pode aparecer com nomes diferentes em CSVs de fontes distintas:
- "João Vitor" / "JOAO VITOR" / "J. Vitor" / "Vitor, João"

### Princípios Fundamentais
1. **athlete_id é o ÚNICO identificador único** - O nome é apenas descritivo
2. **Nunca criar atletas automaticamente** - Sempre exigir confirmação
3. **Nunca sobrescrever aliases existentes** - Conflitos exigem ação manual
4. **Auditoria completa** - Registrar quem criou cada associação

### Fluxo de Resolução (3 Etapas)

**Etapa 1 - Busca Exata**
- CSV contém `athlete_id` explícito? → Usar diretamente
- Alias já mapeado? → Usar athlete_id associado

**Etapa 2 - Sugestão por Similaridade**
- Normalizar nome do CSV
- Comparar com nomes existentes
- Se similaridade ≥ 85%: sugerir candidato
- Se múltiplos candidatos: exigir escolha manual

**Etapa 3 - Confirmação Obrigatória**
- Coach escolhe: atleta existente OU criar novo
- Decisão é persistida como alias
- Reutilizada em futuros uploads

### Estrutura do Módulo

```
backend/identity_resolver/
├── __init__.py          # Exports públicos
├── models.py            # Pydantic models (AthleteAlias, etc.)
├── normalizer.py        # Normalização de nomes
├── matcher.py           # Fuzzy matching (thefuzz)
└── resolver.py          # Motor de resolução
```

### Schema: athlete_aliases

```json
{
  "_id": "ObjectId",
  "athlete_id": "string",
  "coach_id": "string",
  "alias_normalized": "string",
  "alias_original": "string",
  "source_system": "string",
  "created_at": "datetime",
  "last_used_at": "datetime",
  "created_by": "string"
}
```

### API Response: resolve-bulk

```json
{
  "resolved": {"J. Vitor": "athlete_id_123"},
  "resolved_count": 1,
  "unresolved": [
    {
      "original_name": "JOAO VITOR",
      "candidates": [
        {
          "athlete_id": "...",
          "athlete_name": "João Vitor Silva",
          "similarity_score": 93.8,
          "match_reason": "tokens correspondentes"
        }
      ],
      "suggested_action": "select_or_create"
    }
  ],
  "can_import": false,
  "message": "1 nome(s) pendente(s)"
}
```

---

## Próximos Passos (Backlog)

### P1 - Integração com Pipelines de Upload
- [ ] Aplicar resolução de identidade no preview de jump_import
- [ ] Aplicar resolução de identidade no preview de gps_import
- [ ] Bloquear importação se houver atletas não resolvidos

### P2 - Normalização Estatística
- [ ] Correção por dispositivo (offsets de medição)
- [ ] Percentis de grupo (ranking entre equipe)

### P3 - Interface Frontend
- [ ] Upload de CSV com preview
- [ ] Dashboard de atleta com gráficos
- [ ] Indicadores visuais de prontidão
- [ ] Comparação lado a lado

---

## Referências Científicas

- Claudino et al. (2017) - CMJ monitoring in team sports
- Gathercole et al. (2015) - Neuromuscular fatigue markers
- Taylor et al. (2012) - Jump testing for monitoring fatigue
- Bosco et al. (1983) - Simple method for mechanical power measurement
