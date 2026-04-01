# Load Manager Pro — PRD

## Produto
App de gestao de carga e performance esportiva com VBT (Velocity Based Training) e deteccao de pose via camera.

## Stack
- **Frontend**: React Native (Expo SDK 54) com TypeScript
- **Backend**: FastAPI (Python) com MongoDB
- **Pose Detection**: Vision Camera v4.7.3 + MediaPipe Tasks Vision (nativo iOS)
- **Build**: EAS Build (Expo Application Services)

## Usuarios
- Treinadores (coaches) — gerenciam atletas, monitoram carga
- Atletas — registram treinos via VBT camera

## Funcionalidades Core
1. Dashboard de overview de atletas
2. Gestao de atletas (CRUD, perfis, historico)
3. VBT Camera (deteccao de pose em tempo real)
4. Jump Camera (analise de salto)
5. Analise Cientifica (relatorios, PDF)
6. Autenticacao JWT
7. Pipeline de validacao progressiva (5 estagios)

## Credenciais
- Email: `contato@loadmanagerpro.com.br`
- Senha: `#UAE2026`

---

## Historico de Mudancas

### Migracao MediaPipe iOS (2026-04-01)
**Concluido**: Remocao total de `@thinksys/react-native-mediapipe` e implementacao direta via Vision Camera + MediaPipe Tasks Vision.

#### Arquitetura Nova
```
Vision Camera (v4.7.3) -> Frame Processor (JSI/worklets-core v1.6.3) -> detectPose plugin (Swift) -> MediaPipe Tasks Vision -> 33 landmarks -> Pipeline VBT/Jump (INTOCAVEL)
```

#### Arquivos Criados
- `plugins/ios/PoseDetectionPlugin.swift` — Plugin nativo Swift
- `plugins/withMediaPipePose.js` — Expo config plugin
- `services/pose/MediaPipeCamera.tsx` — Componente drop-in replacement
- `scripts/download-pose-model.js` — Download do modelo
- `MEDIAPIPE_SETUP.md` — Guia de setup completo

#### Arquivos Modificados
- `vbt-camera.tsx`, `jump-camera.tsx`, `PoseCamera.tsx`, `CameraView.tsx` — RNMediapipe -> MediaPipeCamera
- `app.json` — plugins: expo-build-properties + withMediaPipePose
- `package.json` — @thinksys removido, worklets-core + expo-build-properties adicionados

#### Contrato de Saida
33 landmarks `[{x, y, z, visibility}]` normalizados 0-1, ordem BlazePose. Zero processamento.

### Fix EAS Build Error (2026-04-01)
**Problema**: Build EAS falhava com `no such module 'MediaPipeTasksVision'` (XCODE_BUILD_ERROR)
**Causa**: Injecao do pod via `withPodfile` nao era confiavel no EAS — o mod nao persistia no Podfile final.
**Solucao aplicada**:
1. Instalado `expo-build-properties` com `ios.useFrameworks: "static"` e `extraPods: [{name: "MediaPipeTasksVision"}]`
2. Reescrito `withMediaPipePose.js`: Pod injection via `withDangerousMod` (escrita direta no Podfile) em vez de `withPodfile` (mod em memoria)
3. Dupla cobertura: `extraPods` via `use_expo_modules!` + linha explicita no Podfile
4. Removido `package-lock.json` (conflito com yarn.lock)
**Status**: Aguardando validacao do usuario via novo deploy EAS

---

## Backlog Priorizado

### P0 (Bloqueador)
- [ ] Validar build EAS apos fix do `no such module` (usuario precisa disparar novo deploy)

### P1 (Alta Prioridade)
- [ ] PDF Generation crash em "Analise Cientifica" (recorrente >3x)

### P2 (Media Prioridade)
- [ ] Layout responsivo (sidebar em telas grandes)
- [ ] Internacionalizacao completa do ScientificAnalysisTab e pagina Avaliacoes
- [ ] Build UI para merge de perfis duplicados de atletas

### P3 (Baixa Prioridade)
- [ ] Corrigir configuracao ESLint para TypeScript
- [ ] Remover diretorio backup `frontend/ios_backup_before_removal/`

---

## Proximos passos para producao
1. `node scripts/download-pose-model.js`
2. `npx expo prebuild --platform ios --clean`
3. `eas build --platform ios --clear-cache`
