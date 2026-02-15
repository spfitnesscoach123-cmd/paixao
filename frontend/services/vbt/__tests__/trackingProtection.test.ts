/**
 * Test Suite para o Sistema de 5 Estágios de Validação Progressiva VBT
 * 
 * CENÁRIOS DE VALIDAÇÃO OBRIGATÓRIOS:
 * 1. Cena vazia -> nenhum cálculo
 * 2. Movimento fora do ponto definido -> nenhum cálculo
 * 3. Baixa confiança -> nenhum cálculo
 * 4. Movimento válido -> contagem correta
 * 
 * ARQUITETURA PROGRESSIVA:
 * Stage 1: FRAME_USABLE
 * Stage 2: FRAME_STABLE
 * Stage 3: FRAME_TRACKABLE
 * Stage 4: FRAME_VALID
 * Stage 5: FRAME_COUNTABLE
 */

import {
  TrackingProtectionSystem,
  createTrackingProtection,
  HumanPresenceValidator,
  TrackingStateMachine,
  TrackingPointManager,
  FrameStabilityValidator,
  NoiseFilter,
  PoseData,
  Keypoint,
  EXERCISE_KEYPOINTS,
  RECOMMENDED_TRACKING_POINTS,
} from '../trackingProtection';

// Helper para criar pose de teste
function createTestPose(keypoints: Partial<Keypoint>[]): PoseData {
  return {
    keypoints: keypoints.map((kp, i) => ({
      name: kp.name || `keypoint_${i}`,
      x: kp.x || 0.5,
      y: kp.y || 0.5,
      score: kp.score !== undefined ? kp.score : 0.8,
    })),
    timestamp: Date.now(),
  };
}

// Helper para criar pose completa de squat
function createSquatPose(yPosition: number = 0.5, confidence: number = 0.8): PoseData {
  const keypointNames = ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'];
  return createTestPose(
    keypointNames.map(name => ({
      name,
      x: name.includes('left') ? 0.4 : 0.6,
      y: name.includes('hip') ? yPosition : name.includes('knee') ? yPosition + 0.15 : yPosition + 0.3,
      score: confidence,
    }))
  );
}

describe('Sistema de 3 Camadas de Proteção VBT', () => {
  
  describe('CAMADA 1: Validação de Presença Humana', () => {
    let validator: HumanPresenceValidator;
    
    beforeEach(() => {
      validator = new HumanPresenceValidator({
        minKeypointScore: 0.6,
        requiredStableFrames: 5,
        exerciseKeypoints: EXERCISE_KEYPOINTS['Back Squat'],
      });
    });
    
    test('CENÁRIO 1: Cena vazia deve retornar inválido', () => {
      const result = validator.validateKeypoints(null);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('pose detectada');
    });
    
    test('Pose com keypoints faltando deve retornar inválido', () => {
      const incompletePose = createTestPose([
        { name: 'left_hip', score: 0.8 },
        { name: 'right_hip', score: 0.8 },
        // Faltam knee e ankle
      ]);
      
      const result = validator.validateKeypoints(incompletePose);
      expect(result.isValid).toBe(false);
      expect(result.missingKeypoints.length).toBeGreaterThan(0);
    });
    
    test('CENÁRIO 3: Baixa confiança (< 0.6) deve retornar inválido', () => {
      const lowConfidencePose = createSquatPose(0.5, 0.4); // Confiança abaixo de 0.6
      
      const result = validator.validateKeypoints(lowConfidencePose);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('confiança baixa');
    });
    
    test('Pose válida com confiança >= 0.6 deve retornar válido', () => {
      const validPose = createSquatPose(0.5, 0.8);
      
      const result = validator.validateKeypoints(validPose);
      expect(result.isValid).toBe(true);
    });
    
    test('Estabilidade requer 5 frames consecutivos válidos', () => {
      const validPose = createSquatPose(0.5, 0.8);
      
      // Frames 1-4: não estável ainda
      for (let i = 0; i < 4; i++) {
        validator.validateKeypoints(validPose);
        expect(validator.isStable()).toBe(false);
      }
      
      // Frame 5: agora estável
      validator.validateKeypoints(validPose);
      expect(validator.isStable()).toBe(true);
    });
    
    test('Pose inválida reseta contador de estabilidade', () => {
      const validPose = createSquatPose(0.5, 0.8);
      
      // 3 frames válidos
      for (let i = 0; i < 3; i++) {
        validator.validateKeypoints(validPose);
      }
      
      // Pose inválida reseta
      validator.validateKeypoints(null);
      expect(validator.getStabilityProgress()).toBe(0);
      
      // Precisa de 5 frames novamente
      for (let i = 0; i < 4; i++) {
        validator.validateKeypoints(validPose);
      }
      expect(validator.isStable()).toBe(false);
    });
  });
  
  describe('CAMADA 2: Máquina de Estados', () => {
    let stateMachine: TrackingStateMachine;
    
    beforeEach(() => {
      stateMachine = new TrackingStateMachine({
        minKeypointScore: 0.6,
        requiredStableFrames: 5,
        minMovementDelta: 0.02,
        movingAverageWindow: 5,
        angularThreshold: 5,
        exerciseKeypoints: [],
      });
    });
    
    test('Estado inicial deve ser noHuman (semPessoa)', () => {
      expect(stateMachine.getState()).toBe('noHuman');
    });
    
    test('Transição noHuman -> ready quando humano estável', () => {
      const result = stateMachine.transition(
        true, // humanValid
        true, // humanStable
        0, // movementDelta
        { x: 0.5, y: 0.5 }
      );
      
      expect(result.newState).toBe('ready');
      expect(result.message).toContain('PRONTO');
    });
    
    test('Transição ready -> executing quando movimento detectado', () => {
      // Primeiro vai para ready
      stateMachine.transition(true, true, 0, { x: 0.5, y: 0.5 });
      
      // Movimento significativo
      const result = stateMachine.transition(
        true, 
        true, 
        0.05, // > minMovementDelta (0.02)
        { x: 0.5, y: 0.55 }
      );
      
      expect(result.newState).toBe('executing');
      expect(result.message).toContain('EXECUTANDO');
    });
    
    test('Perda de humano retorna para noHuman', () => {
      // Vai para ready
      stateMachine.transition(true, true, 0, { x: 0.5, y: 0.5 });
      expect(stateMachine.getState()).toBe('ready');
      
      // Perde humano
      const result = stateMachine.transition(false, false, 0, null);
      expect(result.newState).toBe('noHuman');
      expect(result.message).toContain('SEM PESSOA');
    });
    
    test('Instabilidade retorna para noHuman', () => {
      // Vai para ready
      stateMachine.transition(true, true, 0, { x: 0.5, y: 0.5 });
      
      // Instabilidade
      const result = stateMachine.transition(true, false, 0, { x: 0.5, y: 0.5 });
      expect(result.newState).toBe('noHuman');
    });
  });
  
  describe('CAMADA 3: Ponto de Tracking do Coach', () => {
    let trackingManager: TrackingPointManager;
    
    beforeEach(() => {
      trackingManager = new TrackingPointManager({
        minKeypointScore: 0.6,
        requiredStableFrames: 5,
        minMovementDelta: 0.02,
        movingAverageWindow: 5,
        angularThreshold: 5,
        exerciseKeypoints: [],
      });
    });
    
    test('Sistema deve bloquear se ponto não definido', () => {
      expect(trackingManager.isSet()).toBe(false);
      
      const result = trackingManager.getTrackedPosition(createSquatPose());
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('não definido');
    });
    
    test('Coach pode definir ponto de tracking', () => {
      trackingManager.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      expect(trackingManager.isSet()).toBe(true);
      const tp = trackingManager.getTrackingPoint();
      expect(tp.keypointName).toBe('left_hip');
    });
    
    test('CENÁRIO 2: Movimento fora do ponto deve retornar inválido', () => {
      // Coach define ponto como left_hip
      trackingManager.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      // Pose sem left_hip
      const poseWithoutHip = createTestPose([
        { name: 'left_shoulder', score: 0.8 },
        { name: 'right_shoulder', score: 0.8 },
      ]);
      
      const result = trackingManager.getTrackedPosition(poseWithoutHip);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('não detectado');
    });
    
    test('CENÁRIO 3: Ponto com baixa confiança deve bloquear', () => {
      trackingManager.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      // Pose com left_hip de baixa confiança
      const lowConfPose = createTestPose([
        { name: 'left_hip', x: 0.5, y: 0.5, score: 0.3 }, // Abaixo de 0.6
      ]);
      
      const result = trackingManager.getTrackedPosition(lowConfPose);
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('Confiança');
    });
    
    test('CENÁRIO 4: Ponto válido deve permitir cálculo', () => {
      trackingManager.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      const validPose = createTestPose([
        { name: 'left_hip', x: 0.5, y: 0.5, score: 0.85 },
      ]);
      
      const result = trackingManager.getTrackedPosition(validPose);
      expect(result.isValid).toBe(true);
      expect(result.position).toEqual({ x: 0.5, y: 0.5 });
    });
    
    test('Suavização por moving average funciona', () => {
      trackingManager.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      // Simula 5 frames com posições ligeiramente diferentes
      const positions = [0.5, 0.51, 0.49, 0.52, 0.48];
      
      for (const y of positions) {
        const pos = trackingManager.getSmoothedPosition({ x: 0.5, y });
        expect(pos).not.toBeNull();
      }
      
      // A posição suavizada deve ser próxima da média
      const finalSmoothed = trackingManager.getSmoothedPosition({ x: 0.5, y: 0.5 });
      expect(finalSmoothed!.y).toBeCloseTo(0.5, 1);
    });
  });
  
  describe('Sistema Completo de Proteção', () => {
    let protectionSystem: TrackingProtectionSystem;
    
    beforeEach(() => {
      protectionSystem = createProtectionSystem({
        minKeypointScore: 0.6,
        requiredStableFrames: 5,
        minMovementDelta: 0.02,
      });
      protectionSystem.setExercise('Back Squat');
    });
    
    test('CENÁRIO 1: Cena vazia -> nenhum cálculo', () => {
      protectionSystem.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      const result = protectionSystem.processFrame(null);
      
      expect(result.state).toBe('noHuman');
      expect(result.canCalculate).toBe(false);
      expect(result.canCountRep).toBe(false);
    });
    
    test('Sem ponto definido -> bloqueio total', () => {
      // Não define ponto
      const result = protectionSystem.processFrame(createSquatPose());
      
      expect(result.canCalculate).toBe(false);
      expect(result.message).toContain('BLOQUEADO');
    });
    
    test('CENÁRIO 2: Movimento fora do ponto -> nenhum cálculo', () => {
      protectionSystem.setTrackingPoint(0.5, 0.5, 'left_wrist'); // Define wrist
      
      // Pose só tem hip e knee, não tem wrist
      const result = protectionSystem.processFrame(createSquatPose());
      
      expect(result.canCalculate).toBe(false);
    });
    
    test('CENÁRIO 3: Baixa confiança -> nenhum cálculo', () => {
      protectionSystem.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      const lowConfPose = createSquatPose(0.5, 0.3);
      const result = protectionSystem.processFrame(lowConfPose);
      
      expect(result.canCalculate).toBe(false);
      expect(result.message).toContain('BLOQUEADO');
    });
    
    test('CENÁRIO 4: Fluxo completo com movimento válido', () => {
      protectionSystem.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      // Simula 5 frames para estabilizar
      const validPose = createSquatPose(0.5, 0.85);
      for (let i = 0; i < 5; i++) {
        const result = protectionSystem.processFrame(validPose);
        if (i < 4) {
          expect(result.canCalculate).toBe(false); // Ainda não estável
        }
      }
      
      // Frame 6: deve estar pronto
      const readyResult = protectionSystem.processFrame(validPose);
      expect(readyResult.state).toBe('ready');
      expect(readyResult.canCalculate).toBe(true);
    });
    
    test('Reset limpa todos os estados', () => {
      protectionSystem.setTrackingPoint(0.5, 0.5, 'left_hip');
      
      // Processa alguns frames
      for (let i = 0; i < 5; i++) {
        protectionSystem.processFrame(createSquatPose());
      }
      
      // Reset
      protectionSystem.reset();
      
      expect(protectionSystem.getState()).toBe('noHuman');
      expect(protectionSystem.getStabilityProgress()).toBe(0);
    });
  });
  
  describe('Filtro de Ruído', () => {
    let noiseFilter: NoiseFilter;
    
    beforeEach(() => {
      noiseFilter = new NoiseFilter({
        minKeypointScore: 0.6,
        requiredStableFrames: 5,
        minMovementDelta: 0.02,
        movingAverageWindow: 5,
        angularThreshold: 5,
        exerciseKeypoints: [],
      });
    });
    
    test('Micro-movimentos são filtrados', () => {
      const microMovement = 0.01; // Abaixo de 0.02
      expect(noiseFilter.filterMovement(microMovement)).toBe(0);
    });
    
    test('Movimentos significativos passam', () => {
      const bigMovement = 0.05; // Acima de 0.02
      expect(noiseFilter.filterMovement(bigMovement)).toBe(bigMovement);
    });
    
    test('Micro-velocidades são filtradas', () => {
      const microVelocity = 0.03; // Abaixo de 0.05 m/s
      expect(noiseFilter.filterVelocity(microVelocity)).toBe(0);
    });
    
    test('Velocidades significativas passam', () => {
      const velocity = 0.5; // m/s
      expect(noiseFilter.filterVelocity(velocity)).toBe(velocity);
    });
  });
});

// Executa testes se chamado diretamente
if (typeof require !== 'undefined' && require.main === module) {
  console.log('Executando testes do Sistema de 3 Camadas de Proteção VBT...');
}
