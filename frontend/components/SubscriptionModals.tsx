/**
 * Subscription Modals
 * 
 * Componentes de modal para diferentes estados da assinatura:
 * - TrialRequiredModal: Modal obrigatório para iniciar trial
 * - RenewalWarningModal: Aviso de renovação (3 dias antes)
 * - SubscriptionExpiredModal: Modal de assinatura expirada
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

// ============================================
// TIPOS
// ============================================

interface BaseModalProps {
  visible: boolean;
  onClose?: () => void;
}

interface TrialRequiredModalProps extends BaseModalProps {
  onStartTrial: () => void;
  onRestorePurchases: () => void;
  isLoading?: boolean;
  price?: string;
}

interface RenewalWarningModalProps extends BaseModalProps {
  daysRemaining: number;
  onDismiss: () => void;
  onManageSubscription: () => void;
}

interface SubscriptionExpiredModalProps extends BaseModalProps {
  onSubscribe: () => void;
  onRestorePurchases: () => void;
  isLoading?: boolean;
  price?: string;
}

// ============================================
// TRIAL REQUIRED MODAL
// Modal obrigatório para iniciar período de trial
// ============================================

export const TrialRequiredModal: React.FC<TrialRequiredModalProps> = ({
  visible,
  onStartTrial,
  onRestorePurchases,
  isLoading = false,
  price = '$39.99',
}) => {
  const { locale } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={[colors.accent.primary, colors.accent.secondary]}
                style={styles.iconGradient}
              >
                <Ionicons name="rocket" size={36} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Text style={styles.modalTitle}>
              {locale === 'pt' ? 'Bem-vindo ao LoadManager Pro!' : 'Welcome to LoadManager Pro!'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {locale === 'pt'
                ? 'Para começar a usar todas as funcionalidades, ative seu período de testes gratuito.'
                : 'To start using all features, activate your free trial period.'}
            </Text>
          </View>

          {/* Trial Info */}
          <View style={styles.trialInfoContainer}>
            <View style={styles.trialInfoItem}>
              <View style={styles.trialInfoIcon}>
                <Ionicons name="calendar-outline" size={24} color={colors.accent.primary} />
              </View>
              <View style={styles.trialInfoText}>
                <Text style={styles.trialInfoTitle}>
                  {locale === 'pt' ? '7 dias gratuitos' : '7 days free'}
                </Text>
                <Text style={styles.trialInfoDesc}>
                  {locale === 'pt'
                    ? 'Teste todas as funcionalidades sem compromisso'
                    : 'Test all features without commitment'}
                </Text>
              </View>
            </View>

            <View style={styles.trialInfoItem}>
              <View style={styles.trialInfoIcon}>
                <Ionicons name="card-outline" size={24} color={colors.accent.primary} />
              </View>
              <View style={styles.trialInfoText}>
                <Text style={styles.trialInfoTitle}>
                  {locale === 'pt' ? `Depois: ${price}/mês` : `Then: ${price}/month`}
                </Text>
                <Text style={styles.trialInfoDesc}>
                  {locale === 'pt'
                    ? 'Cobrança automática após o período de testes'
                    : 'Automatic billing after trial period'}
                </Text>
              </View>
            </View>

            <View style={styles.trialInfoItem}>
              <View style={styles.trialInfoIcon}>
                <Ionicons name="close-circle-outline" size={24} color={colors.accent.primary} />
              </View>
              <View style={styles.trialInfoText}>
                <Text style={styles.trialInfoTitle}>
                  {locale === 'pt' ? 'Cancele quando quiser' : 'Cancel anytime'}
                </Text>
                <Text style={styles.trialInfoDesc}>
                  {locale === 'pt'
                    ? 'Sem taxas de cancelamento ou multas'
                    : 'No cancellation fees or penalties'}
                </Text>
              </View>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onStartTrial}
              disabled={isLoading}
              data-testid="trial-modal-start-btn"
            >
              <LinearGradient
                colors={[colors.accent.primary, colors.accent.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButtonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="play-circle" size={22} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>
                      {locale === 'pt' ? 'Iniciar Período de Testes' : 'Start Free Trial'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onRestorePurchases}
              disabled={isLoading}
              data-testid="trial-modal-restore-btn"
            >
              <Text style={styles.secondaryButtonText}>
                {locale === 'pt' ? 'Restaurar Compras' : 'Restore Purchases'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Legal text */}
          <Text style={styles.legalText}>
            {locale === 'pt'
              ? `Ao iniciar o trial, você concorda com os Termos de Uso. Após 7 dias, ${price} USD será cobrado mensalmente. Cancele a qualquer momento nas configurações da App Store.`
              : `By starting the trial, you agree to the Terms of Use. After 7 days, ${price} USD will be charged monthly. Cancel anytime in App Store settings.`}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

// ============================================
// RENEWAL WARNING MODAL
// Aviso de renovação faltando 3 dias
// ============================================

export const RenewalWarningModal: React.FC<RenewalWarningModalProps> = ({
  visible,
  daysRemaining,
  onDismiss,
  onManageSubscription,
}) => {
  const { locale } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContentSmall}>
          {/* Header */}
          <View style={styles.warningHeader}>
            <View style={[styles.iconContainer, styles.warningIconContainer]}>
              <Ionicons name="time-outline" size={36} color={colors.status.warning} />
            </View>
            <Text style={styles.modalTitle}>
              {locale === 'pt' ? 'Sua assinatura está expirando!' : 'Your subscription is expiring!'}
            </Text>
          </View>

          {/* Content */}
          <View style={styles.warningContent}>
            <Text style={styles.daysRemainingText}>
              {daysRemaining === 1
                ? locale === 'pt'
                  ? 'Falta 1 dia para a renovação'
                  : '1 day until renewal'
                : locale === 'pt'
                ? `Faltam ${daysRemaining} dias para a renovação`
                : `${daysRemaining} days until renewal`}
            </Text>
            <Text style={styles.warningDesc}>
              {locale === 'pt'
                ? 'Mantenha sua assinatura ativa para continuar usando todas as funcionalidades e preservar seus dados.'
                : 'Keep your subscription active to continue using all features and preserve your data.'}
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onManageSubscription}
              data-testid="renewal-modal-manage-btn"
            >
              <Text style={styles.secondaryButtonText}>
                {locale === 'pt' ? 'Gerenciar Assinatura' : 'Manage Subscription'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
              data-testid="renewal-modal-dismiss-btn"
            >
              <Text style={styles.dismissButtonText}>
                {locale === 'pt' ? 'Entendi' : 'Got it'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ============================================
// SUBSCRIPTION EXPIRED MODAL
// Modal quando a assinatura expirou
// ============================================

export const SubscriptionExpiredModal: React.FC<SubscriptionExpiredModalProps> = ({
  visible,
  onClose,
  onSubscribe,
  onRestorePurchases,
  isLoading = false,
  price = '$39.99',
}) => {
  const { locale } = useLanguage();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={[styles.iconContainer, styles.expiredIconContainer]}>
              <Ionicons name="alert-circle" size={48} color={colors.status.error} />
            </View>
            <Text style={styles.modalTitle}>
              {locale === 'pt' ? 'Sua assinatura expirou' : 'Your subscription expired'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {locale === 'pt'
                ? 'Renove sua assinatura para continuar usando todas as funcionalidades. Seus dados estão seguros e serão restaurados.'
                : 'Renew your subscription to continue using all features. Your data is safe and will be restored.'}
            </Text>
          </View>

          {/* Benefits reminder */}
          <View style={styles.benefitsReminder}>
            <Text style={styles.benefitsReminderTitle}>
              {locale === 'pt' ? 'Ao renovar você terá:' : 'By renewing you get:'}
            </Text>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={18} color={colors.status.success} />
              <Text style={styles.benefitText}>
                {locale === 'pt' ? 'Acesso imediato a todas as funcionalidades' : 'Immediate access to all features'}
              </Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={18} color={colors.status.success} />
              <Text style={styles.benefitText}>
                {locale === 'pt' ? 'Todos os seus dados preservados' : 'All your data preserved'}
              </Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={18} color={colors.status.success} />
              <Text style={styles.benefitText}>
                {locale === 'pt' ? 'Histórico completo de avaliações' : 'Complete assessment history'}
              </Text>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onSubscribe}
              disabled={isLoading}
              data-testid="expired-modal-subscribe-btn"
            >
              <LinearGradient
                colors={[colors.accent.primary, colors.accent.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButtonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={22} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>
                      {locale === 'pt' ? `Assinar por ${price}/mês` : `Subscribe for ${price}/month`}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onRestorePurchases}
              disabled={isLoading}
              data-testid="expired-modal-restore-btn"
            >
              <Text style={styles.secondaryButtonText}>
                {locale === 'pt' ? 'Restaurar Compras' : 'Restore Purchases'}
              </Text>
            </TouchableOpacity>

            {onClose && (
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={onClose}
                data-testid="expired-modal-dismiss-btn"
              >
                <Text style={styles.dismissButtonText}>
                  {locale === 'pt' ? 'Fechar' : 'Close'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ============================================
// ESTILOS
// ============================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.dark.card,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalContentSmall: {
    backgroundColor: colors.dark.card,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  warningHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expiredIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  trialInfoContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  trialInfoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  trialInfoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  trialInfoText: {
    flex: 1,
  },
  trialInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  trialInfoDesc: {
    fontSize: 14,
    color: colors.text.tertiary,
    lineHeight: 20,
  },
  warningContent: {
    alignItems: 'center',
    marginBottom: 24,
  },
  daysRemainingText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.status.warning,
    marginBottom: 12,
    textAlign: 'center',
  },
  warningDesc: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  benefitsReminder: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  benefitsReminderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  benefitText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginLeft: 10,
    flex: 1,
  },
  modalButtons: {
    gap: 12,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 14,
  },
  secondaryButtonText: {
    color: colors.text.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: colors.text.tertiary,
    fontSize: 14,
    fontWeight: '500',
  },
  legalText: {
    fontSize: 11,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
});

export default {
  TrialRequiredModal,
  RenewalWarningModal,
  SubscriptionExpiredModal,
};
