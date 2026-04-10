package expo.modules.mediapipepose

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * MediaPipePoseModule — Definicao do modulo Expo para Android.
 *
 * Registra a view nativa (CameraX + MediaPipe) e expoe props/eventos para o JS.
 * O processamento MediaPipe roda inteiramente em threads nativos (nunca no JS thread).
 */
class MediaPipePoseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MediaPipePose")

    View(MediaPipePoseView::class) {
      Events(
        "onPoseDetected",
        "onError",
        "onCameraReady"
      )

      Prop("cameraFacing") { view: MediaPipePoseView, facing: String? ->
        view.setCameraFacing(facing ?: "back")
      }

      Prop("isActive") { view: MediaPipePoseView, active: Boolean? ->
        view.setIsActive(active ?: false)
      }

      Prop("modelComplexity") { view: MediaPipePoseView, complexity: Int? ->
        view.setModelComplexity(complexity ?: 0)
      }

      Prop("minDetectionConfidence") { view: MediaPipePoseView, confidence: Double? ->
        view.setMinDetectionConfidence(confidence?.toFloat() ?: 0.6f)
      }

      Prop("minTrackingConfidence") { view: MediaPipePoseView, confidence: Double? ->
        view.setMinTrackingConfidence(confidence?.toFloat() ?: 0.6f)
      }
    }
  }
}
