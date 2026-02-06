import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { Athlete, GPSData, WellnessQuestionnaire } from '../types';
import { ComparisonChart } from '../components/dashboard/ComparisonChart';

const ATHLETE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function CompareAthletes() {
  const router = useRouter();
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');

  const { data: athletes, isLoading } = useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const response = await api.get<Athlete[]>('/athletes');
      return response.data;
    },
  });

  // Get unique positions
  const positions = useMemo(() => {
    if (!athletes) return [];
    const uniquePositions = [...new Set(athletes.map(a => a.position))];
    return uniquePositions.filter(p => p && p !== 'Não especificado');
  }, [athletes]);

  // Filter athletes by position
  const filteredAthletes = useMemo(() => {
    if (!athletes) return [];
    if (filterPosition === 'all') return athletes;
    return athletes.filter(a => a.position === filterPosition);
  }, [athletes, filterPosition]);

  const toggleAthlete = (athleteId: string) => {
    if (selectedAthletes.includes(athleteId)) {
      setSelectedAthletes(selectedAthletes.filter(id => id !== athleteId));
    } else {
      if (selectedAthletes.length >= 6) {
        alert('Máximo 6 atletas para comparação');
        return;
      }
      setSelectedAthletes([...selectedAthletes, athleteId]);
    }
  };

  // Fetch GPS data for selected athletes
  const { data: comparisonData, isLoading: dataLoading } = useQuery({
    queryKey: ['comparison', selectedAthletes, dateRange],
    queryFn: async () => {
      if (selectedAthletes.length === 0) return null;

      const cutoffDate = new Date();
      if (dateRange === '7d') {
        cutoffDate.setDate(cutoffDate.getDate() - 7);
      } else if (dateRange === '30d') {
        cutoffDate.setDate(cutoffDate.getDate() - 30);
      } else {
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
      }
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      const promises = selectedAthletes.map(async athleteId => {
        const [gpsRes, wellnessRes] = await Promise.all([
          api.get<GPSData[]>(`/gps-data/athlete/${athleteId}`).catch(() => ({ data: [] })),
          api.get<WellnessQuestionnaire[]>(`/wellness/athlete/${athleteId}`).catch(() => ({ data: [] })),
        ]);

        const gpsData = gpsRes.data.filter(d => d.date >= cutoffStr);
        const wellnessData = wellnessRes.data.filter(w => w.date >= cutoffStr);

        const athlete = athletes?.find(a => (a.id || a._id) === athleteId);

        return {
          athleteId,
          athleteName: athlete?.name || 'Unknown',
          position: athlete?.position || '',
          gpsData,
          wellnessData,
          stats: {
            avgDistance: gpsData.length > 0 
              ? gpsData.reduce((sum, d) => sum + d.total_distance, 0) / gpsData.length 
              : 0,
            avgSprints: gpsData.length > 0
              ? gpsData.reduce((sum, d) => sum + d.number_of_sprints, 0) / gpsData.length
              : 0,
            avgHSR: gpsData.length > 0
              ? gpsData.reduce((sum, d) => sum + (d.high_speed_running || 0), 0) / gpsData.length
              : 0,
            maxSpeed: Math.max(...gpsData.map(d => d.max_speed || 0), 0),
            avgWellness: wellnessData.length > 0
              ? wellnessData.reduce((sum, w) => sum + (w.wellness_score || 0), 0) / wellnessData.length
              : 0,
            avgReadiness: wellnessData.length > 0
              ? wellnessData.reduce((sum, w) => sum + (w.readiness_score || 0), 0) / wellnessData.length
              : 0,
            totalSessions: gpsData.length,
          },
        };
      });

      return await Promise.all(promises);
    },
    enabled: selectedAthletes.length > 0,
  });

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1e40af', '#3b82f6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Comparar Atletas</Text>
          <Text style={styles.headerSubtitle}>
            {selectedAthletes.length} de 6 selecionados
          </Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Filters */}
        <View style={styles.filtersSection}>
          <Text style={styles.filterLabel}>Posição:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.filterChip, filterPosition === 'all' && styles.filterChipActive]}
              onPress={() => setFilterPosition('all')}
            >
              <Text style={[styles.filterChipText, filterPosition === 'all' && styles.filterChipTextActive]}>
                Todos
              </Text>
            </TouchableOpacity>
            {positions.map(position => (
              <TouchableOpacity
                key={position}
                style={[styles.filterChip, filterPosition === position && styles.filterChipActive]}
                onPress={() => setFilterPosition(position)}
              >
                <Text style={[styles.filterChipText, filterPosition === position && styles.filterChipTextActive]}>
                  {position}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.filtersSection}>
          <Text style={styles.filterLabel}>Período:</Text>
          <View style={styles.dateFilters}>
            <TouchableOpacity
              style={[styles.dateChip, dateRange === '7d' && styles.dateChipActive]}
              onPress={() => setDateRange('7d')}
            >
              <Text style={[styles.dateChipText, dateRange === '7d' && styles.dateChipTextActive]}>
                7 dias
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateChip, dateRange === '30d' && styles.dateChipActive]}
              onPress={() => setDateRange('30d')}
            >
              <Text style={[styles.dateChipText, dateRange === '30d' && styles.dateChipTextActive]}>
                30 dias
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateChip, dateRange === 'all' && styles.dateChipActive]}
              onPress={() => setDateRange('all')}
            >
              <Text style={[styles.dateChipText, dateRange === 'all' && styles.dateChipTextActive]}>
                Tudo
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Athletes Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Selecionar Atletas (máx. 6)</Text>
          <View style={styles.athletesList}>
            {filteredAthletes.map((athlete, index) => {
              const isSelected = selectedAthletes.includes(athlete.id || athlete._id || '');
              const athleteColor = ATHLETE_COLORS[selectedAthletes.indexOf(athlete.id || athlete._id || '')] || '#6b7280';

              return (
                <TouchableOpacity
                  key={athlete.id || athlete._id}
                  style={[
                    styles.athleteItem,
                    isSelected && { borderColor: athleteColor, borderWidth: 2 },
                  ]}
                  onPress={() => toggleAthlete(athlete.id || athlete._id || '')}
                >
                  {isSelected && (
                    <View style={[styles.selectedBadge, { backgroundColor: athleteColor }]}>
                      <Ionicons name="checkmark" size={16} color="#ffffff" />
                    </View>
                  )}
                  <View style={[styles.athleteColorDot, { backgroundColor: isSelected ? athleteColor : '#e5e7eb' }]} />
                  <View style={styles.athleteItemInfo}>
                    <Text style={styles.athleteItemName}>{athlete.name}</Text>
                    <Text style={styles.athleteItemPosition}>{athlete.position}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Comparison Charts */}
        {selectedAthletes.length > 0 && comparisonData && !dataLoading && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comparação de Desempenho</Text>

            <ComparisonChart
              title="Distância Média (metros)"
              athletes={comparisonData.map((d, i) => ({
                name: d.athleteName,
                value: d.stats.avgDistance,
                color: ATHLETE_COLORS[i],
              }))}
              unit="m"
            />

            <ComparisonChart
              title="HSR Médio (High Speed Running)"
              athletes={comparisonData.map((d, i) => ({
                name: d.athleteName,
                value: d.stats.avgHSR,
                color: ATHLETE_COLORS[i],
              }))}
              unit="m"
            />

            <ComparisonChart
              title="Sprints Médios por Sessão"
              athletes={comparisonData.map((d, i) => ({
                name: d.athleteName,
                value: d.stats.avgSprints,
                color: ATHLETE_COLORS[i],
              }))}
            />

            <ComparisonChart
              title="Velocidade Máxima"
              athletes={comparisonData.map((d, i) => ({
                name: d.athleteName,
                value: d.stats.maxSpeed,
                color: ATHLETE_COLORS[i],
              }))}
              unit=" km/h"
            />

            <ComparisonChart
              title="Wellness Score Médio"
              athletes={comparisonData.map((d, i) => ({
                name: d.athleteName,
                value: d.stats.avgWellness,
                color: ATHLETE_COLORS[i],
              }))}
              unit="/10"
            />

            {/* Stats Table */}
            <View style={styles.tableCard}>
              <Text style={styles.tableTitle}>Resumo Comparativo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.table}>
                  {/* Header */}
                  <View style={styles.tableRow}>
                    <View style={[styles.tableCell, styles.tableCellHeader, { width: 120 }]}>
                      <Text style={styles.tableHeaderText}>Atleta</Text>
                    </View>
                    <View style={[styles.tableCell, styles.tableCellHeader, { width: 80 }]}>
                      <Text style={styles.tableHeaderText}>Sessões</Text>
                    </View>
                    <View style={[styles.tableCell, styles.tableCellHeader, { width: 100 }]}>
                      <Text style={styles.tableHeaderText}>Dist. Média</Text>
                    </View>
                    <View style={[styles.tableCell, styles.tableCellHeader, { width: 100 }]}>
                      <Text style={styles.tableHeaderText}>HSR Médio</Text>
                    </View>
                    <View style={[styles.tableCell, styles.tableCellHeader, { width: 80 }]}>
                      <Text style={styles.tableHeaderText}>Sprints</Text>
                    </View>
                    <View style={[styles.tableCell, styles.tableCellHeader, { width: 90 }]}>
                      <Text style={styles.tableHeaderText}>Wellness</Text>
                    </View>
                  </View>

                  {/* Data Rows */}
                  {comparisonData.map((data, index) => (
                    <View key={data.athleteId} style={styles.tableRow}>
                      <View style={[styles.tableCell, { width: 120 }]}>
                        <View style={styles.tableCellName}>
                          <View style={[styles.colorDot, { backgroundColor: ATHLETE_COLORS[index] }]} />
                          <Text style={styles.tableCellText} numberOfLines={1}>
                            {data.athleteName.split(' ')[0]}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.tableCell, { width: 80 }]}>
                        <Text style={styles.tableCellValue}>{data.stats.totalSessions}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: 100 }]}>
                        <Text style={styles.tableCellValue}>
                          {(data.stats.avgDistance / 1000).toFixed(1)} km
                        </Text>
                      </View>
                      <View style={[styles.tableCell, { width: 100 }]}>
                        <Text style={styles.tableCellValue}>{data.stats.avgHSR.toFixed(0)}m</Text>
                      </View>
                      <View style={[styles.tableCell, { width: 80 }]}>
                        <Text style={styles.tableCellValue}>{data.stats.avgSprints.toFixed(1)}</Text>
                      </View>
                      <View style={[styles.tableCell, { width: 90 }]}>
                        <Text style={[styles.tableCellValue, { color: data.stats.avgWellness >= 7 ? '#10b981' : data.stats.avgWellness >= 5 ? '#f59e0b' : '#ef4444' }]}>
                          {data.stats.avgWellness.toFixed(1)}/10
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        )}

        {selectedAthletes.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="git-compare-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>Selecione atletas para comparar</Text>
            <Text style={styles.emptySubtext}>
              Escolha até 6 atletas e veja comparações detalhadas
            </Text>
          </View>
        )}

        {dataLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Carregando dados...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  content: {
    flex: 1,
  },
  filtersSection: {
    padding: 16,
    paddingBottom: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  dateFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  dateChip: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dateChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  dateChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  dateChipTextActive: {
    color: '#ffffff',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  athletesList: {
    gap: 8,
  },
  athleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  selectedBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  athleteColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  athleteItemInfo: {
    flex: 1,
  },
  athleteItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  athleteItemPosition: {
    fontSize: 13,
    color: '#6b7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  table: {
    gap: 1,
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
  },
  tableCell: {
    padding: 12,
    justifyContent: 'center',
  },
  tableCellHeader: {
    backgroundColor: '#f3f4f6',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#374151',
  },
  tableCellName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tableCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  tableCellValue: {
    fontSize: 13,
    color: '#374151',
  },
});
