import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

interface ComparisonChartProps {
  title: string;
  athletes: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  unit?: string;
}

export const ComparisonChart: React.FC<ComparisonChartProps> = ({ title, athletes, unit = '' }) => {
  const barData = athletes.map(athlete => ({
    value: athlete.value,
    label: athlete.name.split(' ')[0], // First name only
    frontColor: athlete.color,
    gradientColor: athlete.color,
    spacing: 2,
  }));

  const maxValue = Math.max(...athletes.map(a => a.value));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      
      <BarChart
        data={barData}
        width={Dimensions.get('window').width - 64}
        height={200}
        barWidth={40}
        spacing={24}
        roundedTop
        roundedBottom
        hideRules
        xAxisThickness={0}
        yAxisThickness={0}
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.labelText}
        noOfSections={4}
        maxValue={maxValue * 1.2}
        showGradient
      />

      <View style={styles.legend}>
        {athletes.map((athlete, index) => (
          <View key={index} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: athlete.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {athlete.name}: {athlete.value.toFixed(0)}{unit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20,
  },
  axisText: {
    fontSize: 10,
    color: '#9ca3af',
  },
  labelText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  legend: {
    marginTop: 20,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
  },
});
