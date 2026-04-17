import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface TeamDashboardResponse {
  stats: {
    total_athletes: number;
  };
  athletes: any[];
  risk_distribution: { [key: string]: number };
  position_summary: { [key: string]: any };
  alerts: string[];
}

export default function TeamDashboard() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = React.useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['team-dashboard'],
    queryFn: async () => {
      const response = await api.get<TeamDashboardResponse>(`/dashboard/team?lang=${locale}`);
      return response.data;
    },
  });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const styles = createStyles(colors);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="pulse" size={32} color={colors.accent.primary} />
        <Text style={styles.loadingText}>
          {locale === 'pt' ? 'Carregando...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning" size={48} color={colors.status.error} />
        <Text style={styles.errorText}>
          {locale === 'pt' ? 'Erro ao carregar dados' : 'Error loading data'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>{locale === 'pt' ? 'Tentar novamente' : 'Try again'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasNoData = data.stats.total_athletes === 0;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.gradients.background}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Dashboard da Equipe' : 'Team Dashboard'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {locale === 'pt' ? 'Visão geral do desempenho' : 'Performance overview'}
          </Text>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* CSV IMPORT BUTTON - INTOCÁVEL */}
          <TouchableOpacity
            style={styles.csvImportButton}
            onPress={() => router.push('/upload-csv')}
            activeOpacity={0.8}
            data-testid="csv-import-button"
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.csvImportGradient}
            >
              <Ionicons name="cloud-upload" size={24} color="#ffffff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.csvImportTitle}>
                  {locale === 'pt' ? 'Importar Dados CSV Catapult' : 'Import CSV Catapult Data'}
                </Text>
                <Text style={styles.csvImportSubtitle}>
                  {locale === 'pt' ? 'GPS, Sprint, Aceleração' : 'GPS, Sprint, Acceleration'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>

          {/* EMPTY STATE */}
          {hasNoData && (
            <View style={styles.emptyStateContainer} data-testid="team-empty-state">
              <Ionicons name="people-outline" size={64} color={colors.text.tertiary} />
              <Text style={styles.emptyStateTitle}>
                {locale === 'pt' ? 'Nenhum atleta cadastrado' : 'No athletes registered'}
              </Text>
              <Text style={styles.emptyStateSubtitle}>
                {locale === 'pt'
                  ? 'Adicione atletas para visualizar estatísticas da equipe'
                  : 'Add athletes to view team statistics'}
              </Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => router.push('/add-athlete')}
                data-testid="add-athlete-empty-state-btn"
              >
                <LinearGradient
                  colors={[colors.accent.primary, colors.accent.secondary]}
                  style={styles.emptyStateButtonGradient}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.emptyStateButtonText}>
                    {locale === 'pt' ? 'Adicionar Atleta' : 'Add Athlete'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* CONTAINER BASE - Pronto para receber novos componentes */}
          <View style={{ flex: 1 }} data-testid="team-dashboard-content">
          </View>

        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
    gap: 12,
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
    padding: 20,
  },
  errorText: {
    color: colors.text.secondary,
    fontSize: 16,
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.accent.primary,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  csvImportButton: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  csvImportGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  csvImportTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  csvImportSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emptyStateButton: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyStateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
