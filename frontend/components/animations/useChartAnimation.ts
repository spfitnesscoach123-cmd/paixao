import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import {
  useSharedValue,
  withTiming,
  withDelay,
  Easing as REasing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';

// ---- Reduce Motion Detection (singleton, cross-platform) ----
let _rmInit = false;
let _rmVal = false;
const _rmSubs = new Set<(v: boolean) => void>();

function initReduceMotion() {
  if (_rmInit) return;
  _rmInit = true;
  if (Platform.OS === 'web') {
    try {
      const mq = typeof window !== 'undefined'
        ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
        : null;
      if (mq) {
        _rmVal = mq.matches;
        mq.addEventListener('change', (e: MediaQueryListEvent) => {
          _rmVal = e.matches;
          _rmSubs.forEach(fn => fn(e.matches));
        });
      }
    } catch {}
  } else {
    AccessibilityInfo.isReduceMotionEnabled().then(v => {
      _rmVal = v;
      _rmSubs.forEach(fn => fn(v));
    });
    AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => {
      _rmVal = v;
      _rmSubs.forEach(fn => fn(v));
    });
  }
}

export function useReduceMotionPreference(): boolean {
  initReduceMotion();
  const [rm, setRm] = useState(_rmVal);
  useEffect(() => {
    setRm(_rmVal);
    _rmSubs.add(setRm);
    return () => { _rmSubs.delete(setRm); };
  }, []);
  return rm;
}

// ---- Chart Animation Config ----
export interface ChartAnimConfig {
  duration?: number;
  delay?: number;
  deps?: any[];
}

/**
 * Mount progress animation: 0 -> 1
 * Data-driven re-trigger: when deps change, re-animates 0 -> 1 (faster)
 * Reduce motion: returns 1 instantly
 * Reanimated timing engine for smooth native-thread animation
 *
 * Backward compatible:
 *   useChartAnimation(800, 100)                        // legacy
 *   useChartAnimation({ duration: 800, delay: 100, deps: [data] })  // new
 */
export function useChartAnimation(
  arg1: number | ChartAnimConfig = 800,
  arg2: number = 0
): number {
  const cfg = typeof arg1 === 'number' ? { duration: arg1, delay: arg2 } : arg1;
  const { duration = 800, delay = 0, deps } = cfg;
  const reduceMotion = useReduceMotionPreference();
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0);
  const sv = useSharedValue(reduceMotion ? 1 : 0);
  const isFirst = useRef(true);
  const depsKey = deps != null ? JSON.stringify(deps) : '';
  const prevDeps = useRef(depsKey);

  useEffect(() => {
    if (reduceMotion) {
      sv.value = 1;
      setProgress(1);
      return () => cancelAnimation(sv);
    }

    if (isFirst.current) {
      isFirst.current = false;
      sv.value = 0;
      sv.value = withDelay(delay, withTiming(1, {
        duration,
        easing: REasing.out(REasing.cubic),
      }));
    } else if (deps != null && prevDeps.current !== depsKey) {
      cancelAnimation(sv);
      sv.value = 0;
      sv.value = withTiming(1, {
        duration: Math.min(duration, 400),
        easing: REasing.out(REasing.cubic),
      });
    }
    prevDeps.current = depsKey;
    return () => cancelAnimation(sv);
  }, [reduceMotion, depsKey]);

  useAnimatedReaction(
    () => sv.value,
    (val) => { runOnJS(setProgress)(val); },
    [sv]
  );

  return progress;
}

/**
 * Data-driven animated value with smooth transitions.
 * Mount: 0 -> target (with stagger delay)
 * Target change: smoothly transitions from current display value -> new target
 * Reduce motion: snaps to target instantly
 */
export function useAnimatedValue(
  target: number,
  config: Omit<ChartAnimConfig, 'deps'> = {}
): number {
  const { duration = 800, delay = 0 } = config;
  const reduceMotion = useReduceMotionPreference();
  const [display, setDisplay] = useState(reduceMotion ? target : 0);
  const sv = useSharedValue(reduceMotion ? target : 0);
  const isFirst = useRef(true);
  const prev = useRef(target);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(sv);
      sv.value = target;
      setDisplay(target);
      return () => cancelAnimation(sv);
    }

    if (isFirst.current) {
      isFirst.current = false;
      sv.value = withDelay(delay, withTiming(target, {
        duration,
        easing: REasing.out(REasing.cubic),
      }));
    } else if (prev.current !== target) {
      cancelAnimation(sv);
      sv.value = withTiming(target, {
        duration: Math.min(duration, 500),
        easing: REasing.out(REasing.cubic),
      });
    }
    prev.current = target;
    return () => cancelAnimation(sv);
  }, [target, reduceMotion]);

  useAnimatedReaction(
    () => sv.value,
    (val) => { runOnJS(setDisplay)(val); },
    [sv]
  );

  return display;
}
