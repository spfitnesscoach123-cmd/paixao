import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { Athlete } from '../../types';

export default function AthletesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: athletes, isLoading } = useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const response = await api.get<Athlete[]>('/athletes');
      return response.data;
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['athletes'] });
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

  const renderAthleteCard = ({ item }: { item: Athlete }) => (
    <TouchableOpacity
      style={styles.athleteCard}
      onPress={() => router.push(`/athlete/${item.id}`)}
    >
      <View style={styles.athleteCardContent}>
        {item.photo_base64 ? (
          <Image
            source={{ uri: item.photo_base64 }}
            style={styles.athletePhoto}
          />
        ) : (
          <View style={styles.athletePhotoPlaceholder}>
            <Ionicons name="person" size={32} color="#9ca3af" />
          </View>
        )}
        <View style={styles.athleteInfo}>
          <Text style={styles.athleteName}>{item.name}</Text>
          <View style={styles.athleteDetails}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={14} color="#6b7280" />
              <Text style={styles.detailText}>{calculateAge(item.birth_date)} anos</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="football-outline" size={14} color="#6b7280" />
              <Text style={styles.detailText}>{item.position}</Text>
            </View>
          </View>
          {(item.height || item.weight) && (
            <View style={styles.athleteDetails}>
              {item.height && (
                <View style={styles.detailItem}>
                  <Ionicons name="resize-outline" size={14} color="#6b7280" />
                  <Text style={styles.detailText}>{item.height} cm</Text>
                </View>
              )}
              {item.weight && (
                <View style={styles.detailItem}>
                  <Ionicons name="barbell-outline" size={14} color="#6b7280" />
                  <Text style={styles.detailText}>{item.weight} kg</Text>
                </View>
              )}
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={24} color="#9ca3af" />
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={athletes}
        keyExtractor={(item) => item.id!}
        renderItem={renderAthleteCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>Nenhum atleta cadastrado</Text>
            <Text style={styles.emptySubtext}>
              Adicione seu primeiro atleta para começar
            </Text>
          </View>
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/add-athlete')}
      >
        <Ionicons name="add" size={32} color="#ffffff" />
      </TouchableOpacity>
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
  listContent: {
    padding: 16,
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
  athletePhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  athletePhotoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  athleteDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  detailText: {
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
