import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTeamTableData } from '../../hooks/useTeamTableData';
import { TeamTable } from '../../components/dashboard/TeamTable';
import { StackedBarChart } from '../../components/dashboard/StackedBarChart';
import { ScatterPlot } from '../../components/dashboard/ScatterPlot';
import { NeuromuscularChart } from '../../components/dashboard/NeuromuscularChart';
import type { TeamTableRowData } from '../../components/dashboard/types';

const DATE_RANGES = [
  { key: 'today', labelPt: 'Hoje', labelEn: 'Today' },
  { key: '7d', labelPt: '7 dias', labelEn: '7 days' },
  { key: '14d', labelPt: '14 dias', labelEn: '14 days' },
  { key: '28d', labelPt: '28 dias', labelEn: '28 days' },
  { key: '90d', labelPt: '90 dias', labelEn: '90 days' },
];

interface BasicTeamResponse {
  stats: { total_athletes: number };
}

export default function TeamDashboard() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedDateRange, setSelectedDateRange] = React.useState('7d');
  const [dateModalVisible, setDateModalVisible] = React.useState(false);

  // Basic team query (for empty state detection)
  const { data: basicData, isLoading: basicLoading, error: basicError, refetch: basicRefetch } = useQuery({
    queryKey: ['team-dashboard-basic'],
    queryFn: async () => {
      const response = await api.get<BasicTeamResponse>(`/dashboard/team?lang=${locale}`);
      return response.data;
    },
  });

  // Table data query
  const { data: tableData, isLoading: tableLoading, refetch: tableRefetch } = useTeamTableData(selectedDateRange);

  useFocusEffect(
    React.useCallback(() => {
      basicRefetch();
      tableRefetch();
    }, [basicRefetch, tableRefetch])
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([basicRefetch(), tableRefetch()]);
    setRefreshing(false);
  }, [basicRefetch, tableRefetch]);

  const handleDateRangeSelect = React.useCallback((rangeKey: string) => {
    setSelectedDateRange(rangeKey);
    setDateModalVisible(false);
  }, []);

  const getCurrentDateRangeLabel = React.useCallback(() => {
    const range = DATE_RANGES.find(r => r.key === selectedDateRange);
    return range ? (locale === 'pt' ? range.labelPt : range.labelEn) : '7 dias';
  }, [selectedDateRange, locale]);

  const handleRowPress = React.useCallback((row: TeamTableRowData) => {
    router.push(`/athlete/${row.athlete_id}`);
  }, [router]);

  const styles = createStyles(colors);

  if (basicLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="pulse" size={32} color={colors.accent.primary} />
        <Text style={styles.loadingText}>
          {locale === 'pt' ? 'Carregando...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  if (basicError || !basicData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning" size={48} color={colors.status.error} />
        <Text style={styles.errorText}>
          {locale === 'pt' ? 'Erro ao carregar dados' : 'Error loading data'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => basicRefetch()}>
          <Text style={styles.retryText}>{locale === 'pt' ? 'Tentar novamente' : 'Try again'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasNoData = basicData.stats.total_athletes === 0;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.gradients.background}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Dashboard da Equipe' : 'Team Dashboard'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {locale === 'pt' ? 'Visão geral do desempenho' : 'Performance overview'}
          </Text>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* CSV IMPORT BUTTON - INTOCÁVEL */}
          <TouchableOpacity
            style={styles.csvImportButton}
            onPress={() => router.push('/upload-csv')}
            activeOpacity={0.8}
            data-testid="csv-import-button"
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.csvImportGradient}
            >
              <Ionicons name="cloud-upload" size={24} color="#ffffff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.csvImportTitle}>
                  {locale === 'pt' ? 'Importar Dados CSV Catapult' : 'Import CSV Catapult Data'}
                </Text>
                <Text style={styles.csvImportSubtitle}>
                  {locale === 'pt' ? 'GPS, Sprint, Aceleração' : 'GPS, Sprint, Acceleration'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>

          {/* EMPTY STATE */}
          {hasNoData && (
            <View style={styles.emptyStateContainer} data-testid="team-empty-state">
              <Ionicons name="people-outline" size={64} color={colors.text.tertiary} />
              <Text style={styles.emptyStateTitle}>
                {locale === 'pt' ? 'Nenhum atleta cadastrado' : 'No athletes registered'}
              </Text>
              <Text style={styles.emptyStateSubtitle}>
                {locale === 'pt'
                  ? 'Adicione atletas para visualizar estatísticas da equipe'
                  : 'Add athletes to view team statistics'}
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => router.push('/add-athlete')}
                data-testid="add-athlete-empty-state-btn"
              >
                <LinearGradient
                  colors={[colors.accent.primary, colors.accent.secondary]}
                  style={styles.emptyStateButtonGradient}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.emptyStateButtonText}>
                    {locale === 'pt' ? 'Adicionar Atleta' : 'Add Athlete'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* DATE FILTER */}
          {!hasNoData && (
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterButton, { borderColor: colors.border.default, backgroundColor: colors.dark.card }]}
                onPress={() => setDateModalVisible(true)}
                data-testid="date-filter-button"
              >
                <Ionicons name="calendar-outline" size={16} color={colors.accent.primary} />
                <Text style={[styles.filterButtonText, { color: colors.text.secondary }]}>
                  {getCurrentDateRangeLabel()}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.text.tertiary} />
              </TouchableOpacity>

              {tableData?.period_label && (
                <Text style={[styles.periodLabel, { color: colors.text.tertiary }]}>
                  {locale === 'pt' ? 'Período:' : 'Period:'} {tableData.period_label}
                </Text>
              )}
            </View>
          )}

          {/* GRÁFICO DE BARRAS EMPILHADAS */}
          {!hasNoData && (
            <StackedBarChart
              rows={tableData?.rows || []}
              isLoading={tableLoading}
              colors={colors}
              locale={locale}
            />
          )}

          {/* GRÁFICO DE DISPERSÃO */}
          {!hasNoData && (
            <ScatterPlot
              rows={tableData?.rows || []}
              isLoading={tableLoading}
              colors={colors}
              locale={locale}
            />
          )}

          {/* GRÁFICO NEUROMUSCULAR */}
          {!hasNoData && (
            <NeuromuscularChart
              rows={tableData?.rows || []}
              isLoading={tableLoading}
              colors={colors}
              locale={locale}
            />
          )}

          {/* TABELA ANALÍTICA */}
          {!hasNoData && (
            <TeamTable
              rows={tableData?.rows || []}
              isLoading={tableLoading}
              colors={colors}
              locale={locale}
              onRowPress={handleRowPress}
            />
          )}

        </ScrollView>
      </LinearGradient>

      {/* Date Range Selection Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={dateModalVisible}
        onRequestClose={() => setDateModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDateModalVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.dark.cardSolid }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                {locale === 'pt' ? 'Selecionar Período' : 'Select Date Range'}
              </Text>
              <TouchableOpacity onPress={() => setDateModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {DATE_RANGES.map((range) => (
              <TouchableOpacity
                key={range.key}
                style={[
                  styles.optionRow,
                  {
                    backgroundColor: selectedDateRange === range.key
                      ? 'rgba(124, 255, 58, 0.1)'
                      : colors.dark.secondary,
                    borderColor: selectedDateRange === range.key
                      ? colors.accent.primary
                      : colors.border.default,
                  },
                ]}
                onPress={() => handleDateRangeSelect(range.key)}
                data-testid={`date-range-${range.key}`}
              >
                <View style={styles.optionContent}>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: selectedDateRange === range.key
                          ? colors.accent.primary
                          : colors.text.tertiary,
                      },
                    ]}
                  >
                    {selectedDateRange === range.key && (
                      <View style={[styles.radioInner, { backgroundColor: colors.accent.primary }]} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      {
                        color: selectedDateRange === range.key
                          ? colors.text.primary
                          : colors.text.secondary,
                        fontWeight: selectedDateRange === range.key ? '600' : '500',
                      },
                    ]}
                  >
                    {locale === 'pt' ? range.labelPt : range.labelEn}
                  </Text>
                </View>
                {selectedDateRange === range.key && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
    gap: 12,
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
    padding: 20,
  },
  errorText: {
    color: colors.text.secondary,
    fontSize: 16,
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.accent.primary,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  csvImportButton: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  csvImportGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  csvImportTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  csvImportSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emptyStateButton: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyStateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Date Filter
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  periodLabel: {
    fontSize: 12,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: {
    fontSize: 15,
  },
});
