import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { GPSData } from '../../types';

interface GPSChartProps {
  data: GPSData[];
  metric: 'total_distance' | 'high_intensity_distance' | 'sprint_distance' | 'number_of_sprints';
  title: string;
  color?: string;
}

export const GPSChart: React.FC<GPSChartProps> = ({ data, metric, title, color = '#2563eb' }) => {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Sem dados disponíveis</Text>
      </View>
    );
  }

  // Sort by date and take last 10 records
  const sortedData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-10);

  const chartData = sortedData.map((item) => ({
    value: item[metric] as number,
    label: item.date.split('-')[2], // Show only day
    date: item.date,
  }));

  const maxValue = Math.max(...chartData.map(d => d.value));
  const minValue = Math.min(...chartData.map(d => d.value));
  const avgValue = chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Média</Text>
          <Text style={styles.statValue}>{avgValue.toFixed(0)}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Máximo</Text>
          <Text style={styles.statValue}>{maxValue.toFixed(0)}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Mínimo</Text>
          <Text style={styles.statValue}>{minValue.toFixed(0)}</Text>
        </View>
      </View>

      <LineChart
        data={chartData}
        width={Dimensions.get('window').width - 64}
        height={200}
        color={color}
        thickness={3}
        startFillColor={color}
        endFillColor={color}
        startOpacity={0.4}
        endOpacity={0.1}
        areaChart
        curved
        spacing={40}
        initialSpacing={10}
        noOfSections={4}
        yAxisColor="#e5e7eb"
        xAxisColor="#e5e7eb"
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        hideDataPoints={false}
        dataPointsColor={color}
        dataPointsRadius={4}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  axisText: {
    fontSize: 10,
    color: '#9ca3af',
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
});
