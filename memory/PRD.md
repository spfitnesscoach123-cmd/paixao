# Load Manager Pro - PRD

## Problema Original
Aplicação full-stack React Native (Expo SDK 54) + FastAPI para monitoramento esportivo VBT (Velocity Based Training) e análise de saltos. O pipeline de captura de pose utiliza câmera do dispositivo para rastrear barras e articulações em tempo real.

## Arquitetura
```
/app
├── backend/          → FastAPI (Python)
│   └── server.py     
├── frontend/         → React Native (Expo SDK 54, Hermes)
│   ├── app/          → Telas (Expo Router)
│   ├── services/
│   │   ├── frameTime.ts        → [NOVO] Timestamps monotônicos (performance.now)
│   │   ├── frameDrop.ts        → [NOVO] Monitor de integridade de frames
│   │   ├── camera/             → Managers do lifecycle da câmera
│   │   ├── pose/               → Interfaces e stubs do MediaPipe
│   │   ├── jump/               → Detecção de eventos do Jump
│   │   └── vbt/                → TrackingSystem, VelocityCalculator, RepDetector
│   └── docs/
```

## O que foi implementado

### Sessão anterior (Abril 2026)
- Reset técnico completo: remoção de MediaPipe, VisionCamera, plugins nativos
- Baseline EAS build limpo e estável
- Correção do crash PDF em Análise Científica
- Auditoria técnica completa do pipeline VBT/Jump

### Sessão atual (02/Abril/2026)
- **Precisão Temporal**: Substituição de `Date.now()` por `performance.now()` monotônico em todo o pipeline de métricas
- **Frame Drop Detection**: Monitor de integridade detecta e protege contra frames perdidos
- Testes unitários: 14 testes (frameTime + frameDrop) + 34 testes existentes VBT = 48 passing

## Estado Atual
- **Build**: Web export 100% funcional, EAS baseline estável
- **Mocked**: Motor de pose (MediaPipe) segue mockado (`MEDIAPIPE_AVAILABLE = false`)
- **Pipeline**: Timestamps monotônicos + frame drop detection ativos no VBT e Jump

## Backlog Priorizado

### P0 — Crítico
- [ ] Reintegração segura da visão computacional (MediaPipe ou alternativa)

### P2 — Futuro
- [ ] UI para merge de perfis duplicados de atletas
- [ ] Internacionalização (i18n) de ScientificAnalysisTab e Avaliações
- [ ] Refatoração: trackingProtection.ts (1460 linhas → 8 módulos)
- [ ] Remoção de código legacy (~600 linhas mortas em barTracker.ts + useBarTracking.ts)
- [ ] Unificação da fórmula RSI entre frontend e backend
- [ ] Gate de logs com __DEV__
