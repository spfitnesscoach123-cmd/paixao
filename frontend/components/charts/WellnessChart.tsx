import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { WellnessQuestionnaire } from '../../types';

interface WellnessChartProps {
  data: WellnessQuestionnaire[];
}

export const WellnessChart: React.FC<WellnessChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Sem dados de wellness disponíveis</Text>
      </View>
    );
  }

  // Sort by date and take last 14 records
  const sortedData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  const wellnessData = sortedData.map((item) => ({
    value: item.wellness_score || 0,
    label: item.date.split('-')[2],
  }));

  const readinessData = sortedData.map((item) => ({
    value: item.readiness_score || 0,
    label: item.date.split('-')[2],
  }));

  const avgWellness = wellnessData.reduce((sum, d) => sum + d.value, 0) / wellnessData.length;
  const avgReadiness = readinessData.reduce((sum, d) => sum + d.value, 0) / readinessData.length;

  const getScoreColor = (score: number) => {
    if (score >= 7) return '#10b981';
    if (score >= 5) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Evolução de Wellness & Prontidão</Text>
      
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2563eb' }]} />
          <Text style={styles.legendText}>Wellness ({avgWellness.toFixed(1)})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#8b5cf6' }]} />
          <Text style={styles.legendText}>Prontidão ({avgReadiness.toFixed(1)})</Text>
        </View>
      </View>

      <LineChart
        data={wellnessData}
        data2={readinessData}
        width={Dimensions.get('window').width - 64}
        height={220}
        color="#2563eb"
        color2="#8b5cf6"
        thickness={3}
        curved
        spacing={40}
        initialSpacing={10}
        noOfSections={5}
        maxValue={10}
        yAxisColor="#e5e7eb"
        xAxisColor="#e5e7eb"
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        hideDataPoints={false}
        dataPointsColor="#2563eb"
        dataPointsColor2="#8b5cf6"
        dataPointsRadius={4}
        rulesColor="#e5e7eb"
        rulesType="solid"
      />

      <View style={styles.zonesContainer}>
        <View style={[styles.zone, { backgroundColor: '#dcfce7' }]}>
          <Text style={styles.zoneText}>🟢 Ótimo: 7-10</Text>
        </View>
        <View style={[styles.zone, { backgroundColor: '#fef3c7' }]}>
          <Text style={styles.zoneText}>🟡 Moderado: 5-7</Text>
        </View>
        <View style={[styles.zone, { backgroundColor: '#fee2e2' }]}>
          <Text style={styles.zoneText}>🔴 Atenção: 0-5</Text>
        </View>
      </View>
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
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  axisText: {
    fontSize: 10,
    color: '#9ca3af',
  },
  zonesContainer: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  zone: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  zoneText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
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
