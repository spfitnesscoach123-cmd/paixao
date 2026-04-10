package expo.modules.mediapipepose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import java.nio.ByteBuffer

/**
 * PoseLandmarkerService — Wrapper do MediaPipe Pose Landmarker para Android.
 *
 * Responsabilidades:
 * - Inicializar o modelo UMA vez (singleton por instancia da view)
 * - Processar ImageProxy via VIDEO mode (sincrono, deterministico)
 * - Serializar landmarks para Maps leves
 * - Chamar callbacks com resultado
 *
 * VIDEO mode: cada frame enviado gera exatamente um resultado.
 * O sistema nativo (CameraX) controla quais frames entram no pipeline.
 * NUNCA roda no main thread.
 */
class PoseLandmarkerService(
  private val context: Context,
  modelComplexity: Int,
  minDetectionConfidence: Float,
  minTrackingConfidence: Float,
  private val onResult: (List<Map<String, Any>>, Long, Int, Int) -> Unit,
  private val onError: (String) -> Unit
) {

  private var poseLandmarker: PoseLandmarker? = null

  init {
    setupLandmarker(
      complexity = modelComplexity,
      detectionConfidence = minDetectionConfidence,
      trackingConfidence = minTrackingConfidence
    )
  }

  // MARK: - Setup

  private fun setupLandmarker(
    complexity: Int,
    detectionConfidence: Float,
    trackingConfidence: Float
  ) {
    try {
      val modelName = "pose_landmarker_lite.task"

      val baseOptions = BaseOptions.builder()
        .setModelAssetPath(modelName)
        .setDelegate(Delegate.CPU)
        .build()

      val options = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setRunningMode(RunningMode.VIDEO)
        .setNumPoses(1)
        .setMinPoseDetectionConfidence(detectionConfidence)
        .setMinPosePresenceConfidence(detectionConfidence)
        .setMinTrackingConfidence(trackingConfidence)
        .build()

      poseLandmarker = PoseLandmarker.createFromOptions(context, options)
    } catch (e: Exception) {
      onError("Falha ao inicializar PoseLandmarker: ${e.message}")
    }
  }

  // MARK: - Detection (sincrono — VIDEO mode)

  fun detect(imageProxy: ImageProxy) {
    val landmarker = poseLandmarker
    if (landmarker == null) {
      imageProxy.close()
      return
    }

    try {
      val bitmap = imageProxyToBitmap(imageProxy)
      if (bitmap == null) {
        imageProxy.close()
        return
      }

      val mpImage = BitmapImageBuilder(bitmap).build()
      val timestampMs = imageProxy.imageInfo.timestamp / 1000

      val result = landmarker.detectForVideo(mpImage, timestampMs)
      handleResult(result, timestampMs)
    } catch (e: Exception) {
      // Frame nao processado — nao interrompe o pipeline
    } finally {
      imageProxy.close()
    }
  }

  // MARK: - Image Conversion

  private fun imageProxyToBitmap(imageProxy: ImageProxy): Bitmap? {
    val planes = imageProxy.planes
    if (planes.isEmpty()) return null

    val buffer: ByteBuffer = planes[0].buffer
    val pixelStride = planes[0].pixelStride
    val rowStride = planes[0].rowStride
    val rowPadding = rowStride - pixelStride * imageProxy.width

    val bitmap = Bitmap.createBitmap(
      imageProxy.width + rowPadding / pixelStride,
      imageProxy.height,
      Bitmap.Config.ARGB_8888
    )
    buffer.rewind()
    bitmap.copyPixelsFromBuffer(buffer)

    // Crop para tamanho real (sem padding)
    val croppedBitmap = if (rowPadding > 0) {
      Bitmap.createBitmap(bitmap, 0, 0, imageProxy.width, imageProxy.height)
    } else {
      bitmap
    }

    // Aplicar rotacao se necessario
    val rotation = imageProxy.imageInfo.rotationDegrees
    return if (rotation != 0) {
      val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
      Bitmap.createBitmap(croppedBitmap, 0, 0, croppedBitmap.width, croppedBitmap.height, matrix, true)
    } else {
      croppedBitmap
    }
  }

  // MARK: - Result Handling

  private fun handleResult(result: PoseLandmarkerResult, timestampMs: Long) {
    val landmarks = result.landmarks()
    if (landmarks.isEmpty() || landmarks[0].isEmpty()) return

    val serialized = landmarks[0].map { lm ->
      mapOf<String, Any>(
        "x" to lm.x().toDouble(),
        "y" to lm.y().toDouble(),
        "z" to lm.z().toDouble(),
        "visibility" to (lm.visibility().orElse(0f)).toDouble()
      )
    }

    onResult(serialized, timestampMs, 480, 640)
  }

  // MARK: - Cleanup

  fun close() {
    poseLandmarker?.close()
    poseLandmarker = null
  }
}
