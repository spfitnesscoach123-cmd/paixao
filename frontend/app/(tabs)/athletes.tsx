import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { Athlete } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSession } from '../../contexts/SessionContext';
import { AnimatedCard, SkeletonList, FadeInView } from '../../components/animations';

type HubView = 'hub' | 'athletes' | 'vbt-select' | 'assessment-menu' | 'bodyscan-select' | 'jump-select';

export default function AthletesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [hubView, setHubView] = useState<HubView>('hub');

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

  // Navigate to module with returnPath
  const launchModule = (athleteId: string, module: string) => {
    session.setActiveAthlete(athleteId);
    session.setMode('hub');
    session.setReturnPath('hub');
    router.push(`/athlete/${athleteId}/${module}?returnPath=hub` as any);
  };

  const styles = createStyles(colors);

  // ====== HUB MAIN VIEW ======
  if (hubView === 'hub') {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.hubContent, { paddingTop: insets.top + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hubTitle} data-testid="hub-title">
            {locale === 'pt' ? 'Central de Operacoes' : 'Operations Hub'}
          </Text>
          <Text style={styles.hubSubtitle}>
            {locale === 'pt' ? 'Selecione um modulo para iniciar' : 'Select a module to start'}
          </Text>

          {/* Card: Atletas */}
          <AnimatedCard
            style={styles.hubCard}
            onPress={() => setHubView('athletes')}
            data-testid="hub-card-athletes"
          >
            <LinearGradient
              colors={colors.gradients.card}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hubCardGradient}
            >
              <View style={[styles.hubCardIcon, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                <Ionicons name="people" size={28} color={colors.accent.primary} />
              </View>
              <View style={styles.hubCardInfo}>
                <Text style={styles.hubCardTitle}>
                  {locale === 'pt' ? 'Atletas' : 'Athletes'}
                </Text>
                <Text style={styles.hubCardDesc}>
                  {locale === 'pt' 
                    ? `${athletes?.length || 0} atletas cadastrados` 
                    : `${athletes?.length || 0} registered athletes`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
            </LinearGradient>
          </AnimatedCard>

          {/* Card: VBT */}
          <AnimatedCard
            style={styles.hubCard}
            onPress={() => setHubView('vbt-select')}
            data-testid="hub-card-vbt"
          >
            <LinearGradient
              colors={colors.gradients.card}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hubCardGradient}
            >
              <View style={[styles.hubCardIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Ionicons name="barbell" size={28} color="#3b82f6" />
              </View>
              <View style={styles.hubCardInfo}>
                <Text style={styles.hubCardTitle}>VBT</Text>
                <Text style={styles.hubCardDesc}>
                  {locale === 'pt' ? 'Velocity Based Training' : 'Velocity Based Training'}
                </Text>
                {/* Station Mode button */}
                <TouchableOpacity
                  style={styles.stationModeButton}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    session.setMode('hub');
                    router.push('/station/vbt' as any);
                  }}
                  data-testid="hub-station-vbt"
                >
                  <Ionicons name="repeat" size={14} color="#3b82f6" />
                  <Text style={styles.stationModeText}>Station Mode</Text>
                </TouchableOpacity>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
            </LinearGradient>
          </AnimatedCard>

          {/* Card: Avaliacoes Fisicas */}
          <AnimatedCard
            style={styles.hubCard}
            onPress={() => setHubView('assessment-menu')}
            data-testid="hub-card-assessments"
          >
            <LinearGradient
              colors={colors.gradients.card}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hubCardGradient}
            >
              <View style={[styles.hubCardIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="fitness" size={28} color="#10b981" />
              </View>
              <View style={styles.hubCardInfo}>
                <Text style={styles.hubCardTitle}>
                  {locale === 'pt' ? 'Avaliacoes Fisicas' : 'Physical Assessments'}
                </Text>
                <Text style={styles.hubCardDesc}>
                  {locale === 'pt' ? 'Body Scan e Jump Assessment' : 'Body Scan & Jump Assessment'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
            </LinearGradient>
          </AnimatedCard>
        </ScrollView>
      </View>
    );
  }

  // ====== ASSESSMENT SUBMENU ======
  if (hubView === 'assessment-menu') {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.hubContent, { paddingTop: insets.top + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => setHubView('hub')}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            <Text style={styles.backButtonText}>
              {locale === 'pt' ? 'Voltar' : 'Back'}
            </Text>
          </TouchableOpacity>
          
          <Text style={styles.hubTitle}>
            {locale === 'pt' ? 'Avaliacoes Fisicas' : 'Physical Assessments'}
          </Text>

          {/* Body Scan */}
          <AnimatedCard
            style={styles.hubCard}
            onPress={() => setHubView('bodyscan-select')}
            data-testid="hub-card-bodyscan"
          >
            <LinearGradient
              colors={colors.gradients.card}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hubCardGradient}
            >
              <View style={[styles.hubCardIcon, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                <Ionicons name="body" size={28} color="#ec4899" />
              </View>
              <View style={styles.hubCardInfo}>
                <Text style={styles.hubCardTitle}>
                  {locale === 'pt' ? 'Composicao Corporal' : 'Body Composition'}
                </Text>
                <Text style={styles.hubCardDesc}>
                  {locale === 'pt' ? 'Body Scan + protocolos de dobras' : 'Body Scan + skinfold protocols'}
                </Text>
                {/* Station Mode button */}
                <TouchableOpacity
                  style={[styles.stationModeButton, { backgroundColor: 'rgba(236, 72, 153, 0.12)' }]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    session.setMode('hub');
                    router.push('/station/body-scan' as any);
                  }}
                  data-testid="hub-station-bodyscan"
                >
                  <Ionicons name="repeat" size={14} color="#ec4899" />
                  <Text style={[styles.stationModeText, { color: '#ec4899' }]}>Station Mode</Text>
                </TouchableOpacity>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
            </LinearGradient>
          </AnimatedCard>

          {/* Jump Assessment */}
          <AnimatedCard
            style={styles.hubCard}
            onPress={() => setHubView('jump-select')}
            data-testid="hub-card-jump"
          >
            <LinearGradient
              colors={colors.gradients.card}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hubCardGradient}
            >
              <View style={[styles.hubCardIcon, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Ionicons name="trending-up" size={28} color="#f59e0b" />
              </View>
              <View style={styles.hubCardInfo}>
                <Text style={styles.hubCardTitle}>Jump Assessment</Text>
                <Text style={styles.hubCardDesc}>
                  {locale === 'pt' ? 'CMJ, SL-CMJ, RSI e fadiga' : 'CMJ, SL-CMJ, RSI & fatigue'}
                </Text>
                {/* Station Mode button */}
                <TouchableOpacity
                  style={[styles.stationModeButton, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    session.setMode('hub');
                    router.push('/station/jump' as any);
                  }}
                  data-testid="hub-station-jump"
                >
                  <Ionicons name="repeat" size={14} color="#f59e0b" />
                  <Text style={[styles.stationModeText, { color: '#f59e0b' }]}>Station Mode</Text>
                </TouchableOpacity>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
            </LinearGradient>
          </AnimatedCard>
        </ScrollView>
      </View>
    );
  }

  // ====== ATHLETE SELECTOR (for VBT, Body Scan, Jump) ======
  const moduleMap: Record<string, { title: string; route: string; icon: string; color: string }> = {
    'vbt-select': {
      title: 'VBT',
      route: 'vbt-camera',
      icon: 'barbell',
      color: '#3b82f6',
    },
    'bodyscan-select': {
      title: locale === 'pt' ? 'Body Scan' : 'Body Scan',
      route: 'body-scan',
      icon: 'body',
      color: '#ec4899',
    },
    'jump-select': {
      title: 'Jump Assessment',
      route: 'jump-camera',
      icon: 'trending-up',
      color: '#f59e0b',
    },
  };

  const currentModule = moduleMap[hubView];

  if (currentModule) {
    const parentView = hubView === 'vbt-select' ? 'hub' : 'assessment-menu';
    return (
      <View style={styles.container}>
        <View style={[styles.selectorHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => setHubView(parentView)}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            <Text style={styles.backButtonText}>
              {locale === 'pt' ? 'Voltar' : 'Back'}
            </Text>
          </TouchableOpacity>
          <View style={styles.selectorTitleRow}>
            <Ionicons name={currentModule.icon as any} size={22} color={currentModule.color} />
            <Text style={styles.selectorTitle}>{currentModule.title}</Text>
          </View>
          <Text style={styles.selectorSubtitle}>
            {locale === 'pt' ? 'Selecione o atleta' : 'Select athlete'}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.centerContainer}>
            <SkeletonList count={6} />
          </View>
        ) : (
          <FlatList
            data={athletes}
            keyExtractor={(item) => item.id || item._id || ''}
            renderItem={({ item }) => (
              <AnimatedCard
                style={styles.athleteCard}
                onPress={() => launchModule(item.id || item._id, currentModule.route)}
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
                        <Image source={{ uri: item.photo_base64 }} style={styles.athletePhoto} />
                      </View>
                    ) : (
                      <View style={styles.athletePhotoPlaceholder}>
                        <Ionicons name="person" size={24} color={currentModule.color} />
                      </View>
                    )}
                    <View style={styles.athleteInfo}>
                      <Text style={styles.athleteName}>{item.name}</Text>
                      <View style={styles.athleteDetails}>
                        <View style={styles.detailBadge}>
                          <Text style={styles.detailText}>{item.position}</Text>
                        </View>
                        {item.weight && (
                          <View style={styles.detailBadge}>
                            <Text style={styles.detailText}>{item.weight} kg</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={[styles.launchButton, { backgroundColor: currentModule.color + '20' }]}>
                      <Ionicons name="play" size={20} color={currentModule.color} />
                    </View>
                  </View>
                </LinearGradient>
              </AnimatedCard>
            )}
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
                <Ionicons name="people-outline" size={48} color={colors.text.tertiary} />
                <Text style={styles.emptyText}>
                  {locale === 'pt' ? 'Nenhum atleta cadastrado' : 'No athletes registered'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  // ====== ATHLETES LIST (profile access - preserves legacy flow) ======
  if (hubView === 'athletes') {
    return (
      <View style={styles.container}>
        <View style={[styles.selectorHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => setHubView('hub')}>
            <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
            <Text style={styles.backButtonText}>
              {locale === 'pt' ? 'Voltar' : 'Back'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.selectorTitle}>
            {locale === 'pt' ? 'Atletas' : 'Athletes'}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.centerContainer}>
            <SkeletonList count={6} />
          </View>
        ) : (
          <FlatList
            data={athletes}
            keyExtractor={(item) => item.id || item._id || ''}
            renderItem={({ item }) => (
              <AnimatedCard
                style={styles.athleteCard}
                onPress={() => {
                  session.setMode('profile');
                  router.push(`/athlete/${item.id || item._id}` as any);
                }}
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
                        <Image source={{ uri: item.photo_base64 }} style={styles.athletePhoto} />
                      </View>
                    ) : (
                      <View style={styles.athletePhotoPlaceholder}>
                        <Ionicons name="person" size={24} color={colors.accent.primary} />
                      </View>
                    )}
                    <View style={styles.athleteInfo}>
                      <Text style={styles.athleteName}>{item.name}</Text>
                      <View style={styles.athleteDetails}>
                        <View style={styles.detailBadge}>
                          <Ionicons name="calendar-outline" size={12} color={colors.accent.light} />
                          <Text style={styles.detailText}>{calculateAge(item.birth_date)} {t('athletes.years')}</Text>
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
              </AnimatedCard>
            )}
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
                <Ionicons name="people-outline" size={64} color={colors.accent.primary} />
                <Text style={styles.emptyText}>{t('athletes.noAthletes')}</Text>
                <Text style={styles.emptySubtext}>{t('athletes.addFirst')}</Text>
              </View>
            }
          />
        )}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/add-athlete' as any)}
          activeOpacity={0.8}
          data-testid="add-athlete-fab"
        >
          <LinearGradient colors={colors.gradients.primary} style={styles.fabGradient}>
            <Ionicons name="add" size={32} color="#ffffff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const createStyles = (colors: any) => StyleSheet.create({
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
  // HUB styles
  hubContent: {
    padding: 20,
    paddingBottom: 40,
  },
  hubTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  hubSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 24,
  },
  hubCard: {
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  hubCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    backgroundColor: colors.dark.card,
  },
  hubCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  hubCardInfo: {
    flex: 1,
  },
  hubCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 3,
  },
  hubCardDesc: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  stationModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  stationModeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
    letterSpacing: 0.3,
  },
  // Back button
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '600',
  },
  // Selector header
  selectorHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  selectorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  selectorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  selectorSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  // Athlete cards
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  athleteCard: {
    marginBottom: 10,
    borderRadius: 14,
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
    padding: 14,
  },
  photoContainer: {
    marginRight: 14,
  },
  athletePhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.accent.primary,
  },
  athletePhotoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: colors.border.default,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  athleteDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  detailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  detailText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  detailTextSmall: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  launchButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 6,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  fabGradient: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
