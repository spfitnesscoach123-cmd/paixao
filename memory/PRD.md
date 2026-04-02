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

#### Contrato de Saida
33 landmarks `[{x, y, z, visibility}]` normalizados 0-1, ordem BlazePose. Zero processamento.

### Fix EAS Build Error v1 (2026-04-01)
**Problema**: Build EAS falhava com `no such module 'MediaPipeTasksVision'`
**Solucao aplicada**: `expo-build-properties` com `extraPods` + `withDangerousMod` fallback
**Status**: FALHOU no EAS (>3 tentativas)

### Fix EAS Build Error v2 (2026-04-02)
**Problema**: Mesma falha `no such module 'MediaPipeTasksVision'` persistiu apos fix v1
**Causa raiz**: `extraPods` do `expo-build-properties` nao e confiavel no EAS SDK 54; injecao anterior via `withDangerousMod` carecia de `source CDN`, versionamento fixo, e `use_frameworks!` explicito no Podfile
**Solucao aplicada**:
1. Removido `extraPods` do `expo-build-properties` (mantido apenas `useFrameworks: "static"`)
2. Reescrito `withMediaPipePose.js` com injecao direta e agressiva:
   - `source 'https://cdn.cocoapods.org/'` no topo do Podfile
   - `use_frameworks! :linkage => :static` antes do target
   - `pod 'MediaPipeTasksVision', '0.10.14'` dentro do target (versao pinada)
   - `BUILD_LIBRARY_FOR_DISTRIBUTION = 'YES'` no post_install
3. Logging extensivo para debug completo nos logs do EAS
4. Todas as operacoes idempotentes (seguras para multiplas execucoes)
5. Fallback documentado para `:dynamic` se `:static` persistir falhando
**Testes**: Plugin carrega sem erros, simulacao contra Podfile SDK 54 passa 6/6 verificacoes, idempotencia aprovada
**Status**: AGUARDANDO VALIDACAO DO USUARIO via novo deploy EAS

---

## Backlog Priorizado

### P0 (Bloqueador)
- [ ] Validar build EAS apos fix v2 do `no such module` (usuario precisa disparar novo deploy com `--clear-cache`)

### P1 (Alta Prioridade)
- [ ] PDF Generation crash em "Analise Cientifica" (recorrente >3x)

### P2 (Media Prioridade)
- [ ] Instalar `eslint-config-expo` para resolver warnings CI
- [ ] Internacionalizacao completa do ScientificAnalysisTab e pagina Avaliacoes
- [ ] Build UI para merge de perfis duplicados de atletas

### P3 (Baixa Prioridade)
- [ ] Remover diretorio backup `frontend/ios_backup_before_removal/`

---

## Proximos passos para producao
1. `node scripts/download-pose-model.js`
2. `npx expo prebuild --platform ios --clean`
3. `eas build --platform ios --clear-cache`
4. Verificar nos logs do EAS se todos os checks `[withMediaPipePose]` mostram `SIM`
5. Se falhar com `:static`, trocar para `:dynamic` no `withMediaPipePose.js` (ver FALLBACK)
