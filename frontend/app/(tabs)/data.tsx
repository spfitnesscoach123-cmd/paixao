import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { Athlete, GPSData, WellnessQuestionnaire } from '../../types';
import { StatCard } from '../../components/charts/StatCard';

export default function DataScreen() {
  const router = useRouter();

  const { data: athletes, isLoading: athletesLoading } = useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const response = await api.get<Athlete[]>('/athletes');
      return response.data;
    },
  });

  const calculateTeamStats = () => {
    if (!athletes || athletes.length === 0) return null;

    const totalAthletes = athletes.length;
    const avgAge = athletes.reduce((sum, athlete) => {
      const age = calculateAge(athlete.birth_date);
      return sum + age;
    }, 0) / totalAthletes;

    return {
      totalAthletes,
      avgAge: avgAge.toFixed(1),
    };
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

  const teamStats = calculateTeamStats();

  if (athletesLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!athletes || athletes.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="people-outline" size={64} color="#d1d5db" />
        <Text style={styles.emptyText}>Nenhum atleta cadastrado</Text>
        <Text style={styles.emptySubtext}>
          Adicione atletas para visualizar estatísticas da equipe
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/add-athlete')}
        >
          <Ionicons name="add" size={24} color="#ffffff" />
          <Text style={styles.addButtonText}>Adicionar Atleta</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard da Equipe</Text>
        <Text style={styles.headerSubtitle}>Visão geral dos seus atletas</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCardWrapper}>
          <StatCard
            title="Total de Atletas"
            value={teamStats?.totalAthletes || 0}
            icon="people"
            color="#2563eb"
          />
        </View>
        <View style={styles.statCardWrapper}>
          <StatCard
            title="Idade Média"
            value={`${teamStats?.avgAge} anos`}
            icon="calendar"
            color="#10b981"
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Atletas</Text>
        </View>

        {athletes.map((athlete) => (
          <TouchableOpacity
            key={athlete.id}
            style={styles.athleteCard}
            onPress={() => router.push(`/athlete/${athlete.id || athlete._id}/charts`)}
          >
            <View style={styles.athleteCardContent}>
              <View style={styles.athletePhotoPlaceholder}>
                {athlete.photo_base64 ? (
                  <Image 
                    source={{ uri: athlete.photo_base64 }} 
                    style={styles.athletePhoto}
                  />
                ) : (
                  <Ionicons name="person" size={24} color="#9ca3af" />
                )}
              </View>
              <View style={styles.athleteInfo}>
                <Text style={styles.athleteName}>{athlete.name}</Text>
                <View style={styles.athleteDetails}>
                  <View style={styles.detailItem}>
                    <Ionicons name="football-outline" size={14} color="#6b7280" />
                    <Text style={styles.detailText}>{athlete.position}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                    <Text style={styles.detailText}>{calculateAge(athlete.birth_date)} anos</Text>
                  </View>
                </View>
              </View>
              <View style={styles.chartsIconContainer}>
                <Ionicons name="bar-chart" size={24} color="#2563eb" />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={32} color="#2563eb" />
        <Text style={styles.infoTitle}>Visualize Gráficos Detalhados</Text>
        <Text style={styles.infoText}>
          Clique em qualquer atleta para ver gráficos de evolução GPS, wellness, e análises completas.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f9fafb',
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
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
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  athleteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  athleteCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  athletePhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  athleteDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: '#6b7280',
  },
  chartsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e40af',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    textAlign: 'center',
    lineHeight: 20,
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
