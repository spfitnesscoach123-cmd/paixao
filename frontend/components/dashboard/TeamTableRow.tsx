import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ZoneBar } from './ZoneBar';
import { MiniBar } from './MiniBar';
import { FatigueBar } from './FatigueBar';
import type { TeamTableRowData } from './types';

const STATUS_COLORS: Record<string, string> = {
  READY: '#10b981',
  ATTENTION: '#f59e0b',
  NOT_READY: '#ef4444',
  UNKNOWN: '#475569',
};

interface Props {
  row: TeamTableRowData;
  maxDistance: number;
  maxSprints: number;
  maxAccDec: number;
  visibleCols: Record<string, boolean>;
  onPress: (row: TeamTableRowData) => void;
  colors: any;
  locale: string;
}

export const TeamTableRowItem = React.memo(function TeamTableRowItem({
  row,
  maxDistance,
  maxSprints,
  maxAccDec,
  visibleCols,
  onPress,
  colors,
  locale,
}: Props) {
  const statusColor = STATUS_COLORS[row.readiness_status] || STATUS_COLORS.UNKNOWN;
  const distKm = (row.total_distance / 1000).toFixed(1);

  const handlePress = React.useCallback(() => {
    onPress(row);
  }, [onPress, row]);

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border.default }]}
      onPress={handlePress}
      activeOpacity={0.7}
      data-testid={`table-row-${row.athlete_id}`}
    >
      {/* COL 1: ATLETA */}
      <View style={styles.colAthlete}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <View style={styles.athleteText}>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={[styles.position, { color: colors.text.tertiary }]} numberOfLines={1}>
            {row.position}
          </Text>
        </View>
      </View>

      {/* COL 2: TOTAL DISTANCE */}
      <View style={styles.colMetric}>
        <Text style={[styles.metricValue, { color: colors.text.primary }]}>{distKm}</Text>
        <Text style={[styles.metricUnit, { color: colors.text.tertiary }]}>km</Text>
        <MiniBar value={row.total_distance} maxValue={maxDistance} color="#3b82f6" />
      </View>

      {/* COL 3: ZONES (stacked bar) */}
      {visibleCols.zones && (
        <View style={styles.colZones}>
          <ZoneBar z3={row.z3} z4={row.z4} z5={row.z5} />
          <View style={styles.zoneLabels}>
            <Text style={[styles.zoneLabelText, { color: '#3b82f6' }]}>{(row.z3 / 1000).toFixed(1)}</Text>
            <Text style={[styles.zoneLabelText, { color: '#f59e0b' }]}>{(row.z4 / 1000).toFixed(1)}</Text>
            <Text style={[styles.zoneLabelText, { color: '#ef4444' }]}>{(row.z5 / 1000).toFixed(1)}</Text>
          </View>
        </View>
      )}

      {/* COL 4: SPRINT COUNT */}
      {visibleCols.sprint && (
        <View style={styles.colSmall}>
          <Text style={[styles.metricValue, { color: colors.text.primary }]}>{row.sprint_count}</Text>
          <MiniBar value={row.sprint_count} maxValue={maxSprints} color="#8b5cf6" />
        </View>
      )}

      {/* COL 5: ACC/DEC */}
      {visibleCols.accDec && (
        <View style={styles.colSmall}>
          <Text style={[styles.metricValue, { color: colors.text.primary }]}>{row.acc_dec}</Text>
          <MiniBar value={row.acc_dec} maxValue={maxAccDec} color="#6366f1" />
        </View>
      )}

      {/* COL 6: RSIMOD */}
      <View style={styles.colRsi}>
        <View style={styles.rsiRow}>
          <Text style={[styles.metricValue, { color: colors.text.primary }]}>
            {row.rsimod != null ? row.rsimod.toFixed(2) : '-'}
          </Text>
          {row.rsimod_delta != null && (
            <Ionicons
              name={row.rsimod_delta >= 0 ? 'arrow-up' : 'arrow-down'}
              size={12}
              color={row.rsimod_delta >= 0 ? '#10b981' : '#ef4444'}
            />
          )}
        </View>
        {row.rsimod_delta != null && (
          <Text
            style={[
              styles.deltaText,
              { color: row.rsimod_delta >= 0 ? '#10b981' : '#ef4444' },
            ]}
          >
            {row.rsimod_delta >= 0 ? '+' : ''}{row.rsimod_delta.toFixed(1)}%
          </Text>
        )}
      </View>

      {/* COL 7: FADIGA */}
      <View style={styles.colFatigue}>
        <Text style={[styles.fatigueValue, { color: STATUS_COLORS[row.fatigue_status] || colors.text.tertiary }]}>
          {row.fatigue_index != null ? `${row.fatigue_index.toFixed(0)}%` : '-'}
        </Text>
        <FatigueBar value={row.fatigue_index} status={row.fatigue_status} />
      </View>

      {/* COL 8: BODY COMP */}
      <View style={styles.colBody}>
        <Text style={[styles.bodyText, { color: colors.text.secondary }]}>
          {row.weight != null ? `${row.weight}kg` : '-'}
        </Text>
        <Text style={[styles.bodyText, { color: colors.text.secondary }]}>
          {row.body_fat != null ? `${row.body_fat}%` : '-'}
        </Text>
        <Text style={[styles.bodyTextSmall, { color: colors.text.tertiary }]}>
          {row.lean_mass != null ? `${row.lean_mass}kg LM` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  colAthlete: {
    width: 120,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  athleteText: {
    flex: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
  },
  position: {
    fontSize: 10,
    marginTop: 1,
  },
  colMetric: {
    width: 70,
    paddingHorizontal: 4,
    gap: 2,
  },
  colZones: {
    width: 90,
    paddingHorizontal: 4,
    gap: 3,
  },
  zoneLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  zoneLabelText: {
    fontSize: 8,
    fontWeight: '600',
  },
  colSmall: {
    width: 50,
    paddingHorizontal: 4,
    gap: 2,
  },
  colRsi: {
    width: 65,
    paddingHorizontal: 4,
  },
  rsiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: '600',
  },
  colFatigue: {
    width: 60,
    paddingHorizontal: 4,
    gap: 3,
  },
  fatigueValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  colBody: {
    width: 65,
    paddingHorizontal: 4,
  },
  bodyText: {
    fontSize: 10,
  },
  bodyTextSmall: {
    fontSize: 9,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  metricUnit: {
    fontSize: 9,
    marginTop: -2,
  },
});
