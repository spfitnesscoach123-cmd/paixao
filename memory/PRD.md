# Load Manager Pro - PRD

## Problema Original
Aplicacao full-stack React Native (Expo SDK 54) + FastAPI para monitoramento esportivo VBT (Velocity Based Training) e analise de saltos.

## Arquitetura
```
/app
├── backend/          -> FastAPI (Python)
│   └── server.py     
├── frontend/         -> React Native (Expo SDK 54, Hermes)
│   ├── app/          -> Telas (Expo Router)
│   ├── services/
│   │   ├── frameTime.ts        -> Timestamps monotonicos (performance.now)
│   │   ├── frameDrop.ts        -> Monitor de integridade de frames
│   │   ├── camera/             -> Managers do lifecycle da camera
│   │   ├── pose/               -> Interfaces e stubs do MediaPipe
│   │   ├── jump/               -> Deteccao de eventos do Jump
│   │   └── vbt/                -> TrackingSystem, VelocityCalculator, RepDetector
│   └── docs/
```

## Implementado - Sessao atual (02/Abril/2026)
- Precisao Temporal: Date.now() substituido por performance.now() monotonico no pipeline de metricas
- Frame Drop Detection: FrameIntegrityMonitor detecta e protege contra frames perdidos
- Unificacao RSI -> RSImod: Formula unica jumpHeight(m)/time_to_takeoff(s) em CMJ+DJ+SL-CMJ, frontend+backend
- Testes: 48 unit tests + 3 validacoes API (CMJ/DJ/SL-CMJ) confirmadas via curl

## Estado Atual
- Build: Web export 100% funcional, EAS baseline estavel
- Mocked: Motor de pose (MediaPipe) mockado (MEDIAPIPE_AVAILABLE = false)
- RSI: Formula unificada RSImod validada com diferenca 0% frontend/backend

## Backlog
### P0
- [ ] Reintegracao segura da visao computacional (MediaPipe ou alternativa)

### P2
- [ ] UI merge de perfis duplicados de atletas
- [ ] i18n de ScientificAnalysisTab e Avaliacoes
- [ ] Refatoracao trackingProtection.ts (1460 linhas)
- [ ] Remocao de codigo legacy (~600 linhas mortas)
- [ ] Gate de logs com __DEV__
