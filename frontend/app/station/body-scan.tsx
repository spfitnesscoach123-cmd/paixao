import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { Athlete } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSession } from '../../contexts/SessionContext';

/**
 * Station Mode for Body Scan.
 * 
 * Unlike VBT/Jump, Body Scan has a multi-screen chain:
 *   body-scan → protocol-select → measurement → report
 * The camera cannot persist across this chain, so Station Mode
 * uses Fluxo A navigation with returnPath='station' propagated
 * through the entire chain. After save in report.tsx, user returns
 * to the HUB where this picker is available.
 */
export default function StationBodyScan() {
  const router = useRouter();
  const { colors } = useTheme();
  const { locale } = useLanguage();
  const session = useSession();
  const insets = useSafeAreaInsets();

  const { data: athletes } = useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const response = await api.get<Athlete[]>('/athletes');
      return response.data;
    },
  });

  const launchBodyScan = useCallback((athlete: Athlete) => {
    const id = athlete.id || athlete._id;
    session.setActiveAthlete(id);
    session.setMode('hub');
    session.setReturnPath('station');
    // Navigate to body-scan with returnPath=station
    // This propagates through the entire chain: body-scan → protocol-select → measurement → report
    router.push(`/athlete/${id}/body-scan?returnPath=station` as any);
  }, [session, router]);

  const handleExit = useCallback(() => {
    session.setMode('hub');
    session.clearActiveAthlete();
    router.replace('/(tabs)/athletes' as any);
  }, [session, router]);

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Station Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={handleExit} style={styles.exitButton} data-testid="station-bodyscan-exit-btn">
          <Ionicons name="close" size={22} color={colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.stationBadge}>
            <Text style={styles.stationBadgeText}>STATION</Text>
          </View>
          <Text style={styles.headerTitle}>Body Scan</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      {/* Subtitle */}
      <View style={styles.subtitleRow}>
        <Ionicons name="body" size={18} color="#ec4899" />
        <Text style={styles.subtitle}>
          {locale === 'pt' ? 'Selecione o atleta para iniciar o Body Scan' : 'Select athlete to start Body Scan'}
        </Text>
      </View>

      {/* Athlete List */}
      <FlatList
        data={athletes}
        keyExtractor={(item) => item.id || item._id || ''}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.athleteCard}
            onPress={() => launchBodyScan(item)}
            data-testid={`station-bodyscan-pick-${item.id || item._id}`}
          >
            {item.photo_base64 ? (
              <Image source={{ uri: item.photo_base64 }} style={styles.athletePhoto} />
            ) : (
              <View style={styles.athletePhotoPlaceholder}>
                <Ionicons name="person" size={20} color="#ec4899" />
              </View>
            )}
            <View style={styles.athleteInfo}>
              <Text style={styles.athleteName}>{item.name}</Text>
              <View style={styles.athleteDetails}>
                <Text style={styles.athletePosition}>{item.position}</Text>
                {item.weight && <Text style={styles.athleteMetric}>{item.weight} kg</Text>}
                {item.height && <Text style={styles.athleteMetric}>{item.height} cm</Text>}
              </View>
            </View>
            <View style={styles.launchButton}>
              <Ionicons name="scan" size={20} color="#ec4899" />
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>
              {locale === 'pt' ? 'Nenhum atleta cadastrado' : 'No athletes registered'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: colors.dark.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  exitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stationBadge: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stationBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  athleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  athletePhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  athletePhotoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 3,
  },
  athleteDetails: {
    flexDirection: 'row',
    gap: 8,
  },
  athletePosition: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  athleteMetric: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  launchButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: colors.text.secondary,
  },
});
