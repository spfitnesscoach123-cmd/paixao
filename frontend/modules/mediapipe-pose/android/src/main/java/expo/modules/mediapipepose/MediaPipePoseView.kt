package expo.modules.mediapipepose

import android.content.Context
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * MediaPipePoseView — View nativa Android com CameraX + MediaPipe Pose Landmarker.
 *
 * Arquitetura:
 * - CameraX gerencia a camera (preview via PreviewView + analise via ImageAnalysis)
 * - PoseLandmarkerService processa frames em thread separado (VIDEO mode, sincrono)
 * - Resultados sao enviados ao JS via EventDispatcher (onPoseDetected)
 *
 * REGRAS:
 * - MediaPipe NUNCA roda no main thread
 * - Camera pipeline NUNCA e bloqueado (STRATEGY_KEEP_ONLY_LATEST)
 * - JS recebe apenas landmarks serializados (Map leve)
 */
class MediaPipePoseView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  // Event dispatchers para o JS
  private val onPoseDetected by EventDispatcher()
  private val onError by EventDispatcher()
  private val onCameraReady by EventDispatcher()

  // Camera
  private val previewView: PreviewView = PreviewView(context).apply {
    layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    )
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
  }

  private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private var cameraProvider: ProcessCameraProvider? = null
  private var landmarkerService: PoseLandmarkerService? = null

  // State
  private var currentFacing = CameraSelector.LENS_FACING_BACK
  private var isActive = false
  private var isCameraBound = false

  // Config
  private var modelComplexity: Int = 0
  private var minDetectionConfidence: Float = 0.6f
  private var minTrackingConfidence: Float = 0.6f

  init {
    addView(previewView)
  }

  // MARK: - Props setters

  fun setCameraFacing(facing: String) {
    val newFacing = if (facing == "front") CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
    if (newFacing != currentFacing) {
      currentFacing = newFacing
      if (isCameraBound) {
        rebindCamera()
      }
    }
  }

  fun setIsActive(active: Boolean) {
    if (active != isActive) {
      isActive = active
      if (active) {
        startCamera()
      } else {
        stopCamera()
      }
    }
  }

  fun setModelComplexity(complexity: Int) {
    modelComplexity = complexity
  }

  fun setMinDetectionConfidence(confidence: Float) {
    minDetectionConfidence = confidence
  }

  fun setMinTrackingConfidence(confidence: Float) {
    minTrackingConfidence = confidence
  }

  // MARK: - Camera Lifecycle

  private fun startCamera() {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

    cameraProviderFuture.addListener({
      try {
        cameraProvider = cameraProviderFuture.get()
        initializeLandmarker()
        bindCamera()
      } catch (e: Exception) {
        onError(mapOf("message" to "Falha ao iniciar camera: ${e.message}"))
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun stopCamera() {
    cameraProvider?.unbindAll()
    isCameraBound = false
    landmarkerService?.close()
    landmarkerService = null
  }

  private fun rebindCamera() {
    cameraProvider?.unbindAll()
    isCameraBound = false
    bindCamera()
  }

  private fun initializeLandmarker() {
    landmarkerService?.close()
    landmarkerService = PoseLandmarkerService(
      context = context,
      modelComplexity = modelComplexity,
      minDetectionConfidence = minDetectionConfidence,
      minTrackingConfidence = minTrackingConfidence,
      onResult = { landmarks, timestampMs, width, height ->
        // Dispatch para o JS no main thread
        post {
          onPoseDetected(mapOf(
            "landmarks" to landmarks,
            "timestamp" to timestampMs,
            "frameWidth" to width,
            "frameHeight" to height
          ))
        }
      },
      onError = { message ->
        post {
          onError(mapOf("message" to message))
        }
      }
    )
  }

  private fun bindCamera() {
    val provider = cameraProvider ?: return
    val lifecycleOwner = getLifecycleOwner() ?: run {
      onError(mapOf("message" to "LifecycleOwner nao disponivel"))
      return
    }

    try {
      provider.unbindAll()

      val cameraSelector = CameraSelector.Builder()
        .requireLensFacing(currentFacing)
        .build()

      // Preview
      val preview = Preview.Builder()
        .build()
        .also {
          it.surfaceProvider = previewView.surfaceProvider
        }

      // Image Analysis para frames
      val imageAnalysis = ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
        .build()

      imageAnalysis.setAnalyzer(analysisExecutor) { imageProxy ->
        if (isActive && landmarkerService != null) {
          landmarkerService?.detect(imageProxy)
        } else {
          imageProxy.close()
        }
      }

      provider.bindToLifecycle(
        lifecycleOwner,
        cameraSelector,
        preview,
        imageAnalysis
      )

      isCameraBound = true
      onCameraReady(mapOf<String, Any>())

    } catch (e: Exception) {
      onError(mapOf("message" to "Falha ao vincular camera: ${e.message}"))
    }
  }

  private fun getLifecycleOwner(): LifecycleOwner? {
    // Tenta obter do contexto (Activity)
    var ctx = context
    while (ctx != null) {
      if (ctx is LifecycleOwner) return ctx
      ctx = if (ctx is android.content.ContextWrapper) ctx.baseContext else null
    }
    return null
  }

  // MARK: - Cleanup

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    stopCamera()
    analysisExecutor.shutdown()
  }
}
