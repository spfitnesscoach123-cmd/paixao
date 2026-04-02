# Load Manager Pro — PRD

## Produto
App de gestao de carga e performance esportiva com VBT (Velocity Based Training) e deteccao de pose via camera.

## Stack
- **Frontend**: React Native (Expo SDK 54) com TypeScript
- **Backend**: FastAPI (Python) com MongoDB
- **Build**: EAS Build (Expo Application Services)

## Usuarios
- Treinadores (coaches) — gerenciam atletas, monitoram carga
- Atletas — registram treinos via VBT camera

## Funcionalidades Core
1. Dashboard de overview de atletas
2. Gestao de atletas (CRUD, perfis, historico)
3. VBT Camera (modo simulacao ativo — MediaPipe removido temporariamente)
4. Jump Camera (modo simulacao ativo — MediaPipe removido temporariamente)
5. Analise Cientifica (relatorios, PDF)
6. Autenticacao JWT
7. Pipeline de validacao progressiva (5 estagios)

## Credenciais
- Email: `contato@loadmanagerpro.com.br`
- Senha: `#UAE2026`

---

## Historico de Mudancas

### Reset Tecnico — Remocao do MediaPipe (2026-04-02)
**Objetivo**: Obter baseline build limpo no EAS antes de reintroduzir dependencias nativas.

**Causa raiz dos erros de build**:
- `expo-build-properties` com `useFrameworks: "static"` causava `ExpoModulesCore not found` e `React/CoreModulesPlugins.h file not found`
- Plugin customizado `withMediaPipePose.js` injetava pod e modificacoes no Podfile que geravam erros de sintaxe Ruby

**O que foi removido**:
1. `plugins/withMediaPipePose.js` — Config plugin do MediaPipe (DELETADO)
2. `plugins/ios/PoseDetectionPlugin.swift` — Codigo nativo Swift (DELETADO)
3. `scripts/download-pose-model.js` — Script de download do modelo (DELETADO)
4. `assets/models/pose_landmarker_full.task` — Modelo de 9.4MB (DELETADO)
5. `ios_backup_before_removal/` — Diretorio backup legado (DELETADO)
6. `expo-build-properties` plugin removido do `app.json` (useFrameworks: "static")
7. `withMediaPipePose` plugin removido do `app.json`

**O que foi preservado**:
- `react-native-vision-camera` — Plugin de camera padrao (nao e MediaPipe)
- `services/pose/MediaPipeCamera.tsx` — Substituido por STUB (MEDIAPIPE_AVAILABLE = false)
- Todos os componentes de camera (vbt-camera, jump-camera) — Entram no modo fallback/simulacao automaticamente

**Correcoes adicionais**:
- `eslint-config-expo` instalado (resolvia falha do `expo doctor`)
- `.gitignore` limpo (remocao de entradas corrompidas `-e` e regras `*.env`)
- URL hardcoded Railway removida de `login.tsx`

**Status**: PRONTO PARA DEPLOY — Health check PASS

---

## Backlog Priorizado

### P0 (Bloqueador)
- [x] Reset tecnico — baseline build limpo (CONCLUIDO)
- [x] Auditoria tecnica pos-limpeza (CONCLUIDO — zero blockers)
- [ ] Validar build EAS iOS (usuario precisa disparar deploy)

### P1 (Alta Prioridade)
- [ ] PDF Generation crash em "Analise Cientifica" (recorrente >3x)
- [ ] Reintegrar MediaPipe (apos baseline estavel) — usar abordagem de plugin corrigida

### P2 (Media Prioridade)
- [x] Instalar `eslint-config-expo` (CONCLUIDO)
- [ ] Internacionalizacao completa do ScientificAnalysisTab e pagina Avaliacoes
- [ ] Build UI para merge de perfis duplicados de atletas

### P3 (Baixa Prioridade)
- [x] Remover diretorio backup `frontend/ios_backup_before_removal/` (CONCLUIDO)

---

## Proximos passos
1. Save to Github
2. Deploy via Emergent
3. Verificar EAS build iOS (deve compilar limpo sem MediaPipe)
4. Apos baseline estavel, reintroduzir MediaPipe com abordagem corrigida
