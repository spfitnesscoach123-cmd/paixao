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
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { Athlete } from '../../types';
import { colors } from '../../constants/theme';

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
      onPress={() => router.push(`/athlete/${item.id || item._id}`)}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={colors.gradients.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      >
        <View style={styles.athleteCardContent}>
          {item.photo_base64 ? (
            <View style={styles.photoContainer}>
              <Image
                source={{ uri: item.photo_base64 }}
                style={styles.athletePhoto}
              />
              <View style={styles.photoGlow} />
            </View>
          ) : (
            <View style={styles.athletePhotoPlaceholder}>
              <Ionicons name="person" size={28} color={colors.accent.primary} />
            </View>
          )}
          <View style={styles.athleteInfo}>
            <Text style={styles.athleteName}>{item.name}</Text>
            <View style={styles.athleteDetails}>
              <View style={styles.detailBadge}>
                <Ionicons name="calendar-outline" size={12} color={colors.accent.light} />
                <Text style={styles.detailText}>{calculateAge(item.birth_date)} anos</Text>
              </View>
              <View style={styles.detailBadge}>
                <Ionicons name="football-outline" size={12} color={colors.accent.tertiary} />
                <Text style={styles.detailText}>{item.position}</Text>
              </View>
            </View>
            {(item.height || item.weight) && (
              <View style={styles.athleteDetails}>
                {item.height && (
                  <View style={styles.detailBadge}>
                    <Text style={styles.detailTextSmall}>{item.height} cm</Text>
                  </View>
                )}
                {item.weight && (
                  <View style={styles.detailBadge}>
                    <Text style={styles.detailTextSmall}>{item.weight} kg</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.accent.primary} />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={athletes}
        keyExtractor={(item) => item.id || item._id || ''}
        renderItem={renderAthleteCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.accent.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconGlow}>
              <Ionicons name="people-outline" size={64} color={colors.accent.primary} />
            </View>
            <Text style={styles.emptyText}>Nenhum atleta cadastrado</Text>
            <Text style={styles.emptySubtext}>
              Adicione seu primeiro atleta ou importe CSV
            </Text>
          </View>
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/add-athlete')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={colors.gradients.primary}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={32} color="#ffffff" />
        </LinearGradient>
      </TouchableOpacity>
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
  listContent: {
    padding: 16,
  },
  athleteCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cardGradient: {
    backgroundColor: colors.dark.card,
  },
  athleteCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  photoContainer: {
    position: 'relative',
    marginRight: 16,
  },
  athletePhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.accent.primary,
  },
  photoGlow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent.primary,
    opacity: 0.2,
    top: 0,
    left: 0,
  },
  athletePhotoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 2,
    borderColor: colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 6,
  },
  athleteDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  detailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  detailTextSmall: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyIconGlow: {
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.text.secondary,
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
    overflow: 'hidden',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  fabGradient: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
