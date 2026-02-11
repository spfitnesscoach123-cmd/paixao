import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../services/api';
import { format, parseISO, isAfter, isBefore, startOfDay } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

const { width: screenWidth } = Dimensions.get('window');

// Day classifications
const DAY_CLASSIFICATIONS = [
  { id: 'MD', label: 'MD', color: '#ef4444', description: 'Match Day' },
  { id: 'MD-1', label: 'MD-1', color: '#f97316', description: 'Dia antes do jogo' },
  { id: 'MD-2', label: 'MD-2', color: '#eab308', description: '2 dias antes' },
  { id: 'MD-3', label: 'MD-3', color: '#22c55e', description: '3 dias antes' },
  { id: 'MD-4', label: 'MD-4', color: '#14b8a6', description: '4 dias antes' },
  { id: 'MD-5', label: 'MD-5', color: '#3b82f6', description: '5 dias antes' },
  { id: 'D.O', label: 'D.O', color: '#6b7280', description: 'Day Off' },
];

// Multiplier options
const MULTIPLIER_OPTIONS = [
  1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0,
  2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0
];

// Metrics
const METRICS = [
  { id: 'total_distance', label: 'Distância Total', unit: 'm' },
  { id: 'hid_z3', label: 'HID Z3 (15-20 km/h)', unit: 'm' },
  { id: 'hsr_z4', label: 'HSR Z4 (20-25 km/h)', unit: 'm' },
  { id: 'sprint_z5', label: 'Sprint Z5 (>25 km/h)', unit: 'm' },
  { id: 'sprints_count', label: 'Sprints', unit: '' },
  { id: 'acc_dec_total', label: 'ACC + DECC', unit: '' },
];

interface DailyPrescription {
  day_classification: string;
  date: string;
  total_distance_percent: number;
  hid_z3_percent: number;
  hsr_z4_percent: number;
  sprint_z5_percent: number;
  sprints_count_percent: number;
  acc_dec_total_percent: number;
}

interface WeeklyPrescription {
  total_distance_multiplier: number;
  hid_z3_multiplier: number;
  hsr_z4_multiplier: number;
  sprint_z5_multiplier: number;
  sprints_count_multiplier: number;
  acc_dec_total_multiplier: number;
}

interface PeriodizationWeek {
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
  days: DailyPrescription[];
  weekly_prescription: WeeklyPrescription;
}

export default function PeriodizationScreen() {
  const { t, locale } = useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dateLocale = locale === 'pt' ? ptBR : enUS;
  
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWeekDetail, setShowWeekDetail] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch periodization weeks
  const { data: weeks, isLoading: weeksLoading } = useQuery({
    queryKey: ['periodization-weeks'],
    queryFn: async () => {
      const response = await api.get('/periodization/weeks');
      return response.data;
    },
  });

  // Fetch notifications
  const { data: notifications, refetch: refetchNotifications } = useQuery({
    queryKey: ['peak-notifications'],
    queryFn: async () => {
      const response = await api.get('/periodization/notifications?unread_only=true');
      return response.data;
    },
  });

  // Mark notification as read
  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await api.put(`/periodization/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      refetchNotifications();
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.put('/periodization/notifications/read-all');
    },
    onSuccess: () => {
      refetchNotifications();
    },
  });

  // Check if week is editable
  const isWeekEditable = (endDate: string) => {
    const end = parseISO(endDate);
    const today = startOfDay(new Date());
    return !isBefore(end, today);
  };

  // Render week card
  const renderWeekCard = (week: PeriodizationWeek) => {
    const editable = isWeekEditable(week.end_date);
    const startDate = parseISO(week.start_date);
    const endDate = parseISO(week.end_date);
    const today = startOfDay(new Date());
    
    let status = 'future';
    if (isBefore(endDate, today)) {
      status = 'past';
    } else if (isBefore(startDate, today) || startDate.getTime() === today.getTime()) {
      status = 'current';
    }

    return (
      <TouchableOpacity
        key={week.id}
        style={[
          styles.weekCard,
          status === 'current' && styles.weekCardCurrent,
          status === 'past' && styles.weekCardPast,
        ]}
        onPress={() => router.push(`/periodization/${week.id}`)}
        data-testid={`week-card-${week.id}`}
      >
        <View style={styles.weekCardHeader}>
          <View style={styles.weekCardTitleRow}>
            <Text style={styles.weekCardTitle}>{week.name}</Text>
            {status === 'current' && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>
                  {locale === 'pt' ? 'ATUAL' : 'CURRENT'}
                </Text>
              </View>
            )}
            {status === 'past' && (
              <Ionicons name="lock-closed" size={16} color={colors.text.tertiary} />
            )}
          </View>
          <Text style={styles.weekCardDates}>
            {format(startDate, 'dd MMM', { locale: dateLocale })} - {format(endDate, 'dd MMM', { locale: dateLocale })}
          </Text>
        </View>

        <View style={styles.weekDaysPreview}>
          {week.days.slice(0, 7).map((day, index) => {
            const classification = DAY_CLASSIFICATIONS.find(c => c.id === day.day_classification);
            return (
              <View
                key={index}
                style={[
                  styles.dayPreviewBadge,
                  { backgroundColor: classification?.color || colors.dark.card }
                ]}
              >
                <Text style={styles.dayPreviewText}>{classification?.label || '?'}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.weekCardFooter}>
          <View style={styles.weekMultiplierPreview}>
            <Ionicons name="fitness" size={14} color={colors.text.secondary} />
            <Text style={styles.weekMultiplierText}>
              {week.weekly_prescription.total_distance_multiplier}x
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={[colors.dark.background, colors.dark.secondary]}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Periodização' : 'Periodization'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {locale === 'pt' ? 'Planejamento de Cargas' : 'Load Planning'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {/* Notifications Button */}
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => setShowNotifications(true)}
            data-testid="notifications-button"
          >
            <Ionicons name="notifications" size={24} color={colors.text.primary} />
            {notifications && notifications.length > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{notifications.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="calendar" size={24} color={colors.accent.primary} />
            <Text style={styles.statValue}>{weeks?.length || 0}</Text>
            <Text style={styles.statLabel}>
              {locale === 'pt' ? 'Semanas' : 'Weeks'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={24} color="#22c55e" />
            <Text style={styles.statValue}>
              {weeks?.filter((w: PeriodizationWeek) => isWeekEditable(w.end_date)).length || 0}
            </Text>
            <Text style={styles.statLabel}>
              {locale === 'pt' ? 'Ativas' : 'Active'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="notifications" size={24} color="#f59e0b" />
            <Text style={styles.statValue}>{notifications?.length || 0}</Text>
            <Text style={styles.statLabel}>
              {locale === 'pt' ? 'Alertas' : 'Alerts'}
            </Text>
          </View>
        </View>

        {/* Create New Week Button */}
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/periodization/create')}
          data-testid="create-week-button"
        >
          <View style={styles.createButtonContent}>
            <View style={styles.createButtonIcon}>
              <Ionicons name="add" size={28} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.createButtonTitle}>
                {locale === 'pt' ? 'Nova Semana' : 'New Week'}
              </Text>
              <Text style={styles.createButtonSubtitle}>
                {locale === 'pt' ? 'Criar planejamento de cargas' : 'Create load planning'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
        </TouchableOpacity>

        {/* Weeks List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? 'Semanas de Periodização' : 'Periodization Weeks'}
          </Text>
        </View>

        {weeksLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
          </View>
        ) : weeks && weeks.length > 0 ? (
          weeks.map((week: PeriodizationWeek) => renderWeekCard(week))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={colors.text.tertiary} />
            <Text style={styles.emptyStateTitle}>
              {locale === 'pt' ? 'Nenhuma semana criada' : 'No weeks created'}
            </Text>
            <Text style={styles.emptyStateText}>
              {locale === 'pt' 
                ? 'Crie sua primeira semana de periodização para começar o planejamento de cargas.'
                : 'Create your first periodization week to start load planning.'}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notificationsModal}>
            <View style={styles.notificationsHeader}>
              <Text style={styles.notificationsTitle}>
                {locale === 'pt' ? 'Notificações' : 'Notifications'}
              </Text>
              <View style={styles.notificationsActions}>
                {notifications && notifications.length > 0 && (
                  <TouchableOpacity
                    style={styles.markAllReadButton}
                    onPress={() => markAllReadMutation.mutate()}
                  >
                    <Text style={styles.markAllReadText}>
                      {locale === 'pt' ? 'Marcar todas lidas' : 'Mark all read'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowNotifications(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.notificationsList}>
              {notifications && notifications.length > 0 ? (
                notifications.map((notification: any) => (
                  <TouchableOpacity
                    key={notification.id}
                    style={styles.notificationItem}
                    onPress={() => markReadMutation.mutate(notification.id)}
                  >
                    <View style={styles.notificationIcon}>
                      <Ionicons name="trending-up" size={20} color="#22c55e" />
                    </View>
                    <View style={styles.notificationContent}>
                      <Text style={styles.notificationAthlete}>{notification.athlete_name}</Text>
                      <Text style={styles.notificationMetric}>{notification.metric}</Text>
                      <Text style={styles.notificationValues}>
                        {notification.old_value.toFixed(0)} → {notification.new_value.toFixed(0)}
                      </Text>
                      <Text style={styles.notificationDate}>
                        {locale === 'pt' ? 'Sessão:' : 'Session:'} {notification.session_date}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyNotifications}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.text.tertiary} />
                  <Text style={styles.emptyNotificationsText}>
                    {locale === 'pt' ? 'Sem notificações novas' : 'No new notifications'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 4,
  },
  createButton: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: colors.accent.primary,
    borderStyle: 'dashed',
  },
  createButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  createButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  createButtonSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  weekCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  weekCardCurrent: {
    borderWidth: 2,
    borderColor: colors.accent.primary,
  },
  weekCardPast: {
    opacity: 0.6,
  },
  weekCardHeader: {
    marginBottom: 12,
  },
  weekCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  currentBadge: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  weekCardDates: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
  },
  weekDaysPreview: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  dayPreviewBadge: {
    width: 36,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayPreviewText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  weekCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  weekMultiplierPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekMultiplierText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: colors.dark.card,
    borderRadius: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
  },
  // Notifications Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  notificationsModal: {
    backgroundColor: colors.dark.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 40,
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  notificationsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  notificationsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  markAllReadButton: {
    padding: 8,
  },
  markAllReadText: {
    fontSize: 12,
    color: colors.accent.primary,
  },
  notificationsList: {
    padding: 20,
  },
  notificationItem: {
    flexDirection: 'row',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  notificationAthlete: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  notificationMetric: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  notificationValues: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
    marginTop: 4,
  },
  notificationDate: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 4,
  },
  emptyNotifications: {
    alignItems: 'center',
    padding: 40,
  },
  emptyNotificationsText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 12,
  },
});
