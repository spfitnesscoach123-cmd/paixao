import React from 'react';
import { View, StyleSheet } from 'react-native';

const STATUS_COLORS: Record<string, string> = {
  READY: '#10b981',
  ATTENTION: '#f59e0b',
  NOT_READY: '#ef4444',
  UNKNOWN: '#475569',
};

interface FatigueBarProps {
  value: number | null;
  status: string;
}

export const FatigueBar = React.memo(function FatigueBar({ value, status }: FatigueBarProps) {
  const pct = value != null ? Math.min(value, 100) : 0;
  const color = STATUS_COLORS[status] || STATUS_COLORS.UNKNOWN;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
