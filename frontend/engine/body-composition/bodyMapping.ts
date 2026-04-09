/**
 * bodyMapping.ts — Body Mapping Engine
 *
 * Converte landmarks MediaPipe em proporcoes corporais normalizadas.
 * Pura logica, sem dependencia de React.
 *
 * Pipeline: RawLandmark[] (media de N frames) -> BodyParams
 */

// ============================================================
// TYPES
// ============================================================

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface BodyParams {
  shoulderWidth: number;     // cm
  hipWidth: number;          // cm
  torsoLength: number;       // cm
  leftArmLength: number;     // cm
  rightArmLength: number;    // cm
  leftLegLength: number;     // cm
  rightLegLength: number;    // cm
  shoulderToHipRatio: number;
  bodyHeight: number;        // altura estimada em coordenadas normalizadas
  scaleFactor: number;       // athleteHeight / bodyHeight (pixels->cm)
  rawLandmarks: Landmark[];  // preserva para debug
}

export interface CapturedFrame {
  landmarks: Landmark[];
  timestamp: number;
  confidence: number;
}

export interface PoseValidation {
  isFullBodyVisible: boolean;
  isGoodDistance: boolean;
  isCentered: boolean;
  isStable: boolean;
  confidence: number;
  message: string | null;
}

// ============================================================
// LANDMARK INDICES (MediaPipe Pose, 33 pontos)
// ============================================================

const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

// ============================================================
// CONSTANTES
// ============================================================

const MIN_VISIBILITY = 0.5;
const STABILITY_THRESHOLD = 0.02;  // stdDev max por landmark para considerar estavel
const MIN_BODY_HEIGHT = 0.3;       // corpo deve ocupar pelo menos 30% do frame
const MAX_BODY_HEIGHT = 0.95;      // corpo nao deve ocupar mais que 95%
const CENTER_TOLERANCE = 0.15;     // tolerancia de centralizacao (15% de cada lado)

// ============================================================
// UTILIDADES GEOMETRICAS
// ============================================================

function dist2D(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ============================================================
// VALIDACAO DE POSE
// ============================================================

/**
 * Valida se a pose atual e adequada para captura.
 * Checa: corpo inteiro visivel, distancia, centralizacao.
 */
export function validatePose(landmarks: Landmark[]): PoseValidation {
  if (!landmarks || landmarks.length < 33) {
    return {
      isFullBodyVisible: false,
      isGoodDistance: false,
      isCentered: false,
      isStable: true,
      confidence: 0,
      message: 'Pose nao detectada',
    };
  }

  const criticalIndices = [
    LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ];

  // Corpo inteiro visivel?
  const allVisible = criticalIndices.every(
    (i) => landmarks[i] && landmarks[i].visibility >= MIN_VISIBILITY
  );

  // Confianca media
  const visibilities = criticalIndices
    .map((i) => landmarks[i]?.visibility ?? 0);
  const avgConfidence = visibilities.reduce((s, v) => s + v, 0) / visibilities.length;

  // Distancia: corpo deve ocupar entre 30-95% do frame
  const nose = landmarks[LM.NOSE];
  const leftAnkle = landmarks[LM.LEFT_ANKLE];
  const rightAnkle = landmarks[LM.RIGHT_ANKLE];
  const ankleY = Math.max(leftAnkle?.y ?? 0, rightAnkle?.y ?? 0);
  const bodyHeightNorm = ankleY - (nose?.y ?? 0);
  const isGoodDistance = bodyHeightNorm >= MIN_BODY_HEIGHT && bodyHeightNorm <= MAX_BODY_HEIGHT;

  // Centralizacao: centro do corpo proximo ao centro do frame
  const shoulderCenter = midpoint(
    landmarks[LM.LEFT_SHOULDER] || { x: 0.5, y: 0.5, z: 0, visibility: 0 },
    landmarks[LM.RIGHT_SHOULDER] || { x: 0.5, y: 0.5, z: 0, visibility: 0 }
  );
  const hipCenter = midpoint(
    landmarks[LM.LEFT_HIP] || { x: 0.5, y: 0.5, z: 0, visibility: 0 },
    landmarks[LM.RIGHT_HIP] || { x: 0.5, y: 0.5, z: 0, visibility: 0 }
  );
  const bodyCenter = midpoint(shoulderCenter, hipCenter);
  const isCentered = Math.abs(bodyCenter.x - 0.5) <= CENTER_TOLERANCE;

  // Mensagem
  let message: string | null = null;
  if (!allVisible) {
    message = 'Corpo inteiro deve estar visivel';
  } else if (!isGoodDistance) {
    message = bodyHeightNorm < MIN_BODY_HEIGHT
      ? 'Aproxime-se da camera'
      : 'Afaste-se da camera';
  } else if (!isCentered) {
    message = bodyCenter.x < 0.5
      ? 'Mova-se para a direita'
      : 'Mova-se para a esquerda';
  }

  return {
    isFullBodyVisible: allVisible,
    isGoodDistance,
    isCentered,
    isStable: true, // estabilidade e calculada em batch
    confidence: avgConfidence,
    message,
  };
}

// ============================================================
// ESTABILIDADE DO BUFFER
// ============================================================

/**
 * Avalia estabilidade de um buffer de frames.
 * Calcula stdDev de cada landmark critico nos frames capturados.
 */
export function evaluateStability(frames: CapturedFrame[]): {
  isStable: boolean;
  avgStdDev: number;
} {
  if (frames.length < 10) {
    return { isStable: false, avgStdDev: 1 };
  }

  const criticalIndices = [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ];

  const stdDevs: number[] = [];
  for (const idx of criticalIndices) {
    const xs = frames.map((f) => f.landmarks[idx]?.x ?? 0);
    const ys = frames.map((f) => f.landmarks[idx]?.y ?? 0);
    stdDevs.push(stdDev(xs), stdDev(ys));
  }

  const avgStdDev = stdDevs.reduce((s, v) => s + v, 0) / stdDevs.length;
  return {
    isStable: avgStdDev < STABILITY_THRESHOLD,
    avgStdDev,
  };
}

// ============================================================
// MEDIA DE LANDMARKS
// ============================================================

/**
 * Calcula a media dos landmarks de um buffer de frames.
 * Descarta frames com confianca baixa.
 */
export function averageLandmarks(frames: CapturedFrame[]): Landmark[] {
  const minConfidence = 0.5;
  const validFrames = frames.filter((f) => f.confidence >= minConfidence);

  if (validFrames.length === 0) return [];

  const numLandmarks = validFrames[0].landmarks.length;
  const result: Landmark[] = [];

  for (let i = 0; i < numLandmarks; i++) {
    let sumX = 0, sumY = 0, sumZ = 0, sumVis = 0;
    let count = 0;

    for (const frame of validFrames) {
      const lm = frame.landmarks[i];
      if (lm && lm.visibility >= minConfidence) {
        sumX += lm.x;
        sumY += lm.y;
        sumZ += lm.z;
        sumVis += lm.visibility;
        count++;
      }
    }

    if (count > 0) {
      result.push({
        x: sumX / count,
        y: sumY / count,
        z: sumZ / count,
        visibility: sumVis / count,
      });
    } else {
      result.push({ x: 0, y: 0, z: 0, visibility: 0 });
    }
  }

  return result;
}

// ============================================================
// BODY MAPPING: LANDMARKS -> BODY PARAMS
// ============================================================

/**
 * Transforma landmarks medios em proporcoes corporais.
 *
 * @param landmarks — Media de ~60 frames, 33 pontos MediaPipe
 * @param athleteHeightCm — Altura real do atleta em cm
 */
export function mapBody(landmarks: Landmark[], athleteHeightCm: number): BodyParams | null {
  if (!landmarks || landmarks.length < 33) return null;

  const nose = landmarks[LM.NOSE];
  const lShoulder = landmarks[LM.LEFT_SHOULDER];
  const rShoulder = landmarks[LM.RIGHT_SHOULDER];
  const lElbow = landmarks[LM.LEFT_ELBOW];
  const rElbow = landmarks[LM.RIGHT_ELBOW];
  const lWrist = landmarks[LM.LEFT_WRIST];
  const rWrist = landmarks[LM.RIGHT_WRIST];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];
  const lKnee = landmarks[LM.LEFT_KNEE];
  const rKnee = landmarks[LM.RIGHT_KNEE];
  const lAnkle = landmarks[LM.LEFT_ANKLE];
  const rAnkle = landmarks[LM.RIGHT_ANKLE];

  // Distancias normalizadas (0-1)
  const shoulderWidth = dist2D(lShoulder, rShoulder);
  const hipWidth = dist2D(lHip, rHip);

  const leftArmLength = dist2D(lShoulder, lElbow) + dist2D(lElbow, lWrist);
  const rightArmLength = dist2D(rShoulder, rElbow) + dist2D(rElbow, rWrist);

  const leftLegLength = dist2D(lHip, lKnee) + dist2D(lKnee, lAnkle);
  const rightLegLength = dist2D(rHip, rKnee) + dist2D(rKnee, rAnkle);

  const shoulderMid = midpoint(lShoulder, rShoulder);
  const hipMid = midpoint(lHip, rHip);
  const torsoLength = dist2D(shoulderMid, hipMid);

  // Altura do corpo em coordenadas normalizadas (nariz -> meio dos tornozelos)
  const ankleMid = midpoint(lAnkle, rAnkle);
  const bodyHeight = dist2D(nose, ankleMid);

  if (bodyHeight < 0.1) return null; // pose invalida

  // Fator de escala: converte coordenadas normalizadas para cm
  const scaleFactor = athleteHeightCm / bodyHeight;

  return {
    shoulderWidth: shoulderWidth * scaleFactor,
    hipWidth: hipWidth * scaleFactor,
    torsoLength: torsoLength * scaleFactor,
    leftArmLength: leftArmLength * scaleFactor,
    rightArmLength: rightArmLength * scaleFactor,
    leftLegLength: leftLegLength * scaleFactor,
    rightLegLength: rightLegLength * scaleFactor,
    shoulderToHipRatio: hipWidth > 0 ? shoulderWidth / hipWidth : 0,
    bodyHeight,
    scaleFactor,
    rawLandmarks: landmarks,
  };
}
