# RELATÓRIO DE AUDITORIA TÉCNICA — ACWR / EWMA

**Data:** Fevereiro 2026  
**Objetivo:** Investigar por que o EWMA ACWR já implementado não está sendo utilizado no Team Dashboard

---

## ETAPA 1 — IMPLEMENTAÇÕES EWMA ENCONTRADAS

### 1.1 `backend/load_engine/ewma_calculator.py`
- **Classe:** `EWMACalculator`
- **Propósito:** Implementa cálculo EWMA completo para cargas de treino
- **Fórmula:** `EWMA_today = Load_today * lambda + EWMA_yesterday * (1 - lambda)`
- **Constantes:**
  - `EWMA_ACUTE_LAMBDA = 2 / (7 + 1) = 0.25` (janela 7 dias)
  - `EWMA_CHRONIC_LAMBDA = 2 / (28 + 1) = 0.069` (janela 28 dias)
- **Métodos principais:**
  - `calculate_acute_ewma()` — calcula EWMA agudo (janela 7 dias)
  - `calculate_chronic_ewma()` — calcula EWMA crônico (janela 28 dias)
  - `calculate_both()` — calcula ambos em uma chamada
  - `calculate_from_history()` — recalcula EWMA a partir de histórico completo
- **Usado para:** acute load EWMA, chronic load EWMA
- **Instância singleton:** `ewma_calculator` exportada no `__init__.py`

### 1.2 `backend/load_engine/acwr_calculator.py`
- **Classe:** `ACWRCalculator`
- **Propósito:** Calcula ACWR a partir de valores EWMA
- **Fórmula:** `ACWR = EWMA_acute / EWMA_chronic`
- **Classificação de zonas:**
  - UNDERLOAD: < 0.8
  - OPTIMAL: 0.8 - 1.3
  - WARNING: 1.3 - 1.5
  - SPIKE: > 1.5
- **Usado para:** ACWR final baseado em EWMA

### 1.3 `backend/load_engine/rolling_load_engine.py`
- **Classe:** `RollingLoadEngine`
- **Propósito:** Orquestra EWMA + ACWR + Monotony + Strain + Spike Detection
- **Método principal:** `update_athlete_metrics()` — ponto de entrada para atualizar métricas
- **Fluxo:**
  1. Agrega dados GPS do dia
  2. Busca métricas anteriores (EWMA do dia anterior)
  3. Calcula EWMA acute + chronic para cada métrica (distance, hsr, sprint_distance, acc_dec_load)
  4. Calcula ACWR via `ACWRCalculator.calculate_with_zone(ewma_acute, ewma_chronic)`
  5. Calcula monotony + strain semanal
  6. Detecta spikes
  7. Armazena resultado na coleção `athlete_load_metrics` (upsert)
- **Coleção MongoDB:** `athlete_load_metrics`
- **Métricas retornadas por atleta:** `distance.ewma_acute`, `distance.ewma_chronic`, `distance.acwr`, `distance.acwr_zone` (idem para hsr, sprint_distance, acc_dec_load)

### 1.4 `backend/load_engine/spike_detector.py`
- **Classe:** `SpikeDetector`
- **Propósito:** Detecta picos de carga e calcula monotony/strain
- **Usado para:** detecção de spikes baseado no ACWR EWMA

### 1.5 `backend/load_engine/load_metrics.py`
- **Propósito:** Define constantes, enums e modelos Pydantic
- **Modelos chave:** `MetricValues` (contém `ewma_acute`, `ewma_chronic`, `acwr`, `acwr_zone`), `AthleteLoadMetrics` (documento completo por atleta/data)

---

## ETAPA 2 — CÁLCULO ACWR ATIVO NO TEAM DASHBOARD

### Localização exata
- **Arquivo:** `backend/server.py`
- **Função:** `get_team_dashboard()` (endpoint `GET /api/dashboard/team`)
- **Linha:** ~8097 (início do loop de atletas) até ~8237 (fim do cálculo ACWR)

### Fórmula aplicada (CONFIRMADO — Coupled ACWR por soma simples)

```python
# Linhas 8201-8217 de server.py
# ACWR CALCULATION (logic unchanged)
acute_load = 0.0
for i in range(7):
    date_str = (today - timedelta(days=i)).strftime("%Y-%m-%d")
    day_data = gps_data_by_date.get(date_str, {})
    acute_load += day_data.get(acwr_metric, 0) or 0

chronic_load = 0.0
for i in range(28):
    date_str = (today - timedelta(days=i)).strftime("%Y-%m-%d")
    day_data = gps_data_by_date.get(date_str, {})
    chronic_load += day_data.get(acwr_metric, 0) or 0

chronic_weekly_avg = chronic_load / 4 if chronic_load > 0 else 0

if chronic_weekly_avg > 0:
    acwr = round(acute_load / chronic_weekly_avg, 2)
```

### Confirmação da estrutura

| Componente | Método usado | Cientificamente correto? |
|---|---|---|
| Acute Load | `sum(últimos 7 dias)` | Parcialmente (soma simples, não EWMA) |
| Chronic Load | `sum(últimos 28 dias)` | Parcialmente (soma simples) |
| Chronic Weekly Avg | `chronic_load / 4` | **PROBLEMA PRINCIPAL** |
| ACWR | `acute_load / chronic_weekly_avg` | **Coupled ACWR** |

### Artefato matemático documentado
Se toda a atividade GPS de um atleta estiver apenas nos últimos 7 dias (sem dados entre os dias 8-28):
- `chronic_load == acute_load` (mesma soma)
- `chronic_weekly_avg = acute_load / 4`
- `ACWR = acute_load / (acute_load / 4) = 4.0` — **SEMPRE**

---

## ETAPA 3 — ONDE O EWMA É CHAMADO

### Chamada 1: Upload de dados GPS (endpoint POST)
- **Arquivo:** `server.py`, linha 1185-1193
- **Contexto:** Após upload individual de GPS data via API
```python
# UPDATE ROLLING LOAD METRICS (EWMA, ACWR, etc.)
await load_engine.update_athlete_metrics(
    athlete_id=gps_data.athlete_id,
    coach_id=coach_id_str,
    date=gps_data.date
)
```

### Chamada 2: Importação CSV de GPS
- **Arquivo:** `server.py`, linha 9472-9480
- **Contexto:** Após importação de arquivo CSV wearable
```python
# UPDATE ROLLING LOAD METRICS (EWMA, ACWR, etc.)
await load_engine.update_athlete_metrics(
    athlete_id=athlete_id,
    coach_id=str(current_user["_id"]),
    date=consolidated.get("date")
)
```

### Chamada 3: Endpoint dedicado individual
- **Arquivo:** `server.py`, linha 4484-4549
- **Endpoint:** `GET /api/load-metrics/{athlete_id}`
- **O que retorna:** EWMA acute, EWMA chronic, ACWR (EWMA-based), zones, monotony, strain, spikes

### Chamada 4: Endpoint dedicado equipe
- **Arquivo:** `server.py`, linha 4601-4650
- **Endpoint:** `GET /api/load-metrics/team/latest`
- **O que retorna:** ACWR EWMA por atleta para cada métrica (distance, hsr, sprint, acc_dec)

### Chamada 5: Recalcular desde uma data
- **Arquivo:** `server.py`, linha 4552-4598
- **Endpoint:** `POST /api/load-metrics/{athlete_id}/recalculate`
- **O que faz:** Recalcula EWMA incrementalmente desde uma data específica

### Estado da coleção `athlete_load_metrics`
**RESULTADO DA VERIFICAÇÃO: A coleção está VAZIA (0 documentos)**

Isso significa que:
- O `load_engine.update_athlete_metrics()` foi implementado nos pontos de ingestão (upload e CSV), mas como a base de dados de teste tem apenas 1 registro GPS, a coleção pode nunca ter sido populada com dados significativos
- OU os dados foram limpos/recriados

---

## ETAPA 4 — PIPELINE DE MÉTRICAS DO TEAM DASHBOARD

### Pipeline ATIVO (o que está rodando):
```
GPS data (coleção gps_data)
  → Carregamento bulk para memória (query direta)
  → Agrupamento por atleta (in-memory)
  → Agrupamento por data/sessão (in-memory, com dedup de períodos)
  → Soma simples acute (7 dias) / chronic (28 dias) [INLINE]
  → ACWR = acute / (chronic/4)  [COUPLED ACWR]
  → Campo "acwr" no response JSON
  → Frontend team.tsx consome "athlete.acwr"
```

### Pipeline DORMIENTE (implementado mas NÃO usado pelo dashboard):
```
GPS data (coleção gps_data)
  → load_engine.update_athlete_metrics() [chamado no upload/CSV]
  → EWMACalculator.calculate_both() [EWMA incremental]
  → ACWRCalculator.calculate_with_zone(ewma_acute, ewma_chronic) [EWMA ACWR]
  → Armazenamento em "athlete_load_metrics" (coleção MongoDB)
  → Endpoints GET /api/load-metrics/{id} e GET /api/load-metrics/team/latest
  → NENHUM frontend consome estes endpoints para o Team Dashboard
```

### Campos retornados pela API ativa (`GET /api/dashboard/team`):
```json
{
  "athletes": [
    {
      "acwr": 4.0,        // <- Coupled ACWR (soma simples)
      "risk_level": "high" // <- classificação baseada no valor incorreto
    }
  ],
  "stats": {
    "team_avg_acwr": 4.0   // <- média dos ACWRs incorretos
  }
}
```

### Campos disponíveis no pipeline DORMIENTE (`GET /api/load-metrics/team/latest`):
```json
{
  "metrics": [
    {
      "distance_acwr": null,   // <- EWMA ACWR (vazio pois coleção está sem dados)
      "distance_zone": "unknown",
      "hsr_acwr": null,
      "sprint_acwr": null,
      "monotony": 0,
      "strain": 0
    }
  ]
}
```

---

## ETAPA 5 — COEXISTÊNCIA DE MÉTODOS

### Existem 4 (QUATRO) implementações de ACWR no projeto:

| # | Método | Localização | Tipo | Status |
|---|--------|------------|------|--------|
| 1 | **Inline Coupled ACWR** | `server.py` linhas 8201-8237 (dentro de `get_team_dashboard`) | Soma simples: `sum(7d) / (sum(28d)/4)` | **ATIVO** no Team Dashboard |
| 2 | **`calculate_metric_acwr()`** | `server.py` linha 3824-3847 | Soma simples: `sum(acute) / (sum(chronic)/4)` | Usado em endpoint legado |
| 3 | **`calculate_rolling_acwr()`** | `server.py` linhas 3873-3902 | Rolling average: `avg(7d) / avg(28d)` | Usado em `GET /api/analysis/acwr-rolling/{id}` |
| 4 | **EWMA ACWR (load_engine)** | `load_engine/acwr_calculator.py` + `rolling_load_engine.py` | EWMA: `ewma_acute / ewma_chronic` | **DORMIENTE** — armazena em `athlete_load_metrics` mas não é lido pelo dashboard |

### Qual método deveria ser o padrão científico do sistema?
O **Método 4 (EWMA ACWR)** é o padrão cientificamente recomendado:
- Williams et al. (2017), Murray et al. (2017): EWMA responde melhor a variações
- Não sofre do artefato matemático do Coupled ACWR
- Produz valores mais estáveis e representativos
- Já foi IMPLEMENTADO e TESTADO no módulo `load_engine`

### Por que o Método 1 (ativo) produz sempre 4.0?
O artefato é inerente ao modelo Coupled ACWR quando dados existem apenas na janela aguda:
- Se dados GPS estão concentrados nos últimos 7 dias
- `chronic_load = acute_load` (pois 28 dias inclui os 7 dias)
- `ACWR = acute / (chronic/4) = acute / (acute/4) = 4.0`

---

## ETAPA 6 — USO NO FRONTEND

### Arquivo: `frontend/app/(tabs)/team.tsx`
- **Endpoint chamado:** `GET /api/dashboard/team?lang=${locale}&acwr_metric=${selectedMetric}&date_range=${selectedDateRange}` (linha 141)
- **Campo exibido:** `athlete.acwr` (linha 565)
- **Média exibida:** `data.stats.team_avg_acwr` (linha 654)

### O frontend NÃO chama:
- `GET /api/load-metrics/team/latest` (endpoint EWMA)
- `GET /api/load-metrics/{athlete_id}` (endpoint EWMA individual)

### Diagnóstico do Frontend:
A API já retorna um campo ACWR, mas este campo é calculado pelo Método 1 (Coupled ACWR inline). O frontend apenas exibe o que recebe — **o problema está 100% no backend**, no endpoint `GET /api/dashboard/team`.

O endpoint EWMA (`GET /api/load-metrics/team/latest`) existe mas nunca foi integrado ao frontend do Team Dashboard.

---

## ETAPA 7 — HISTÓRICO DE IMPLEMENTAÇÃO

### Cronologia deduzida do código:

1. **Fase 1 (Original):** Implementação inicial do Team Dashboard com Coupled ACWR inline em `get_team_dashboard()`. Fórmula simples: `sum(7d) / (sum(28d)/4)`.

2. **Fase 2 (Evolução):** Criação das funções auxiliares `calculate_metric_acwr()` e `calculate_rolling_acwr()` para endpoints de análise individual. Ainda baseadas em soma simples e rolling averages.

3. **Fase 3 (Modernização):** Implementação completa do módulo `load_engine/` com arquitetura profissional:
   - `EWMACalculator` — cálculo EWMA incremental
   - `ACWRCalculator` — ACWR baseado em EWMA
   - `SpikeDetector` — detecção de picos
   - `RollingLoadEngine` — orquestrador com persistência em MongoDB
   - Endpoints dedicados: `GET /api/load-metrics/{id}`, `GET /api/load-metrics/team/latest`, `POST /api/load-metrics/{id}/recalculate`
   - Integração nos pontos de ingestão (upload GPS e CSV import)

4. **Fase 4 (Desconexão):** O Team Dashboard (`get_team_dashboard()`) NUNCA foi atualizado para usar o `load_engine`. O cálculo inline (Coupled ACWR) permaneceu ativo, e o pipeline EWMA ficou "dormiente" — funcional mas sem consumidor no frontend principal.

### Comentário no código (linha 8201):
```python
# ACWR CALCULATION (logic unchanged)
```
Este comentário confirma que o cálculo inline foi mantido intencionalmente inalterado, mesmo após a criação do `load_engine`.

---

## RESULTADO DA AUDITORIA

### 1. Existe implementação EWMA no código?
**SIM.** Implementação completa e profissional no pacote `backend/load_engine/`.

### 2. Onde essa implementação está localizada?
- `backend/load_engine/ewma_calculator.py` — Cálculo EWMA
- `backend/load_engine/acwr_calculator.py` — ACWR baseado em EWMA
- `backend/load_engine/rolling_load_engine.py` — Orquestrador principal
- `backend/load_engine/spike_detector.py` — Detecção de spikes
- `backend/load_engine/load_metrics.py` — Constantes e modelos

### 3. Ela calcula ACWR ou apenas cargas EWMA?
**Calcula AMBOS:** cargas EWMA (acute e chronic) E o ACWR final (via `EWMA_acute / EWMA_chronic`).

### 4. Qual método de ACWR está atualmente ativo no Team Dashboard?
**Método Coupled ACWR por soma simples** — implementado inline na função `get_team_dashboard()` em `server.py`, linhas 8201-8237.

### 5. Por que o método EWMA não está sendo utilizado no cálculo exibido?
**O endpoint `GET /api/dashboard/team` nunca foi refatorado para consumir os dados da coleção `athlete_load_metrics`.** A função `get_team_dashboard()` faz todo o cálculo de ACWR inline usando soma simples, ignorando completamente o módulo `load_engine` e a coleção onde os dados EWMA são armazenados.

### 6. Existe duplicação de métodos?
**SIM. Existem 4 implementações diferentes de ACWR no projeto:**
1. Inline Coupled ACWR em `get_team_dashboard()` — **ATIVO no dashboard**
2. `calculate_metric_acwr()` — usado em endpoint legado
3. `calculate_rolling_acwr()` — usado em endpoint de análise individual  
4. EWMA ACWR no `load_engine` — **DORMIENTE**

### 7. Qual endpoint ou função alimenta o valor mostrado no dashboard?
**`GET /api/dashboard/team`** → função `get_team_dashboard()` em `server.py` (linha 7876)

---

## DIAGNÓSTICO FINAL

A desconexão entre a implementação EWMA e o Team Dashboard ocorreu porque:

1. O módulo `load_engine/` foi construído como um sistema moderno e independente
2. Ele foi integrado nos pontos de **ingestão** de dados (upload GPS e CSV)
3. Ele possui endpoints **dedicados** para consulta (`/api/load-metrics/*`)
4. **MAS** o endpoint principal do Team Dashboard (`/api/dashboard/team`) nunca foi atualizado para:
   - Ler da coleção `athlete_load_metrics`
   - Substituir o cálculo inline (Coupled ACWR) pelo ACWR EWMA
5. O frontend (`team.tsx`) chama apenas o endpoint antigo, não os endpoints EWMA
6. A coleção `athlete_load_metrics` está atualmente **VAZIA** (0 documentos), confirmando que o pipeline EWMA não está sendo utilizado de forma efetiva

### Caminho para correção (NÃO implementar nesta etapa):
O endpoint `get_team_dashboard()` deve ser refatorado para:
- Opção A: Ler diretamente da coleção `athlete_load_metrics` (mais rápido, dados pré-calculados)
- Opção B: Chamar `load_engine.get_latest_metrics()` ou `load_engine.get_team_metrics()` dentro do endpoint
- Em ambos os casos: substituir o campo `acwr` inline pelo valor EWMA da `load_engine`
- Antes: garantir que a coleção `athlete_load_metrics` seja populada (via recalculate para dados históricos existentes)
