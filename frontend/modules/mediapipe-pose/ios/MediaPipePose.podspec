Pod::Spec.new do |s|
  s.name           = 'MediaPipePose'
  s.version        = '1.0.0'
  s.summary        = 'Expo module: camera nativa + MediaPipe Pose Landmarker'
  s.description    = 'Modulo Expo local com AVCaptureSession + MediaPipe Tasks Vision vendored para deteccao de pose em tempo real.'
  s.homepage       = 'https://github.com/loadmanager/mediapipe-pose'
  s.license        = { :type => 'MIT' }
  s.author         = 'LoadManager Pro'
  s.source         = { :git => '' }

  s.platform       = :ios, '15.0'
  s.swift_version  = '5.9'
  s.static_framework = true

  s.source_files   = '**/*.swift'
  s.resources      = ['pose_landmarker_lite.task']

  # XCFrameworks vendored — bypassa CocoaPods completamente para MediaPipe
  s.vendored_frameworks = [
    'Frameworks/MediaPipeTasksVision.xcframework',
    'Frameworks/MediaPipeCommonGraphLibraries.xcframework'
  ]

  s.dependency 'ExpoModulesCore'

  # Frameworks exigidos pelo modulemap do MediaPipeTasksVision
  s.frameworks = [
    'AVFoundation',
    'CoreMedia',
    'CoreVideo',
    'Accelerate',
    'CoreFoundation',
    'CoreGraphics',
    'CoreImage',
    'Foundation',
    'Metal',
    'MetalKit',
    'QuartzCore',
    'UIKit'
  ]

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'OTHER_LDFLAGS' => '$(inherited) -lc++ -ldl -lm -lpthread -ObjC',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
  }
end
