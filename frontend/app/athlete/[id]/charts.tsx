import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../services/api';
import { Athlete, GPSData, WellnessQuestionnaire } from '../../../types';
import { GPSChart } from '../../../components/charts/GPSChart';
import { WellnessChart } from '../../../components/charts/WellnessChart';
import { StatCard } from '../../../components/charts/StatCard';

export default function AthleteCharts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: athlete } = useQuery({
    queryKey: ['athlete', id],
    queryFn: async () => {
      const response = await api.get<Athlete>(`/athletes/${id}`);
      return response.data;
    },
  });

  const { data: gpsData } = useQuery({
    queryKey: ['gps', id],
    queryFn: async () => {
      const response = await api.get<GPSData[]>(`/gps-data/athlete/${id}`);
      return response.data;
    },
  });

  const { data: wellnessData } = useQuery({
    queryKey: ['wellness', id],
    queryFn: async () => {
      const response = await api.get<WellnessQuestionnaire[]>(`/wellness/athlete/${id}`);
      return response.data;
    },
  });

  const calculateStats = () => {
    if (!gpsData || gpsData.length === 0) return null;

    const totalSessions = gpsData.length;
    const avgDistance = gpsData.reduce((sum, d) => sum + d.total_distance, 0) / totalSessions;
    const avgSprints = gpsData.reduce((sum, d) => sum + d.number_of_sprints, 0) / totalSessions;
    const maxSpeed = Math.max(...gpsData.map(d => d.max_speed || 0));

    return {
      totalSessions,
      avgDistance: avgDistance.toFixed(0),
      avgSprints: avgSprints.toFixed(1),
      maxSpeed: maxSpeed.toFixed(1),
    };
  };

  const calculateWellnessStats = () => {
    if (!wellnessData || wellnessData.length === 0) return null;

    const avgWellness = wellnessData.reduce((sum, w) => sum + (w.wellness_score || 0), 0) / wellnessData.length;
    const avgReadiness = wellnessData.reduce((sum, w) => sum + (w.readiness_score || 0), 0) / wellnessData.length;
    const avgSleep = wellnessData.reduce((sum, w) => sum + w.sleep_hours, 0) / wellnessData.length;

    return {
      avgWellness: avgWellness.toFixed(1),
      avgReadiness: avgReadiness.toFixed(1),
      avgSleep: avgSleep.toFixed(1),
    };
  };

  const stats = calculateStats();
  const wellnessStats = calculateWellnessStats();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {athlete?.name} - Gráficos
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* GPS Stats */}
        {stats && (
          <>
            <Text style={styles.sectionTitle}>Estatísticas GPS</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title="Sessões"
                  value={stats.totalSessions}
                  icon="calendar"
                  color="#2563eb"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title="Dist. Média"
                  value={`${stats.avgDistance}m`}
                  icon="fitness"
                  color="#10b981"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title="Sprints Médios"
                  value={stats.avgSprints}
                  icon="flash"
                  color="#f59e0b"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title="Vel. Máxima"
                  value={`${stats.maxSpeed} km/h`}
                  icon="speedometer"
                  color="#ef4444"
                />
              </View>
            </View>
          </>
        )}

        {/* GPS Charts */}
        {gpsData && gpsData.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Evolução GPS</Text>
            
            <GPSChart
              data={gpsData}
              metric="total_distance"
              title="Distância Total (metros)"
              color="#2563eb"
            />
            
            <GPSChart
              data={gpsData}
              metric="high_intensity_distance"
              title="Distância Alta Intensidade (metros)"
              color="#f59e0b"
            />
            
            <GPSChart
              data={gpsData}
              metric="sprint_distance"
              title="Distância em Sprints (metros)"
              color="#ef4444"
            />
            
            <GPSChart
              data={gpsData}
              metric="number_of_sprints"
              title="Número de Sprints"
              color="#8b5cf6"
            />
          </>
        )}

        {/* Wellness Stats */}
        {wellnessStats && (
          <>
            <Text style={styles.sectionTitle}>Estatísticas Wellness</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title="Wellness Médio"
                  value={`${wellnessStats.avgWellness}/10`}
                  icon="heart"
                  color="#10b981"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title="Prontidão Média"
                  value={`${wellnessStats.avgReadiness}/10`}
                  icon="checkmark-circle"
                  color="#2563eb"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title="Sono Médio"
                  value={`${wellnessStats.avgSleep}h`}
                  icon="moon"
                  color="#8b5cf6"
                />
              </View>
            </View>
          </>
        )}

        {/* Wellness Chart */}
        {wellnessData && wellnessData.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Evolução Wellness</Text>
            <WellnessChart data={wellnessData} />
          </>
        )}

        {/* Empty State */}
        {(!gpsData || gpsData.length === 0) && (!wellnessData || wellnessData.length === 0) && (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>Sem dados para visualizar</Text>
            <Text style={styles.emptySubtext}>
              Adicione dados GPS e wellness para ver gráficos
            </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2563eb',
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
    color: '#ffffff',
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 8,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCardWrapper: {
    width: '48%',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
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
});
