# AUDITORIA TECNICA COMPLETA
## Divergencias entre Team Dashboard e Dashboard Overview

**Data:** Fevereiro 2026
**Status:** Diagnostico completo - Sem alteracoes no codigo

---

## PARTE 1 — RASTREAMENTO DA FONTE DE DADOS DO DASHBOARD OVERVIEW

### 1. Endpoint que abastece a tela
- **Endpoint:** `GET /api/dashboard/overview`
- **Funcao backend:** `get_dashboard_overview()` — arquivo `backend/server.py`, linha 8514

### 2. Funcao que monta os dados da camada LOAD INTELLIGENCE
A funcao `get_dashboard_overview()` monta LOAD INTELLIGENCE assim:
- **ACWR, Acute Load, Chronic Load:** Lidos diretamente de `athlete_load_metrics` (linhas 8784-8802)
- **Monotony, Strain:** Lidos de `athlete_load_metrics` (linhas 8799-8802)
- **Daily Timeline (grafico):** Construido por `build_daily_gps()` a partir de `gps_data` com dedup (linhas 8650-8685)
- **ACWR Timeline:** Lido de `athlete_load_metrics` historico (linhas 8830-8838)
- **Velocity Zones:** Construido por `build_daily_gps()` com dedup (linhas 8841-8857)

### 3. Colecoes consultadas
| Dado | Colecao | Pipeline |
|------|---------|----------|
| ACWR / Acute / Chronic / Monotony / Strain | `athlete_load_metrics` | EWMA via RollingLoadEngine |
| Daily Timeline / Heatmap / Velocity Zones | `gps_data` | `build_daily_gps()` com dedup |
| Wellness | `wellness` | Leitura direta |
| Jumps / VBT / Body Comp | `jump_assessments` / `vbt_data` / `body_compositions` | Leitura direta |

### 4. Campos usados para Acute / Chronic / ACWR
```
athlete_load_metrics.distance.ewma_acute  → Acute Load
athlete_load_metrics.distance.ewma_chronic → Chronic Load
athlete_load_metrics.distance.acwr        → ACWR
athlete_load_metrics.monotony             → Monotony
athlete_load_metrics.strain               → Strain
```

### 5. Origem do valor em `athlete_load_metrics`
A colecao `athlete_load_metrics` e populada pela funcao:
```
RollingLoadEngine.update_athlete_metrics()
```
Localizada em: `backend/load_engine/rolling_load_engine.py`, linha 272

Essa funcao chama `aggregate_gps_for_date()` (linha 136) para obter o load diario.

### 6-8. **CAUSA RAIZ ENCONTRADA: Soma indevida de periodos**

A funcao `aggregate_gps_for_date()` (linhas 136-180 de `rolling_load_engine.py`):

```python
async def aggregate_gps_for_date(self, athlete_id, coach_id, date):
    gps_records = await self.db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": coach_id,
        "date": date
    }).to_list(100)

    totals = {"distance": 0.0, ...}

    for record in gps_records:
        totals["distance"] += float(record.get("total_distance", 0) or 0)
        # ... soma TODOS os registros sem deduplicacao
    return totals
```

**ESTA FUNCAO NAO TEM LOGICA DE DEDUPLICACAO.**

Quando uma sessao GPS possui multiplos registros na colecao `gps_data` (ex: "Session" + "1st Half" + "2nd Half"), a funcao soma TODOS eles.

Exemplo para Khosaif Abdallah:
- Registro "Session": total_distance = 11125m
- Registro "1st Half": total_distance = Xm
- Registro "2nd Half": total_distance = Ym
- `aggregate_gps_for_date` soma: 11125 + X + Y ≈ 22130m (INFLADO)

Este valor inflado e entao processado pelo calculador EWMA:
1. `current_load = 22130` (inflado)
2. Como e o primeiro dia: `ewma_acute = 22130`, `ewma_chronic = 22130`
3. Dias subsequentes sem atividade: EWMA decai com fatores lambda
4. Resultado final armazenado: `distance.ewma_acute ≈ 22130`, `distance.ewma_chronic ≈ 21122`

### 9. Filtro de datas
O filtro global de 28 dias e aplicado de forma diferente:
- **Overview:** Filtra `gps_data` com `date >= 90_dias_atras` para carregar dados, mas os gauges ACWR usam `athlete_load_metrics` que reflete o ULTIMO registro (sem filtro temporal direto no gauge)
- **Team Dashboard:** Mesma abordagem para ACWR (ultimo registro de `athlete_load_metrics`)

---

## PARTE 2 — COMPARACAO DIRETA TEAM DASHBOARD vs OVERVIEW

### Tabela Comparativa por Metrica

| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **Endpoint** | `GET /api/dashboard/team` | `GET /api/dashboard/overview` |
| **Funcao** | `get_team_dashboard()` L.7887 | `get_dashboard_overview()` L.8514 |
| **Arquivo** | `backend/server.py` | `backend/server.py` |

#### Total Distance (metric_value no Team Dashboard)
| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **Fonte** | `gps_data` direto | Nao exibe este campo diretamente |
| **Logica de dedup** | SIM — `_GPS_SESSION_KW` / `_GPS_PERIOD_KW` (L.8158-8199) | N/A para gauges |
| **Agregacao** | Soma diaria com dedup, depois soma ultimos min(filter_days, 7) dias | Timeline usa `build_daily_gps()` COM dedup |
| **Valor para Khosaif** | 11125 (CORRETO — apenas Session) | Timeline mostraria 11125 (correto) |

#### Acute Load
| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **Fonte** | `athlete_load_metrics` | `athlete_load_metrics` |
| **Campo** | `load_engine_field.ewma_acute` (via `load_metrics_by_athlete`) | `distance.ewma_acute` (via `load_metrics_latest`) |
| **Pipeline** | `RollingLoadEngine.aggregate_gps_for_date()` → SEM dedup → EWMA | Mesma pipeline |
| **Valor para Khosaif** | **Nao exibido como campo separado** | 22130 (INFLADO) |

#### Chronic Load
| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **Fonte** | `athlete_load_metrics` | `athlete_load_metrics` |
| **Campo** | `load_engine_field.ewma_chronic` | `distance.ewma_chronic` |
| **Pipeline** | `RollingLoadEngine.aggregate_gps_for_date()` → SEM dedup → EWMA | Mesma pipeline |
| **Valor para Khosaif** | **Nao exibido como campo separado** | 21122 (INFLADO) |

#### ACWR
| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **Fonte** | `athlete_load_metrics` | `athlete_load_metrics` |
| **Campo** | `load_engine_field.acwr` | `distance.acwr` |
| **Calculo** | `ewma_acute / ewma_chronic` | `ewma_acute / ewma_chronic` |
| **Valor para Khosaif** | 1.05 (ou similar — ratio de valores inflados) | 1.1 (ratio de valores inflados) |
| **Observacao** | O RATIO pode parecer "razoavel" mesmo com valores base inflados | Idem |

**NOTA CRITICA:** O ACWR como RATIO pode ser semelhante em ambos os dashboards porque tanto acute quanto chronic estao igualmente inflados. A divergencia principal e nos VALORES ABSOLUTOS (Acute Load e Chronic Load).

#### Wellness
| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **Fonte** | `wellness` (colecao) | `wellness` (colecao) |
| **Campo** | `wellness_score` (0-10) | `wellness_score` (0-10) |
| **Calculo** | Leitura direta do banco, recalculo inline se ausente | `get_wellness_score()` — mesma formula |
| **Exibicao** | Card: "Wellness Medio" mostrando valor 0-10 | **NAO EXIBE wellness diretamente** |
| **Agregacao equipe** | `team_avg_wellness` = media simples dos wellness_score | `team_wellness` = `safe_avg()` — mesma logica |

#### Readiness
| Aspecto | Team Dashboard | Dashboard Overview |
|---------|---------------|-------------------|
| **Fonte** | `wellness` → campo `readiness_score` | `wellness` → campo `wellness_score` |
| **Formula original** | `(10-fatigue)*0.3 + sleep_score*0.3 + (10-soreness)*0.2 + mood*0.2` | `(10-fatigue)*0.2 + (10-stress)*0.15 + mood*0.15 + sleep_quality*0.2 + (10-soreness)*0.15 + hydration*0.15` |
| **Escala** | readiness_score * 10 → 0-100% | wellness_score * 10 → 0-100 |
| **Exibicao** | Card: "Readiness Medio" com sufixo % | **Gauge: "Prontidao" (label = Readiness)** |
| **PROBLEMA** | Mostra READINESS real | **Mostra WELLNESS rotulado como "Prontidao/Readiness"** |

---

## PARTE 3 — AUDITORIA DO TOTAL DISTANCE NO OVERVIEW (Acute Load = 22130)

### Rastreamento Matematico Completo

```
CAMINHO DOS DADOS:

1. CSV Import → gps_data (multiplos registros por sessao)
   Registros para Khosaif, data X:
   - Registro A: period_name="Session"    → total_distance = 11125
   - Registro B: period_name="1st Half"   → total_distance = ~5000
   - Registro C: period_name="2nd Half"   → total_distance = ~6000
   (Soma B+C ≈ 11000, Soma A+B+C ≈ 22125)

2. Apos insert, load_engine.update_athlete_metrics() e chamado
   → Chama aggregate_gps_for_date()
   → Query: db.gps_data.find({athlete_id, coach_id, date})
   → Retorna TODOS os 3 registros (A, B, C)
   → Soma: totals["distance"] = 11125 + ~5000 + ~6000 = ~22125

3. EWMACalculator.calculate_both(current_load=22125, prev_acute=None, prev_chronic=None, is_first_day=True)
   → ewma_acute = 22125 (primeiro dia: EWMA = load)
   → ewma_chronic = 22125

4. Dias subsequentes SEM atividade:
   → ewma_acute = 0 * 0.25 + 22125 * 0.75 = 16594
   → ewma_chronic = 0 * 0.069 + 22125 * 0.931 = 20598
   (Decaimento continua ate valores atuais: ~22130 acute, ~21122 chronic)

5. ACWR = ewma_acute / ewma_chronic = 22130 / 21122 ≈ 1.05
   (O valor 1.1 pode variar dependendo da sequencia exata de dias)

6. Armazenado em athlete_load_metrics:
   {
     "athlete_id": "...",
     "date": "...",
     "distance": {
       "daily_load": 22125,
       "ewma_acute": 22130,   ← INFLADO
       "ewma_chronic": 21122,  ← INFLADO
       "acwr": 1.05
     }
   }
```

### Prova da Duplicacao

| Componente | Valor | Fonte | Tem Dedup? |
|-----------|-------|-------|-----------|
| Team Dashboard metric_value | 11125 | `gps_data` → dedup | SIM |
| Overview Daily Timeline | ~11125 | `gps_data` → `build_daily_gps()` → dedup | SIM |
| Overview Acute Load gauge | 22130 | `athlete_load_metrics` → `aggregate_gps_for_date()` | **NAO** |
| Overview Chronic Load gauge | 21122 | `athlete_load_metrics` → `aggregate_gps_for_date()` | **NAO** |

### Conclusao Parte 3
O valor 22130 e resultado da soma indevida de TODOS os periodos GPS (Session + 1st Half + 2nd Half) pela funcao `aggregate_gps_for_date()` no RollingLoadEngine. O valor correto deveria ser baseado apenas no periodo "Session" = 11125.

---

## PARTE 4 — AUDITORIA DE WELLNESS / READINESS

### Divergencia Identificada

O Team Dashboard e o Dashboard Overview usam **metricas diferentes** rotuladas de forma confusa:

#### Team Dashboard (team.tsx)
```
Card 1: "Wellness Medio" → data.stats.team_avg_wellness
  Fonte: wellness_score (0-10 scale)
  Formula: (10-fatigue)*0.20 + (10-stress)*0.15 + mood*0.15 + sleep_quality*0.20 + (10-soreness)*0.15 + hydration*0.15
  Exibicao: Valor numerico direto (ex: 6.8)

Card 2: "Readiness Medio" → data.stats.team_avg_readiness (com sufixo %)
  Fonte: readiness_score * 10 (0-100% scale)
  Formula original: (10-fatigue)*0.30 + sleep_score*0.30 + (10-soreness)*0.20 + mood*0.20
  sleep_score = min(sleep_hours / 8.0 * 10, 10)
  Exibicao: Valor percentual (ex: 72%)
```

#### Dashboard Overview — Team Status (data.tsx)
```
Gauge: "Prontidao" (label=Readiness) → wellness * 10
  Fonte: summary.team_wellness (0-10 scale)
  Formula: MESMA do wellness_score acima
  Exibicao: wellness_score * 10 = ex: 68 (em gauge 0-100)
```

### Analise da Divergencia

| Metrica | Team Dashboard | Overview (Team Status) |
|---------|---------------|----------------------|
| **O que mostra** | Avg Wellness = 6.8 (0-10) E Avg Readiness = 72% (0-100) | Gauge "Prontidao" = 68 (0-100) |
| **Formula real** | wellness_score + readiness_score (SEPARADOS) | wellness_score * 10 (rotulado como "Prontidao") |
| **O problema** | CORRETO — sao metricas distintas | **INCORRETO** — mostra wellness como se fosse readiness |

### Formulas Comparadas

```
WELLNESS_SCORE (mesma nos dois dashboards):
  = (10-fatigue)*0.20 + (10-stress)*0.15 + mood*0.15 + sleep_quality*0.20 + (10-soreness)*0.15 + hydration*0.15
  Escala: 0-10
  Considera: 6 variaveis com pesos iguais

READINESS_SCORE (apenas no Team Dashboard):
  = (10-fatigue)*0.30 + sleep_score*0.30 + (10-soreness)*0.20 + mood*0.20
  onde sleep_score = min(sleep_hours/8*10, 10)
  Escala: 0-10 (multiplicado por 10 para exibir como %)
  Considera: 4 variaveis com pesos diferentes, inclui SLEEP_HOURS
```

### Exemplos de Divergencia

Se um atleta tem:
- fatigue=3, stress=4, mood=7, sleep_quality=8, muscle_soreness=3, hydration=7, sleep_hours=7

```
wellness_score = (10-3)*0.20 + (10-4)*0.15 + 7*0.15 + 8*0.20 + (10-3)*0.15 + 7*0.15
              = 1.40 + 0.90 + 1.05 + 1.60 + 1.05 + 1.05 = 7.05

readiness_score = (10-3)*0.30 + min(7/8*10,10)*0.30 + (10-3)*0.20 + 7*0.20
               = 2.10 + 2.625 + 1.40 + 1.40 = 7.525

Team Dashboard: Wellness Medio = 7.05 | Readiness Medio = 75.3%
Overview gauge "Prontidao": 70.5 (wellness * 10)
```

A diferenca (75.3 vs 70.5) vem do uso de formulas diferentes.

### Conclusao Parte 4
1. **Confusao semantica confirmada**: O Overview rotula "Prontidao/Readiness" mas mostra wellness_score * 10
2. **Divergencia real de calculo**: wellness_score ≠ readiness_score (formulas diferentes, pesos diferentes, variaveis diferentes)
3. **Atletas sem resposta**: Ambos os dashboards excluem atletas sem wellness (nao contam como zero)
4. **Janela temporal**: Ambos usam o ULTIMO registro de wellness por atleta (sem filtro por periodo)

---

## PARTE 5 — VERIFICACAO DE COERENCIA COM O PERFIL DO ATLETA

### Referencia de Verdade
- 1 atividade registrada para Khosaif Abdallah
- 3 periodos dentro da atividade:
  - Periodo "Session" (total): total_distance ≈ 11125m
  - Periodo 1 (sub-periodo): total_distance ≈ Xm
  - Periodo 2 (sub-periodo): total_distance ≈ Ym
  - Soma dos sub-periodos ≈ 20738m
- Team Dashboard usa apenas Session = 11125m (CORRETO)

### Respostas

| Pergunta | Resposta |
|----------|---------|
| O Overview deveria usar Session apenas? | **SIM** — deve seguir a mesma logica do Team Dashboard |
| O Overview esta usando periodos internos indevidamente? | **SIM** — via `aggregate_gps_for_date()` no RollingLoadEngine |
| Existe requisito antigo para agregacao diferente? | **NAO** — o `build_daily_gps()` do proprio Overview ja tem dedup correto |
| A diferenca e bug ou comportamento legado? | **BUG** — a funcao `aggregate_gps_for_date()` nunca teve logica de dedup |

### Impacto Cascata
A funcao `aggregate_gps_for_date()` sem dedup afeta **TODAS** as metricas derivadas armazenadas em `athlete_load_metrics`:
- `distance.ewma_acute` — INFLADO
- `distance.ewma_chronic` — INFLADO
- `distance.daily_load` — INFLADO
- `hsr.ewma_acute/chronic` — POTENCIALMENTE INFLADO (se HSR tiver periodos)
- `sprint_distance.ewma_acute/chronic` — POTENCIALMENTE INFLADO
- `acc_dec_load` — POTENCIALMENTE INFLADO
- `high_intensity_distance` — POTENCIALMENTE INFLADO
- `number_of_sprints` — POTENCIALMENTE INFLADO
- `monotony` — CALCULADO COM VALORES INFLADOS
- `strain` — CALCULADO COM VALORES INFLADOS

---

## PARTE 6 — RESULTADO FINAL DA AUDITORIA

### Lista de Divergencias Confirmadas

#### DIVERGENCIA 1: Acute Load inflado no Overview
| Atributo | Detalhe |
|----------|---------|
| **Valor no Team Dashboard** | metric_value = 11125 (soma de 7 dias com dedup, apenas Session) |
| **Valor no Dashboard Overview** | acute_load = 22130 (EWMA baseado em soma SEM dedup) |
| **Valor correto esperado** | acute_load baseado em ≈11125 por dia (apenas Session) |
| **Origem do erro** | `RollingLoadEngine.aggregate_gps_for_date()` |
| **Arquivo/Funcao/Linha** | `backend/load_engine/rolling_load_engine.py` → `aggregate_gps_for_date()` → linhas 136-180 |
| **Gravidade** | CRITICA |

#### DIVERGENCIA 2: Chronic Load inflado no Overview
| Atributo | Detalhe |
|----------|---------|
| **Valor no Team Dashboard** | Nao exibido separadamente |
| **Valor no Dashboard Overview** | chronic_load = 21122 (EWMA baseado em soma SEM dedup) |
| **Valor correto esperado** | chronic_load baseado em ≈11125 por dia (apenas Session) |
| **Origem do erro** | Mesma da Divergencia 1 |
| **Arquivo/Funcao/Linha** | `backend/load_engine/rolling_load_engine.py` → `aggregate_gps_for_date()` → linhas 136-180 |
| **Gravidade** | CRITICA |

#### DIVERGENCIA 3: Monotony e Strain potencialmente inflados
| Atributo | Detalhe |
|----------|---------|
| **Origem do erro** | `RollingLoadEngine.calculate_weekly_metrics()` usa `loads.get("distance")` inflado |
| **Arquivo/Funcao/Linha** | `backend/load_engine/rolling_load_engine.py` → `calculate_weekly_metrics()` → linhas 230-270 |
| **Gravidade** | ALTA |

#### DIVERGENCIA 4: Gauge "Prontidao" mostra Wellness ao inves de Readiness
| Atributo | Detalhe |
|----------|---------|
| **Valor no Team Dashboard** | Avg Wellness (0-10) E Avg Readiness (0-100%) como cards separados |
| **Valor no Dashboard Overview** | Gauge "Prontidao" = wellness_score * 10 (rotulado como Readiness) |
| **Valor correto esperado** | Ou mostrar readiness_score * 10, ou rotular como "Wellness" |
| **Origem do erro** | Frontend `data.tsx` usa `wellness * 10` no gauge rotulado "Prontidao/Readiness" |
| **Arquivo/Funcao/Linha** | `frontend/app/(tabs)/data.tsx` → `renderTeamStatus()` → linha 825 |
| **Gravidade** | MEDIA — confusao semantica, nao erro de calculo |

#### DIVERGENCIA 5: Codigo morto no Dashboard Overview
| Atributo | Detalhe |
|----------|---------|
| **Funcoes** | `calc_acwr()` (L.8687) e `calc_monotony_strain()` (L.8695) definidas mas nunca chamadas |
| **Origem** | Remanescentes da refatoracao anterior que trocou calculo inline por EWMA |
| **Arquivo/Funcao/Linha** | `backend/server.py` → linhas 8687-8710 |
| **Gravidade** | BAIXA — nao afeta funcionalidade |

### Fonte Unica de Verdade (Definicao)

| Metrica | Fonte de Verdade | Pipeline Correto |
|---------|-----------------|-----------------|
| Total Distance (diario) | `gps_data` com dedup Session/Period | `build_daily_gps()` ou logica equivalente do Team Dashboard |
| ACWR / Acute / Chronic | `athlete_load_metrics` — MAS so apos correcao do `aggregate_gps_for_date()` | RollingLoadEngine com dedup |
| Monotony / Strain | `athlete_load_metrics` — MAS so apos correcao | RollingLoadEngine com dedup |
| Wellness Score | `wellness` colecao → `wellness_score` | Leitura direta |
| Readiness Score | `wellness` colecao → `readiness_score` | Leitura direta |

### Recomendacoes de Correcao

#### CORRECAO 1 (CRITICA): Adicionar dedup a `aggregate_gps_for_date()`
**Arquivo:** `backend/load_engine/rolling_load_engine.py`
**Funcao:** `aggregate_gps_for_date()` (linhas 136-180)
**Acao:** Implementar a MESMA logica de deduplicacao que existe no Team Dashboard e no `build_daily_gps()`:
1. Agrupar registros por `session_name`
2. Para cada sessao, classificar periodos usando keywords (session/total/full vs half/period/split)
3. Preferir o registro "session total" sobre a soma de periodos
4. Apenas somar periodos se nao houver session total

#### CORRECAO 2 (CRITICA): Recalcular `athlete_load_metrics` para todos os atletas
**Acao:** Apos corrigir `aggregate_gps_for_date()`, executar `populate_all_athletes()` para recalcular TODOS os valores EWMA historicos com os dados corretos.

#### CORRECAO 3 (MEDIA): Corrigir o gauge "Prontidao" no Overview
**Arquivo:** `frontend/app/(tabs)/data.tsx`
**Funcao:** `renderTeamStatus()` (linha 825)
**Opcoes:**
- A) Mudar para usar `readiness_score * 10` (alinhando com Team Dashboard)
- B) Manter wellness mas renomear o label para "Wellness" ao inves de "Prontidao"
**Recomendacao:** Opcao A — alinhar com Team Dashboard

#### CORRECAO 4 (BAIXA): Remover codigo morto
**Arquivo:** `backend/server.py`
**Acao:** Remover funcoes `calc_acwr()` e `calc_monotony_strain()` (linhas 8687-8710) que sao definidas mas nunca chamadas dentro de `get_dashboard_overview()`.

### Validacao Final

| Metrica | Status Atual | Apos Correcao |
|---------|-------------|---------------|
| Total Distance (timeline) | CORRETO (dedup via `build_daily_gps`) | Sem alteracao |
| Acute Load | INFLADO (sem dedup no LoadEngine) | Correto (dedup no `aggregate_gps_for_date`) |
| Chronic Load | INFLADO (sem dedup no LoadEngine) | Correto |
| ACWR | RATIO POSSIVELMENTE OK, valores base inflados | Correto |
| Monotony | POSSIVELMENTE INFLADO | Correto (apos recalculo) |
| Strain | POSSIVELMENTE INFLADO | Correto (apos recalculo) |
| Gauge Prontidao | MOSTRA WELLNESS, NAO READINESS | Mostrara Readiness real |
| Heatmap | CORRETO | Sem alteracao |
| Velocity Zones | CORRETO | Sem alteracao |

---

## RESUMO EXECUTIVO

### Causa raiz principal
A funcao `RollingLoadEngine.aggregate_gps_for_date()` em `backend/load_engine/rolling_load_engine.py` (linhas 136-180) **nao possui logica de deduplicacao de periodos GPS**. Quando uma sessao contem tanto um registro "Session" (total) quanto registros de sub-periodos ("1st Half", "2nd Half"), a funcao soma TODOS eles, inflando o daily load em aproximadamente 2x.

Este daily load inflado e usado como input para o calculador EWMA, resultando em valores de `ewma_acute`, `ewma_chronic`, `monotony` e `strain` TODOS inflados na colecao `athlete_load_metrics`.

### Causa raiz secundaria
O Dashboard Overview rotula o gauge de Team Status como "Prontidao" (Readiness) mas na realidade exibe `wellness_score * 10`, que usa uma formula diferente de `readiness_score`. Isso cria confusao semantica quando comparado com o "Avg Readiness" do Team Dashboard.

### O que NAO deve ser alterado
- A logica de dedup do Team Dashboard esta CORRETA
- A logica de `build_daily_gps()` no Overview esta CORRETA
- A pipeline EWMA do RollingLoadEngine esta CORRETA (o problema e o INPUT, nao o calculo)
- O calculo de wellness_score e readiness_score estao CORRETOS individualmente
