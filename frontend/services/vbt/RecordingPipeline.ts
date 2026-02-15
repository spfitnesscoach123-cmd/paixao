/**
 * RecordingPipeline - Production-Grade Video Recording for VBT
 * 
 * Manages video recording lifecycle with:
 * - startRecording with proper native camera integration
 * - stopRecording with cleanup
 * - Recording state management
 * - onRecordingFinished and onRecordingError callbacks
 * - Video file handling
 * 
 * CRITICAL: Recording MUST use cameraRef.current.startRecording()
 * NOT just state changes.
 */

import { RefObject } from 'react';
import { CameraView } from 'expo-camera';

export type RecordingState = 
  | 'idle'       // Not recording
  | 'starting'   // Starting recording
  | 'recording'  // Actively recording
  | 'stopping'   // Stopping recording
  | 'completed'  // Recording finished
  | 'error';     // Recording failed

export interface RecordingConfig {
  maxDurationMs: number;       // Maximum recording duration
  fileType: 'mp4' | 'mov';     // Output file type
  quality: 'low' | 'medium' | 'high';
  muted: boolean;              // Mute audio during recording
}

export interface RecordingResult {
  uri: string;                 // Video file URI
  duration: number;            // Recording duration in ms
  startTime: number;           // Recording start timestamp
  endTime: number;             // Recording end timestamp
}

export interface RecordingPipelineState {
  state: RecordingState;
  isRecording: boolean;
  duration: number;
  error: string | null;
  result: RecordingResult | null;
}

export interface RecordingCallbacks {
  onRecordingStarted?: () => void;
  onRecordingFinished?: (result: RecordingResult) => void;
  onRecordingError?: (error: Error) => void;
  onDurationUpdate?: (duration: number) => void;
}

const DEFAULT_CONFIG: RecordingConfig = {
  maxDurationMs: 300000, // 5 minutes max
  fileType: 'mp4',
  quality: 'high',
  muted: false,
};

/**
 * RecordingPipeline Class
 * 
 * Manages video recording for VBT sessions.
 * Provides proper integration with expo-camera recording API.
 */
export class RecordingPipeline {
  private config: RecordingConfig;
  private callbacks: RecordingCallbacks;
  private state: RecordingState = 'idle';
  private startTime: number = 0;
  private endTime: number = 0;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private currentDuration: number = 0;
  private recordingPromise: Promise<{ uri: string }> | null = null;
  private lastResult: RecordingResult | null = null;
  private lastError: Error | null = null;

  constructor(
    config: Partial<RecordingConfig> = {},
    callbacks: RecordingCallbacks = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Start video recording
   * 
   * CRITICAL: This method MUST call cameraRef.current.startRecording()
   * Setting state alone does NOT start recording.
   * 
   * @param cameraRef - Reference to CameraView component
   */
  async startRecording(cameraRef: RefObject<CameraView>): Promise<boolean> {
    // Validate camera reference
    if (!cameraRef.current) {
      this.handleError(new Error('Camera reference is null'));
      return false;
    }
    
    // Check if already recording
    if (this.state === 'recording' || this.state === 'starting') {
      console.warn('[RecordingPipeline] Already recording or starting');
      return false;
    }
    
    // Transition to starting state
    this.setState('starting');
    this.startTime = Date.now();
    this.currentDuration = 0;
    this.lastResult = null;
    this.lastError = null;
    
    console.log('[RecordingPipeline] Starting recording...');
    
    try {
      // Start duration timer
      this.startDurationTimer();
      
      // CRITICAL: Actually start the camera recording
      // This is the key fix for BUG 2 - recording must call native method
      this.recordingPromise = cameraRef.current.recordAsync({
        maxDuration: this.config.maxDurationMs / 1000, // Convert to seconds
        // Note: expo-camera may not support all options
      });
      
      // Transition to recording state
      this.setState('recording');
      this.callbacks.onRecordingStarted?.();
      
      console.log('[RecordingPipeline] Recording STARTED successfully');
      return true;
      
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Stop video recording
   * 
   * @param cameraRef - Reference to CameraView component
   */
  async stopRecording(cameraRef: RefObject<CameraView>): Promise<RecordingResult | null> {
    // Check if recording
    if (this.state !== 'recording') {
      console.warn('[RecordingPipeline] Not currently recording');
      return null;
    }
    
    // Transition to stopping state
    this.setState('stopping');
    this.endTime = Date.now();
    
    console.log('[RecordingPipeline] Stopping recording...');
    
    // Stop duration timer
    this.stopDurationTimer();
    
    try {
      // Stop the camera recording
      if (cameraRef.current) {
        cameraRef.current.stopRecording();
      }
      
      // Wait for the recording promise to resolve
      let videoUri = '';
      if (this.recordingPromise) {
        const result = await this.recordingPromise;
        videoUri = result.uri;
        this.recordingPromise = null;
      }
      
      // Create result
      const result: RecordingResult = {
        uri: videoUri,
        duration: this.endTime - this.startTime,
        startTime: this.startTime,
        endTime: this.endTime,
      };
      
      this.lastResult = result;
      this.setState('completed');
      this.callbacks.onRecordingFinished?.(result);
      
      console.log(`[RecordingPipeline] Recording STOPPED. Duration: ${result.duration}ms`);
      return result;
      
    } catch (error) {
      this.handleError(error as Error);
      return null;
    }
  }

  /**
   * Handle recording completion (called from camera callback)
   */
  handleRecordingFinished(result: { uri: string }): void {
    if (this.state === 'recording' || this.state === 'stopping') {
      this.endTime = Date.now();
      this.stopDurationTimer();
      
      const recordingResult: RecordingResult = {
        uri: result.uri,
        duration: this.endTime - this.startTime,
        startTime: this.startTime,
        endTime: this.endTime,
      };
      
      this.lastResult = recordingResult;
      this.setState('completed');
      this.callbacks.onRecordingFinished?.(recordingResult);
      
      console.log(`[RecordingPipeline] Recording finished via callback. URI: ${result.uri}`);
    }
  }

  /**
   * Handle recording error (called from camera callback)
   */
  handleRecordingError(error: Error): void {
    this.handleError(error);
  }

  /**
   * Handle error during recording
   */
  private handleError(error: Error): void {
    console.error('[RecordingPipeline] Error:', error.message);
    
    this.lastError = error;
    this.stopDurationTimer();
    this.setState('error');
    this.callbacks.onRecordingError?.(error);
    this.recordingPromise = null;
  }

  /**
   * Start duration tracking timer
   */
  private startDurationTimer(): void {
    this.durationTimer = setInterval(() => {
      this.currentDuration = Date.now() - this.startTime;
      this.callbacks.onDurationUpdate?.(this.currentDuration);
      
      // Check max duration
      if (this.currentDuration >= this.config.maxDurationMs) {
        console.log('[RecordingPipeline] Max duration reached');
        // Note: We don't auto-stop here as the camera might handle it
      }
    }, 100); // Update every 100ms
  }

  /**
   * Stop duration tracking timer
   */
  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  /**
   * Set state
   */
  private setState(newState: RecordingState): void {
    console.log(`[RecordingPipeline] State: ${this.state} -> ${newState}`);
    this.state = newState;
  }

  /**
   * Get current state
   */
  getState(): RecordingPipelineState {
    return {
      state: this.state,
      isRecording: this.state === 'recording',
      duration: this.currentDuration,
      error: this.lastError?.message || null,
      result: this.lastResult,
    };
  }

  /**
   * Check if recording is active
   */
  isRecording(): boolean {
    return this.state === 'recording';
  }

  /**
   * Get current duration
   */
  getDuration(): number {
    return this.currentDuration;
  }

  /**
   * Get last result
   */
  getLastResult(): RecordingResult | null {
    return this.lastResult;
  }

  /**
   * Update callbacks
   */
  setCallbacks(callbacks: RecordingCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Reset pipeline
   */
  reset(): void {
    this.stopDurationTimer();
    this.state = 'idle';
    this.startTime = 0;
    this.endTime = 0;
    this.currentDuration = 0;
    this.recordingPromise = null;
    this.lastResult = null;
    this.lastError = null;
  }
}

/**
 * Create a recording pipeline with custom configuration
 */
export function createRecordingPipeline(
  config?: Partial<RecordingConfig>,
  callbacks?: RecordingCallbacks
): RecordingPipeline {
  return new RecordingPipeline(config, callbacks);
}

export default RecordingPipeline;
