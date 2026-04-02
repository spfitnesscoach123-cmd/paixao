/**
 * Testes unitários para frameTime.ts e frameDrop.ts
 *
 * Validam:
 * 1. Timestamps monotônicos via getFrameTimestamp()
 * 2. Detecção de frame drop via FrameIntegrityMonitor
 */
import { getFrameTimestamp, getNextFrameId, resetFrameTime, resetFrameTimestamp } from '../frameTime';
import { FrameIntegrityMonitor } from '../frameDrop';

describe('frameTime — Precisão Temporal', () => {
  beforeEach(() => {
    resetFrameTime();
  });

  test('getFrameTimestamp() retorna valor monotônico crescente', () => {
    const timestamps: number[] = [];
    for (let i = 0; i < 100; i++) {
      timestamps.push(getFrameTimestamp());
    }
    
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });

  test('getFrameTimestamp() usa performance.now() como base (não epoch)', () => {
    const ts = getFrameTimestamp();
    // performance.now() retorna ms desde início da app, tipicamente < 1_000_000_000
    // Date.now() retorna ms epoch, tipicamente > 1_700_000_000_000
    expect(ts).toBeLessThan(1_000_000_000_000);
  });

  test('getFrameTimestamp() prioriza timestamp nativo quando fornecido', () => {
    const nativeTs = 12345.678;
    const result = getFrameTimestamp(nativeTs);
    expect(result).toBe(nativeTs);
  });

  test('getFrameTimestamp() garante monotonicidade mesmo com native timestamp retroativo', () => {
    const ts1 = getFrameTimestamp(1000);
    const ts2 = getFrameTimestamp(500); // Valor menor que o anterior
    expect(ts2).toBeGreaterThan(ts1); // Deve ser > 1000 mesmo com input 500
  });

  test('getNextFrameId() retorna IDs sequenciais crescentes', () => {
    resetFrameTime();
    const ids = [];
    for (let i = 0; i < 10; i++) {
      ids.push(getNextFrameId());
    }
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('resetFrameTime() reseta ambos contadores', () => {
    getNextFrameId();
    getNextFrameId();
    getFrameTimestamp();
    
    resetFrameTime();
    
    expect(getNextFrameId()).toBe(1);
  });
});

describe('frameDrop — Integridade de Frames', () => {
  let monitor: FrameIntegrityMonitor;
  
  beforeEach(() => {
    monitor = new FrameIntegrityMonitor({ targetFps: 30 });
  });

  test('primeiro frame é sempre válido', () => {
    const result = monitor.checkFrame(1, 0);
    expect(result.isValid).toBe(true);
    expect(result.dropped).toBe(false);
    expect(result.droppedCount).toBe(0);
  });

  test('frames sequenciais com timing normal são válidos', () => {
    monitor.checkFrame(1, 0);
    const result = monitor.checkFrame(2, 33.3); // ~30fps
    expect(result.isValid).toBe(true);
    expect(result.dropped).toBe(false);
  });

  test('detecta frame drop por gap no ID', () => {
    monitor.checkFrame(1, 0);
    // Frame 2 e 3 perdidos, recebe frame 4
    const result = monitor.checkFrame(4, 99.9);
    expect(result.dropped).toBe(true);
    expect(result.droppedCount).toBeGreaterThanOrEqual(2);
    expect(result.isValid).toBe(false);
  });

  test('detecta frame drop por gap temporal', () => {
    monitor.checkFrame(1, 0);
    // Gap de 100ms para 30fps (esperado ~33ms, threshold 50ms)
    const result = monitor.checkFrame(2, 100);
    expect(result.dropped).toBe(true);
    expect(result.droppedCount).toBeGreaterThanOrEqual(1);
    expect(result.isValid).toBe(false);
  });

  test('getDropRate() calcula taxa de perda corretamente', () => {
    monitor.checkFrame(1, 0);
    monitor.checkFrame(2, 33);
    monitor.checkFrame(3, 66);
    // 3 frames processados, 0 drops
    expect(monitor.getDropRate()).toBe(0);
    
    // Frame 4 e 5 perdidos
    monitor.checkFrame(6, 200);
    expect(monitor.getTotalDropped()).toBeGreaterThan(0);
    expect(monitor.getDropRate()).toBeGreaterThan(0);
  });

  test('isQualityDegraded() retorna true com alta taxa de perda', () => {
    monitor.checkFrame(1, 0);
    // Simular muitos drops
    monitor.checkFrame(20, 1000); // 18 frames perdidos de 2 processados
    expect(monitor.isQualityDegraded()).toBe(true);
  });

  test('reset() limpa todos os contadores', () => {
    monitor.checkFrame(1, 0);
    monitor.checkFrame(10, 500);
    
    monitor.reset();
    
    expect(monitor.getTotalDropped()).toBe(0);
    expect(monitor.getTotalFrames()).toBe(0);
    expect(monitor.getDropRate()).toBe(0);
    
    // Novo frame após reset é válido
    const result = monitor.checkFrame(1, 0);
    expect(result.isValid).toBe(true);
  });

  test('threshold configurável respeita FPS alvo', () => {
    // Monitor para 60fps (intervalo esperado ~16.6ms, threshold ~25ms)
    const monitor60fps = new FrameIntegrityMonitor({ targetFps: 60 });
    monitor60fps.checkFrame(1, 0);
    
    // Gap de 50ms seria drop para 60fps
    const result = monitor60fps.checkFrame(2, 50);
    expect(result.dropped).toBe(true);
    
    // Mas seria OK para 30fps
    const monitor30fps = new FrameIntegrityMonitor({ targetFps: 30 });
    monitor30fps.checkFrame(1, 0);
    const result30 = monitor30fps.checkFrame(2, 40);
    expect(result30.dropped).toBe(false);
  });
});
