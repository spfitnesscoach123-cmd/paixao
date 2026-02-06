import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { Athlete, GPSData } from '../types';
import { colors } from '../constants/theme';

const ATHLETE_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const POSITION_COLORS: { [key: string]: string } = {
  'Goleiro': '#f59e0b',
  'Zagueiro': '#3b82f6',
  'Lateral': '#06b6d4',
  'Volante': '#8b5cf6',
  'Meio-campo': '#10b981',
  'Atacante': '#ef4444',
  'Meia': '#ec4899',
};

type CompareMode = 'athletes' | 'sessions' | 'position-group';

interface QuadrantData {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  position?: string;
  session?: string;
}

export default function CompareAthletes() {
  const router = useRouter();
  const [compareMode, setCompareMode] = useState<CompareMode>('athletes');
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('all');

  const { data: athletes, isLoading: loadingAthletes } = useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const response = await api.get<Athlete[]>('/athletes');
      return response.data;
    },
  });

  const { data: allGpsData, isLoading: loadingGps } = useQuery({
    queryKey: ['all-gps-data', athletes?.length],
    queryFn: async () => {
      if (!athletes || athletes.length === 0) return {};
      const gpsMap: { [athleteId: string]: GPSData[] } = {};
      
      for (const athlete of athletes) {
        const id = athlete.id || athlete._id;
        if (!id) continue;
        try {
          const response = await api.get<GPSData[]>(`/gps-data/athlete/${id}`);
          gpsMap[id] = response.data || [];
        } catch (error) {
          gpsMap[id] = [];
        }
      }
      return gpsMap;
    },
    enabled: !!athletes && athletes.length > 0,
  });

  const positions = useMemo(() => {
    if (!athletes) return [];
    const uniquePositions = [...new Set(athletes.map(a => a.position))];
    return uniquePositions.filter(p => p && p !== 'Não especificado');
  }, [athletes]);

  const filterByDate = (data: GPSData[]) => {
    if (!data || dateRange === 'all') return data || [];
    const now = new Date();
    const days = dateRange === '7d' ? 7 : 30;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return data.filter(d => new Date(d.date) >= cutoff);
  };

  const quadrantData: QuadrantData[] = useMemo(() => {
    if (!athletes || !allGpsData) return [];

    const data: QuadrantData[] = [];

    if (compareMode === 'athletes') {
      selectedAthletes.forEach((athleteId, index) => {
        const athlete = athletes.find(a => (a.id || a._id) === athleteId);
        const gpsData = filterByDate(allGpsData[athleteId] || []);
        
        if (athlete && gpsData.length > 0) {
          const avgTotalDistance = gpsData.reduce((sum, d) => sum + (d.total_distance || 0), 0) / gpsData.length;
          const avgHighIntensity = gpsData.reduce((sum, d) => sum + (d.high_intensity_distance || 0), 0) / gpsData.length;
          
          if (!isNaN(avgTotalDistance) && !isNaN(avgHighIntensity)) {
            data.push({
              id: athleteId,
              name: athlete.name,
              x: avgTotalDistance,
              y: avgHighIntensity,
              color: ATHLETE_COLORS[index % ATHLETE_COLORS.length],
              position: athlete.position,
            });
          }
        }
      });
    } else if (compareMode === 'sessions' && selectedAthlete) {
      const athlete = athletes.find(a => (a.id || a._id) === selectedAthlete);
      const gpsData = filterByDate(allGpsData[selectedAthlete] || []);
      
      gpsData.forEach((session, index) => {
        const periodName = session.notes?.replace('Período: ', '') || `Sessão ${index + 1}`;
        if (!isNaN(session.total_distance) && !isNaN(session.high_intensity_distance)) {
          data.push({
            id: `${session.id || index}`,
            name: periodName,
            x: session.total_distance || 0,
            y: session.high_intensity_distance || 0,
            color: ATHLETE_COLORS[index % ATHLETE_COLORS.length],
            session: session.date,
          });
        }
      });
    } else if (compareMode === 'position-group') {
      selectedPositions.forEach((position, index) => {
        const positionAthletes = athletes.filter(a => a.position === position);
        
        let totalDistance = 0;
        let totalHighIntensity = 0;
        let count = 0;
        
        positionAthletes.forEach(athlete => {
          const athleteId = athlete.id || athlete._id;
          if (!athleteId) return;
          const gpsData = filterByDate(allGpsData[athleteId] || []);
          
          gpsData.forEach(d => {
            totalDistance += d.total_distance || 0;
            totalHighIntensity += d.high_intensity_distance || 0;
            count++;
          });
        });
        
        if (count > 0) {
          data.push({
            id: position,
            name: `${position} (${positionAthletes.length})`,
            x: totalDistance / count,
            y: totalHighIntensity / count,
            color: POSITION_COLORS[position] || ATHLETE_COLORS[index % ATHLETE_COLORS.length],
            position,
          });
        }
      });
    }

    return data;
  }, [athletes, allGpsData, compareMode, selectedAthletes, selectedAthlete, selectedPositions, dateRange]);

  const toggleAthlete = (athleteId: string) => {
    if (selectedAthletes.includes(athleteId)) {
      setSelectedAthletes(selectedAthletes.filter(id => id !== athleteId));
    } else if (selectedAthletes.length < 10) {
      setSelectedAthletes([...selectedAthletes, athleteId]);
    }
  };

  const togglePosition = (position: string) => {
    if (selectedPositions.includes(position)) {
      setSelectedPositions(selectedPositions.filter(p => p !== position));
    } else {
      setSelectedPositions([...selectedPositions, position]);
    }
  };

  const chartWidth = Dimensions.get('window').width - 48;
  const chartHeight = 280;

  // Calculate chart bounds with safety checks
  const chartBounds = useMemo(() => {
    if (quadrantData.length === 0) {
      return { minX: 0, maxX: 10000, minY: 0, maxY: 1000, medianX: 5000, medianY: 500 };
    }

    const xValues = quadrantData.map(d => d.x).filter(v => !isNaN(v) && isFinite(v));
    const yValues = quadrantData.map(d => d.y).filter(v => !isNaN(v) && isFinite(v));
    
    if (xValues.length === 0 || yValues.length === 0) {
      return { minX: 0, maxX: 10000, minY: 0, maxY: 1000, medianX: 5000, medianY: 500 };
    }

    const sortedX = [...xValues].sort((a, b) => a - b);
    const sortedY = [...yValues].sort((a, b) => a - b);
    
    const medX = sortedX[Math.floor(sortedX.length / 2)];
    const medY = sortedY[Math.floor(sortedY.length / 2)];
    
    const padding = 0.15;
    const minX = Math.max(0, Math.min(...xValues) * (1 - padding));
    const maxX = Math.max(...xValues) * (1 + padding);
    const minY = Math.max(0, Math.min(...yValues) * (1 - padding));
    const maxY = Math.max(...yValues) * (1 + padding);

    return { minX, maxX, minY, maxY, medianX: medX, medianY: medY };
  }, [quadrantData]);

  const isLoading = loadingAthletes;
  const isLoadingGps = loadingGps;

  const renderQuadrantChart = () => {
    if (quadrantData.length === 0) {
      return (
        <View style={styles.emptyChart}>
          <Ionicons name="analytics-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyChartText}>Selecione atletas ou posições para comparar</Text>
        </View>
      );
    }

    const { minX, maxX, minY, maxY, medianX, medianY } = chartBounds;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Análise de Quadrantes</Text>
        <Text style={styles.chartSubtitle}>X: Distância Total (m) | Y: Alta Intensidade (m)</Text>
        
        <View style={styles.chartArea}>
          {/* Quadrant backgrounds */}
          <View style={styles.quadrantGrid}>
            <View style={[styles.quadrant, styles.quadrantTopLeft]}>
              <Text style={styles.quadrantLabel}>Baixo Vol.</Text>
              <Text style={styles.quadrantLabel}>Alta Int.</Text>
            </View>
            <View style={[styles.quadrant, styles.quadrantTopRight]}>
              <Text style={styles.quadrantLabel}>Alto Vol.</Text>
              <Text style={styles.quadrantLabel}>Alta Int.</Text>
            </View>
            <View style={[styles.quadrant, styles.quadrantBottomLeft]}>
              <Text style={styles.quadrantLabel}>Baixo Vol.</Text>
              <Text style={styles.quadrantLabel}>Baixa Int.</Text>
            </View>
            <View style={[styles.quadrant, styles.quadrantBottomRight]}>
              <Text style={styles.quadrantLabel}>Alto Vol.</Text>
              <Text style={styles.quadrantLabel}>Baixa Int.</Text>
            </View>
          </View>

          {/* Data points */}
          {quadrantData.map((point, index) => {
            const xPercent = ((point.x - minX) / rangeX) * 100;
            const yPercent = 100 - ((point.y - minY) / rangeY) * 100;
            
            return (
              <View
                key={point.id}
                style={[
                  styles.dataPoint,
                  {
                    left: `${Math.min(Math.max(xPercent, 5), 95)}%`,
                    top: `${Math.min(Math.max(yPercent, 5), 95)}%`,
                    backgroundColor: point.color,
                  },
                ]}
              >
                <Text style={styles.dataPointText}>{index + 1}</Text>
              </View>
            );
          })}
        </View>

        {/* Axes labels */}
        <View style={styles.axisLabels}>
          <Text style={styles.axisLabel}>← Dist. Total (m) →</Text>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {quadrantData.map((point, index) => (
            <View key={point.id} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: point.color }]}>
                <Text style={styles.legendNumber}>{index + 1}</Text>
              </View>
              <View style={styles.legendTextContainer}>
                <Text style={styles.legendName} numberOfLines={1}>{point.name}</Text>
                <Text style={styles.legendValues}>
                  {point.x.toFixed(0)}m / {point.y.toFixed(0)}m
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Comparações Dinâmicas</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Compare Mode Selector */}
          <View style={styles.modeSelector}>
            <Text style={styles.sectionTitle}>Modo de Comparação</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.modeButton, compareMode === 'athletes' && styles.modeButtonActive]}
                onPress={() => setCompareMode('athletes')}
              >
                <Ionicons name="people" size={18} color={compareMode === 'athletes' ? '#ffffff' : colors.accent.primary} />
                <Text style={[styles.modeButtonText, compareMode === 'athletes' && styles.modeButtonTextActive]}>
                  Entre Atletas
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modeButton, compareMode === 'sessions' && styles.modeButtonActive]}
                onPress={() => setCompareMode('sessions')}
              >
                <Ionicons name="calendar" size={18} color={compareMode === 'sessions' ? '#ffffff' : colors.accent.primary} />
                <Text style={[styles.modeButtonText, compareMode === 'sessions' && styles.modeButtonTextActive]}>
                  Sessões
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modeButton, compareMode === 'position-group' && styles.modeButtonActive]}
                onPress={() => setCompareMode('position-group')}
              >
                <Ionicons name="layers" size={18} color={compareMode === 'position-group' ? '#ffffff' : colors.accent.primary} />
                <Text style={[styles.modeButtonText, compareMode === 'position-group' && styles.modeButtonTextActive]}>
                  Grupos por Posição
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Date Range Filter */}
          <View style={styles.dateFilter}>
            <Text style={styles.filterLabel}>Período:</Text>
            <View style={styles.dateButtons}>
              {(['7d', '30d', 'all'] as const).map(range => (
                <TouchableOpacity
                  key={range}
                  style={[styles.dateButton, dateRange === range && styles.dateButtonActive]}
                  onPress={() => setDateRange(range)}
                >
                  <Text style={[styles.dateButtonText, dateRange === range && styles.dateButtonTextActive]}>
                    {range === '7d' ? '7 dias' : range === '30d' ? '30 dias' : 'Tudo'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.accent.primary} style={{ marginTop: 32 }} />
          ) : (
            <>
              {/* Selection Area */}
              {compareMode === 'athletes' && athletes && athletes.length > 0 && (
                <View style={styles.selectionArea}>
                  <Text style={styles.selectionTitle}>
                    Selecione Atletas ({selectedAthletes.length}/10)
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {athletes.map((athlete, index) => {
                      const athleteId = athlete.id || athlete._id || `athlete-${index}`;
                      const isSelected = selectedAthletes.includes(athleteId);
                      return (
                        <TouchableOpacity
                          key={athleteId}
                          style={[styles.athleteChip, isSelected && styles.athleteChipSelected]}
                          onPress={() => toggleAthlete(athleteId)}
                        >
                          <Text style={[styles.athleteChipText, isSelected && styles.athleteChipTextSelected]}>
                            {athlete.name}
                          </Text>
                          {isSelected && (
                            <View style={[styles.chipNumber, { backgroundColor: ATHLETE_COLORS[selectedAthletes.indexOf(athleteId) % ATHLETE_COLORS.length] }]}>
                              <Text style={styles.chipNumberText}>
                                {selectedAthletes.indexOf(athleteId) + 1}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {compareMode === 'sessions' && athletes && athletes.length > 0 && (
                <View style={styles.selectionArea}>
                  <Text style={styles.selectionTitle}>Selecione um Atleta</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {athletes.map((athlete, index) => {
                      const athleteId = athlete.id || athlete._id || `athlete-${index}`;
                      const isSelected = selectedAthlete === athleteId;
                      return (
                        <TouchableOpacity
                          key={athleteId}
                          style={[styles.athleteChip, isSelected && styles.athleteChipSelected]}
                          onPress={() => setSelectedAthlete(isSelected ? null : athleteId)}
                        >
                          <Text style={[styles.athleteChipText, isSelected && styles.athleteChipTextSelected]}>
                            {athlete.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {compareMode === 'position-group' && positions.length > 0 && (
                <View style={styles.selectionArea}>
                  <Text style={styles.selectionTitle}>Selecione Posições</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {positions.map(position => {
                      const isSelected = selectedPositions.includes(position);
                      return (
                        <TouchableOpacity
                          key={position}
                          style={[
                            styles.positionChip, 
                            isSelected && styles.positionChipSelected,
                            isSelected && { borderColor: POSITION_COLORS[position] || colors.accent.primary }
                          ]}
                          onPress={() => togglePosition(position)}
                        >
                          <View style={[
                            styles.positionDot, 
                            { backgroundColor: POSITION_COLORS[position] || colors.accent.primary }
                          ]} />
                          <Text style={[styles.positionChipText, isSelected && styles.positionChipTextSelected]}>
                            {position}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Quadrant Chart */}
              {renderQuadrantChart()}

              {/* Stats Summary */}
              {quadrantData.length > 0 && (
                <View style={styles.statsContainer}>
                  <Text style={styles.sectionTitle}>Resumo Estatístico</Text>
                  <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                      <Ionicons name="speedometer" size={24} color={colors.accent.primary} />
                      <Text style={styles.statValue}>
                        {(quadrantData.reduce((sum, d) => sum + d.x, 0) / quadrantData.length).toFixed(0)}m
                      </Text>
                      <Text style={styles.statLabel}>Dist. Total Média</Text>
                    </View>
                    <View style={styles.statCard}>
                      <Ionicons name="flash" size={24} color={colors.status.warning} />
                      <Text style={styles.statValue}>
                        {(quadrantData.reduce((sum, d) => sum + d.y, 0) / quadrantData.length).toFixed(0)}m
                      </Text>
                      <Text style={styles.statLabel}>Alta Int. Média</Text>
                    </View>
                    <View style={styles.statCard}>
                      <Ionicons name="trending-up" size={24} color={colors.status.success} />
                      <Text style={styles.statValue}>
                        {Math.max(...quadrantData.map(d => d.x)).toFixed(0)}m
                      </Text>
                      <Text style={styles.statLabel}>Maior Distância</Text>
                    </View>
                    <View style={styles.statCard}>
                      <Ionicons name="trophy" size={24} color={colors.status.error} />
                      <Text style={styles.statValue}>
                        {Math.max(...quadrantData.map(d => d.y)).toFixed(0)}m
                      </Text>
                      <Text style={styles.statLabel}>Maior Alta Int.</Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 12,
  },
  modeSelector: {
    marginBottom: 20,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  dateFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginRight: 12,
  },
  dateButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  dateButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.dark.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  dateButtonActive: {
    backgroundColor: colors.accent.secondary,
    borderColor: colors.accent.secondary,
  },
  dateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  dateButtonTextActive: {
    color: '#ffffff',
  },
  selectionArea: {
    marginBottom: 20,
  },
  selectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 10,
  },
  athleteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.dark.card,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  athleteChipSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderColor: colors.accent.primary,
  },
  athleteChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  athleteChipTextSelected: {
    color: colors.text.primary,
  },
  chipNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  chipNumberText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  positionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.dark.card,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 2,
    borderColor: colors.border.default,
    gap: 8,
  },
  positionChipSelected: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  positionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  positionChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  positionChipTextSelected: {
    color: colors.text.primary,
  },
  chartContainer: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 16,
  },
  chartArea: {
    height: 280,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  quadrantGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quadrant: {
    width: '50%',
    height: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  quadrantTopLeft: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  quadrantTopRight: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  quadrantBottomLeft: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  quadrantBottomRight: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  quadrantLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  dataPoint: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -14,
    marginTop: -14,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  dataPointText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  axisLabels: {
    alignItems: 'center',
    marginTop: 8,
  },
  axisLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  emptyChart: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 48,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  emptyChartText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 12,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  legendColor: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  legendTextContainer: {
    flex: 1,
  },
  legendName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  legendValues: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  statsContainer: {
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
  },
});
