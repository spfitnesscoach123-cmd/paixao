import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TeamTableRowItem } from './TeamTableRow';
import type { TeamTableRowData, SortKey, SortDir } from './types';

const TOGGLE_COLS = [
  { key: 'zones', label: 'Zonas', labelEn: 'Zones' },
  { key: 'sprint', label: 'Sprint', labelEn: 'Sprint' },
  { key: 'accDec', label: 'ACC/DEC', labelEn: 'ACC/DEC' },
] as const;

interface Props {
  rows: TeamTableRowData[];
  isLoading: boolean;
  colors: any;
  locale: string;
  onRowPress: (row: TeamTableRowData) => void;
}

export function TeamTable({ rows, isLoading, colors, locale, onRowPress }: Props) {
  const [sortKey, setSortKey] = React.useState<SortKey>('total_distance');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [visibleCols, setVisibleCols] = React.useState<Record<string, boolean>>({
    zones: true,
    sprint: true,
    accDec: true,
  });

  // Toggle sort
  const handleSort = React.useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
        return key;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  // Toggle column visibility
  const toggleCol = React.useCallback((key: string) => {
    setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Sort rows
  const sortedRows = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const aVal = a[sortKey] ?? -Infinity;
      const bVal = b[sortKey] ?? -Infinity;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal) || 0;
      const numB = Number(bVal) || 0;
      return sortDir === 'asc' ? numA - numB : numB - numA;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  // Compute max values for proportional bars (no recalculation of metrics!)
  const maxValues = React.useMemo(() => ({
    distance: Math.max(...rows.map(r => r.total_distance), 1),
    sprints: Math.max(...rows.map(r => r.sprint_count), 1),
    accDec: Math.max(...rows.map(r => r.acc_dec), 1),
  }), [rows]);

  const keyExtractor = React.useCallback((item: TeamTableRowData) => item.athlete_id, []);

  const renderItem = React.useCallback(({ item }: { item: TeamTableRowData }) => (
    <TeamTableRowItem
      row={item}
      maxDistance={maxValues.distance}
      maxSprints={maxValues.sprints}
      maxAccDec={maxValues.accDec}
      visibleCols={visibleCols}
      onPress={onRowPress}
      colors={colors}
      locale={locale}
    />
  ), [maxValues, visibleCols, onRowPress, colors, locale]);

  const SortIcon = React.useCallback(({ colKey }: { colKey: SortKey }) => {
    if (sortKey !== colKey) return null;
    return (
      <Ionicons
        name={sortDir === 'desc' ? 'caret-down' : 'caret-up'}
        size={10}
        color={colors.accent.primary}
        style={{ marginLeft: 2 }}
      />
    );
  }, [sortKey, sortDir, colors]);

  if (isLoading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.dark.cardSolid }]}>
        <ActivityIndicator size="small" color={colors.accent.primary} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[styles.emptyWrap, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]}>
        <Ionicons name="analytics-outline" size={32} color={colors.text.tertiary} />
        <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
          {locale === 'pt' ? 'Nenhum dado disponível' : 'No data available'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.dark.cardSolid, borderColor: colors.border.default }]} data-testid="team-analytics-table">
      {/* Column Toggle */}
      <View style={styles.toggleRow}>
        {TOGGLE_COLS.map(col => (
          <TouchableOpacity
            key={col.key}
            style={[
              styles.toggleBtn,
              {
                backgroundColor: visibleCols[col.key]
                  ? 'rgba(139, 92, 246, 0.15)'
                  : colors.dark.secondary,
                borderColor: visibleCols[col.key]
                  ? colors.accent.primary
                  : colors.border.default,
              },
            ]}
            onPress={() => toggleCol(col.key)}
            data-testid={`toggle-col-${col.key}`}
          >
            <Text
              style={[
                styles.toggleText,
                { color: visibleCols[col.key] ? colors.accent.primary : colors.text.tertiary },
              ]}
            >
              {locale === 'pt' ? col.label : col.labelEn}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Table Header + Body wrapped in horizontal scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <View>
          {/* HEADER */}
          <View style={[styles.headerRow, { borderBottomColor: colors.border.default }]}>
            <TouchableOpacity style={styles.colAthlete} onPress={() => handleSort('name')} data-testid="sort-name">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                {locale === 'pt' ? 'Atleta' : 'Athlete'}
              </Text>
              <SortIcon colKey="name" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.colMetric} onPress={() => handleSort('total_distance')} data-testid="sort-distance">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>Dist.</Text>
              <SortIcon colKey="total_distance" />
            </TouchableOpacity>

            {visibleCols.zones && (
              <TouchableOpacity style={styles.colZones} onPress={() => handleSort('z3')} data-testid="sort-zones">
                <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                  {locale === 'pt' ? 'Zonas' : 'Zones'}
                </Text>
                <SortIcon colKey="z3" />
              </TouchableOpacity>
            )}

            {visibleCols.sprint && (
              <TouchableOpacity style={styles.colSmall} onPress={() => handleSort('sprint_count')} data-testid="sort-sprint">
                <Text style={[styles.headerText, { color: colors.text.secondary }]}>SPR</Text>
                <SortIcon colKey="sprint_count" />
              </TouchableOpacity>
            )}

            {visibleCols.accDec && (
              <TouchableOpacity style={styles.colSmall} onPress={() => handleSort('acc_dec')} data-testid="sort-accdec">
                <Text style={[styles.headerText, { color: colors.text.secondary }]}>A/D</Text>
                <SortIcon colKey="acc_dec" />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.colRsi} onPress={() => handleSort('rsimod')} data-testid="sort-rsi">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>RSI</Text>
              <SortIcon colKey="rsimod" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.colFatigue} onPress={() => handleSort('fatigue_index')} data-testid="sort-fatigue">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                {locale === 'pt' ? 'Fadiga' : 'Fatigue'}
              </Text>
              <SortIcon colKey="fatigue_index" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.colBody} onPress={() => handleSort('body_fat')} data-testid="sort-body">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>Body</Text>
              <SortIcon colKey="body_fat" />
            </TouchableOpacity>
          </View>

          {/* ROWS */}
          <FlatList
            data={sortedRows}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews
            getItemLayout={(_data, index) => ({
              length: 56,
              offset: 56 * index,
              index,
            })}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  loadingWrap: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyWrap: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colAthlete: {
    width: 120,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  colMetric: {
    width: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colZones: {
    width: 90,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colSmall: {
    width: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colRsi: {
    width: 65,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colFatigue: {
    width: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colBody: {
    width: 65,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
});
