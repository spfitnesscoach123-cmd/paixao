import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { useAnimatedCounter } from './useAnimatedCounter';

interface AnimatedMetricProps {
  value: number;
  style?: StyleProp<TextStyle>;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  enabled?: boolean;
}

/**
 * Animated metric display component.
 * Renders a number that counts up from 0 to the target value.
 */
export const AnimatedMetric: React.FC<AnimatedMetricProps> = ({
  value,
  style,
  duration = 700,
  decimals = 0,
  suffix = '',
  prefix = '',
  enabled = true,
}) => {
  const display = useAnimatedCounter(value, duration, decimals, enabled);
  return <Text style={style}>{prefix}{display}{suffix}</Text>;
};
