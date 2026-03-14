# AUDITORIA INDEPENDENTE DE VALIDACAO
## Stale Data entre Dashboard Overview e Team Dashboard

**Data:** Marco 2026
**Tipo:** Auditoria somente-leitura, sem alteracao de codigo
**Objetivo:** Validar se a correcao implementada resolveu o problema

---

## 1. INSPECAO DO FRONTEND (SEM ALTERACAO)

### 1.1. `data.tsx` (Dashboard Overview)
- **Linha 13:** `import { useFocusEffect } from 'expo-router';` — PRESENTE ✅
- **Linhas 386-390:** `useFocusEffect(useCallback(() => { refetch(); }, [refetch]))` — PRESENTE E ATIVO ✅
- **Query:** `useQuery` com `queryKey: ['dashboard-overview', ...]` — refetch automatico ao ganhar foco ✅
- **Endpoint:** `GET /api/dashboard/overview` via `api.get()` — sem cache local adicional ✅

### 1.2. `team.tsx` (Team Dashboard)
- **Linha 14:** `import { useRouter, useFocusEffect } from 'expo-router';` — PRESENTE ✅
- **Linhas 147-151:** `useFocusEffect(React.useCallback(() => { refetch(); }, [refetch]))` — PRESENTE E ATIVO ✅
- **Query:** `useQuery` com `queryKey: ['team-dashboard', ...]` — refetch automatico ao ganhar foco ✅
- **Endpoint:** `GET /api/dashboard/team` via `api.get()` — sem cache local adicional ✅

### 1.3. `_layout.tsx` (QueryClient)
- **Linha 10:** `const queryClient = new QueryClient();` — sem `staleTime: Infinity` ✅
- React Query defaults: `staleTime: 0`, `gcTime: 5 min` — dados considerados stale imediatamente
- `useFocusEffect` garante refetch a cada navegacao de tab, compensando o fato de tabs nao desmontarem

### 1.4. Conclusao Frontend
A correcao e SUFICIENTE para o cenario descrito. `useFocusEffect` e o mecanismo correto para React Native com Tab Navigation (expo-router). Cada vez que o usuario navega para a aba Overview ou Team, os dados sao refrescados do servidor. Nao existe provider, store, memoizacao ou cache local que impeca a atualizacao visual.

---

## 2. INSPECAO DO BACKEND (SEM ALTERACAO)

### 2.1. `delete_gps_activities` (server.py, linhas 1257-1343)
- **Phase 1** (linhas 1269-1286): Coleta athletes/dates afetados ANTES de deletar ✅
- **Phase 2** (linhas 1288-1303): Deleta registros GPS ✅
- **Phase 3** (linhas 1308-1337): Para cada atleta afetado:
  - Deleta `athlete_load_metrics` com `date >= earliest_date` ✅
  - Busca proximo GPS restante >= earliest_date ✅
  - Se encontrar: recalcula EWMA a partir dessa data ✅
  - Se nao: retorna `stale_metrics_cleaned: True` ✅

### 2.2. Verificacao de Consistencia
- Overview e Team consomem a MESMA colecao `athlete_load_metrics`
- Ambos os endpoints usam a mesma logica: sort por `date desc`, pegar primeiro por atleta
- Ambos os endpoints usam o campo `distance.ewma_acute` / `distance.ewma_chronic` / `distance.acwr`
- Nao existe endpoint separado, cache de backend, ou materializacao adicional
- Nao existe divergencia de filtro, janela temporal ou timezone entre os endpoints

### 2.3. Conclusao Backend
A correcao e SUFICIENTE. A Phase 3 resolve corretamente o cenario de exclusao:
- Se GPS restante existe: recalcula EWMA chain ✅
- Se GPS restante NAO existe: limpa metrics stale ✅
- Nao permanece nenhum registro orphan ✅

---

## 3. TESTES PRATICOS — CENARIO ORIGINAL

### Teste 1: CREATE → Verificar → DELETE → Verificar
```
BASELINE:     OV acute=10500, acwr=1.0 | TD acwr=1.0
POS-CREATE:   OV acute=9750,  acwr=0.95 | TD acwr=0.95     ← AMBOS MUDARAM ✅
POS-DELETE:   OV acute=10500, acwr=1.0  | TD acwr=1.0       ← AMBOS REVERTERAM ✅
```
**RESULTADO:** PASSOU ✅

---

## 4. TESTES DE BORDA

### Teste 2: Mutacoes Consecutivas (create/delete/create/delete)
```
BASELINE:     OV acute=10500, acwr=1.0
CREATE 1:     OV acute=9125,  acwr=0.9  | TD acwr=0.9      ✅
DELETE 1:     OV acute=10500, acwr=1.0  | TD acwr=1.0       ✅
CREATE 2:     OV acute=10875, acwr=1.03 | TD acwr=1.03      ✅
DELETE 2:     OV acute=10500, acwr=1.0  | TD acwr=1.0       ✅
```
**RESULTADO:** PASSOU ✅ — 4 mutacoes consecutivas, Overview e Team sempre sincronizados

### Teste 3: Exclusao de TODAS as atividades do atleta
```
ANTES:        OV acute=10500, acwr=1.0 | 1 GPS record
DELETE ALL:   deleted=1, stale_metrics_cleaned=True
APOS:         OV acute=0, acwr=None | TD acwr=None
METRICS DB:   0 registros (limpo completamente)
RESTAURACAO:  OV acute=10500, acwr=1.0 (recriado automaticamente)
```
**RESULTADO:** PASSOU ✅ — Sem registros orphan, sem dados stale

### Teste 4: Verificacao de que `athlete_load_metrics` fica vazio apos delete total
```
Metrics restantes para João: 0
```
**RESULTADO:** PASSOU ✅ — Nenhum registro stale permanece

---

## 5. VERIFICACAO SE A CORRECAO FOI SUFICIENTE

| Ponto de Verificacao | Resultado |
|---------------------|-----------|
| Overview busca dado fresco do servidor? | SIM — `useFocusEffect(refetch)` ✅ |
| Team Dashboard busca dado fresco? | SIM — `useFocusEffect(refetch)` ✅ |
| Ambos consomem dados coerentes? | SIM — mesma colecao, mesma query ✅ |
| Existe divergencia de endpoint? | NAO ✅ |
| Existe divergencia de filtro? | NAO ✅ |
| Existe divergencia de janela temporal? | NAO ✅ |
| Existe cache que impede atualizacao? | NAO ✅ |
| Existe provider/store local com stale data? | NAO ✅ |
| `athlete_load_metrics` fica limpo apos delete? | SIM ✅ |
| Recalculo e automatico sem refresh manual? | SIM ✅ |
| Problema foi resolvido na causa raiz? | SIM ✅ |

---

## 6. CONCLUSAO FINAL

### **A) CORRECAO VALIDADA COM SUCESSO — PROBLEMA REALMENTE RESOLVIDO** ✅

A correcao implementada resolve o problema na causa raiz de forma SUFICIENTE e COMPLETA:

**Frontend:**
- `useFocusEffect(refetch)` garante que cada tab refaz a query do servidor ao ganhar foco
- Isso compensa o comportamento de React Native onde tabs ficam montadas e `useQuery` nao refaz automaticamente

**Backend:**
- Phase 3 do `delete_gps_activities` garante limpeza de metrics stale E recalculo quando necessario
- Nao permanecem registros orphan apos exclusao parcial ou total

**Consistencia:**
- Overview e Team Dashboard consomem a mesma fonte (`athlete_load_metrics`) com a mesma logica
- Ambos refazem request ao ganhar foco
- Ambos refletem mutacoes (create/delete) imediatamente na proxima navegacao

### Nota sobre teste anterior invalido
Os testes 2 e 3 da sessao anterior (que mostraram valores inalterados) falharam por `422 Unprocessable Entity` nos CREATEs (payload incompleto). Isso foi detectado nesta auditoria ao inspecionar os logs HTTP. Os valores estavam inalterados porque os CREATEs nunca aconteceram, NAO por falha na correcao.

---

## ARQUIVOS INSPECIONADOS
- `frontend/app/(tabs)/data.tsx` — linhas 1-14, 373-405
- `frontend/app/(tabs)/team.tsx` — linhas 1-16, 138-160
- `frontend/app/_layout.tsx` — linhas 1-52
- `backend/server.py` — linhas 1180-1343
