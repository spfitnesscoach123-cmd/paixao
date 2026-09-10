import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { GPSData } from '../../types';
import { colors } from '../../constants/theme';

interface GPSChartProps {
  data: GPSData[];
  metric: 'total_distance' | 'high_intensity_distance' | 'sprint_distance' | 'number_of_sprints';
  title: string;
  color?: string;
}

// Extract period name from notes
const extractPeriod = (notes?: string): string => {
  if (!notes) return 'N/A';
  const period = notes.replace('Período: ', '');
  // Shorten period names
  if (period.toLowerCase().includes('1st half')) return '1st Half';
  if (period.toLowerCase().includes('2nd half')) return '2nd Half';
  if (period.toLowerCase().includes('session')) return 'Session (Total)';
  return period;
};

export const GPSChart: React.FC<GPSChartProps> = ({ data, metric, title, color = colors.accent.primary }) => {
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
    period: extractPeriod(item.notes),
  }));

  // Group data by period to show period stats instead of max/min/avg
  const periodStats: { [key: string]: { total: number; count: number } } = {};
  sortedData.forEach(item => {
    const period = extractPeriod(item.notes);
    if (!periodStats[period]) {
      periodStats[period] = { total: 0, count: 0 };
    }
    periodStats[period].total += item[metric] as number;
    periodStats[period].count += 1;
  });

  // Calculate averages per period
  const periodAverages = Object.entries(periodStats).map(([period, stats]) => ({
    period,
    average: stats.total / stats.count,
  }));

  // Sort periods: Session first, then 1st Half, then 2nd Half
  const sortOrder = ['Session (Total)', '1st Half', '2nd Half'];
  periodAverages.sort((a, b) => {
    const indexA = sortOrder.findIndex(s => a.period.includes(s.replace(' (Total)', '')));
    const indexB = sortOrder.findIndex(s => b.period.includes(s.replace(' (Total)', '')));
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      
      <View style={styles.statsRow}>
        {periodAverages.slice(0, 3).map((stat, index) => (
          <View key={stat.period} style={styles.statItem}>
            <Text style={styles.statLabel}>{stat.period}</Text>
            <Text style={[styles.statValue, { color: index === 0 ? colors.accent.primary : colors.text.primary }]}>
              {stat.average.toFixed(0)}
            </Text>
          </View>
        ))}
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
        yAxisColor={colors.border.default}
        xAxisColor={colors.border.default}
        yAxisTextStyle={styles.axisText}
        xAxisLabelTextStyle={styles.axisText}
        hideDataPoints={false}
        dataPointsColor={color}
        dataPointsRadius={4}
        backgroundColor={colors.dark.card}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginBottom: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  axisText: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  emptyContainer: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
});
