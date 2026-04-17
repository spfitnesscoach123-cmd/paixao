import React from 'react';
import { View, StyleSheet } from 'react-native';

interface MiniBarProps {
  value: number;
  maxValue: number;
  color: string;
}

export const MiniBar = React.memo(function MiniBar({ value, maxValue, color }: MiniBarProps) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
