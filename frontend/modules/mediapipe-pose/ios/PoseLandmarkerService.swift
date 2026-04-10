import Foundation
import AVFoundation
import MediaPipeTasksVision
import os

/// Logger para diagnostico visivel no Console.app em builds Release
private let mpLog = Logger(subsystem: "com.loadmanagerpro.mediapipe", category: "pose")

/**
 * PoseLandmarkerService — Wrapper REAL do MediaPipe Pose Landmarker.
 *
 * Import direto de MediaPipeTasksVision (vendored XCFramework).
 * ZERO stubs, ZERO #if canImport, ZERO fallbacks.
 *
 * LIVE_STREAM mode: detectAsync envia frames de forma nao-bloqueante.
 * Resultados chegam via PoseLandmarkerLiveStreamDelegate.
 * Timestamps devem ser monotonicamente crescentes (CMSampleBuffer PTS).
 * NUNCA roda no main thread.
 */
class PoseLandmarkerService: NSObject, PoseLandmarkerLiveStreamDelegate {

  private var poseLandmarker: PoseLandmarker?
  private let onResult: ([[String: Any]], Int, Int, Int) -> Void
  private let onError: (String) -> Void
  private(set) var isAvailable: Bool = false

  init(
    modelComplexity: Int,
    minDetectionConfidence: Float,
    minTrackingConfidence: Float,
    onResult: @escaping ([[String: Any]], Int, Int, Int) -> Void,
    onError: @escaping (String) -> Void
  ) {
    self.onResult = onResult
    self.onError = onError
    super.init()
    mpLog.info("[MediaPipe] SERVICE CREATED")

    setupLandmarker(
      complexity: modelComplexity,
      detectionConfidence: minDetectionConfidence,
      trackingConfidence: minTrackingConfidence
    )
  }

  // MARK: - Setup

  private func setupLandmarker(
    complexity: Int,
    detectionConfidence: Float,
    trackingConfidence: Float
  ) {
    let modelName = "pose_landmarker_lite"

    mpLog.info("[MediaPipe] SETUP START - procurando modelo: \(modelName, privacy: .public).task")

    let bundlePath = Bundle(for: type(of: self)).path(forResource: modelName, ofType: "task")
    let mainPath = Bundle.main.path(forResource: modelName, ofType: "task")

    mpLog.info("[MediaPipe] Bundle(for: self) path: \(bundlePath ?? "NIL", privacy: .public)")
    mpLog.info("[MediaPipe] Bundle.main path: \(mainPath ?? "NIL", privacy: .public)")

    guard let modelPath = bundlePath ?? mainPath else {
      mpLog.error("[MediaPipe] ERRO: modelo \(modelName, privacy: .public).task NAO encontrado em nenhum bundle")
      onError("Modelo \(modelName).task nao encontrado no bundle")
      return
    }

    mpLog.info("[MediaPipe] Modelo encontrado: \(modelPath, privacy: .public)")

    do {
      let baseOptions = BaseOptions()
      baseOptions.modelAssetPath = modelPath

      let options = PoseLandmarkerOptions()
      options.baseOptions = baseOptions
      options.runningMode = .liveStream
      options.numPoses = 1
      options.minPoseDetectionConfidence = detectionConfidence
      options.minPosePresenceConfidence = detectionConfidence
      options.minTrackingConfidence = trackingConfidence
      options.poseLandmarkerLiveStreamDelegate = self

      mpLog.info("[MediaPipe] Criando PoseLandmarker...")
      poseLandmarker = try PoseLandmarker(options: options)
      isAvailable = true
      mpLog.info("[MediaPipe] INITIALIZED OK - isAvailable=true")
    } catch {
      mpLog.error("[MediaPipe] ERRO ao criar PoseLandmarker: \(error.localizedDescription, privacy: .public)")
      onError("Falha ao inicializar PoseLandmarker: \(error.localizedDescription)")
    }
  }

  // MARK: - Detection (async — LIVE_STREAM mode)

  func detect(sampleBuffer: CMSampleBuffer, timestampMs: Int) {
    guard poseLandmarker != nil else {
      mpLog.warning("[MediaPipe] FRAME DROPPED - poseLandmarker is nil")
      return
    }

    guard let mpImage = try? MPImage(sampleBuffer: sampleBuffer) else {
      mpLog.warning("[MediaPipe] FRAME DROPPED - MPImage creation failed")
      return
    }

    do {
      try poseLandmarker?.detectAsync(image: mpImage, timestampInMilliseconds: timestampMs)
    } catch {
      mpLog.error("[MediaPipe] detectAsync error: \(error.localizedDescription, privacy: .public)")
    }
  }

  // MARK: - PoseLandmarkerLiveStreamDelegate

  func poseLandmarker(
    _ poseLandmarker: PoseLandmarker,
    didFinishDetection result: PoseLandmarkerResult?,
    timestampInMilliseconds: Int,
    error: Error?
  ) {
    if let error = error {
      mpLog.error("[MediaPipe] DETECTION ERROR: \(error.localizedDescription, privacy: .public)")
      onError("Erro na deteccao: \(error.localizedDescription)")
      return
    }

    guard let result = result,
          let firstPose = result.landmarks.first,
          !firstPose.isEmpty else { return }

    let serialized = serializeLandmarks(firstPose)
    onResult(serialized, timestampInMilliseconds, 480, 640)
  }

  // MARK: - Serialization

  private func serializeLandmarks(_ landmarks: [NormalizedLandmark]) -> [[String: Any]] {
    return landmarks.map { lm in
      [
        "x": Double(lm.x),
        "y": Double(lm.y),
        "z": Double(lm.z),
        "visibility": Double(lm.visibility?.floatValue ?? 0),
      ]
    }
  }

  // MARK: - Cleanup

  func close() {
    mpLog.info("[MediaPipe] SERVICE CLOSING")
    poseLandmarker = nil
    isAvailable = false
  }
}
