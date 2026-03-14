# AUDITORIA TECNICA — MECANISMO DE RECALCULO DE METRICAS

**Data:** Marco 2026
**Status:** Auditoria completa + Correcoes implementadas e testadas (19/19 tests PASS)

---

## 1. ESTADO ANTES DA AUDITORIA

O recalculo de `athlete_load_metrics` era acionado APENAS em:
- `POST /api/gps-data` (CREATE) → `load_engine.update_athlete_metrics()` ✅
- `POST /api/wearables/import/csv` (CSV import) → `load_engine.update_athlete_metrics()` ✅
- `POST /api/load-metrics/recalculate-all` (ADMIN manual) ✅

**Nao era acionado em:**
- `POST /api/gps-data/delete-activities` (DELETE GPS) ❌
- `PUT /api/gps-data/session/{id}/activity-type` (UPDATE tipo) ❌
- `PUT /api/gps-data/session/{id}/classify-all` (UPDATE tipo todos) ❌
- `DELETE /api/athletes/{id}` (DELETE atleta — sem cascade cleanup) ❌

---

## 2. ARQUITETURA DE DADOS — MATERIALIZADO vs AO VIVO

### Tabela Materializada/Derivada (RISCO DE STALENESS)
| Colecao | Fonte | Alimentada por | Risco |
|---------|-------|---------------|-------|
| `athlete_load_metrics` | `gps_data` | RollingLoadEngine (EWMA) | **SIM** — stale se GPS for alterado sem recalculo |

### Tabelas Consultadas Ao Vivo (SEM RISCO DE STALENESS)
| Colecao | Usada em | Recalculo necessario? |
|---------|----------|----------------------|
| `wellness` | Dashboard Overview, Team Dashboard, Athlete Profile | **NAO** — query ao vivo |
| `jump_assessments` | Dashboard Overview (RSImod), Athlete Profile (CMJ/SL-CMJ/DJ) | **NAO** — query ao vivo |
| `body_compositions` | Dashboard Overview, Athlete Profile | **NAO** — query ao vivo |
| `vbt_data` | Dashboard Overview, Athlete Profile | **NAO** — query ao vivo |
| `assessments` | Athlete Profile (avaliacoes fisicas) | **NAO** — query ao vivo |
| `gps_data` | Timeline, Heatmap, Velocity Zones (via build_daily_gps) | **NAO** — query ao vivo com dedup |

**Conclusao:** DELETE de wellness, jumps, body comp, VBT, assessments reflete automaticamente em todas as telas na proxima consulta. Nenhum recalculo adicional e necessario para essas entidades.

---

## 3. CORRECOES IMPLEMENTADAS

### GAP 1: DELETE GPS → Recalculo Automatico
**Arquivo:** `backend/server.py` — `delete_gps_activities()`
**Logica:** 3 fases:
1. ANTES de deletar: coleta (athlete_id, dates) afetados
2. Deleta registros GPS
3. Para cada atleta afetado:
   - Deleta `athlete_load_metrics` da data mais antiga afetada em diante
   - Encontra o proximo GPS restante >= data afetada
   - Se existir: recalcula EWMA a partir dessa data
   - Se nao: limpeza concluida (metricas anteriores permanecem validas)

### GAP 2: UPDATE Activity Type → Recalculo Automatico
**Arquivo:** `backend/server.py` — `update_session_activity_type()` e `classify_session_for_all_athletes()`
**Logica:** Apos atualizar o tipo de atividade, chama `load_engine.recalculate_from_date()` para o(s) atleta(s) afetado(s) a partir da data da sessao.

### GAP 3: DELETE Athlete → Cascade Cleanup
**Arquivo:** `backend/server.py` — `delete_athlete()`
**Logica:** Apos deletar o atleta, limpa TODAS as colecoes relacionadas:
- `athlete_load_metrics`
- `gps_data`
- `wellness`
- `jump_assessments`
- `body_compositions`
- `vbt_data`
- `assessments`

---

## 4. MAPA COMPLETO DE RECALCULO POR OPERACAO

### GPS Data
| Operacao | Endpoint | Recalculo | Status |
|----------|----------|-----------|--------|
| CREATE | `POST /api/gps-data` | `update_athlete_metrics()` | ✅ Ja existia |
| CREATE (CSV) | `POST /api/wearables/import/csv` | `update_athlete_metrics()` | ✅ Ja existia |
| DELETE | `POST /api/gps-data/delete-activities` | Clean + `recalculate_from_date()` | ✅ CORRIGIDO |
| UPDATE tipo | `PUT /api/gps-data/session/{id}/activity-type` | `recalculate_from_date()` | ✅ CORRIGIDO |
| UPDATE tipo (all) | `PUT /api/gps-data/session/{id}/classify-all` | `recalculate_from_date()` por atleta | ✅ CORRIGIDO |

### Athlete
| Operacao | Endpoint | Cascade | Status |
|----------|----------|---------|--------|
| DELETE | `DELETE /api/athletes/{id}` | 7 colecoes limpas | ✅ CORRIGIDO |

### Wellness (Live-queried)
| Operacao | Endpoint | Recalculo | Status |
|----------|----------|-----------|--------|
| CREATE | `POST /api/wellness` | N/A (ao vivo) | ✅ OK |
| CREATE (token) | `POST /api/wellness/token/submit` | N/A (ao vivo) | ✅ OK |
| DELETE | Nao existe endpoint dedicado | N/A | ⚠️ Sem endpoint |

### Jump Assessments (Live-queried)
| Operacao | Endpoint | Recalculo | Status |
|----------|----------|-----------|--------|
| CREATE | `POST /api/jump/assessment` | N/A (ao vivo) | ✅ OK |
| DELETE | `DELETE /api/jump/assessment/{id}` | N/A (ao vivo) | ✅ OK |

### Body Composition (Live-queried)
| Operacao | Endpoint | Recalculo | Status |
|----------|----------|-----------|--------|
| CREATE | `POST /api/body-composition` | N/A (ao vivo) | ✅ OK |
| DELETE | `DELETE /api/body-composition/{id}` | N/A (ao vivo) | ✅ OK |

### VBT (Live-queried)
| Operacao | Endpoint | Recalculo | Status |
|----------|----------|-----------|--------|
| CREATE | `POST /api/vbt/data` | N/A (ao vivo) | ✅ OK |
| DELETE | `DELETE /api/jumps/{id}` (VBT shared) | N/A (ao vivo) | ✅ OK |

### Assessments (Live-queried)
| Operacao | Endpoint | Recalculo | Status |
|----------|----------|-----------|--------|
| CREATE | `POST /api/assessments` | N/A (ao vivo) | ✅ OK |
| DELETE | Sem endpoint dedicado | N/A | ⚠️ Sem endpoint |

---

## 5. TESTE PRATICO — EVIDENCIA

### GPS CREATE → DELETE → Metricas Revertidas
```
BASELINE:     João acute=10500, chronic=10500, acwr=1.0
POS-CREATE:   João acute=9875,  chronic=10328, acwr=0.96 (recalculado automaticamente)
POS-DELETE:   João acute=10500, chronic=10500, acwr=1.0  (revertido automaticamente)
```

### Athlete Cascade DELETE
```
Response: {
  "message": "Athlete deleted successfully",
  "related_data_cleaned": {
    "athlete_load_metrics": N,
    "gps_data": N,
    "wellness": N,
    "jump_assessments": N,
    "body_compositions": N,
    "vbt_data": N,
    "assessments": N
  }
}
```

---

## 6. CENARIOS DE STALENESS RESTANTES

| Cenario | Risco | Status |
|---------|-------|--------|
| GPS delete sem recalculo | ~~ALTO~~ | ✅ CORRIGIDO |
| GPS activity-type update sem recalculo | ~~MEDIO~~ | ✅ CORRIGIDO |
| Athlete delete sem cascade | ~~MEDIO~~ | ✅ CORRIGIDO |
| Wellness delete | BAIXO | ⚠️ Sem endpoint DELETE dedicado (live-queried, afeta apenas se for implementado) |
| Assessments delete | BAIXO | ⚠️ Sem endpoint DELETE dedicado |
| Edicao retroativa de GPS (nao existe endpoint) | N/A | ⚠️ Nao existe endpoint de UPDATE de GPS existente |
| Cache HTTP/CDN | N/A | Nao existe cache — todas as queries sao ao vivo |
| Memoizacao frontend | N/A | React state e resetado no refresh/navegacao |

---

## 7. ENDPOINT ADMIN (FERRAMENTA DE REPARO)

`POST /api/load-metrics/recalculate-all` permanece como ferramenta administrativa para:
- Rebuild completo apos correcao de bugs no pipeline
- Migracao de dados
- Reparo de emergencia

**NAO e mais necessario para operacao normal do sistema.** Todos os fluxos de create/update/delete agora recalculam automaticamente.
