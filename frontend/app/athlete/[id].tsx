import React, { useState } from 'react';
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
import { format } from 'date-fns';
import { AnalysisTab } from '../../components/AnalysisTab';
import { colors } from '../../constants/theme';

type TabType = 'info' | 'gps' | 'wellness' | 'assessments' | 'analysis';

export default function AthleteDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [refreshing, setRefreshing] = useState(false);

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
        <ActivityIndicator size="large" color={colors.spectral.cyan} />
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
                <Ionicons name="calendar" size={20} color={colors.spectral.cyan} />
                <Text style={styles.infoLabel}>Idade:</Text>
                <Text style={styles.infoValue}>{calculateAge(athlete.birth_date)} anos</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="football" size={20} color={colors.spectral.green} />
                <Text style={styles.infoLabel}>Posição:</Text>
                <Text style={styles.infoValue}>{athlete.position}</Text>
              </View>
              {athlete.height && (
                <View style={styles.infoRow}>
                  <Ionicons name="resize" size={20} color={colors.spectral.teal} />
                  <Text style={styles.infoLabel}>Altura:</Text>
                  <Text style={styles.infoValue}>{athlete.height} cm</Text>
                </View>
              )}
              {athlete.weight && (
                <View style={styles.infoRow}>
                  <Ionicons name="barbell" size={20} color={colors.spectral.purple} />
                  <Text style={styles.infoLabel}>Peso:</Text>
                  <Text style={styles.infoValue}>{athlete.weight} kg</Text>
                </View>
              )}
            </View>

            <TouchableOpacity 
              style={styles.chartsButton}
              onPress={() => router.push(`/athlete/${id}/charts`)}
            >
              <Ionicons name="bar-chart" size={20} color={colors.spectral.cyan} />
              <Text style={styles.chartsButtonText}>Ver Gráficos Detalhados</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.spectral.cyan} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color={colors.status.error} />
              <Text style={styles.deleteButtonText}>Excluir Atleta</Text>
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
                <Text style={styles.actionButtonText}>Entrada Manual</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/athlete/${id}/upload-gps`)}
              >
                <Ionicons name="cloud-upload" size={24} color="#2563eb" />
                <Text style={styles.actionButtonText}>Upload CSV</Text>
              </TouchableOpacity>
            </View>

            {gpsLoading ? (
              <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 32 }} />
            ) : gpsData && gpsData.length > 0 ? (
              gpsData.map((item) => (
                <View key={item.id} style={styles.dataCard}>
                  <View style={styles.dataHeader}>
                    <Ionicons name="location" size={20} color="#2563eb" />
                    <Text style={styles.dataDate}>{item.date}</Text>
                  </View>
                  <View style={styles.dataGrid}>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Dist. Total</Text>
                      <Text style={styles.dataValue}>{item.total_distance.toFixed(0)}m</Text>
                    </View>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Alta Int.</Text>
                      <Text style={styles.dataValue}>{item.high_intensity_distance.toFixed(0)}m</Text>
                    </View>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Sprints</Text>
                      <Text style={styles.dataValue}>{item.number_of_sprints}</Text>
                    </View>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Vel. Máx</Text>
                      <Text style={styles.dataValue}>{item.max_speed?.toFixed(1) || '-'} km/h</Text>
                    </View>
                  </View>
                  {item.notes && (
                    <Text style={styles.dataNotes}>{item.notes}</Text>
                  )}
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="location-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>Nenhum dado GPS registrado</Text>
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
              <Text style={styles.addButtonText}>Novo Questionário</Text>
            </TouchableOpacity>

            {wellnessLoading ? (
              <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 32 }} />
            ) : wellnessData && wellnessData.length > 0 ? (
              wellnessData.map((item) => (
                <View key={item.id} style={styles.dataCard}>
                  <View style={styles.dataHeader}>
                    <Ionicons name="fitness" size={20} color="#10b981" />
                    <Text style={styles.dataDate}>{item.date}</Text>
                  </View>
                  <View style={styles.scoreRow}>
                    <View style={styles.scoreBox}>
                      <Text style={styles.scoreLabel}>Wellness</Text>
                      <Text style={[styles.scoreValue, { color: item.wellness_score! >= 7 ? '#10b981' : item.wellness_score! >= 5 ? '#f59e0b' : '#ef4444' }]}>
                        {item.wellness_score?.toFixed(1)}
                      </Text>
                    </View>
                    <View style={styles.scoreBox}>
                      <Text style={styles.scoreLabel}>Prontidão</Text>
                      <Text style={[styles.scoreValue, { color: item.readiness_score! >= 7 ? '#10b981' : item.readiness_score! >= 5 ? '#f59e0b' : '#ef4444' }]}>
                        {item.readiness_score?.toFixed(1)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.dataGrid}>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Fadiga</Text>
                      <Text style={styles.dataValue}>{item.fatigue}/10</Text>
                    </View>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Sono</Text>
                      <Text style={styles.dataValue}>{item.sleep_hours}h</Text>
                    </View>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Humor</Text>
                      <Text style={styles.dataValue}>{item.mood}/10</Text>
                    </View>
                    <View style={styles.dataItem}>
                      <Text style={styles.dataLabel}>Hidratação</Text>
                      <Text style={styles.dataValue}>{item.hydration}/10</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="fitness-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>Nenhum questionário registrado</Text>
              </View>
            )}
          </View>
        );

      case 'assessments':
        return (
          <View style={styles.tabContent}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/athlete/${id}/add-assessment`)}
            >
              <Ionicons name="add" size={24} color="#ffffff" />
              <Text style={styles.addButtonText}>Nova Avaliação</Text>
            </TouchableOpacity>

            {assessmentsLoading ? (
              <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 32 }} />
            ) : assessments && assessments.length > 0 ? (
              assessments.map((item) => (
                <View key={item.id} style={styles.dataCard}>
                  <View style={styles.dataHeader}>
                    <Ionicons 
                      name={item.assessment_type === 'strength' ? 'barbell' : item.assessment_type === 'aerobic' ? 'heart' : 'body'} 
                      size={20} 
                      color="#8b5cf6" 
                    />
                    <Text style={styles.dataDate}>{item.date}</Text>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeText}>
                        {item.assessment_type === 'strength' ? 'Força' : item.assessment_type === 'aerobic' ? 'Aeróbico' : 'Composição'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.metricsContainer}>
                    {Object.entries(item.metrics).map(([key, value]) => (
                      <View key={key} style={styles.metricItem}>
                        <Text style={styles.metricKey}>{key}:</Text>
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
                <Text style={styles.emptyText}>Nenhuma avaliação registrada</Text>
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
    borderColor: colors.spectral.cyan,
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
    borderBottomColor: colors.spectral.cyan,
  },
  tabText: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.spectral.cyan,
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
    borderColor: colors.spectral.cyan,
  },
  chartsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.spectral.cyan,
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
    borderColor: colors.spectral.cyan,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.spectral.cyan,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.spectral.green,
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
    color: colors.spectral.purple,
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
});
