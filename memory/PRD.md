# Load Manager Pro - PRD

## Problema Original
Aplicativo de gerenciamento de carga para treinadores esportivos. React Native Expo (frontend) + FastAPI (backend) + MongoDB. Modulos: VBT (Velocity Based Training), Jump Camera (CMJ, SL-CMJ), Body Scan 3D (composicao corporal).

## Usuarios
- Treinadores/Preparadores fisicos
- Atletas (visualizacao de dados)

## Funcionalidades Core
1. **Gerenciamento de Atletas** - CRUD completo
2. **Avaliacao de Forca & VBT** - Velocity Based Training com camera
3. **Jump Camera** - CMJ e SL-CMJ com MediaPipe
4. **Body Scan 3D** - Scanner corporal + Protocolos cientificos
5. **Wellness** - Monitoramento de bem-estar
6. **GPS Data** - Importacao CSV Catapult
7. **Analise Cientifica** - Graficos e metricas avancadas
8. **Team Dashboard** - Reestruturacao completa com tabela analitica

## Arquitetura
```
/app
├── frontend/ (React Native Expo)
│   ├── app/(tabs)/team.tsx (Team Dashboard reestruturado)
│   ├── app/athlete/[id]/ (Telas por atleta)
│   ├── components/dashboard/
│   │   ├── TeamTable.tsx (Tabela analitica principal)
│   │   ├── TeamTableRow.tsx (Linha memoizada da tabela)
│   │   ├── ZoneBar.tsx (Barra segmentada Z3/Z4/Z5)
│   │   ├── MiniBar.tsx (Barra proporcional generica)
│   │   ├── FatigueBar.tsx (Barra de fadiga colorida)
│   │   └── types.ts (TeamTableRowData, SortKey, SortDir)
│   ├── hooks/useTeamTableData.ts (Hook para dados da tabela)
│   ├── components/body-composition/
│   │   └── Avatar3D.tsx (Three.js + GLB)
│   ├── engine/body-composition/
│   └── services/jump/
├── backend/ (FastAPI)
│   └── server.py
│       ├── GET /api/dashboard/team (endpoint original intacto)
│       ├── GET /api/dashboard/team-table (NOVO - dados para tabela analitica)
│       └── ... demais endpoints
```

## Team Dashboard - Plano de Reestruturacao

### Etapa 1: Limpeza controlada - CONCLUIDA
- Removidos todos cards, graficos e filtros antigos
- Mantido apenas botao IMPORTAR CSV e empty state
- De 1590 para ~300 linhas

### Etapa 2: Filtro de data + Tabela analitica - CONCLUIDA
- Implementado filtro por periodo (Hoje/7d/14d/28d/90d) com modal
- Novo endpoint `GET /api/dashboard/team-table` agregando:
  - GPS (distance, z3, z4, z5, sprints, acc_dec)
  - Jump Camera (rsimod, rsimod_delta)
  - Body Scan (weight, body_fat, lean_mass)
  - Wellness (fatigue_index, fatigue_status, readiness_status)
- Tabela com 8 colunas: Atleta, Distancia, Zonas, Sprint, ACC/DEC, RSImod, Fadiga, Body Comp
- Ordenacao por qualquer coluna
- Toggle de colunas (Zonas, Sprint, ACC/DEC)
- Scroll horizontal
- FlatList virtualizada + React.memo + keyExtractor estavel

### Etapa 3: Grafico de carga (Stacked Bar) - CONCLUIDA
- StackedBarChart.tsx com barras empilhadas por atleta (SVG nativo)
- Camadas: Total Distance (base) + Z3 + Z4 + Z5
- Seletores toggle para Z3/Z4/Z5 (ativar/desativar camadas dinamicamente)
- Linha horizontal de media da equipe (tracejada)
- Destaque visual Top 3 (verde) e Bottom 3 (vermelho)
- Labels com iniciais dos atletas + valor em km
- Scroll horizontal para +100 atletas
- Todos useMemo, React.memo, componentes puros

### Proximas etapas previstas:
- Etapa 4: Grafico de dispersao (Scatter Plot)
- Etapa 5: Grafico neuromuscular (RSImod + fadiga)
- Etapa 6: Refinamentos visuais e integracao final

## Restricoes absolutas
- NAO alterar botao IMPORTAR CSV
- NAO alterar pipeline de ingestao CSV
- NAO modificar regras do Overview
- NAO criar novas metricas - apenas visualizacao
- SL-CMJ visualmente oculto (logica interna preservada)

## Credenciais de teste
- Email: contato@loadmanagerpro.com.br
- Senha: #UAE2026
