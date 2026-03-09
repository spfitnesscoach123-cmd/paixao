/**
 * CameraMediapipeManager - Singleton Manager
 * 
 * Global manager for camera and MediaPipe lifecycle.
 * Ensures safe initialization, prevents race conditions, and handles cleanup.
 * 
 * ARCHITECTURE:
 * - Single source of truth for camera/mediapipe state
 * - Sequential state transitions (no parallel initialization)
 * - Safe resource cleanup on unmount/background
 * - Compatible with both Jump Camera and VBT Camera
 * 
 * IMPORTANT: VBT Camera continues to work independently.
 * This manager provides optional lifecycle coordination for modules that need it.
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import {
  CameraPhase,
  CameraOwner,
  CameraManagerState,
  TransitionResult,
  ReadinessCheck,
  LifecycleEvent,
  LifecycleCallback,
  VALID_TRANSITIONS,
  PHASE_DESCRIPTIONS,
} from './types';

// Logging prefix
const LOG_PREFIX = '[CameraManager]';

/**
 * CameraMediapipeManager Singleton
 * 
 * Manages the lifecycle of camera and MediaPipe resources.
 */
class CameraMediapipeManager {
  private static instance: CameraMediapipeManager | null = null;
  
  // State
  private state: CameraManagerState;
  
  // Callbacks
  private lifecycleCallbacks: Set<LifecycleCallback> = new Set();
  
  // Timers
  private initializationTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // App state subscription
  private appStateSubscription: { remove: () => void } | null = null;
  
  // Configuration
  private readonly INITIALIZATION_TIMEOUT_MS = 10000; // 10 seconds max for any phase
  private readonly FRAME_THRESHOLD_FOR_READY = 3; // Need 3 frames to confirm MediaPipe ready
  
  private constructor() {
    this.state = {
      phase: 'IDLE',
      owner: 'none',
      error: null,
      lastTransition: Date.now(),
      frameCount: 0,
      isAppActive: true,
    };
    
    // Subscribe to app state changes
    this.setupAppStateListener();
    
    console.log(`${LOG_PREFIX} Manager initialized`);
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): CameraMediapipeManager {
    if (!CameraMediapipeManager.instance) {
      CameraMediapipeManager.instance = new CameraMediapipeManager();
    }
    return CameraMediapipeManager.instance;
  }
  
  /**
   * Reset singleton (for testing/cleanup)
   */
  public static resetInstance(): void {
    if (CameraMediapipeManager.instance) {
      CameraMediapipeManager.instance.destroy();
      CameraMediapipeManager.instance = null;
    }
  }
  
  // ============================================================================
  // APP STATE MANAGEMENT
  // ============================================================================
  
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }
  
  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    const wasActive = this.state.isAppActive;
    const isActive = nextAppState === 'active';
    
    this.state.isAppActive = isActive;
    
    if (wasActive && !isActive) {
      // App going to background
      console.log(`${LOG_PREFIX} App entering background`);
      this.notifyCallbacks('app_background');
      
      // If we're in active capture, pause (but don't release)
      if (this.state.phase === 'CAPTURE_ACTIVE' || this.state.phase === 'MEDIAPIPE_READY') {
        console.log(`${LOG_PREFIX} Pausing capture for background`);
        // We don't auto-release - let the component decide what to do
      }
    } else if (!wasActive && isActive) {
      // App returning to foreground
      console.log(`${LOG_PREFIX} App returning to foreground`);
      this.notifyCallbacks('app_foreground');
    }
  };
  
  // ============================================================================
  // STATE TRANSITIONS
  // ============================================================================
  
  /**
   * Request ownership of the camera system
   * Returns true if ownership granted, false if already owned by another module
   */
  public requestOwnership(requester: CameraOwner): boolean {
    if (this.state.owner === 'none' || this.state.owner === requester) {
      this.state.owner = requester;
      console.log(`${LOG_PREFIX} Ownership granted to: ${requester}`);
      return true;
    }
    
    console.warn(`${LOG_PREFIX} Ownership denied to ${requester}, current owner: ${this.state.owner}`);
    return false;
  }
  
  /**
   * Release ownership
   */
  public releaseOwnership(requester: CameraOwner): void {
    if (this.state.owner === requester) {
      this.state.owner = 'none';
      console.log(`${LOG_PREFIX} Ownership released by: ${requester}`);
    }
  }
  
  /**
   * Transition to a new phase
   */
  public transitionTo(newPhase: CameraPhase, owner?: CameraOwner): TransitionResult {
    const currentPhase = this.state.phase;
    
    // Validate ownership
    if (owner && this.state.owner !== 'none' && this.state.owner !== owner) {
      console.warn(`${LOG_PREFIX} Transition blocked - wrong owner: ${owner} vs ${this.state.owner}`);
      return {
        success: false,
        previousPhase: currentPhase,
        newPhase: currentPhase,
        error: `Not owner. Current owner: ${this.state.owner}`,
      };
    }
    
    // Check if transition is valid
    const validNextPhases = VALID_TRANSITIONS[currentPhase];
    if (!validNextPhases.includes(newPhase)) {
      console.warn(`${LOG_PREFIX} Invalid transition: ${currentPhase} -> ${newPhase}`);
      return {
        success: false,
        previousPhase: currentPhase,
        newPhase: currentPhase,
        error: `Invalid transition from ${currentPhase} to ${newPhase}`,
      };
    }
    
    // Clear any pending timeout
    this.clearInitializationTimeout();
    
    // Update state
    this.state.phase = newPhase;
    this.state.lastTransition = Date.now();
    
    if (newPhase === 'ERROR') {
      this.state.error = 'Transition to error state';
    } else if (newPhase === 'IDLE') {
      this.state.error = null;
      this.state.frameCount = 0;
    }
    
    console.log(`${LOG_PREFIX} Phase transition: ${currentPhase} -> ${newPhase} (${PHASE_DESCRIPTIONS[newPhase]})`);
    
    // Set timeout for initialization phases
    if (this.isInitializingPhase(newPhase)) {
      this.setInitializationTimeout(newPhase);
    }
    
    return {
      success: true,
      previousPhase: currentPhase,
      newPhase,
    };
  }
  
  /**
   * Check if phase is an initialization phase
   */
  private isInitializingPhase(phase: CameraPhase): boolean {
    return [
      'INITIALIZING_CAMERA',
      'INITIALIZING_MEDIAPIPE',
      'REQUESTING_PERMISSION',
    ].includes(phase);
  }
  
  /**
   * Set timeout for initialization
   */
  private setInitializationTimeout(phase: CameraPhase): void {
    this.initializationTimeout = setTimeout(() => {
      if (this.state.phase === phase) {
        console.error(`${LOG_PREFIX} Initialization timeout in phase: ${phase}`);
        this.state.error = `Timeout during ${phase}`;
        this.transitionTo('ERROR');
        this.notifyCallbacks('error');
      }
    }, this.INITIALIZATION_TIMEOUT_MS);
  }
  
  /**
   * Clear initialization timeout
   */
  private clearInitializationTimeout(): void {
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
    }
  }
  
  // ============================================================================
  // CAMERA LIFECYCLE
  // ============================================================================
  
  /**
   * Start camera initialization sequence
   * Call this when ready to mount the camera component
   */
  public startCamera(owner: CameraOwner): boolean {
    // Request ownership
    if (!this.requestOwnership(owner)) {
      return false;
    }
    
    // Check current state
    if (this.state.phase !== 'IDLE' && this.state.phase !== 'PERMISSION_GRANTED') {
      console.warn(`${LOG_PREFIX} Cannot start camera from phase: ${this.state.phase}`);
      return false;
    }
    
    // Transition to initializing
    const result = this.transitionTo('INITIALIZING_CAMERA', owner);
    if (!result.success) {
      return false;
    }
    
    this.notifyCallbacks('component_mount');
    return true;
  }
  
  /**
   * Signal that camera is ready (called when first frame received or onCameraReady)
   */
  public signalCameraReady(owner?: CameraOwner): boolean {
    if (owner && this.state.owner !== owner) {
      return false;
    }
    
    if (this.state.phase !== 'INITIALIZING_CAMERA') {
      // Already past this phase, ignore
      if (this.state.phase === 'CAMERA_READY' || 
          this.state.phase === 'INITIALIZING_MEDIAPIPE' ||
          this.state.phase === 'MEDIAPIPE_READY' ||
          this.state.phase === 'CAPTURE_ACTIVE') {
        return true;
      }
      return false;
    }
    
    const result = this.transitionTo('CAMERA_READY', owner);
    if (result.success) {
      this.notifyCallbacks('camera_ready');
    }
    return result.success;
  }
  
  /**
   * Start MediaPipe initialization
   * Should only be called after camera is ready
   */
  public startMediapipe(owner?: CameraOwner): boolean {
    if (owner && this.state.owner !== owner) {
      return false;
    }
    
    if (this.state.phase !== 'CAMERA_READY') {
      console.warn(`${LOG_PREFIX} Cannot start MediaPipe from phase: ${this.state.phase}`);
      return false;
    }
    
    const result = this.transitionTo('INITIALIZING_MEDIAPIPE', owner);
    return result.success;
  }
  
  /**
   * Record frame received from MediaPipe
   * After threshold frames, signals MediaPipe is ready
   */
  public recordFrame(owner?: CameraOwner): boolean {
    if (owner && this.state.owner !== owner) {
      return false;
    }
    
    this.state.frameCount++;
    
    // If we're in INITIALIZING_CAMERA and receive a frame, camera is ready
    if (this.state.phase === 'INITIALIZING_CAMERA') {
      this.signalCameraReady(owner);
      // Automatically start MediaPipe initialization
      this.startMediapipe(owner);
    }
    
    // If we're in INITIALIZING_MEDIAPIPE and have enough frames, MediaPipe is ready
    if (this.state.phase === 'INITIALIZING_MEDIAPIPE') {
      if (this.state.frameCount >= this.FRAME_THRESHOLD_FOR_READY) {
        const result = this.transitionTo('MEDIAPIPE_READY', owner);
        if (result.success) {
          this.notifyCallbacks('mediapipe_ready');
        }
      }
    }
    
    // First frame notification
    if (this.state.frameCount === 1) {
      this.notifyCallbacks('first_frame');
    }
    
    return true;
  }
  
  /**
   * Signal that capture is now active (countdown complete, recording, etc.)
   */
  public signalCaptureActive(owner?: CameraOwner): boolean {
    if (owner && this.state.owner !== owner) {
      return false;
    }
    
    if (this.state.phase !== 'MEDIAPIPE_READY') {
      console.warn(`${LOG_PREFIX} Cannot start capture from phase: ${this.state.phase}`);
      return false;
    }
    
    const result = this.transitionTo('CAPTURE_ACTIVE', owner);
    return result.success;
  }
  
  /**
   * Release all resources
   */
  public releaseAll(owner?: CameraOwner): boolean {
    if (owner && this.state.owner !== 'none' && this.state.owner !== owner) {
      console.warn(`${LOG_PREFIX} Cannot release - not owner`);
      return false;
    }
    
    console.log(`${LOG_PREFIX} Releasing all resources`);
    
    // Clear timeout
    this.clearInitializationTimeout();
    
    // Transition to releasing
    if (this.state.phase !== 'IDLE') {
      this.transitionTo('RELEASING');
      this.notifyCallbacks('release');
      
      // Small delay then go to IDLE
      setTimeout(() => {
        this.state.phase = 'IDLE';
        this.state.owner = 'none';
        this.state.error = null;
        this.state.frameCount = 0;
      }, 100);
    }
    
    return true;
  }
  
  // ============================================================================
  // READINESS CHECKS
  // ============================================================================
  
  /**
   * Check if camera is ready
   */
  public isCameraReady(): boolean {
    return [
      'CAMERA_READY',
      'INITIALIZING_MEDIAPIPE',
      'MEDIAPIPE_READY',
      'CAPTURE_ACTIVE',
    ].includes(this.state.phase);
  }
  
  /**
   * Check if MediaPipe is ready
   */
  public isMediapipeReady(): boolean {
    return [
      'MEDIAPIPE_READY',
      'CAPTURE_ACTIVE',
    ].includes(this.state.phase);
  }
  
  /**
   * Check if frame processing is allowed
   */
  public canProcessFrames(): boolean {
    return this.isMediapipeReady() && this.state.isAppActive;
  }
  
  /**
   * Get full readiness status
   */
  public getReadiness(): ReadinessCheck {
    return {
      cameraReady: this.isCameraReady(),
      mediapipeReady: this.isMediapipeReady(),
      canProcess: this.canProcessFrames(),
      phase: this.state.phase,
      owner: this.state.owner,
    };
  }
  
  /**
   * Get current state (read-only copy)
   */
  public getState(): Readonly<CameraManagerState> {
    return { ...this.state };
  }
  
  /**
   * Get current phase
   */
  public getPhase(): CameraPhase {
    return this.state.phase;
  }
  
  /**
   * Get current owner
   */
  public getOwner(): CameraOwner {
    return this.state.owner;
  }
  
  /**
   * Check if owned by specific module
   */
  public isOwnedBy(owner: CameraOwner): boolean {
    return this.state.owner === owner;
  }
  
  /**
   * Check if available for use
   */
  public isAvailable(): boolean {
    return this.state.owner === 'none' && this.state.phase === 'IDLE';
  }
  
  // ============================================================================
  // CALLBACKS
  // ============================================================================
  
  /**
   * Subscribe to lifecycle events
   */
  public subscribe(callback: LifecycleCallback): () => void {
    this.lifecycleCallbacks.add(callback);
    return () => this.lifecycleCallbacks.delete(callback);
  }
  
  /**
   * Notify all callbacks
   */
  private notifyCallbacks(event: LifecycleEvent): void {
    this.lifecycleCallbacks.forEach(callback => {
      try {
        callback(event, this.getState());
      } catch (e) {
        console.error(`${LOG_PREFIX} Callback error:`, e);
      }
    });
  }
  
  // ============================================================================
  // CLEANUP
  // ============================================================================
  
  /**
   * Destroy the manager (for app shutdown)
   */
  public destroy(): void {
    console.log(`${LOG_PREFIX} Destroying manager`);
    
    this.clearInitializationTimeout();
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    
    this.lifecycleCallbacks.clear();
    
    this.state = {
      phase: 'IDLE',
      owner: 'none',
      error: null,
      lastTransition: Date.now(),
      frameCount: 0,
      isAppActive: true,
    };
  }
}

// Export singleton getter
export const getCameraManager = (): CameraMediapipeManager => {
  return CameraMediapipeManager.getInstance();
};

// Export class for type checking
export { CameraMediapipeManager };

// Export convenience functions
export const isCameraSystemReady = (): boolean => {
  return getCameraManager().isCameraReady();
};

export const isMediapipeSystemReady = (): boolean => {
  return getCameraManager().isMediapipeReady();
};

export const canProcessCameraFrames = (): boolean => {
  return getCameraManager().canProcessFrames();
};
