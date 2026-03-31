# Load Manager Pro - PRD

## Original Problem Statement
Aplicativo de monitoramento de carga esportiva com React Native (frontend) + FastAPI (backend) + MongoDB.

## Feature: Enhanced CSV Import (2026-03-16)

### Implementação
Fluxo de importação CSV multi-step com detecção de estrutura, preview, mapeamento inteligente e templates.

### Backend (NOVOS — aditivos, zero mudanças em código existente)
- **`/app/backend/csv_analyzer.py`**: Módulo isolado de análise CSV
  - `analyze_csv()`: Detecta delimiter, encoding, header row, tipo de coluna, manufacturer, auto-mapping com confidence score
  - `apply_custom_mapping()`: Aplica mapeamento customizado e retorna records normalizados
  - `INTERNAL_FIELDS`: Definição de campos agrupados (required/recommended/optional) com aliases
  
- **Endpoints em `server.py` (linhas ~9820)**:
  - `POST /api/csv/analyze` — Analisa CSV e retorna auto-mapping + sugestões + preview
  - `POST /api/csv/import-mapped` — Importa com mapeamento customizado, preserva auto-criação de atletas
  - `GET /api/csv/mapping-templates` — Lista templates salvos
  - `POST /api/csv/mapping-templates` — Salva template
  - `DELETE /api/csv/mapping-templates/{id}` — Remove template

### Frontend
- **`/app/frontend/app/upload-csv.tsx`**: Nova página multi-step
  - Step 1: Upload + análise automática
  - Step 2: Review (summary, preview, mappings, warnings, templates)
  - Step 3: Mapping manual (dropdowns searcháveis, sugestões, sample values)
  - Step 4: Importação + resultado detalhado

### Navegação
- `team.tsx`: Botão "Importar CSV" agora navega para `/upload-csv` (antes: `/upload-catapult`)
- `upload-catapult.tsx`: Preservado (rota ainda funciona, não deletada)

### Testes
- 11/11 backend tests PASS (iteration_39)
- Regression dashboards: PASS
- Frontend rendering: PASS

## Correções Anteriores

### Bug P0 - Dashboard Visão Geral: Dados Desatualizados (2026-03-14)
**Corrigido**: has_gps_data flag gates load metrics computation.

### Bug - Wellness Residual no Estado Vazio (2026-03-14)
**Corrigido**: `|| 5` fallback substituído por `hasWellnessData` check.

### Bug - Dashboard Equipe Desaparece (2026-03-14)
**Corrigido**: Early return removido, empty state inline.

### UI - DJ Oculto + Entrada Manual Removida (2026-03-14)
**Corrigido**: DJ comentado em 3 telas, manual entry removida.

### Bug Crítico - Document Picker iOS (2026-03-16)
**Corrigido**: `blob.arrayBuffer()` é undefined no React Native nativo (iOS). Corrigido com branch `Platform.OS === 'web'` em `upload-csv.tsx`.

### RC5 - CSV Import Não Atualiza Métricas EWMA/ACWR (2026-03-23)
**Corrigido**: `engine.recalculate_athlete(aid)` chamava método inexistente no `RollingLoadEngine`. Substituído por `load_engine.recalculate_from_date(athlete_id, coach_id, earliest_date)` com `earliest_date` derivada dos registros importados. Erro silenciado (`except: pass`) substituído por `logging.error`. Arquivo: `server.py` L9951-9972.

## Auditoria Dashboard Visão Geral (2026-03-23)
Root causes identificadas (RC1-RC7):
- RC1: Gauges não respondem ao filtro de data (EWMA acumulativo, sem filtro)
- RC2: Filtro "Hoje" (filter_days=0) quebra charts e velocity zones — **CORRIGIDO**
- RC3: Filtro "Ontem" gera datas erradas na timeline — **CORRIGIDO**
- RC4: LMPI amarelo vs Risk "optimal" — semânticas incompatíveis — **CORRIGIDO**
- RC5: CSV Import não atualiza métricas — **CORRIGIDO**
- RC6: Monotony/Strain calculados diferente em Team vs Overview — **CORRIGIDO**
- ACWR Padronização: 5 endpoints `/analysis/acwr-*` migrados de rolling average para load_engine EWMA — **CORRIGIDO**
- RC7: Atletas sem dados aparecem com risco alto artificialmente — **CORRIGIDO**

## Auditoria VBT Camera + Jump Camera (2026-03-24)
**Documentado**: Auditoria pre-migracao MediaPipe. Documento completo em `/app/memory/AUDIT_VBT_JUMP_CAMERA.md`.
- Pipelines VBT (8 etapas) e Jump (8 etapas) mapeados
- 4 pontos de integracao MediaPipe identificados
- Patch iOS (2 fixes criticos) documentado
- 17 arquivos INTOCAVEIS, 7 CUIDADO, 4 SEGUROS classificados
- Conclusao: Sistema estavel para intervencao

## UI Enhancement — LMPI Score Classification no Smart Summary (2026-03-24)
**Implementado**: Badge de classificação LMPI exibido no Smart Summary sem alterar lógica do backend.
- Helper `getLmpiClassification()` mapeia thresholds existentes: >=70 → Alto, >=40 → Moderado, <40 → Baixo
- Badge com cor/background exibido abaixo do gauge
- Validade: invalid → "Sem dados", partial → asterisco "*" com nota explicativa
- Tabela renomeada de "Atletas com Maior Risco" → "Ranking LMPI" com colunas Score + Classificação
- Atletas com `lmpi_validity === "invalid"` filtrados da tabela
- Sem "High Risk" visual — classificação reflete performance, não risco direto
- Arquivo: `frontend/app/(tabs)/data.tsx`

## Auditoria Animacoes + Responsividade (2026-03-24)
**Documentado**: Auditoria da dashboard "Visao Geral". Documento completo em `/app/memory/AUDIT_ANIMATIONS_RESPONSIVENESS.md`.
- Animacoes SVG (gauges, barras, linhas): NAO IMPLEMENTADAS nos componentes SVG (renderizam valor final direto)
- Wrappers (FadeInView, ChartEntryView): FUNCIONAM mas animam container, nao conteudo SVG
- AnimatedMetric (contagem numerica): FUNCIONA
- Responsividade: ZERO implementacao (sem breakpoints, sem useWindowDimensions, sem layout lateral)
- 5 causas raiz identificadas, 10 checks de animacao + 10 checks de responsividade

## Pendentes

### P0
- Implementar animacoes SVG reais (gauges, barras, linhas)
- Implementar layout responsivo (sidebar em telas grandes)

### P2
- Refatorar dashboards para Rolling Load Engine
- RSI discrepância Overview vs Team

### P3/Backlog
- Internacionalização ScientificAnalysisTab.tsx
- ESLint TypeScript config
- UI merge perfis duplicados
- Remover ios_backup_before_removal/
