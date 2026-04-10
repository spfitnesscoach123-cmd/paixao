import ExpoModulesCore
import AVFoundation
import UIKit
import os

/// Logger para diagnostico visivel no Console.app em builds Release
private let viewLog = Logger(subsystem: "com.loadmanagerpro.mediapipe", category: "view")

/**
 * MediaPipePoseView — View nativa que renderiza camera + processa pose com MediaPipe.
 *
 * Camera preview via AVCaptureSession.
 * Deteccao de pose via PoseLandmarkerService (MediaPipe Tasks Vision, liveStream mode).
 * JS recebe apenas landmarks serializados (struct leve).
 *
 * REGRAS:
 * - MediaPipe NUNCA roda no main thread
 * - Camera pipeline NUNCA e bloqueado (detectAsync e non-blocking)
 * - JS recebe dados reais, nao simulacao
 */
class MediaPipePoseView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {

  // MARK: - Event Dispatchers
  private let onPoseDetected = EventDispatcher()
  private let onError = EventDispatcher()
  private let onCameraReady = EventDispatcher()

  // MARK: - Camera
  private let captureSession = AVCaptureSession()
  private let previewLayer = AVCaptureVideoPreviewLayer()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let sessionQueue = DispatchQueue(label: "com.mediapipepose.session", qos: .userInitiated)
  private let processingQueue = DispatchQueue(label: "com.mediapipepose.processing", qos: .userInitiated)

  // MARK: - State
  private var isSessionRunning = false
  private var currentFacing: AVCaptureDevice.Position = .back
  private var isActive = false
  private var landmarkerService: PoseLandmarkerService?

  // MARK: - Config
  private var modelComplexity: Int = 0
  private var minDetectionConfidence: Float = 0.6
  private var minTrackingConfidence: Float = 0.6

  // MARK: - Init

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    viewLog.info("[View] CREATED")
    setupPreviewLayer()
  }

  // MARK: - Layout

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }

  // MARK: - Setup

  private func setupPreviewLayer() {
    previewLayer.session = captureSession
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
  }

  private func initializeLandmarker() {
    viewLog.info("[View] initializeLandmarker START")
    landmarkerService = PoseLandmarkerService(
      modelComplexity: modelComplexity,
      minDetectionConfidence: minDetectionConfidence,
      minTrackingConfidence: minTrackingConfidence,
      onResult: { [weak self] landmarks, timestampMs, width, height in
        self?.dispatchPoseEvent(landmarks: landmarks, timestampMs: timestampMs, width: width, height: height)
      },
      onError: { [weak self] message in
        viewLog.error("[View] onError callback: \(message, privacy: .public)")
        self?.onError(["message": message])
      }
    )
    let avail = landmarkerService?.isAvailable == true
    viewLog.info("[View] initializeLandmarker END - isAvailable=\(avail, privacy: .public)")
  }

  // MARK: - Props setters

  func setCameraFacing(_ facing: String) {
    let newPosition: AVCaptureDevice.Position = facing == "front" ? .front : .back
    guard newPosition != currentFacing else { return }
    currentFacing = newPosition

    if isSessionRunning {
      sessionQueue.async { [weak self] in
        self?.reconfigureCamera()
      }
    }
  }

  func setIsActive(_ active: Bool) {
    viewLog.info("[View] setIsActive: \(active, privacy: .public) (was: \(self.isActive, privacy: .public))")
    guard active != isActive else { return }
    isActive = active

    if active {
      startSession()
    } else {
      stopSession()
    }
  }

  func setModelComplexity(_ complexity: Int) {
    modelComplexity = complexity
  }

  func setMinDetectionConfidence(_ confidence: Float) {
    minDetectionConfidence = confidence
  }

  func setMinTrackingConfidence(_ confidence: Float) {
    minTrackingConfidence = confidence
  }

  // MARK: - Session Lifecycle

  private func startSession() {
    viewLog.info("[View] startSession CALLED")
    sessionQueue.async { [weak self] in
      guard let self = self else { return }

      viewLog.info("[View] startSession EXECUTING on sessionQueue")
      self.initializeLandmarker()
      self.configureSession()

      if !self.captureSession.isRunning {
        viewLog.info("[View] captureSession.startRunning()")
        self.captureSession.startRunning()
        self.isSessionRunning = true

        DispatchQueue.main.async {
          viewLog.info("[View] onCameraReady dispatched")
          self.onCameraReady([:])
        }
      }
    }
  }

  private func stopSession() {
    viewLog.info("[View] stopSession CALLED")
    sessionQueue.async { [weak self] in
      guard let self = self else {
        viewLog.warning("[View] stopSession - self is nil (already deallocated)")
        return
      }

      viewLog.info("[View] stopSession EXECUTING - isRunning=\(self.captureSession.isRunning, privacy: .public)")
      if self.captureSession.isRunning {
        self.captureSession.stopRunning()
        self.isSessionRunning = false
        viewLog.info("[View] captureSession STOPPED")
      }

      self.landmarkerService?.close()
      self.landmarkerService = nil
      viewLog.info("[View] landmarkerService CLOSED")
    }
  }

  private func configureSession() {
    captureSession.beginConfiguration()
    captureSession.sessionPreset = .medium

    captureSession.inputs.forEach { captureSession.removeInput($0) }
    captureSession.outputs.forEach { captureSession.removeOutput($0) }

    guard let device = AVCaptureDevice.default(
      .builtInWideAngleCamera,
      for: .video,
      position: currentFacing
    ),
    let input = try? AVCaptureDeviceInput(device: device),
    captureSession.canAddInput(input) else {
      viewLog.error("[View] ERRO: camera nao disponivel")
      DispatchQueue.main.async { [weak self] in
        self?.onError(["message": "Camera nao disponivel para posicao selecionada"])
      }
      captureSession.commitConfiguration()
      return
    }

    captureSession.addInput(input)

    videoOutput.alwaysDiscardsLateVideoFrames = true
    videoOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
    videoOutput.setSampleBufferDelegate(self, queue: processingQueue)

    if captureSession.canAddOutput(videoOutput) {
      captureSession.addOutput(videoOutput)

      if let connection = videoOutput.connection(with: .video) {
        if #available(iOS 17.0, *) {
          if connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
          }
        } else {
          if connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
          }
        }
        connection.isVideoMirrored = (currentFacing == .front)
      }
    }

    captureSession.commitConfiguration()
    viewLog.info("[View] configureSession DONE")
  }

  private func reconfigureCamera() {
    captureSession.beginConfiguration()

    captureSession.inputs.forEach { captureSession.removeInput($0) }

    guard let device = AVCaptureDevice.default(
      .builtInWideAngleCamera,
      for: .video,
      position: currentFacing
    ),
    let input = try? AVCaptureDeviceInput(device: device),
    captureSession.canAddInput(input) else {
      captureSession.commitConfiguration()
      return
    }

    captureSession.addInput(input)

    if let connection = videoOutput.connection(with: .video) {
      connection.isVideoMirrored = (currentFacing == .front)
    }

    captureSession.commitConfiguration()
  }

  // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard isActive, let landmarkerService = landmarkerService else { return }

    // Timestamp monotônico do frame (CMSampleBuffer PTS)
    let timestampCM = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    let timestampInMs = Int(CMTimeGetSeconds(timestampCM) * 1000)

    landmarkerService.detect(sampleBuffer: sampleBuffer, timestampMs: timestampInMs)
  }

  // MARK: - Event Dispatch

  private func dispatchPoseEvent(landmarks: [[String: Any]], timestampMs: Int, width: Int, height: Int) {
    DispatchQueue.main.async { [weak self] in
      self?.onPoseDetected([
        "landmarks": landmarks,
        "timestamp": timestampMs,
        "frameWidth": width,
        "frameHeight": height,
      ])
    }
  }

  // MARK: - Cleanup

  deinit {
    viewLog.info("[View] DEINIT - cleanup sincrono")

    // 1. Remover delegate IMEDIATAMENTE para prevenir entrega de frames
    //    a um objeto ja desalocado (causa raiz do crash)
    videoOutput.setSampleBufferDelegate(nil, queue: nil)

    // 2. Capturar referencias locais (self nao pode ser usado apos deinit)
    let session = captureSession
    let service = landmarkerService
    let queue = sessionQueue

    // 3. Dispatch cleanup para sessionQueue com referencias fortes
    queue.async {
      viewLog.info("[View] DEINIT cleanup - stopping session")
      if session.isRunning {
        session.stopRunning()
      }
      service?.close()
      viewLog.info("[View] DEINIT cleanup DONE")
    }
  }
}
