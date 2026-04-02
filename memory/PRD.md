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
**Solucao aplicada**: Removido extraPods, reescrito withDangerousMod com injecao direta
**Status**: FALHOU — erro de sintaxe Ruby no Podfile gerado

### Fix EAS Build Error v3 (2026-04-02)
**Problema**: Build EAS falhou com `Invalid Podfile: syntax error, unexpected '(', expecting 'end'`
**Causa raiz REAL**: O regex do plugin capturava apenas `config = use_native_modules!` mas o template real do Expo SDK 54 tem `config = use_native_modules!(config_command)`. O pod era injetado no meio da linha, deixando `(config_command)` solto, gerando syntax error. Alem disso, `use_frameworks!` era injetado fora do target pelo plugin, mas o template ja o aplica DENTRO do target via Podfile.properties.json — duplicacao desnecessaria.
**Solucao aplicada**:
1. Regex corrigido para capturar LINHA INTEIRA: `/(config\s*=\s*use_native_modules![^\n]*)/`
2. Removida injecao de `use_frameworks!` — delegado ao template Expo via `expo-build-properties` + `Podfile.properties.json`
3. Mantido: `source CDN` no topo, `pod 'MediaPipeTasksVision', '0.10.14'` dentro do target, `BUILD_LIBRARY_FOR_DISTRIBUTION` no post_install
4. Dump COMPLETO do Podfile nos logs do EAS para debug total
**Testes**: Simulado contra template REAL do Expo SDK 54 (extraido de node_modules/expo/template.tgz) — Podfile gerado sintaticamente correto, pod em linha limpa, idempotencia aprovada
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
