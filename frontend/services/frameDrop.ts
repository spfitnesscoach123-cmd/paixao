/**
 * frameDrop.ts — Monitor de integridade de frames.
 *
 * Detecta perda de frames por:
 * 1. Gap no ID sequencial (frameId não consecutivo)
 * 2. Gap temporal (deltaTime > 1.5x o intervalo esperado para o FPS alvo)
 *
 * Quando um frame drop é detectado:
 * - O frame é marcado como inválido/degradado
 * - Cálculos de métricas críticas (velocidade, tempo de voo) devem ignorar esse frame
 * - Log de warning emitido apenas em __DEV__
 */

export interface FrameDropResult {
  /** Houve perda de frame(s) antes deste */
  dropped: boolean;
  /** Quantidade estimada de frames perdidos */
  droppedCount: number;
  /** Delta de tempo em ms desde o último frame */
  deltaTimeMs: number;
  /** Frame é válido para cálculos de métricas? (false = degradado por drop) */
  isValid: boolean;
}

export interface FrameIntegrityConfig {
  /** FPS alvo da captura (padrão: 30) */
  targetFps: number;
  /** Multiplicador do intervalo esperado para considerar drop (padrão: 1.5) */
  dropThresholdMultiplier: number;
}

const DEFAULT_CONFIG: FrameIntegrityConfig = {
  targetFps: 30,
  dropThresholdMultiplier: 1.5,
};

/**
 * Monitor de integridade de frames.
 * Rastreia sequência e timing para detectar frames perdidos.
 */
export class FrameIntegrityMonitor {
  private config: FrameIntegrityConfig;
  private lastFrameId: number = -1;
  private lastTimestamp: number = 0;
  private hasReference: boolean = false;
  private totalDropped: number = 0;
  private totalFrames: number = 0;
  private expectedIntervalMs: number;

  constructor(config: Partial<FrameIntegrityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.expectedIntervalMs = 1000 / this.config.targetFps;
  }

  /**
   * Avalia integridade de um frame recebido.
   *
   * @param frameId - ID sequencial do frame
   * @param timestamp - Timestamp monotônico do frame (via getFrameTimestamp)
   * @returns Resultado com status de drop e validade
   */
  checkFrame(frameId: number, timestamp: number): FrameDropResult {
    this.totalFrames++;

    // Primeiro frame — sem referência anterior, sempre válido
    if (!this.hasReference) {
      this.lastFrameId = frameId;
      this.lastTimestamp = timestamp;
      this.hasReference = true;
      return { dropped: false, droppedCount: 0, deltaTimeMs: 0, isValid: true };
    }

    const deltaTimeMs = timestamp - this.lastTimestamp;
    let droppedCount = 0;
    let dropped = false;

    // Critério 1: ID não sequencial (gap no counter)
    if (frameId > this.lastFrameId + 1) {
      droppedCount = Math.max(droppedCount, frameId - this.lastFrameId - 1);
      dropped = true;
    }

    // Critério 2: Gap temporal > threshold (ex: > 50ms para 30fps)
    const threshold = this.expectedIntervalMs * this.config.dropThresholdMultiplier;
    if (deltaTimeMs > threshold) {
      const estimatedDrops = Math.max(0, Math.round(deltaTimeMs / this.expectedIntervalMs) - 1);
      droppedCount = Math.max(droppedCount, estimatedDrops);
      dropped = true;
    }

    if (dropped) {
      this.totalDropped += droppedCount;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(
          `[FrameDrop] ${droppedCount} frame(s) perdido(s) | ` +
          `deltaTime=${deltaTimeMs.toFixed(1)}ms | ` +
          `esperado=${this.expectedIntervalMs.toFixed(1)}ms`
        );
      }
    }

    this.lastFrameId = frameId;
    this.lastTimestamp = timestamp;

    return { dropped, droppedCount, deltaTimeMs, isValid: !dropped };
  }

  /**
   * Retorna taxa de perda de frames (0-1).
   * Ex: 0.05 = 5% dos frames foram perdidos.
   */
  getDropRate(): number {
    if (this.totalFrames === 0) return 0;
    return this.totalDropped / (this.totalFrames + this.totalDropped);
  }

  /** Total acumulado de frames perdidos */
  getTotalDropped(): number {
    return this.totalDropped;
  }

  /** Total de frames processados */
  getTotalFrames(): number {
    return this.totalFrames;
  }

  /**
   * Verifica se a qualidade de captura está degradada (>10% de perda).
   */
  isQualityDegraded(): boolean {
    return this.getDropRate() > 0.1;
  }

  /**
   * Reseta o monitor para nova sessão de captura.
   */
  reset(): void {
    this.lastFrameId = -1;
    this.lastTimestamp = 0;
    this.hasReference = false;
    this.totalDropped = 0;
    this.totalFrames = 0;
  }
}
