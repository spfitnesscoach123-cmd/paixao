import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../services/api';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width: screenWidth } = Dimensions.get('window');

// Day classifications
const DAY_CLASSIFICATIONS = [
  { id: 'MD', label: 'MD', color: '#ef4444' },
  { id: 'MD-1', label: 'MD-1', color: '#f97316' },
  { id: 'MD-2', label: 'MD-2', color: '#eab308' },
  { id: 'MD-3', label: 'MD-3', color: '#22c55e' },
  { id: 'MD-4', label: 'MD-4', color: '#14b8a6' },
  { id: 'MD-5', label: 'MD-5', color: '#3b82f6' },
  { id: 'D.O', label: 'D.O', color: '#6b7280' },
];

// Metrics
const METRICS = [
  { id: 'total_distance', label: 'Dist. Total', unit: 'm' },
  { id: 'hid_z3', label: 'HID Z3', unit: 'm' },
  { id: 'hsr_z4', label: 'HSR Z4', unit: 'm' },
  { id: 'sprint_z5', label: 'Sprint Z5', unit: 'm' },
  { id: 'sprints_count', label: 'Sprints', unit: '' },
  { id: 'acc_dec_total', label: 'ACC+DEC', unit: '' },
];

export default function PeriodizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale } = useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dateLocale = locale === 'pt' ? ptBR : enUS;
  
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Fetch week details
  const { data: week, isLoading: weekLoading } = useQuery({
    queryKey: ['periodization-week', id],
    queryFn: async () => {
      const response = await api.get(`/periodization/weeks/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Fetch calculated prescriptions
  const { data: calculations, isLoading: calculationsLoading } = useQuery({
    queryKey: ['periodization-calculated', id],
    queryFn: async () => {
      const response = await api.get(`/periodization/calculated/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Check if week is editable
  const isEditable = () => {
    if (!week) return false;
    const end = parseISO(week.end_date);
    const today = startOfDay(new Date());
    return !isBefore(end, today);
  };

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/periodization/weeks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['periodization-weeks'] });
      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Semana excluída' : 'Week deleted',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: any) => {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        error.response?.data?.detail || 'Failed to delete'
      );
    },
  });

  const handleDelete = () => {
    Alert.alert(
      locale === 'pt' ? 'Confirmar exclusão' : 'Confirm deletion',
      locale === 'pt' 
        ? 'Tem certeza que deseja excluir esta semana?' 
        : 'Are you sure you want to delete this week?',
      [
        { text: locale === 'pt' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        { text: locale === 'pt' ? 'Excluir' : 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  };

  // Render table view
  const renderTableView = () => {
    if (!calculations) return null;

    return (
      <View style={styles.tableContainer}>
        {/* Weekly targets header */}
        <View style={styles.sectionHeader}>
          <Ionicons name="calendar" size={20} color={colors.accent.primary} />
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? 'Metas Semanais' : 'Weekly Targets'}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.tableRow}>
              <View style={styles.tableHeaderCell}>
                <Text style={styles.tableHeaderText}>
                  {locale === 'pt' ? 'Atleta' : 'Athlete'}
                </Text>
              </View>
              {METRICS.map(metric => (
                <View key={metric.id} style={styles.tableMetricCell}>
                  <Text style={styles.tableHeaderText}>{metric.label}</Text>
                </View>
              ))}
            </View>

            {/* Rows */}
            {calculations.athletes.map((athlete: any) => (
              <View key={athlete.athlete_id} style={styles.tableRow}>
                <View style={styles.tableNameCell}>
                  <Text style={styles.tableNameText} numberOfLines={1}>
                    {athlete.athlete_name}
                  </Text>
                </View>
                {METRICS.map(metric => (
                  <View key={metric.id} style={styles.tableValueCell}>
                    <Text style={styles.tableValueText}>
                      {Math.round(athlete.weekly_targets[metric.id]).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Daily targets section */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Ionicons name="today" size={20} color={colors.accent.primary} />
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? 'Metas Diárias' : 'Daily Targets'}
          </Text>
        </View>

        {/* Day selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daySelector}>
          {calculations.days_config.map((day: any) => {
            const classification = DAY_CLASSIFICATIONS.find(c => c.id === day.day_classification);
            const isSelected = selectedDay === day.date;
            return (
              <TouchableOpacity
                key={day.date}
                style={[
                  styles.daySelectorItem,
                  isSelected && { borderColor: classification?.color, borderWidth: 2 },
                ]}
                onPress={() => setSelectedDay(day.date)}
              >
                <Text style={styles.daySelectorDate}>
                  {format(parseISO(day.date), 'EEE', { locale: dateLocale })}
                </Text>
                <Text style={styles.daySelectorDay}>
                  {format(parseISO(day.date), 'dd')}
                </Text>
                <View style={[styles.daySelectorBadge, { backgroundColor: classification?.color }]}>
                  <Text style={styles.daySelectorBadgeText}>{classification?.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Daily table for selected day */}
        {selectedDay && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              {/* Header */}
              <View style={styles.tableRow}>
                <View style={styles.tableHeaderCell}>
                  <Text style={styles.tableHeaderText}>
                    {locale === 'pt' ? 'Atleta' : 'Athlete'}
                  </Text>
                </View>
                {METRICS.map(metric => (
                  <View key={metric.id} style={styles.tableMetricCell}>
                    <Text style={styles.tableHeaderText}>{metric.label}</Text>
                  </View>
                ))}
              </View>

              {/* Rows */}
              {calculations.athletes.map((athlete: any) => {
                const dayTarget = athlete.daily_targets.find((d: any) => d.date === selectedDay);
                return (
                  <View key={athlete.athlete_id} style={styles.tableRow}>
                    <View style={styles.tableNameCell}>
                      <Text style={styles.tableNameText} numberOfLines={1}>
                        {athlete.athlete_name}
                      </Text>
                    </View>
                    {METRICS.map(metric => (
                      <View key={metric.id} style={styles.tableValueCell}>
                        <Text style={styles.tableValueText}>
                          {dayTarget ? Math.round(dayTarget[metric.id]).toLocaleString() : '-'}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    );
  };

  // Render cards view
  const renderCardsView = () => {
    if (!calculations) return null;

    return (
      <View style={styles.cardsContainer}>
        {calculations.athletes.map((athlete: any) => (
          <View key={athlete.athlete_id} style={styles.athleteCard}>
            <View style={styles.athleteCardHeader}>
              <View style={styles.athleteAvatar}>
                <Text style={styles.athleteAvatarText}>
                  {athlete.athlete_name.charAt(0)}
                </Text>
              </View>
              <View>
                <Text style={styles.athleteName}>{athlete.athlete_name}</Text>
                <Text style={styles.athletePeakLabel}>
                  {locale === 'pt' ? 'Base (Jogo)' : 'Base (Game)'}
                </Text>
              </View>
            </View>

            {/* Peak values */}
            <View style={styles.peakValuesGrid}>
              {METRICS.slice(0, 4).map(metric => (
                <View key={metric.id} style={styles.peakValueItem}>
                  <Text style={styles.peakValueLabel}>{metric.label}</Text>
                  <Text style={styles.peakValue}>
                    {Math.round(athlete.peak_values[metric.id]).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>

            {/* Weekly target */}
            <View style={styles.weeklyTargetSection}>
              <Text style={styles.weeklyTargetTitle}>
                {locale === 'pt' ? 'Meta Semanal' : 'Weekly Target'}
              </Text>
              <View style={styles.weeklyTargetGrid}>
                {METRICS.slice(0, 4).map(metric => (
                  <View key={metric.id} style={styles.weeklyTargetItem}>
                    <Text style={styles.weeklyTargetLabel}>{metric.label}</Text>
                    <Text style={styles.weeklyTargetValue}>
                      {Math.round(athlete.weekly_targets[metric.id]).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (weekLoading || calculationsLoading) {
    return (
      <LinearGradient colors={[colors.dark.background, colors.dark.secondary]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
        </View>
      </LinearGradient>
    );
  }

  if (!week) {
    return (
      <LinearGradient colors={[colors.dark.background, colors.dark.secondary]} style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {locale === 'pt' ? 'Semana não encontrada' : 'Week not found'}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.dark.background, colors.dark.secondary]}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/periodization')} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={20} color={colors.accent.light} />
          <Text style={styles.headerBackText}>Voltar ao Menu Principal</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{week.name}</Text>
          <Text style={styles.headerDates}>
            {format(parseISO(week.start_date), 'dd MMM', { locale: dateLocale })} - 
            {format(parseISO(week.end_date), 'dd MMM', { locale: dateLocale })}
          </Text>
        </View>
        {isEditable() && (
          <TouchableOpacity onPress={handleDelete} style={styles.headerDelete}>
            <Ionicons name="trash-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* View mode toggle */}
      <View style={styles.viewModeToggle}>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'table' && styles.viewModeButtonActive]}
          onPress={() => setViewMode('table')}
        >
          <Ionicons 
            name="grid" 
            size={18} 
            color={viewMode === 'table' ? '#ffffff' : colors.text.secondary} 
          />
          <Text style={[
            styles.viewModeText,
            viewMode === 'table' && styles.viewModeTextActive
          ]}>
            {locale === 'pt' ? 'Tabela' : 'Table'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'cards' && styles.viewModeButtonActive]}
          onPress={() => setViewMode('cards')}
        >
          <Ionicons 
            name="albums" 
            size={18} 
            color={viewMode === 'cards' ? '#ffffff' : colors.text.secondary} 
          />
          <Text style={[
            styles.viewModeText,
            viewMode === 'cards' && styles.viewModeTextActive
          ]}>
            Cards
          </Text>
        </TouchableOpacity>
      </View>

      {/* Days overview */}
      <View style={styles.daysOverview}>
        {week.days.map((day: any) => {
          const classification = DAY_CLASSIFICATIONS.find(c => c.id === day.day_classification);
          return (
            <View 
              key={day.date} 
              style={[styles.dayOverviewItem, { backgroundColor: classification?.color }]}
            >
              <Text style={styles.dayOverviewText}>{classification?.label}</Text>
            </View>
          );
        })}
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {viewMode === 'table' ? renderTableView() : renderCardsView()}
        <View style={{ height: 100 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: colors.text.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  headerBackText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent.light,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  headerDates: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
  },
  headerDelete: {
    padding: 8,
  },
  viewModeToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  viewModeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewModeButtonActive: {
    backgroundColor: colors.accent.primary,
  },
  viewModeText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  viewModeTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  daysOverview: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  dayOverviewItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  dayOverviewText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  tableContainer: {
    marginBottom: 24,
  },
  table: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tableHeaderCell: {
    width: 120,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  tableMetricCell: {
    width: 80,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
  },
  tableNameCell: {
    width: 120,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tableNameText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.primary,
  },
  tableValueCell: {
    width: 80,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  tableValueText: {
    fontSize: 12,
    color: colors.text.primary,
  },
  daySelector: {
    marginBottom: 16,
  },
  daySelectorItem: {
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 12,
    marginRight: 8,
    minWidth: 70,
  },
  daySelectorDate: {
    fontSize: 11,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  daySelectorDay: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginVertical: 4,
  },
  daySelectorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  daySelectorBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  // Cards view
  cardsContainer: {
    gap: 16,
  },
  athleteCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
  },
  athleteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  athleteAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  athleteAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  athleteName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  athletePeakLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  peakValuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  peakValueItem: {
    width: (screenWidth - 80) / 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  peakValueLabel: {
    fontSize: 9,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  peakValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  weeklyTargetSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
  },
  weeklyTargetTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.primary,
    marginBottom: 8,
  },
  weeklyTargetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weeklyTargetItem: {
    width: (screenWidth - 80) / 4,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  weeklyTargetLabel: {
    fontSize: 9,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  weeklyTargetValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.accent.primary,
  },
});
