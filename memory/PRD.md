# Load Manager Pro - PRD

## Problema Original
Aplicacao full-stack React Native (Expo SDK 54) + FastAPI para monitoramento esportivo VBT e analise de saltos.

## Protocolos Ativos
- CMJ (Counter Movement Jump)
- SL-CMJ Right / Left (Single Leg CMJ)

## Formula Padrao Unica
RSImod = jumpHeight(m) / time_to_takeoff(s)
- jumpHeight = (g * flight_time^2) / 8
- time_to_takeoff = t_takeoff - t_movement_start

## Implementado

### Sessao 02/Abril/2026
1. Precisao Temporal: Date.now() -> performance.now() monotonico no pipeline
2. Frame Drop Detection: FrameIntegrityMonitor com protecao no VBT e Jump
3. Unificacao RSI -> RSImod (formula unica em todo o sistema)
4. Remocao completa de Drop Jump (DJ): enum, funcoes, UI, endpoints, analises

## Estado Atual
- Build: Web export 100% funcional
- Mocked: Motor de pose (MediaPipe) mockado
- Protocolos: CMJ + SL-CMJ apenas (DJ removido)
- RSImod: Formula unica validada, diferenca 0% frontend/backend

## Backlog
### P0
- [ ] Reintegracao segura da visao computacional (MediaPipe)

### P2
- [ ] UI merge de perfis duplicados de atletas
- [ ] i18n de ScientificAnalysisTab e Avaliacoes
- [ ] Refatoracao trackingProtection.ts
- [ ] Remocao de codigo legacy VBT
- [ ] Gate de logs com __DEV__
