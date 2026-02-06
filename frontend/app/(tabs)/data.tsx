import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { Athlete, GPSData, WellnessQuestionnaire } from '../../types';
import { ImpactCard } from '../../components/dashboard/ImpactCard';
import { QuickStat } from '../../components/dashboard/QuickStat';

export default function DataScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);

  const { data: athletes } = useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const response = await api.get<Athlete[]>('/athletes');
      return response.data;
    },
  });

  // Fetch GPS data for all athletes
  const { data: allGPSData } = useQuery({
    queryKey: ['all-gps-data'],
    queryFn: async () => {
      if (!athletes || athletes.length === 0) return [];
      const promises = athletes.map(athlete =>
        api.get<GPSData[]>(`/gps-data/athlete/${athlete.id || athlete._id}`)
          .then(res => res.data)
          .catch(() => [])
      );
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: !!athletes && athletes.length > 0,
  });

  // Fetch wellness data for all athletes
  const { data: allWellnessData } = useQuery({
    queryKey: ['all-wellness-data'],
    queryFn: async () => {
      if (!athletes || athletes.length === 0) return [];
      const promises = athletes.map(athlete =>
        api.get<WellnessQuestionnaire[]>(`/wellness/athlete/${athlete.id || athlete._id}`)
          .then(res => res.data)
          .catch(() => [])
      );
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: !!athletes && athletes.length > 0,
  });

  const stats = useMemo(() => {
    if (!athletes || !allGPSData || !allWellnessData) return null;

    const totalAthletes = athletes.length;
    const totalSessions = allGPSData.length;
    
    // Average distance
    const avgDistance = allGPSData.length > 0
      ? allGPSData.reduce((sum, d) => sum + d.total_distance, 0) / allGPSData.length
      : 0;

    // Average wellness
    const avgWellness = allWellnessData.length > 0
      ? allWellnessData.reduce((sum, w) => sum + (w.wellness_score || 0), 0) / allWellnessData.length
      : 0;

    // Get last week data for trends
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().split('T')[0];

    const recentSessions = allGPSData.filter(d => d.date >= lastWeekStr).length;
    const recentWellness = allWellnessData.filter(w => w.date >= lastWeekStr);
    const recentAvgWellness = recentWellness.length > 0
      ? recentWellness.reduce((sum, w) => sum + (w.wellness_score || 0), 0) / recentWellness.length
      : 0;

    // Top performers
    const athleteDistances = athletes.map(athlete => {
      const athleteGPS = allGPSData.filter(d => d.athlete_id === (athlete.id || athlete._id));
      const avgDist = athleteGPS.length > 0
        ? athleteGPS.reduce((sum, d) => sum + d.total_distance, 0) / athleteGPS.length
        : 0;
      return { athlete, avgDistance: avgDist };
    });

    const topPerformer = athleteDistances.sort((a, b) => b.avgDistance - a.avgDistance)[0];

    return {
      totalAthletes,
      totalSessions,
      avgDistance,
      avgWellness,
      recentSessions,
      recentAvgWellness,
      topPerformer,
      wellnessTrend: recentAvgWellness > avgWellness ? 'up' : 'down',
    };
  }, [athletes, allGPSData, allWellnessData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['athletes'] }),
      queryClient.invalidateQueries({ queryKey: ['all-gps-data'] }),
      queryClient.invalidateQueries({ queryKey: ['all-wellness-data'] }),
    ]);
    setRefreshing(false);
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <LinearGradient
        colors={['#1e40af', '#3b82f6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View>
          <Text style={styles.headerGreeting}>Dashboard</Text>
          <Text style={styles.headerTitle}>Visão Geral da Equipe</Text>
        </View>
        <TouchableOpacity 
          style={styles.compareButton}
          onPress={() => router.push('/compare-athletes')}
        >
          <Ionicons name="git-compare" size={24} color="#ffffff" />
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.content}>
        {/* Quick Actions */}
        <TouchableOpacity
          style={styles.importButton}
          onPress={() => router.push('/upload-catapult')}
        >
          <LinearGradient
            colors={['#8b5cf6', '#a78bfa']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.importGradient}
          >
            <Ionicons name="cloud-upload" size={28} color="#ffffff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.importTitle}>Importar Dados Catapult</Text>
              <Text style={styles.importSubtitle}>Upload CSV para múltiplos atletas</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#ffffff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Impact Cards */}
        {stats && (
          <>
            <View style={styles.cardsGrid}>
              <View style={styles.cardHalf}>
                <ImpactCard
                  title="ATLETAS"
                  value={stats.totalAthletes}
                  subtitle="Total cadastrados"
                  icon="people"
                  gradientColors={['#3b82f6', '#2563eb']}
                  onPress={() => router.push('/(tabs)/athletes')}
                />
              </View>
              <View style={styles.cardHalf}>
                <ImpactCard
                  title="SESSÕES"
                  value={stats.totalSessions}
                  subtitle={`${stats.recentSessions} últimos 7 dias`}
                  icon="bar-chart"
                  gradientColors={['#10b981', '#059669']}
                />
              </View>
            </View>

            <View style={styles.cardsGrid}>
              <View style={styles.cardHalf}>
                <ImpactCard
                  title="DISTÂNCIA MÉDIA"
                  value={`${(stats.avgDistance / 1000).toFixed(1)}km`}
                  subtitle="Por sessão"
                  icon="fitness"
                  gradientColors={['#f59e0b', '#d97706']}
                />
              </View>
              <View style={styles.cardHalf}>
                <ImpactCard
                  title="WELLNESS MÉDIO"
                  value={stats.avgWellness.toFixed(1)}
                  subtitle="/10"
                  icon="heart"
                  gradientColors={['#ec4899', '#db2777']}
                  trend={stats.wellnessTrend}
                  trendValue="vs. última semana"
                />
              </View>
            </View>

            {stats.topPerformer && (
              <View style={styles.fullCard}>
                <ImpactCard
                  title="🏆 MELHOR DESEMPENHO"
                  value={stats.topPerformer.athlete.name}
                  subtitle={`Média: ${(stats.topPerformer.avgDistance / 1000).toFixed(1)}km por sessão`}
                  icon="trophy"
                  gradientColors={['#f97316', '#ea580c']}
                  onPress={() => router.push(`/athlete/${stats.topPerformer.athlete.id || stats.topPerformer.athlete._id}`)}
                />
              </View>
            )}
          </>
        )}

        {/* Quick Stats Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estatísticas Rápidas</Text>
          <View style={styles.quickStatsGrid}>
            {stats && (
              <>
                <View style={styles.quickStatItem}>
                  <QuickStat
                    label="Sessões/Atleta"
                    value={(stats.totalSessions / (stats.totalAthletes || 1)).toFixed(1)}
                    icon="analytics"
                    color="#3b82f6"
                  />
                </View>
                <View style={styles.quickStatItem}>
                  <QuickStat
                    label="Atividade"
                    value={`${stats.recentSessions}`}
                    icon="pulse"
                    color="#10b981"
                    trend="up"
                  />
                </View>
              </>
            )}
          </View>
        </View>

        {/* Athletes List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Meus Atletas</Text>
            <TouchableOpacity onPress={() => router.push('/compare-athletes')}>
              <Text style={styles.compareLink}>Comparar →</Text>
            </TouchableOpacity>
          </View>

          {athletes && athletes.length > 0 ? (
            athletes.slice(0, 5).map((athlete) => (
              <TouchableOpacity
                key={athlete.id || athlete._id}
                style={styles.athleteCard}
                onPress={() => router.push(`/athlete/${athlete.id || athlete._id}/charts`)}
              >
                <View style={styles.athleteIcon}>
                  <Ionicons name="person" size={20} color="#2563eb" />
                </View>
                <View style={styles.athleteInfo}>
                  <Text style={styles.athleteName}>{athlete.name}</Text>
                  <Text style={styles.athletePosition}>{athlete.position}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Nenhum atleta cadastrado</Text>
            </View>
          )}

          {athletes && athletes.length > 5 && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() => router.push('/(tabs)/athletes')}
            >
              <Text style={styles.viewAllText}>Ver todos os {athletes.length} atletas</Text>
              <Ionicons name="arrow-forward" size={16} color="#2563eb" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerGreeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  compareButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    marginTop: -20,
  },
  importButton: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  importGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  importTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  importSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  cardsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  cardHalf: {
    flex: 1,
  },
  fullCard: {
    marginBottom: 12,
  },
  section: {
    marginTop: 24,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  compareLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  quickStatsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  quickStatItem: {
    flex: 1,
  },
  athleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  athleteIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  athletePosition: {
    fontSize: 13,
    color: '#6b7280',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 8,
    gap: 8,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 12,
  },
});