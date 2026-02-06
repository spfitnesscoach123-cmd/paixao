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
import { colors } from '../../constants/theme';

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
    
    const avgDistance = allGPSData.length > 0
      ? allGPSData.reduce((sum, d) => sum + d.total_distance, 0) / allGPSData.length
      : 0;

    const avgWellness = allWellnessData.length > 0
      ? allWellnessData.reduce((sum, w) => sum + (w.wellness_score || 0), 0) / allWellnessData.length
      : 0;

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().split('T')[0];

    const recentSessions = allGPSData.filter(d => d.date >= lastWeekStr).length;
    const recentWellness = allWellnessData.filter(w => w.date >= lastWeekStr);
    const recentAvgWellness = recentWellness.length > 0
      ? recentWellness.reduce((sum, w) => sum + (w.wellness_score || 0), 0) / recentWellness.length
      : 0;

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
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        <ScrollView
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={colors.accent.primary}
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerGreeting}>Dashboard</Text>
              <Text style={styles.headerTitle}>Visão da Equipe</Text>
            </View>
            <TouchableOpacity
              style={styles.compareButton}
              onPress={() => router.push('/compare-athletes')}
            >
              <LinearGradient
                colors={colors.gradients.green}
                style={styles.compareGradient}
              >
                <Ionicons name="git-compare" size={24} color="#ffffff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Import Button */}
          <TouchableOpacity
            style={styles.importButton}
            onPress={() => router.push('/upload-catapult')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={colors.gradients.purple}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.importGradient}
            >
              <Ionicons name="cloud-upload" size={28} color="#ffffff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.importTitle}>Importar Dados Catapult</Text>
                <Text style={styles.importSubtitle}>CSV automático com múltiplos atletas</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>

          {stats && (
            <View style={styles.content}>
              {/* Impact Cards */}
              <View style={styles.cardsGrid}>
                <View style={styles.cardHalf}>
                  <ImpactCard
                    title="ATLETAS"
                    value={stats.totalAthletes}
                    subtitle="Total cadastrados"
                    icon="people"
                    gradientColors={colors.gradients.cyan}
                    onPress={() => router.push('/(tabs)/athletes')}
                  />
                </View>
                <View style={styles.cardHalf}>
                  <ImpactCard
                    title="SESSÕES"
                    value={stats.totalSessions}
                    subtitle={`${stats.recentSessions} últimos 7d`}
                    icon="bar-chart"
                    gradientColors={colors.gradients.green}
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
                    gradientColors={colors.gradients.teal}
                  />
                </View>
                <View style={styles.cardHalf}>
                  <ImpactCard
                    title="WELLNESS"
                    value={stats.avgWellness.toFixed(1)}
                    subtitle="/10"
                    icon="heart"
                    gradientColors={colors.gradients.pink}
                    trend={stats.wellnessTrend}
                    trendValue="vs. semana"
                  />
                </View>
              </View>

              {stats.topPerformer && (
                <View style={styles.fullCard}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => router.push(`/athlete/${stats.topPerformer.athlete.id || stats.topPerformer.athlete._id}`)}
                  >
                    <LinearGradient
                      colors={['#f97316', '#ea580c']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.topPerformerCard}
                    >
                      <View style={styles.trophyContainer}>
                        <Ionicons name="trophy" size={48} color="rgba(255,255,255,0.3)" />
                      </View>
                      <View style={styles.topPerformerContent}>
                        <Text style={styles.topPerformerLabel}>🏆 MELHOR DESEMPENHO</Text>
                        <Text style={styles.topPerformerName}>{stats.topPerformer.athlete.name}</Text>
                        <Text style={styles.topPerformerValue}>
                          Média: {(stats.topPerformer.avgDistance / 1000).toFixed(1)}km/sessão
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.8)" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}

              {/* Quick Stats */}
              <Text style={styles.sectionTitle}>Estatísticas Rápidas</Text>
              <View style={styles.quickStatsGrid}>
                <View style={styles.quickStatItem}>
                  <QuickStat
                    label="Sessões/Atleta"
                    value={(stats.totalSessions / (stats.totalAthletes || 1)).toFixed(1)}
                    icon="analytics"
                    color={colors.spectral.cyan}
                  />
                </View>
                <View style={styles.quickStatItem}>
                  <QuickStat
                    label="Atividade 7d"
                    value={`${stats.recentSessions}`}
                    icon="pulse"
                    color={colors.spectral.green}
                    trend="up"
                  />
                </View>
              </View>
            </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerGreeting: {
    fontSize: 14,
    color: colors.spectral.cyan,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  compareButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: colors.spectral.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 8,
  },
  compareGradient: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  importButton: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: colors.spectral.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
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
  content: {
    paddingHorizontal: 16,
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
  topPerformerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  trophyContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  topPerformerContent: {
    flex: 1,
  },
  topPerformerLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
    letterSpacing: 1,
  },
  topPerformerName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  topPerformerValue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 24,
    marginBottom: 16,
  },
  quickStatsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  quickStatItem: {
    flex: 1,
  },
});
