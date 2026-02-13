# Load Manager - PRD

## Overview
Sistema de gerenciamento de carga de treinamento para futebol com análise de bem-estar, GPS, força e composição corporal.

## Problema Original
Substituição completa do modelo de "Link Wellness" por um sistema de "Token Wellness" interno ao app:
- Token alfanumérico de 6 caracteres (sem URL externa)
- Limite de usos definido pelo coach
- Expiração configurável (30min, 1h, 2h, 8h, 24h)
- Uso único por atleta por token
- Sem login para atleta

---

## Sistema de Token Wellness (IMPLEMENTADO - 2026-02-13)

### Versão Atual
**app.json version: 1.0.13** (pronto para novo build)

### Novo Fluxo de Acesso

**Primeira abertura do app:**
1. Tela de seleção: "Sou Coach" / "Sou Atleta"
2. Coach → Login normal → Dashboard completo
3. Atleta → Inserir token → Selecionar nome → Responder wellness → Fim

### Backend Implementado

**Novas Coleções MongoDB:**
- `wellness_tokens`: Armazena tokens gerados pelos coaches
  ```json
  {
    "token_id": "YXPVUU",
    "coach_id": "string",
    "max_uses": 30,
    "current_uses": 0,
    "expires_at": "datetime",
    "status": "active|inactive|expired"
  }
  ```
- `token_usage`: Rastreia qual atleta usou qual token
  ```json
  {
    "token_id": "YXPVUU",
    "athlete_id": "string",
    "used_at": "datetime"
  }
  ```

**Endpoints Implementados:**
- `POST /api/wellness/token` - Coach gera token (requer autenticação)
- `POST /api/wellness/token/validate` - Atleta valida token (público)
- `GET /api/wellness/token/{token_id}/athletes` - Lista atletas do coach (público)
- `GET /api/wellness/token/{token_id}/check-athlete/{athlete_id}` - Verifica uso (público)
- `POST /api/wellness/token/submit` - Submete questionário via token (público)
- `GET /api/wellness/tokens` - Lista todos os tokens do coach (requer autenticação)

### Frontend Implementado

**Novas Telas:**
1. `/app/role-select.tsx` - Tela inicial "Sou Coach" / "Sou Atleta"
2. `/app/athlete-token.tsx` - Entrada de token pelo atleta
3. `/app/athlete-wellness.tsx` - Formulário wellness para atleta
4. `/app/generate-wellness-token.tsx` - Coach gera tokens

**Modificações:**
- `index.tsx` - Redirecionamento baseado em role persistido
- `_layout.tsx` - Novas rotas adicionadas
- `profile.tsx` - "Gerar Link" substituído por "Gerar Token"
- `locales/pt.json` e `locales/en.json` - Novas chaves de tradução

### Regras de Negócio

1. **Token de 6 caracteres**: Letras maiúsculas + dígitos, sem O/0/I/1/L
2. **Uso único por atleta**: Verificado via `token_usage` collection
3. **Max uses**: Quando `current_uses >= max_uses`, status = "inactive"
4. **Expiração**: Quando `now > expires_at`, status = "expired"
5. **Sem sessão para atleta**: Após enviar, retorna à tela de token

### Testes (19/19 passando)
- Criação de token com valores padrão e customizados
- Validação case-insensitive
- Bloqueio de uso duplicado por atleta
- Bloqueio quando max_uses atingido
- Rejeição de token inválido/expirado
- Cálculo correto de readiness score

---

## Arquitetura do Código

```
/app
├── backend/
│   ├── server.py          # API FastAPI com endpoints wellness token + VBT
│   └── tests/
│       └── test_vbt_camera.py  # Testes do VBT Camera
├── frontend/
│   ├── app/
│   │   ├── index.tsx           # Redirecionamento por role
│   │   ├── role-select.tsx     # Seleção Coach/Atleta
│   │   ├── athlete-token.tsx   # Entrada de token
│   │   ├── athlete-wellness.tsx # Formulário wellness
│   │   ├── generate-wellness-token.tsx # Coach gera token
│   │   ├── _layout.tsx         # Rotas configuradas
│   │   ├── (tabs)/
│   │   │   └── profile.tsx     # Menu do coach
│   │   └── athlete/[id]/
│   │       ├── add-strength.tsx    # Avaliação de força (botão Camera)
│   │       └── vbt-camera.tsx      # NOVO: VBT via câmera
│   └── locales/
│       ├── pt.json             # Traduções português
│       └── en.json             # Traduções inglês
└── test_reports/
    └── iteration_16.json       # Relatório de testes VBT Camera
```

---

## Backlog

### P0 - VBT via Camera ✅ COMPLETO
- [x] **Fase 1**: UI e navegação (COMPLETA)
- [x] **Fase 2**: Tracking de barbell (COMPLETA - 2026-02-13)
  - [x] Módulo de tracking com modelo físico (`services/vbt/barTracker.ts`)
  - [x] Hook React para integração (`services/vbt/useBarTracking.ts`)
  - [x] Cálculo de velocidade instantânea, média e pico
  - [x] Detecção automática de repetições
  - [x] Feedback visual (verde = OK, vermelho = queda >10%)
  - [x] Simulação para desenvolvimento (useSimulation: true)
  - [x] Documentação para integração com MediaPipe (build nativo)
- [x] **Fase 3**: Integração com gráficos (COMPLETA - 2026-02-13)
  - [x] Gráficos de Perda de Velocidade por Set atualizados automaticamente
  - [x] Perfil Carga x Velocidade integrado (requer cargas variadas para regressão)
  - [x] Relatórios PDF incluem dados VBT da câmera
  - [x] Invalidação de cache para atualização automática de todas as telas
  - [x] Testes automatizados criados (`test_vbt_camera_phase3.py`)

**NOTA**: Tracking real com MediaPipe requer build nativo iOS/Android com react-native-vision-camera + Frame Processors. A simulação atual funciona para testes e desenvolvimento.

### P1 - Internacionalização
- [ ] Internacionalização completa de `ScientificAnalysisTab.tsx`
- [ ] Internacionalização da página "Avaliações"

### P2 - Futuro
- [ ] Testar pipeline `gps_import` com `identity_resolver`
- [ ] Integrar identity resolution em outros imports
- [ ] UI para resolução manual de nomes ambíguos
- [ ] Funcionalidade de merge de atletas duplicados

---

## Credenciais de Teste

- **Coach**: testcoach@example.com / TestPass123!
- **Token de teste**: 9UDZAX (expira em 1h após criação: 2026-02-13 15:41)
- **API URL**: https://vbt-camera-phase3.preview.emergentagent.com
- **Atletas de teste**: Atleta Teste 1, Atleta Teste 2, Atleta Teste 3

---

## Changelog

### 2026-02-13 - VBT via Camera - FASE 2 COMPLETA
- **NOVA FUNCIONALIDADE**: Módulo de tracking de barbell implementado
- Novos arquivos criados:
  - `services/vbt/barTracker.ts` - Lógica de tracking com modelo físico
  - `services/vbt/useBarTracking.ts` - Hook React para integração
  - `services/vbt/index.ts` - Exports e documentação
- Recursos implementados:
  - Cálculo de velocidade instantânea (pixels → metros usando modelo de câmera pinhole)
  - Simulação realista de movimento de barbell com fadiga progressiva
  - Detecção automática de repetições via mudança de fase
  - Feedback visual: verde = OK, vermelho = queda de velocidade >10%
  - Estados de tracking: concêntrico, excêntrico, estacionário
- `vbt-camera.tsx` refatorado para usar o novo hook `useBarTracking`
- **TEST**: 100% taxa de sucesso - Backend (8/8) e Frontend verificados
- **NOTA**: Tracking usa simulação para desenvolvimento. Tracking real com MediaPipe requer build nativo

### 2026-02-13 - VBT via Camera (FASE 1)
- **NOVA FUNCIONALIDADE**: Sistema de rastreamento VBT via câmera
- Botão "VBT via Camera" na tela de Avaliação de Força (add-strength.tsx)
- Nova tela de configuração de câmera (vbt-camera.tsx)
- Inputs de configuração: altura da câmera, distância da barra, carga em kg
- Seleção de exercício (Back Squat, Deadlift, etc.)
- Feedback visual em tempo real (verde = OK, vermelho = queda >10%)
- Contador de repetições e display de velocidade instantânea
- Resumo da sessão com métricas (velocidade média, máxima, queda de velocidade)
- Integração com backend: novo provider 'camera' no enum VBTProvider
- API endpoint `/api/vbt/data` aceita dados com provider='camera'
- **NOTA**: Funcionalidade de câmera requer app nativo (iOS/Android)
- **TEST**: 100% taxa de sucesso backend (8/8) e frontend

### 2026-02-13 - Sistema de Token Wellness
- **NOVA FUNCIONALIDADE**: Sistema completo de tokens para wellness
- Tela de seleção de papel (Coach/Atleta) na abertura do app
- Geração de tokens com limite de usos e expiração
- Fluxo de atleta: inserir token → selecionar nome → responder → fim
- Controle de uso único por atleta por token
- 19 testes unitários passando
- Substituição completa do sistema de links por tokens internos
- **FIX**: Correção do erro "unmatched route" - rotas adicionadas ao _layout.tsx
- **FIX**: Botões "Voltar" implementados nas telas athlete-token.tsx e generate-wellness-token.tsx
- **TEST**: 95% taxa de sucesso no frontend (6/7 funcionalidades, 1 problema visual LOW priority)

