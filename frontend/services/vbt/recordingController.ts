/**
 * RecordingController - Single Source of Truth for Recording State
 * 
 * This controller manages the recording state globally, ensuring that
 * the RECORDING state is never dependent on fragile method calls.
 * 
 * USAGE:
 * - Call recordingController.start() when recording button is pressed
 * - Call recordingController.stop() when recording stops
 * - Check recordingController.isActive() to determine recording state
 * 
 * NEVER call ProgressiveStateMachine.setRecordingActive() directly.
 * The state machine reads from this controller automatically.
 */

class RecordingController {
  private isRecording: boolean = false;
  private startTimestamp: number = 0;

  start(): void {
    this.isRecording = true;
    this.startTimestamp = Date.now();
    console.log("[VBT_RECORDING] STARTED", this.startTimestamp);
  }

  stop(): void {
    this.isRecording = false;
    console.log("[VBT_RECORDING] STOPPED");
  }

  isActive(): boolean {
    return this.isRecording;
  }

  getStartTime(): number {
    return this.startTimestamp;
  }

  /**
   * Reset recording state (for full system reset)
   */
  reset(): void {
    this.isRecording = false;
    this.startTimestamp = 0;
    console.log("[VBT_RECORDING] RESET");
  }
}

// Singleton export - SINGLE SOURCE OF TRUTH
export const recordingController = new RecordingController();
