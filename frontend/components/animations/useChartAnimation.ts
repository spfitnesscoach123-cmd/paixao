import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Returns a progress value (0 -> 1) for animating chart content on mount.
 * Uses the same listener pattern as useAnimatedCounter (proven in codebase).
 */
export function useChartAnimation(duration: number = 800, delay: number = 0): number {
  const [progress, setProgress] = useState(0);
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = animValue.addListener(({ value }) => {
      setProgress(value);
    });

    Animated.timing(animValue, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    return () => {
      animValue.removeListener(id);
    };
  }, []);

  return progress;
}
