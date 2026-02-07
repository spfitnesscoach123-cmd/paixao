import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { Athlete, GPSData, WellnessQuestionnaire, PhysicalAssessment, ComprehensiveAnalysis } from '../../types';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { AnalysisTab } from '../../components/AnalysisTab';
import { ExportPDFButton } from '../../components/ExportPDFButton';
import { GPSDateFilter } from '../../components/GPSDateFilter';
import { WellnessCharts } from '../../components/WellnessCharts';
import { StrengthAnalysisCharts } from '../../components/StrengthAnalysisCharts';
import { StrengthHistoryChart } from '../../components/StrengthHistoryChart';
import { colors } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';

// Interface for grouped session data
interface GroupedSession {
  session_id: string;
  session_name: string;
  date: string;
  periods: GPSData[];
  totals: {
    total_distance: number;
    high_intensity_distance: number;
    sprint_distance: number;
    number_of_sprints: number;
    number_of_accelerations: number;
    number_of_decelerations: number;
    max_speed: number;
  };
}

type TabType = 'info' | 'gps' | 'wellness' | 'assessments' | 'analysis';

// Track selected period within each session
interface SelectedPeriod {
  sessionId: string;
  periodIndex: number;
}

export default function AthleteDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<SelectedPeriod | null>(null);
  
  // GPS Date Filter state
  const [gpsDateFilter, setGpsDateFilter] = useState<{ start: string | null; end: string | null; activeKey: string }>({
    start: null,
    end: null,
    activeKey: 'all'
  });

  const { data: athlete, isLoading: athleteLoading } = useQuery({
    queryKey: ['athlete', id],
    queryFn: async () => {
      const response = await api.get<Athlete>(`/athletes/${id}`);
      return response.data;
    },
  });

  const { data: gpsData, isLoading: gpsLoading } = useQuery({
    queryKey: ['gps', id],
    queryFn: async () => {
      const response = await api.get<GPSData[]>(`/gps-data/athlete/${id}`);
      return response.data;
    },
  });

  const { data: wellnessData, isLoading: wellnessLoading } = useQuery({
    queryKey: ['wellness', id],
    queryFn: async () => {
      const response = await api.get<WellnessQuestionnaire[]>(`/wellness/athlete/${id}`);
      return response.data;
    },
  });

  const { data: assessments, isLoading: assessmentsLoading } = useQuery({
    queryKey: ['assessments', id],
    queryFn: async () => {
      const response = await api.get<PhysicalAssessment[]>(`/assessments/athlete/${id}`);
      return response.data;
    },
  });

  // Group GPS data by session_id
  const groupedSessions = useMemo((): GroupedSession[] => {
    if (!gpsData || gpsData.length === 0) return [];

    // Filter GPS data by date range
    let filteredData = gpsData;
    if (gpsDateFilter.start && gpsDateFilter.end) {
      const startDate = parseISO(gpsDateFilter.start);
      const endDate = parseISO(gpsDateFilter.end);
      filteredData = gpsData.filter(record => {
        try {
          const recordDate = parseISO(record.date);
          return isWithinInterval(recordDate, { start: startDate, end: endDate });
        } catch {
          return false;
        }
      });
    }

    const sessionMap = new Map<string, GroupedSession>();

    filteredData.forEach((record) => {
      // Use session_id if available, otherwise create one from date
      const sessionKey = record.session_id || `legacy_${record.date}`;
      const sessionName = record.session_name || t('gps.session');

      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          session_id: sessionKey,
          session_name: sessionName,
          date: record.date,
          periods: [],
          totals: {
            total_distance: 0,
            high_intensity_distance: 0,
            sprint_distance: 0,
            number_of_sprints: 0,
            number_of_accelerations: 0,
            number_of_decelerations: 0,
            max_speed: 0,
          },
        });
      }

      const session = sessionMap.get(sessionKey)!;
      session.periods.push(record);
      
      // Accumulate totals
      session.totals.total_distance += record.total_distance || 0;
      session.totals.high_intensity_distance += record.high_intensity_distance || 0;
      session.totals.sprint_distance += record.sprint_distance || 0;
      session.totals.number_of_sprints += record.number_of_sprints || 0;
      session.totals.number_of_accelerations += record.number_of_accelerations || 0;
      session.totals.number_of_decelerations += record.number_of_decelerations || 0;
      session.totals.max_speed = Math.max(session.totals.max_speed, record.max_speed || 0);
    });

    // Sort sessions by date (most recent first)
    return Array.from(sessionMap.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [gpsData, t, gpsDateFilter]);

  // Handler for GPS date filter change
  const handleGpsDateFilterChange = (start: string | null, end: string | null) => {
    const activeKey = start && end ? 'custom' : 
                      start === null && end === null ? 'all' :
                      gpsDateFilter.activeKey;
    setGpsDateFilter({ start, end, activeKey });
  };

  const toggleSessionExpand = (sessionId: string) => {
    setExpandedSessions(prev => {
      const isCurrentlyExpanded = prev.includes(sessionId);
      // If collapsing, clear selected period for this session
      if (isCurrentlyExpanded && selectedPeriod?.sessionId === sessionId) {
        setSelectedPeriod(null);
      }
      return isCurrentlyExpanded 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId];
    });
  };

  const togglePeriodSelection = (sessionId: string, periodIndex: number) => {
    setSelectedPeriod(prev => {
      // If clicking the same period, deselect it
      if (prev?.sessionId === sessionId && prev?.periodIndex === periodIndex) {
        return null;
      }
      // Select the new period
      return { sessionId, periodIndex };
    });
  };

  // Get the data to display (either selected period or session totals)
  const getDisplayData = (session: GroupedSession) => {
    if (selectedPeriod?.sessionId === session.session_id) {
      const period = session.periods[selectedPeriod.periodIndex];
      if (period) {
        return {
          total_distance: period.total_distance || 0,
          high_intensity_distance: period.high_intensity_distance || 0,
          number_of_sprints: period.number_of_sprints || 0,
          max_speed: period.max_speed || 0,
          isSelectedPeriod: true,
          periodName: period.period_name || period.notes?.replace('Período: ', '') || `${t('gps.period')} ${selectedPeriod.periodIndex + 1}`
        };
      }
    }
    return {
      ...session.totals,
      isSelectedPeriod: false,
      periodName: null
    };
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/athletes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athletes'] });
      Alert.alert('Sucesso', 'Atleta excluído com sucesso');
      router.back();
    },
    onError: () => {
      Alert.alert('Erro', 'Não foi possível excluir o atleta');
    },
  });

  const handleDelete = () => {
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza que deseja excluir este atleta? Todos os dados associados serão perdidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['athlete', id] }),
      queryClient.invalidateQueries({ queryKey: ['gps', id] }),
      queryClient.invalidateQueries({ queryKey: ['wellness', id] }),
      queryClient.invalidateQueries({ queryKey: ['assessments', id] }),
    ]);
    setRefreshing(false);
  };

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  if (athleteLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  if (!athlete) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Atleta não encontrado</Text>
      </View>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return (
          <View style={styles.tabContent}>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="calendar" size={20} color={colors.accent.primary} />
                <Text style={styles.infoLabel}>Idade:</Text>
                <Text style={styles.infoValue}>{calculateAge(athlete.birth_date)} anos</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="football" size={20} color={colors.accent.tertiary} />
                <Text style={styles.infoLabel}>Posição:</Text>
                <Text style={styles.infoValue}>{athlete.position}</Text>
              </View>
              {athlete.height && (
                <View style={styles.infoRow}>
                  <Ionicons name="resize" size={20} color={colors.accent.blue} />
                  <Text style={styles.infoLabel}>Altura:</Text>
                  <Text style={styles.infoValue}>{athlete.height} cm</Text>
                </View>
              )}
              {athlete.weight && (
                <View style={styles.infoRow}>
                  <Ionicons name="barbell" size={20} color={colors.accent.secondary} />
                  <Text style={styles.infoLabel}>Peso:</Text>
                  <Text style={styles.infoValue}>{athlete.weight} kg</Text>
                </View>
              )}
            </View>

            <TouchableOpacity 
              style={styles.editButton}
              onPress={() => router.push(`/athlete/${id}/edit`)}
            >
              <Ionicons name="create-outline" size={20} color={colors.accent.primary} />
              <Text style={styles.editButtonText}>{t('athletes.editProfile')}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.accent.primary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.chartsButton}
              onPress={() => router.push(`/athlete/${id}/charts`)}
            >
              <Ionicons name="bar-chart" size={20} color={colors.accent.primary} />
              <Text style={styles.chartsButtonText}>{t('athletes.viewCharts')}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.accent.primary} />
            </TouchableOpacity>

            {/* Export PDF Button */}
            <ExportPDFButton athleteId={id} athleteName={athlete.name} />

            <TouchableOpacity 
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color={colors.status.error} />
              <Text style={styles.deleteButtonText}>{t('athletes.deleteAthlete')}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'gps':
        return (
          <View style={styles.tabContent}>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/athlete/${id}/add-gps`)}
              >
                <Ionicons name="add-circle" size={24} color="#2563eb" />
                <Text style={styles.actionButtonText}>{t('gps.manualEntry')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/athlete/${id}/upload-gps`)}
              >
                <Ionicons name="cloud-upload" size={24} color="#2563eb" />
                <Text style={styles.actionButtonText}>{t('gps.uploadCSV')}</Text>
              </TouchableOpacity>
            </View>

            {/* GPS Date Filter */}
            <GPSDateFilter 
              onFilterChange={(start, end) => {
                const key = start === null ? 'all' : 
                            start && end && start === end ? 'custom' : 
                            gpsDateFilter.activeKey;
                setGpsDateFilter({ start, end, activeKey: key });
              }}
              activeFilter={gpsDateFilter.activeKey}
            />

            {/* Session count summary */}
            {groupedSessions.length > 0 && (
              <View style={styles.sessionSummary}>
                <Text style={styles.sessionSummaryText}>
                  {groupedSessions.length} {t('gps.sessions')} • {gpsData?.length || 0} {t('gps.periods')}
                  {gpsDateFilter.start && ` (${t('gps.filtered') || 'filtrado'})`}
                </Text>
              </View>
            )}

            {gpsLoading ? (
              <ActivityIndicator size="large" color={colors.accent.primary} style={{ marginTop: 32 }} />
            ) : groupedSessions.length > 0 ? (
              groupedSessions.map((session) => {
                const isExpanded = expandedSessions.includes(session.session_id);
                const hasPeriods = session.periods.length > 1;
                
                return (
                  <View key={session.session_id} style={styles.sessionCard}>
                    {/* Session Header - Clickable to expand */}
                    <TouchableOpacity 
                      style={styles.sessionHeader}
                      onPress={() => hasPeriods && toggleSessionExpand(session.session_id)}
                      activeOpacity={hasPeriods ? 0.7 : 1}
                    >
                      <View style={styles.sessionHeaderLeft}>
                        <View style={styles.sessionIconBox}>
                          <Ionicons name="calendar" size={20} color={colors.accent.primary} />
                        </View>
                        <View>
                          <Text style={styles.sessionDate}>{session.date}</Text>
                          <Text style={styles.sessionName}>{session.session_name}</Text>
                        </View>
                      </View>
                      <View style={styles.sessionHeaderRight}>
                        {hasPeriods && (
                          <View style={styles.periodCountBadge}>
                            <Text style={styles.periodCountText}>{session.periods.length} {t('gps.periods')}</Text>
                          </View>
                        )}
                        {hasPeriods && (
                          <Ionicons 
                            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                            size={20} 
                            color={colors.text.secondary} 
                          />
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Session Totals - Shows selected period data or session totals */}
                    <View style={styles.sessionTotals}>
                      {(() => {
                        const displayData = getDisplayData(session);
                        return (
                          <>
                            <View style={styles.sessionTotalsHeader}>
                              <Text style={styles.sessionTotalsTitle}>
                                {displayData.isSelectedPeriod 
                                  ? `📍 ${displayData.periodName}` 
                                  : t('gps.sessionTotals')}
                              </Text>
                              {displayData.isSelectedPeriod && (
                                <TouchableOpacity 
                                  onPress={() => setSelectedPeriod(null)}
                                  style={styles.clearSelectionButton}
                                >
                                  <Ionicons name="close-circle" size={18} color={colors.accent.primary} />
                                  <Text style={styles.clearSelectionText}>{t('gps.showTotals')}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            <View style={styles.dataGrid}>
                              <View style={styles.dataItem}>
                                <Text style={styles.dataLabel}>{t('gps.totalDistance')}</Text>
                                <Text style={[styles.dataValueLarge, displayData.isSelectedPeriod && styles.dataValueHighlight]}>
                                  {displayData.total_distance.toFixed(0)}m
                                </Text>
                              </View>
                              <View style={styles.dataItem}>
                                <Text style={styles.dataLabel}>{t('gps.highIntensity')}</Text>
                                <Text style={[styles.dataValueLarge, displayData.isSelectedPeriod && styles.dataValueHighlight]}>
                                  {displayData.high_intensity_distance.toFixed(0)}m
                                </Text>
                              </View>
                              <View style={styles.dataItem}>
                                <Text style={styles.dataLabel}>{t('gps.sprints')}</Text>
                                <Text style={[styles.dataValueLarge, displayData.isSelectedPeriod && styles.dataValueHighlight]}>
                                  {displayData.number_of_sprints}
                                </Text>
                              </View>
                              <View style={styles.dataItem}>
                                <Text style={styles.dataLabel}>{t('gps.maxSpeed')}</Text>
                                <Text style={[styles.dataValueLarge, displayData.isSelectedPeriod && styles.dataValueHighlight]}>
                                  {displayData.max_speed.toFixed(1)} km/h
                                </Text>
                              </View>
                            </View>
                          </>
                        );
                      })()}
                    </View>

                    {/* Expanded Period Details */}
                    {isExpanded && hasPeriods && (
                      <View style={styles.periodsContainer}>
                        <Text style={styles.periodsTitle}>{t('gps.periodDetails')}</Text>
                        <Text style={styles.periodsTip}>{t('gps.tapPeriodTip')}</Text>
                        {session.periods.map((period, pIndex) => {
                          const periodName = period.period_name || period.notes?.replace('Período: ', '') || `${t('gps.period')} ${pIndex + 1}`;
                          const isSelected = selectedPeriod?.sessionId === session.session_id && selectedPeriod?.periodIndex === pIndex;
                          return (
                            <TouchableOpacity 
                              key={period.id || `period-${pIndex}`} 
                              style={[styles.periodItem, isSelected && styles.periodItemSelected]}
                              onPress={() => togglePeriodSelection(session.session_id, pIndex)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.periodHeader}>
                                <View style={[styles.periodBadgeSmall, isSelected && styles.periodBadgeSelected]}>
                                  <Text style={[styles.periodBadgeText, isSelected && styles.periodBadgeTextSelected]}>
                                    {isSelected && '✓ '}{periodName}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.periodDataRow}>
                                <Text style={styles.periodDataText}>
                                  {t('gps.dist')}: {period.total_distance.toFixed(0)}m
                                </Text>
                                <Text style={styles.periodDataText}>
                                  {t('gps.hid')}: {period.high_intensity_distance.toFixed(0)}m
                                </Text>
                                <Text style={styles.periodDataText}>
                                  {t('gps.spr')}: {period.number_of_sprints}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="location-outline" size={48} color={colors.text.tertiary} />
                <Text style={styles.emptyText}>{t('gps.noData')}</Text>
              </View>
            )}
          </View>
        );

      case 'wellness':
        return (
          <View style={styles.tabContent}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/athlete/${id}/add-wellness`)}
            >
              <Ionicons name="add" size={24} color="#ffffff" />
              <Text style={styles.addButtonText}>{t('wellness.newQuestionnaire') || 'Novo Questionário'}</Text>
            </TouchableOpacity>

            {/* QTR Gauge and Charts */}
            {wellnessData && wellnessData.length > 0 && (
              <WellnessCharts data={wellnessData} />
            )}

            {wellnessLoading ? (
              <ActivityIndicator size="large" color={colors.accent.primary} style={{ marginTop: 32 }} />
            ) : wellnessData && wellnessData.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>{t('wellness.history') || 'Histórico'}</Text>
                {wellnessData.map((item, index) => (
                  <View key={item.id || `wellness-${index}`} style={styles.dataCard}>
                    <View style={styles.dataHeader}>
                      <Ionicons name="fitness" size={20} color={colors.status.success} />
                      <Text style={styles.dataDate}>{item.date}</Text>
                    </View>
                    <View style={styles.scoreRow}>
                      <View style={styles.scoreBox}>
                        <Text style={styles.scoreLabel}>{t('wellness.wellness') || 'Wellness'}</Text>
                        <Text style={[styles.scoreValue, { color: (item.wellness_score || 0) >= 7 ? '#10b981' : (item.wellness_score || 0) >= 5 ? '#f59e0b' : '#ef4444' }]}>
                          {item.wellness_score?.toFixed(1) || '-'}
                        </Text>
                      </View>
                      <View style={styles.scoreBox}>
                        <Text style={styles.scoreLabel}>{t('wellness.readiness') || 'Prontidão'}</Text>
                        <Text style={[styles.scoreValue, { color: (item.readiness_score || 0) >= 7 ? '#10b981' : (item.readiness_score || 0) >= 5 ? '#f59e0b' : '#ef4444' }]}>
                          {item.readiness_score?.toFixed(1) || '-'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataGrid}>
                      <View style={styles.dataItem}>
                        <Text style={styles.dataLabel}>{t('wellness.fatigue') || 'Fadiga'}</Text>
                        <Text style={styles.dataValue}>{item.fatigue}/10</Text>
                      </View>
                      <View style={styles.dataItem}>
                        <Text style={styles.dataLabel}>{t('wellness.sleep') || 'Sono'}</Text>
                        <Text style={styles.dataValue}>{item.sleep_hours}h</Text>
                      </View>
                      <View style={styles.dataItem}>
                        <Text style={styles.dataLabel}>{t('wellness.mood') || 'Humor'}</Text>
                        <Text style={styles.dataValue}>{item.mood}/10</Text>
                      </View>
                      <View style={styles.dataItem}>
                        <Text style={styles.dataLabel}>{t('wellness.hydration') || 'Hidratação'}</Text>
                        <Text style={styles.dataValue}>{item.hydration || '-'}/10</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="fitness-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>{t('wellness.noData') || 'Nenhum questionário registrado'}</Text>
              </View>
            )}
          </View>
        );

      case 'assessments':
        return (
          <View style={styles.tabContent}>
            {/* Action buttons - Força (com VBT integrado), Composição Corporal */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.actionButtonLarge}
                onPress={() => router.push(`/athlete/${id}/add-strength`)}
              >
                <LinearGradient colors={['#7c3aed', '#4f46e5']} style={styles.actionButtonGradient}>
                  <View style={styles.actionButtonIconRow}>
                    <Ionicons name="barbell" size={24} color="#ffffff" />
                    <Ionicons name="speedometer" size={20} color="rgba(255,255,255,0.8)" />
                  </View>
                  <Text style={styles.actionButtonLargeText}>
                    {locale === 'pt' ? 'Força & VBT' : 'Strength & VBT'}
                  </Text>
                  <Text style={styles.actionButtonSubtext}>
                    {locale === 'pt' ? 'Avaliação de força + Velocity Based Training' : 'Strength assessment + Velocity Based Training'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButtonLarge}
                onPress={() => router.push(`/athlete/${id}/add-body-composition`)}
              >
                <LinearGradient colors={['#10b981', '#059669']} style={styles.actionButtonGradient}>
                  <Ionicons name="body" size={24} color="#ffffff" />
                  <Text style={styles.actionButtonLargeText}>
                    {locale === 'pt' ? 'Composição Corporal' : 'Body Composition'}
                  </Text>
                  <Text style={styles.actionButtonSubtext}>
                    {locale === 'pt' ? 'Protocolos científicos de dobras cutâneas' : 'Scientific skinfold protocols'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Strength Analysis Section */}
            <View style={styles.strengthAnalysisSection}>
              <StrengthAnalysisCharts athleteId={id} />
            </View>

            {/* Strength History Chart */}
            <StrengthHistoryChart athleteId={id} />

            {/* Assessment History */}
            <Text style={styles.sectionTitle}>{t('assessments.history') || 'Histórico de Avaliações'}</Text>
            
            {assessmentsLoading ? (
              <ActivityIndicator size="large" color={colors.accent.primary} style={{ marginTop: 32 }} />
            ) : assessments && assessments.length > 0 ? (
              assessments.map((item, index) => (
                <View key={item.id || `assessment-${index}`} style={styles.dataCard}>
                  <View style={styles.dataHeader}>
                    <Ionicons 
                      name={item.assessment_type === 'strength' ? 'barbell' : item.assessment_type === 'aerobic' ? 'heart' : 'body'} 
                      size={20} 
                      color="#8b5cf6" 
                    />
                    <Text style={styles.dataDate}>{item.date}</Text>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeText}>
                        {item.assessment_type === 'strength' ? (t('assessments.strength') || 'Força') : 
                         item.assessment_type === 'aerobic' ? (t('assessments.aerobic') || 'Aeróbico') : 
                         (t('assessments.bodyComp') || 'Composição')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.metricsContainer}>
                    {Object.entries(item.metrics).map(([key, value]) => (
                      <View key={key} style={styles.metricItem}>
                        <Text style={styles.metricKey}>{key.replace(/_/g, ' ')}:</Text>
                        <Text style={styles.metricValue}>{String(value)}</Text>
                      </View>
                    ))}
                  </View>
                  {item.notes && (
                    <Text style={styles.dataNotes}>{item.notes}</Text>
                  )}
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="barbell-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>{t('assessments.noData') || 'Nenhuma avaliação registrada'}</Text>
              </View>
            )}
          </View>
        );

      case 'analysis':
        return <AnalysisTab athleteId={id} />;

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{athlete.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.profileSection}>
        {athlete.photo_base64 ? (
          <Image source={{ uri: athlete.photo_base64 }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="person" size={48} color="#9ca3af" />
          </View>
        )}
        <Text style={styles.athleteName}>{athlete.name}</Text>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'info' && styles.activeTab]}
          onPress={() => setActiveTab('info')}
        >
          <Ionicons 
            name="information-circle" 
            size={20} 
            color={activeTab === 'info' ? '#2563eb' : '#9ca3af'} 
          />
          <Text style={[styles.tabText, activeTab === 'info' && styles.activeTabText]}>Info</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'gps' && styles.activeTab]}
          onPress={() => setActiveTab('gps')}
        >
          <Ionicons 
            name="location" 
            size={20} 
            color={activeTab === 'gps' ? '#2563eb' : '#9ca3af'} 
          />
          <Text style={[styles.tabText, activeTab === 'gps' && styles.activeTabText]}>GPS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'wellness' && styles.activeTab]}
          onPress={() => setActiveTab('wellness')}
        >
          <Ionicons 
            name="fitness" 
            size={20} 
            color={activeTab === 'wellness' ? '#2563eb' : '#9ca3af'} 
          />
          <Text style={[styles.tabText, activeTab === 'wellness' && styles.activeTabText]}>Wellness</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'assessments' && styles.activeTab]}
          onPress={() => setActiveTab('assessments')}
        >
          <Ionicons 
            name="barbell" 
            size={20} 
            color={activeTab === 'assessments' ? '#2563eb' : '#9ca3af'} 
          />
          <Text style={[styles.tabText, activeTab === 'assessments' && styles.activeTabText]}>Avaliações</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'analysis' && styles.activeTab]}
          onPress={() => setActiveTab('analysis')}
        >
          <Ionicons 
            name="analytics" 
            size={20} 
            color={activeTab === 'analysis' ? '#2563eb' : '#9ca3af'} 
          />
          <Text style={[styles.tabText, activeTab === 'analysis' && styles.activeTabText]}>Análises</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {renderTabContent()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 12,
    paddingLeft: 4,
  },
  strengthAnalysisSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.secondary,
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  profileSection: {
    backgroundColor: colors.dark.secondary,
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 212, 255, 0.2)',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.accent.primary,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.dark.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  athleteName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 12,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.dark.secondary,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 212, 255, 0.2)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent.primary,
  },
  tabText: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.accent.primary,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 212, 255, 0.1)',
  },
  infoLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    marginLeft: 12,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.status.error,
  },
  chartsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  chartsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent.primary,
    marginLeft: 8,
    marginRight: 8,
    flex: 1,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.status.error,
    marginLeft: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.tertiary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  dataCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
  dataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  dataDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.secondary,
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dataItem: {
    flex: 1,
    minWidth: '45%',
  },
  dataLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  dataValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  dataNotes: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 12,
    fontStyle: 'italic',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  scoreBox: {
    flex: 1,
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  metricsContainer: {
    gap: 8,
  },
  metricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 212, 255, 0.1)',
  },
  metricKey: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.secondary,
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: colors.status.error,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent.primary,
    marginLeft: 8,
    marginRight: 8,
    flex: 1,
  },
  periodBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  periodText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent.primary,
  },
  // Session-based styles
  sessionSummary: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  sessionSummaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  sessionCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
    overflow: 'hidden',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  sessionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sessionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  sessionName: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  sessionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodCountBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  periodCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.primary,
  },
  sessionTotals: {
    padding: 16,
  },
  sessionTotalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionTotalsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent.primary,
    letterSpacing: 0.5,
  },
  clearSelectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearSelectionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  dataValueLarge: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  dataValueHighlight: {
    color: colors.accent.primary,
  },
  periodsContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(139, 92, 246, 0.2)',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  periodsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  periodsTip: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  periodItem: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  periodItemSelected: {
    borderColor: colors.accent.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  periodHeader: {
    marginBottom: 8,
  },
  periodBadgeSmall: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  periodBadgeSelected: {
    backgroundColor: colors.status.success,
  },
  periodBadgeTextSelected: {
    color: '#ffffff',
  },
  periodBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  periodDataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  periodDataText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },
});
