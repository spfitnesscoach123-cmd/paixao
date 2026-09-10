import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import RNSlider from '@react-native-community/slider';

interface SliderProps {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  unit?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  onValueChange,
  minimumValue = 1,
  maximumValue = 10,
  step = 1,
  unit = '',
}) => {
  const getColor = () => {
    const percentage = (value - minimumValue) / (maximumValue - minimumValue);
    if (percentage < 0.33) return '#ef4444';
    if (percentage < 0.66) return '#f59e0b';
    return '#10b981';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.valueBadge, { backgroundColor: getColor() }]}>
          <Text style={styles.valueText}>
            {value}{unit}
          </Text>
        </View>
      </View>
      <RNSlider
        style={styles.slider}
        value={value}
        onValueChange={onValueChange}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        minimumTrackTintColor={getColor()}
        maximumTrackTintColor="#e5e7eb"
        thumbTintColor={getColor()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  valueBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  valueText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  slider: {
    width: '100%',
    height: 40,
  },
});
