/**
 * bodyMapping.test.ts — Testes unitarios do Body Mapping Engine
 *
 * Testa:
 * - validatePose (corpo visivel, distancia, centralizacao)
 * - averageLandmarks (media de frames)
 * - mapBody (proporcoes corporais)
 * - evaluateStability
 */

import {
  validatePose,
  averageLandmarks,
  mapBody,
  evaluateStability,
  type Landmark,
  type CapturedFrame,
} from '../../engine/body-composition/bodyMapping';

// Helper: cria 33 landmarks validos simulando pose frontal
function createValidLandmarks(overrides?: Partial<Record<number, Partial<Landmark>>>): Landmark[] {
  const base: Landmark[] = Array.from({ length: 33 }, (_, i) => ({
    x: 0.5,
    y: 0.3 + i * 0.02,
    z: 0,
    visibility: 0.9,
  }));

  // Posicoes realistas
  base[0] = { x: 0.5, y: 0.15, z: 0, visibility: 0.95 };  // nose
  base[11] = { x: 0.4, y: 0.30, z: 0, visibility: 0.92 };  // l_shoulder
  base[12] = { x: 0.6, y: 0.30, z: 0, visibility: 0.92 };  // r_shoulder
  base[13] = { x: 0.35, y: 0.42, z: 0, visibility: 0.88 };  // l_elbow
  base[14] = { x: 0.65, y: 0.42, z: 0, visibility: 0.88 };  // r_elbow
  base[15] = { x: 0.32, y: 0.52, z: 0, visibility: 0.85 };  // l_wrist
  base[16] = { x: 0.68, y: 0.52, z: 0, visibility: 0.85 };  // r_wrist
  base[23] = { x: 0.43, y: 0.55, z: 0, visibility: 0.90 };  // l_hip
  base[24] = { x: 0.57, y: 0.55, z: 0, visibility: 0.90 };  // r_hip
  base[25] = { x: 0.42, y: 0.70, z: 0, visibility: 0.88 };  // l_knee
  base[26] = { x: 0.58, y: 0.70, z: 0, visibility: 0.88 };  // r_knee
  base[27] = { x: 0.42, y: 0.85, z: 0, visibility: 0.85 };  // l_ankle
  base[28] = { x: 0.58, y: 0.85, z: 0, visibility: 0.85 };  // r_ankle

  if (overrides) {
    for (const [idx, override] of Object.entries(overrides)) {
      base[parseInt(idx)] = { ...base[parseInt(idx)], ...override };
    }
  }

  return base;
}

// ============================================================
// TESTES
// ============================================================

describe('validatePose', () => {
  test('retorna valido para pose completa centralizada', () => {
    const landmarks = createValidLandmarks();
    const result = validatePose(landmarks);

    expect(result.isFullBodyVisible).toBe(true);
    expect(result.isGoodDistance).toBe(true);
    expect(result.isCentered).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.message).toBeNull();
  });

  test('rejeita quando landmarks insuficientes', () => {
    const result = validatePose([]);
    expect(result.isFullBodyVisible).toBe(false);
    expect(result.confidence).toBe(0);
  });

  test('rejeita quando corpo nao esta visivel (visibility baixa)', () => {
    const landmarks = createValidLandmarks({
      27: { visibility: 0.1 },  // left ankle invisivel
      28: { visibility: 0.1 },  // right ankle invisivel
    });
    const result = validatePose(landmarks);
    expect(result.isFullBodyVisible).toBe(false);
    expect(result.message).toContain('visivel');
  });

  test('rejeita quando muito longe da camera', () => {
    const landmarks = createValidLandmarks({
      0: { y: 0.40 },   // nose perto do meio
      27: { y: 0.55 },  // ankles perto do meio
      28: { y: 0.55 },
    });
    const result = validatePose(landmarks);
    expect(result.isGoodDistance).toBe(false);
    expect(result.message).toContain('Aproxime');
  });

  test('rejeita quando descentrado', () => {
    const landmarks = createValidLandmarks({
      11: { x: 0.10 },  // tudo para a esquerda
      12: { x: 0.30 },
      23: { x: 0.13 },
      24: { x: 0.27 },
    });
    const result = validatePose(landmarks);
    expect(result.isCentered).toBe(false);
    expect(result.message).toContain('direita');
  });
});

describe('averageLandmarks', () => {
  test('calcula media de frames validos', () => {
    const frame1: CapturedFrame = {
      landmarks: createValidLandmarks({ 0: { x: 0.4, y: 0.1 } }),
      timestamp: 1000,
      confidence: 0.9,
    };
    const frame2: CapturedFrame = {
      landmarks: createValidLandmarks({ 0: { x: 0.6, y: 0.2 } }),
      timestamp: 1033,
      confidence: 0.9,
    };

    const avg = averageLandmarks([frame1, frame2]);
    expect(avg.length).toBe(33);
    expect(avg[0].x).toBeCloseTo(0.5, 1);
    expect(avg[0].y).toBeCloseTo(0.15, 1);
  });

  test('descarta frames com confianca baixa', () => {
    const goodFrame: CapturedFrame = {
      landmarks: createValidLandmarks({ 0: { x: 0.5, y: 0.15 } }),
      timestamp: 1000,
      confidence: 0.9,
    };
    const badFrame: CapturedFrame = {
      landmarks: createValidLandmarks({ 0: { x: 0.1, y: 0.9 } }),
      timestamp: 1033,
      confidence: 0.3, // abaixo do threshold
    };

    const avg = averageLandmarks([goodFrame, badFrame]);
    expect(avg[0].x).toBeCloseTo(0.5, 1); // apenas o frame bom
  });
});

describe('mapBody', () => {
  test('calcula proporcoes corporais em cm', () => {
    const landmarks = createValidLandmarks();
    const result = mapBody(landmarks, 175);

    expect(result).not.toBeNull();
    if (!result) return;

    // Proporcoes devem ser positivas
    expect(result.shoulderWidth).toBeGreaterThan(0);
    expect(result.hipWidth).toBeGreaterThan(0);
    expect(result.torsoLength).toBeGreaterThan(0);
    expect(result.leftArmLength).toBeGreaterThan(0);
    expect(result.rightArmLength).toBeGreaterThan(0);
    expect(result.leftLegLength).toBeGreaterThan(0);
    expect(result.rightLegLength).toBeGreaterThan(0);

    // Shoulder-to-hip ratio deve ser > 1 para pose padrao
    expect(result.shoulderToHipRatio).toBeGreaterThan(1);

    // Scale factor deve ser positivo
    expect(result.scaleFactor).toBeGreaterThan(0);

    // Preserva landmarks raw
    expect(result.rawLandmarks.length).toBe(33);
  });

  test('retorna null para landmarks insuficientes', () => {
    const result = mapBody([], 175);
    expect(result).toBeNull();
  });

  test('retorna null para bodyHeight muito pequena', () => {
    const landmarks = createValidLandmarks({
      0: { y: 0.5 },    // nose
      27: { y: 0.505 },  // ankles quase na mesma posicao
      28: { y: 0.505 },
    });
    const result = mapBody(landmarks, 175);
    expect(result).toBeNull();
  });

  test('bracos simetricos retornam comprimentos similares', () => {
    const landmarks = createValidLandmarks();
    const result = mapBody(landmarks, 175);
    expect(result).not.toBeNull();
    if (!result) return;

    const diff = Math.abs(result.leftArmLength - result.rightArmLength);
    expect(diff).toBeLessThan(5); // menos de 5cm de diferenca
  });
});

describe('evaluateStability', () => {
  test('frames estaveis retornam isStable true', () => {
    const frames: CapturedFrame[] = [];
    for (let i = 0; i < 20; i++) {
      frames.push({
        landmarks: createValidLandmarks({
          // Variacao minima
          11: { x: 0.4 + Math.random() * 0.005 },
          12: { x: 0.6 + Math.random() * 0.005 },
        }),
        timestamp: 1000 + i * 33,
        confidence: 0.9,
      });
    }

    const result = evaluateStability(frames);
    expect(result.isStable).toBe(true);
    expect(result.avgStdDev).toBeLessThan(0.02);
  });

  test('frames instaveis retornam isStable false', () => {
    const frames: CapturedFrame[] = [];
    for (let i = 0; i < 20; i++) {
      frames.push({
        landmarks: createValidLandmarks({
          // Grande variacao (simulando movimento)
          11: { x: 0.2 + Math.random() * 0.3 },
          12: { x: 0.4 + Math.random() * 0.3 },
          23: { x: 0.2 + Math.random() * 0.3 },
          24: { x: 0.4 + Math.random() * 0.3 },
        }),
        timestamp: 1000 + i * 33,
        confidence: 0.9,
      });
    }

    const result = evaluateStability(frames);
    expect(result.isStable).toBe(false);
  });

  test('frames insuficientes retorna instavel', () => {
    const result = evaluateStability([]);
    expect(result.isStable).toBe(false);
  });
});
