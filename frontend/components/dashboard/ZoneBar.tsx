import React from 'react';
import { View, StyleSheet } from 'react-native';

const ZONE_COLORS = {
  z3: '#3b82f6',
  z4: '#f59e0b',
  z5: '#ef4444',
};

interface ZoneBarProps {
  z3: number;
  z4: number;
  z5: number;
}

export const ZoneBar = React.memo(function ZoneBar({ z3, z4, z5 }: ZoneBarProps) {
  const total = z3 + z4 + z5;
  if (total === 0) {
    return <View style={styles.emptyBar} />;
  }

  const pZ3 = (z3 / total) * 100;
  const pZ4 = (z4 / total) * 100;
  const pZ5 = (z5 / total) * 100;

  return (
    <View style={styles.bar}>
      {pZ3 > 0 && (
        <View style={[styles.segment, { width: `${pZ3}%`, backgroundColor: ZONE_COLORS.z3 }]} />
      )}
      {pZ4 > 0 && (
        <View style={[styles.segment, { width: `${pZ4}%`, backgroundColor: ZONE_COLORS.z4 }]} />
      )}
      {pZ5 > 0 && (
        <View style={[styles.segment, { width: `${pZ5}%`, backgroundColor: ZONE_COLORS.z5 }]} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  segment: {
    height: '100%',
  },
  emptyBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
