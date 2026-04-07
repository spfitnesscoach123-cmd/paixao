/**
 * frameTime.ts — Provedor central de timestamps monotônicos para o pipeline de frames.
 *
 * Substitui Date.now() em todo o pipeline de métricas, garantindo:
 * - Timestamps monotônicos crescentes
 * - Sem jitter do event loop JS (performance.now() é monotônico)
 * - Base temporal consistente em todo o pipeline
 *
 * Prioridade de fonte:
 * 1. Timestamp nativo do frame (quando disponível via MediaPipe/câmera nativa)
 * 2. performance.now() — fallback monotônico, precisão sub-ms
 * 3. NUNCA Date.now() para cálculos de métricas
 *
 * NOTA: performance.now() retorna ms desde o início da app (não epoch Unix).
 * Todos os cálculos de deltaTime funcionam corretamente pois usam a mesma base.
 */

let lastTimestamp = 0;
let frameIdCounter = 0;

/**
 * Retorna timestamp monotônico em milissegundos.
 * Usa performance.now() como base, com garantia de monotonicidade estrita.
 *
 * @param nativeTimestamp - Timestamp nativo do frame da câmera (opcional, prioridade máxima)
 * @returns Timestamp monotônico crescente em ms (base: performance.now)
 */
export function getFrameTimestamp(nativeTimestamp?: number): number {
  let ts: number;

  if (nativeTimestamp != null && nativeTimestamp > 0) {
    // Prioridade 1: Timestamp nativo do frame da câmera
    // Normaliza para ms (alguns provedores retornam em segundos)
    ts = normalizeTimestamp(nativeTimestamp);
  } else {
    // Prioridade 2: performance.now() — monotônico, sub-ms de precisão
    ts = performance.now();
  }

  // Garantia de monotonicidade estrita: nunca retorna timestamp <= ao anterior
  if (ts <= lastTimestamp) {
    ts = lastTimestamp + 0.001; // Incremento mínimo (~1 microsegundo)
  }

  lastTimestamp = ts;
  return ts;
}

/**
 * Gera ID sequencial único para cada frame processado.
 * Incrementa a cada chamada — nunca repete.
 */
export function getNextFrameId(): number {
  return ++frameIdCounter;
}

/**
 * Reseta o gerador de frame IDs.
 * Chamar ao iniciar nova sessão de captura (novo set VBT ou novo salto).
 */
export function resetFrameId(): void {
  frameIdCounter = 0;
}

/**
 * Normaliza timestamp para milissegundos.
 * Alguns provedores (MediaPipe nativo) podem retornar em segundos ou microsegundos.
 * Esta função garante consistência em ms.
 */
export function normalizeTimestamp(ts: number): number {
  if (ts < 100000) return ts * 1000; // Provavelmente em segundos → converter para ms
  return ts;
}

/**
 * Reseta o tracking de último timestamp.
 * Chamar ao iniciar nova sessão de captura.
 */
export function resetFrameTimestamp(): void {
  lastTimestamp = 0;
}

/**
 * Reseta ambos: frame ID e timestamp.
 * Conveniência para início de nova sessão completa.
 */
export function resetFrameTime(): void {
  resetFrameId();
  resetFrameTimestamp();
}
