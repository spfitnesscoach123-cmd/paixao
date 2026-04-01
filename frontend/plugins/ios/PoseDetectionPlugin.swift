//
//  PoseDetectionPlugin.swift
//  LoadManagerPro
//
//  Frame Processor Plugin for VisionCamera v4.
//  Uses MediaPipe Tasks Vision to detect 33 BlazePose landmarks.
//
//  RETURNS EXACTLY:
//  [ { "x": Float, "y": Float, "z": Float, "visibility": Float }, ... ] (33 items)
//  Values normalized 0-1, same order as BlazePose.
//
//  NO additional processing. Raw landmarks only.
//

import VisionCamera
import MediaPipeTasksVision

@objc(PoseDetectionPlugin)
public class PoseDetectionPlugin: FrameProcessorPlugin {

    private var poseLandmarker: PoseLandmarker?
    private var lastTimestampMs: Int = 0

    public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = nil) {
        super.init(proxy: proxy, options: options)
        initializeLandmarker()
    }

    // MARK: - Initialization

    private func initializeLandmarker() {
        guard let modelPath = Bundle.main.path(
            forResource: "pose_landmarker_full",
            ofType: "task"
        ) else {
            print("[PoseDetection] ERROR: pose_landmarker_full.task not found in bundle")
            return
        }

        let options = PoseLandmarkerOptions()
        options.baseOptions.modelAssetPath = modelPath
        options.runningMode = .video
        options.numPoses = 1
        options.minPoseDetectionConfidence = 0.5
        options.minPosePresenceConfidence = 0.5
        options.minTrackingConfidence = 0.5

        do {
            poseLandmarker = try PoseLandmarker(options: options)
            print("[PoseDetection] PoseLandmarker initialized successfully")
        } catch {
            print("[PoseDetection] Failed to create PoseLandmarker: \(error)")
        }
    }

    // MARK: - Frame Processing

    public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
        guard let landmarker = poseLandmarker else { return nil }

        // Monotonic timestamp in milliseconds (strictly increasing required by MediaPipe video mode)
        let timestampMs = Int(frame.timestamp * 1000)
        guard timestampMs > lastTimestampMs else { return nil }
        lastTimestampMs = timestampMs

        do {
            let mpImage = try MPImage(sampleBuffer: frame.buffer)

            let result = try landmarker.detect(
                videoFrame: mpImage,
                timestampInMilliseconds: timestampMs
            )

            // First detected pose only
            guard let poseLandmarks = result.landmarks.first else { return nil }
            guard poseLandmarks.count == 33 else { return nil }

            // Build output array — raw normalized values, zero processing
            var output: [[String: Any]] = []
            output.reserveCapacity(33)

            for lm in poseLandmarks {
                output.append([
                    "x": lm.x,
                    "y": lm.y,
                    "z": lm.z,
                    "visibility": lm.visibility?.floatValue ?? 0.0
                ])
            }

            return output

        } catch {
            // Silent in production — frame skipped
            return nil
        }
    }
}
