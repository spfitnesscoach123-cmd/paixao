import ExpoModulesCore

/**
 * MediaPipePoseModule — Definicao do modulo Expo.
 *
 * Registra a view nativa (camera + MediaPipe) e expoe metodos/eventos para o JS.
 * O processamento MediaPipe roda inteiramente no thread nativo de captura.
 */
public class MediaPipePoseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MediaPipePose")

    // View nativa com camera + pose detection
    View(MediaPipePoseView.self) {
      Events(
        "onPoseDetected",
        "onError",
        "onCameraReady"
      )

      Prop("cameraFacing") { (view: MediaPipePoseView, facing: String?) in
        view.setCameraFacing(facing ?? "back")
      }

      Prop("isActive") { (view: MediaPipePoseView, active: Bool?) in
        view.setIsActive(active ?? false)
      }

      Prop("modelComplexity") { (view: MediaPipePoseView, complexity: Int?) in
        view.setModelComplexity(complexity ?? 0)
      }

      Prop("minDetectionConfidence") { (view: MediaPipePoseView, confidence: Double?) in
        view.setMinDetectionConfidence(Float(confidence ?? 0.6))
      }

      Prop("minTrackingConfidence") { (view: MediaPipePoseView, confidence: Double?) in
        view.setMinTrackingConfidence(Float(confidence ?? 0.6))
      }
    }
  }
}
