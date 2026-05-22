import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { TeamTableRowItem } from './TeamTableRow';
import { InfoTooltip } from './StackedBarChart';
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
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
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
      {/* Section Title with info icon */}
      <View style={styles.titleRow}>
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
          {locale === 'pt' ? 'Tabela Analítica' : 'Analytics Table'}
        </Text>
        <TouchableOpacity
          onPress={() => setTooltipVisible(true)}
          data-testid="team-table-info"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Column Toggle */}
      <View style={styles.toggleRow}>
        {TOGGLE_COLS.map(col => (
          <TouchableOpacity
            key={col.key}
            style={[
              styles.toggleBtn,
              {
                backgroundColor: visibleCols[col.key]
                  ? 'rgba(47, 182, 255, 0.15)'
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

      {/* Table Header + Body wrapped in horizontal scroll.
          minWidth: '100%' on inner View ensures table stretches full card width when it fits,
          and scrolls horizontally when it doesn't (colAthlete flex:1 absorbs extra space). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        directionalLockEnabled
        nestedScrollEnabled
        contentContainerStyle={{ minWidth: '100%' }}
      >
        <View style={{ minWidth: '100%' }}>
          {/* HEADER */}
          <View style={[styles.headerRow, { borderBottomColor: colors.border.default }]}>
            <TouchableOpacity style={styles.colAthlete} onPress={() => handleSort('name')} data-testid="sort-name">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                {locale === 'pt' ? 'Atleta' : 'Athlete'}
              </Text>
              <SortIcon colKey="name" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.colMetric} onPress={() => handleSort('total_distance')} data-testid="sort-distance">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                {locale === 'pt' ? 'Dist. (km)' : 'Dist. (km)'}
              </Text>
              <SortIcon colKey="total_distance" />
            </TouchableOpacity>

            {visibleCols.zones && (
              <TouchableOpacity style={styles.colZones} onPress={() => handleSort('z3')} data-testid="sort-zones">
                <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                  {locale === 'pt' ? 'Zonas (m)' : 'Zones (m)'}
                </Text>
                <SortIcon colKey="z3" />
              </TouchableOpacity>
            )}

            {visibleCols.sprint && (
              <TouchableOpacity style={styles.colSmall} onPress={() => handleSort('sprint_count')} data-testid="sort-sprint">
                <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                  {locale === 'pt' ? 'SPR (n)' : 'SPR (n)'}
                </Text>
                <SortIcon colKey="sprint_count" />
              </TouchableOpacity>
            )}

            {visibleCols.accDec && (
              <TouchableOpacity style={styles.colSmall} onPress={() => handleSort('acc_dec')} data-testid="sort-accdec">
                <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                  {locale === 'pt' ? 'A/D (n)' : 'A/D (n)'}
                </Text>
                <SortIcon colKey="acc_dec" />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.colRsi} onPress={() => handleSort('rsimod')} data-testid="sort-rsi">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>RSImod</Text>
              <SortIcon colKey="rsimod" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.colFatigue} onPress={() => handleSort('fatigue_index')} data-testid="sort-readiness">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                {locale === 'pt' ? 'Prontidão' : 'Readiness'}
              </Text>
              <SortIcon colKey="fatigue_index" />
            </TouchableOpacity>

            <View style={styles.colPain} data-testid="col-pain-header">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                {locale === 'pt' ? 'Dor' : 'Pain'}
              </Text>
            </View>

            <TouchableOpacity style={styles.colFatigue} onPress={() => handleSort('rsimod')} data-testid="sort-cmj-fatigue">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>
                {locale === 'pt' ? 'Fadiga (%)' : 'Fatigue (%)'}
              </Text>
              <SortIcon colKey="rsimod" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.colBody} onPress={() => handleSort('body_fat')} data-testid="sort-body">
              <Text style={[styles.headerText, { color: colors.text.secondary }]}>Body</Text>
              <SortIcon colKey="body_fat" />
            </TouchableOpacity>
          </View>

          {/* ROWS */}
          <View style={{ minHeight: Math.min(sortedRows.length * 56, 560) }}>
            <FlashList
              data={sortedRows}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              estimatedItemSize={56}
              scrollEnabled={false}
              nestedScrollEnabled
            />
          </View>
        </View>
      </ScrollView>

      <InfoTooltip
        visible={tooltipVisible}
        onClose={() => setTooltipVisible(false)}
        colors={colors}
        title={locale === 'pt' ? 'Tabela Analítica' : 'Analytics Table'}
        body={
          locale === 'pt'
            ? 'Linhas por atleta com métricas agregadas do período:\n\n• Dist. (km) — distância total percorrida\n• Zonas (m) — distância em Z3 / Z4 / Z5 em metros\n• SPR (n) — número de sprints (picos > 25.2 km/h)\n• A/D (n) — número de acelerações/desacelerações significativas\n• RSImod — Reactive Strength Index modificado (adim.)\n• Prontidão — derivada dos dados de wellness reportados pelo atleta (sono, recuperação, percepção).\n• Fadiga (%) — Índice de Fadiga Neuromuscular calculado a partir da variação do RSImod no CMJ em relação ao baseline (últimos 28d) do atleta.\n• Composição corporal — %Gordura / Massa magra (kg)\n\nClique nos cabeçalhos para ordenar. Use as chips no topo para mostrar/ocultar colunas.'
            : 'Rows per athlete with aggregated period metrics:\n\n• Dist. (km) — total distance covered\n• Zones (m) — distance in Z3 / Z4 / Z5 in meters\n• SPR (n) — sprint count (peaks > 25.2 km/h)\n• A/D (n) — significant accel/decel events\n• RSImod — modified Reactive Strength Index (unitless)\n• Readiness — derived from athlete-reported wellness data (sleep, recovery, perception).\n• Fatigue (%) — Neuromuscular Fatigue Index computed from CMJ RSImod variation vs the athlete\'s 28-day baseline.\n• Body composition — body fat % / lean mass (kg)\n\nTap column headers to sort. Use chips at the top to show/hide columns.'
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
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
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  colMetric: {
    width: 88,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colZones: {
    width: 118,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colSmall: {
    width: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colRsi: {
    width: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colFatigue: {
    width: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colPain: {
    width: 130,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  colBody: {
    width: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
});
