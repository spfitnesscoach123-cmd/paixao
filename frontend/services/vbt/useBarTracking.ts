/**
 * useBarTracking Hook
 * 
 * React hook for managing barbell tracking state and velocity calculations.
 * Provides a clean interface for the VBT Camera screen.
 * 
 * USAGE:
 * const { startTracking, stopTracking, velocityData, repCount } = useBarTracking({
 *   loadKg: 100,
 *   cameraHeight: 100,
 *   cameraDistance: 150,
 * });
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  BarTrackerState,
  BarPositionSimulator,
  VelocityData,
  createDefaultConfig,
  BarPosition,
} from './barTracker';

export interface BarTrackingConfig {
  loadKg: number;
  cameraHeight: number;  // cm
  cameraDistance: number; // cm
  useSimulation?: boolean; // Default true for dev, false for production
}

export interface RepData {
  rep: number;
  meanVelocity: number;
  peakVelocity: number;
  velocityDrop: number;
  timestamp: number;
}

export interface BarTrackingResult {
  // State
  isTracking: boolean;
  currentVelocity: number;
  peakVelocity: number;
  meanVelocity: number;
  velocityDrop: number;
  repCount: number;
  phase: 'concentric' | 'eccentric' | 'stationary';
  feedbackColor: 'green' | 'red' | 'neutral';
  repsData: RepData[];
  
  // Actions
  startTracking: () => void;
  stopTracking: () => void;
  resetTracking: () => void;
  
  // For real tracking integration
  processFrame: (position: BarPosition) => void;
}

const VELOCITY_DROP_THRESHOLD = 10; // 10% drop = red feedback
const TRACKING_INTERVAL = 33; // ~30 fps for simulation

export function useBarTracking(config: BarTrackingConfig): BarTrackingResult {
  const [isTracking, setIsTracking] = useState(false);
  const [currentVelocity, setCurrentVelocity] = useState(0);
  const [peakVelocity, setPeakVelocity] = useState(0);
  const [meanVelocity, setMeanVelocity] = useState(0);
  const [velocityDrop, setVelocityDrop] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [phase, setPhase] = useState<'concentric' | 'eccentric' | 'stationary'>('stationary');
  const [feedbackColor, setFeedbackColor] = useState<'green' | 'red' | 'neutral'>('neutral');
  const [repsData, setRepsData] = useState<RepData[]>([]);
  
  // Refs for tracker instances
  const trackerRef = useRef<BarTrackerState | null>(null);
  const simulatorRef = useRef<BarPositionSimulator | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRepCountRef = useRef(0);
  
  // Initialize tracker with config
  useEffect(() => {
    const trackerConfig = createDefaultConfig({
      heightCm: config.cameraHeight,
      distanceCm: config.cameraDistance,
    });
    trackerRef.current = new BarTrackerState(trackerConfig);
    
    // Initialize simulator for dev/testing
    if (config.useSimulation !== false) {
      simulatorRef.current = new BarPositionSimulator(config.loadKg);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [config.cameraHeight, config.cameraDistance, config.loadKg, config.useSimulation]);
  
  /**
   * Process velocity data and update state
   */
  const processVelocityData = useCallback((data: VelocityData) => {
    setCurrentVelocity(Math.round(data.instantVelocity * 100) / 100);
    setMeanVelocity(Math.round(data.meanVelocity * 100) / 100);
    setPhase(data.phase);
    setVelocityDrop(data.velocityDrop);
    
    // Update peak velocity
    if (data.instantVelocity > peakVelocity) {
      setPeakVelocity(Math.round(data.instantVelocity * 100) / 100);
    }
    
    // Update feedback color based on velocity drop
    if (data.velocityDrop > VELOCITY_DROP_THRESHOLD) {
      setFeedbackColor('red');
    } else if (data.instantVelocity > 0.1) {
      setFeedbackColor('green');
    } else {
      setFeedbackColor('neutral');
    }
    
    // Handle rep completion
    if (data.repComplete) {
      const tracker = trackerRef.current;
      if (tracker) {
        const newRepCount = tracker.getRepCount();
        
        // Only add rep data if it's a new rep
        if (newRepCount > lastRepCountRef.current) {
          lastRepCountRef.current = newRepCount;
          setRepCount(newRepCount);
          
          const newRepData: RepData = {
            rep: newRepCount,
            meanVelocity: Math.round(data.meanVelocity * 100) / 100,
            peakVelocity: Math.round(data.peakVelocity * 100) / 100,
            velocityDrop: data.velocityDrop,
            timestamp: Date.now(),
          };
          
          setRepsData(prev => [...prev, newRepData]);
        }
      }
    }
  }, [peakVelocity]);
  
  /**
   * Process a single frame position (for real tracking)
   */
  const processFrame = useCallback((position: BarPosition) => {
    if (!trackerRef.current || !isTracking) return;
    
    const velocityData = trackerRef.current.processPosition(position);
    processVelocityData(velocityData);
  }, [isTracking, processVelocityData]);
  
  /**
   * Start tracking - uses simulation or waits for processFrame calls
   */
  const startTracking = useCallback(() => {
    // Reset state
    setIsTracking(true);
    setCurrentVelocity(0);
    setPeakVelocity(0);
    setMeanVelocity(0);
    setVelocityDrop(0);
    setRepCount(0);
    setPhase('stationary');
    setFeedbackColor('neutral');
    setRepsData([]);
    lastRepCountRef.current = 0;
    
    // Reset tracker
    if (trackerRef.current) {
      trackerRef.current.reset();
    }
    
    // Start simulation if enabled
    if (config.useSimulation !== false && simulatorRef.current) {
      simulatorRef.current.reset();
      
      intervalRef.current = setInterval(() => {
        if (simulatorRef.current && trackerRef.current) {
          const position = simulatorRef.current.getNextPosition();
          const velocityData = trackerRef.current.processPosition(position);
          processVelocityData(velocityData);
        }
      }, TRACKING_INTERVAL);
    }
  }, [config.useSimulation, processVelocityData]);
  
  /**
   * Stop tracking
   */
  const stopTracking = useCallback(() => {
    setIsTracking(false);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);
  
  /**
   * Reset all tracking state
   */
  const resetTracking = useCallback(() => {
    stopTracking();
    setCurrentVelocity(0);
    setPeakVelocity(0);
    setMeanVelocity(0);
    setVelocityDrop(0);
    setRepCount(0);
    setPhase('stationary');
    setFeedbackColor('neutral');
    setRepsData([]);
    lastRepCountRef.current = 0;
    
    if (trackerRef.current) {
      trackerRef.current.reset();
    }
    if (simulatorRef.current) {
      simulatorRef.current.reset();
    }
  }, [stopTracking]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  return {
    isTracking,
    currentVelocity,
    peakVelocity,
    meanVelocity,
    velocityDrop,
    repCount,
    phase,
    feedbackColor,
    repsData,
    startTracking,
    stopTracking,
    resetTracking,
    processFrame,
  };
}
