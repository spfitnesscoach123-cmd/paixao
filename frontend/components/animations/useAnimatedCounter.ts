import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Animated counter hook using RN Animated API (web-safe).
 * Animates from 0 to target value with easing.
 */
export function useAnimatedCounter(
  targetValue: number,
  duration: number = 700,
  decimals: number = 0,
  enabled: boolean = true
): string {
  const animValue = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(enabled ? '0' : formatNumber(targetValue, decimals));
  const prevTarget = useRef(0);

  useEffect(() => {
    if (!enabled || typeof targetValue !== 'number' || isNaN(targetValue)) {
      setDisplay(formatNumber(targetValue || 0, decimals));
      return;
    }

    animValue.setValue(prevTarget.current);
    prevTarget.current = targetValue;

    const listener = animValue.addListener(({ value }) => {
      setDisplay(formatNumber(value, decimals));
    });

    Animated.timing(animValue, {
      toValue: targetValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    return () => {
      animValue.removeListener(listener);
    };
  }, [targetValue, enabled]);

  return display;
}

function formatNumber(val: number, decimals: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '0';
  if (decimals === 0) return Math.round(val).toLocaleString('pt-BR');
  return val.toFixed(decimals);
}
