import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import api from '../../../services/api';
import { Athlete, GPSData, WellnessQuestionnaire } from '../../../types';
import { GPSChart } from '../../../components/charts/GPSChart';
import { WellnessChart } from '../../../components/charts/WellnessChart';
import { StatCard } from '../../../components/charts/StatCard';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ReportPreviewModal } from '../../../components/ReportPreviewModal';

export default function AthleteCharts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const [showPreview, setShowPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  const labels = useMemo(() => ({
    charts: locale === 'pt' ? 'Gráficos' : 'Charts',
    gpsStats: locale === 'pt' ? 'Estatísticas GPS' : 'GPS Statistics',
    sessions: locale === 'pt' ? 'Sessões' : 'Sessions',
    avgDistance: locale === 'pt' ? 'Dist. Média' : 'Avg Distance',
    avgSprints: locale === 'pt' ? 'Sprints Médios' : 'Avg Sprints',
    maxSpeed: locale === 'pt' ? 'Vel. Máxima' : 'Max Speed',
    gpsEvolution: locale === 'pt' ? 'Evolução GPS' : 'GPS Evolution',
    totalDistance: locale === 'pt' ? 'Distância Total (metros)' : 'Total Distance (meters)',
    highIntensityDistance: locale === 'pt' ? 'Distância Alta Intensidade (metros)' : 'High Intensity Distance (meters)',
    sprintDistance: locale === 'pt' ? 'Distância em Sprints (metros)' : 'Sprint Distance (meters)',
    numberOfSprints: locale === 'pt' ? 'Número de Sprints' : 'Number of Sprints',
    wellnessStats: locale === 'pt' ? 'Estatísticas Wellness' : 'Wellness Statistics',
    avgWellness: locale === 'pt' ? 'Wellness Médio' : 'Avg Wellness',
    avgReadiness: locale === 'pt' ? 'Prontidão Média' : 'Avg Readiness',
    avgSleep: locale === 'pt' ? 'Sono Médio' : 'Avg Sleep',
    wellnessEvolution: locale === 'pt' ? 'Evolução Wellness' : 'Wellness Evolution',
    exportPdf: locale === 'pt' ? 'Exportar PDF' : 'Export PDF',
    preview: locale === 'pt' ? 'Visualizar antes' : 'Preview before',
  }), [locale]);

  const handlePdfExport = async () => {
    setDownloading(true);
    try {
      const baseUrl = api.defaults.baseURL?.replace('/api', '') || '';
      const fullUrl = `${baseUrl}/api/reports/athlete/${id}/pdf?lang=${locale}`;
      
      if (Platform.OS === 'web') {
        window.open(fullUrl, '_blank');
      } else {
        await Linking.openURL(fullUrl);
      }
    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Erro ao exportar PDF' : 'Error exporting PDF'
      );
    } finally {
      setDownloading(false);
    }
  };

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
          <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {athlete?.name} - {labels.charts}
        </Text>
        <TouchableOpacity 
          onPress={() => setShowPreview(true)} 
          style={styles.pdfButton}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.accent.primary} />
          ) : (
            <Ionicons name="document-text" size={24} color="#dc2626" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* GPS Stats */}
        {stats && (
          <>
            <Text style={styles.sectionTitle}>{labels.gpsStats}</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title={labels.sessions}
                  value={stats.totalSessions}
                  icon="calendar"
                  color="#2563eb"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title={labels.avgDistance}
                  value={`${stats.avgDistance}m`}
                  icon="fitness"
                  color="#10b981"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title={labels.avgSprints}
                  value={stats.avgSprints}
                  icon="flash"
                  color="#f59e0b"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title={labels.maxSpeed}
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
            <Text style={styles.sectionTitle}>{labels.gpsEvolution}</Text>
            
            <GPSChart
              data={gpsData}
              metric="total_distance"
              title={labels.totalDistance}
              color="#2563eb"
            />
            
            <GPSChart
              data={gpsData}
              metric="high_intensity_distance"
              title={labels.highIntensityDistance}
              color="#f59e0b"
            />
            
            <GPSChart
              data={gpsData}
              metric="sprint_distance"
              title={labels.sprintDistance}
              color="#ef4444"
            />
            
            <GPSChart
              data={gpsData}
              metric="number_of_sprints"
              title={labels.numberOfSprints}
              color="#8b5cf6"
            />
          </>
        )}

        {/* Wellness Stats */}
        {wellnessStats && (
          <>
            <Text style={styles.sectionTitle}>{labels.wellnessStats}</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title={labels.avgWellness}
                  value={`${wellnessStats.avgWellness}/10`}
                  icon="heart"
                  color="#10b981"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title={labels.avgReadiness}
                  value={`${wellnessStats.avgReadiness}/10`}
                  icon="checkmark-circle"
                  color="#2563eb"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  title={labels.avgSleep}
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
            <Text style={styles.sectionTitle}>{labels.wellnessEvolution}</Text>
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

      {/* PDF Preview Modal */}
      <ReportPreviewModal
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        reportType="pdf"
        athleteId={id || ''}
        athleteName={athlete?.name || ''}
        locale={locale}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
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
  pdfButton: {
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
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
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
    color: colors.text.secondary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: 8,
    textAlign: 'center',
  },
});
