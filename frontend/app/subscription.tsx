import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';
import * as Localization from 'expo-localization';

const { width } = Dimensions.get('window');

interface Plan {
  id: string;
  name: string;
  price: number;
  price_formatted: string;
  currency: string;
  max_athletes: number;
  history_months: number;
  features_list: string[];
  trial_days: number;
  description: string;
}

interface CurrentSubscription {
  plan: string;
  plan_name: string;
  status: string;
  price: number;
  max_athletes: number;
  current_athletes: number;
  days_remaining: number | null;
  trial_end_date: string | null;
}

export default function Subscription() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [region, setRegion] = useState<string>('BR');

  // Detect region based on device locale
  useEffect(() => {
    const detectedRegion = Localization.getLocales()[0]?.regionCode || 'BR';
    setRegion(detectedRegion);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const lang = locale === 'pt' ? 'pt' : 'en';
      
      // Fetch plan
      try {
        const plansRes = await api.get(`/subscription/plans?lang=${lang}&region=${region}`);
        if (plansRes.data && plansRes.data.length > 0) {
          setPlan(plansRes.data[0]); // Only one plan: Pro
        }
      } catch (plansError) {
        console.error('Error fetching plans:', plansError);
      }
      
      // Fetch current subscription
      try {
        const currentRes = await api.get(`/subscription/current?lang=${lang}&region=${region}`);
        setCurrentSubscription(currentRes.data);
      } catch (subError) {
        console.error('Error fetching current subscription:', subError);
        setCurrentSubscription(null);
      }
    } catch (error) {
      console.error('Error fetching subscription data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [locale, region]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const t = {
    title: locale === 'pt' ? 'Assinatura' : 'Subscription',
    currentPlan: locale === 'pt' ? 'Plano Atual' : 'Current Plan',
    trialBanner: locale === 'pt' ? '7 dias grátis para experimentar!' : '7 days free to try!',
    trialSubtitle: locale === 'pt' ? 'Acesso completo a todas as funcionalidades' : 'Full access to all features',
    startTrial: locale === 'pt' ? 'Começar Trial Grátis' : 'Start Free Trial',
    subscribe: locale === 'pt' ? 'Assinar Agora' : 'Subscribe Now',
    perMonth: locale === 'pt' ? '/mês' : '/month',
    daysRemaining: locale === 'pt' ? 'dias restantes' : 'days remaining',
    cancelSubscription: locale === 'pt' ? 'Cancelar Assinatura' : 'Cancel Subscription',
    restorePurchase: locale === 'pt' ? 'Restaurar Compra' : 'Restore Purchase',
    manageSubscription: locale === 'pt' ? 'Gerenciar Assinatura' : 'Manage Subscription',
    termsOfUse: locale === 'pt' ? 'Termos de Uso' : 'Terms of Use',
    privacyPolicy: locale === 'pt' ? 'Política de Privacidade' : 'Privacy Policy',
    inAppPurchaseNote: locale === 'pt' 
      ? 'Assinatura com renovação automática mensal (a cada 30 dias). O pagamento será processado via App Store ou Google Play.'
      : 'Auto-renewing monthly subscription (every 30 days). Payment will be processed via App Store or Google Play.',
    cancelNote: locale === 'pt'
      ? 'Você pode cancelar a qualquer momento nas configurações da loja de apps. O cancelamento entra em vigor no próximo ciclo de cobrança.'
      : 'You can cancel anytime in your app store settings. Cancellation takes effect at the next billing cycle.',
    statusTrial: locale === 'pt' ? 'PERÍODO DE TESTE' : 'TRIAL PERIOD',
    statusActive: locale === 'pt' ? 'ATIVO' : 'ACTIVE',
    statusCancelled: locale === 'pt' ? 'CANCELADO' : 'CANCELLED',
    statusExpired: locale === 'pt' ? 'EXPIRADO' : 'EXPIRED',
    unlimitedAthletes: locale === 'pt' ? 'Atletas ilimitados' : 'Unlimited athletes',
    allFeatures: locale === 'pt' ? 'Todas as funcionalidades' : 'All features',
  };

  const handleStartTrial = async () => {
    setIsProcessing(true);
    
    Alert.alert(
      locale === 'pt' ? 'Iniciar Trial Gratuito' : 'Start Free Trial',
      locale === 'pt' 
        ? `Você terá 7 dias de acesso completo a todas as funcionalidades.\n\nApós o período de teste, será cobrado ${plan?.price_formatted}${t.perMonth} via compra no app.`
        : `You'll have 7 days of full access to all features.\n\nAfter the trial period, ${plan?.price_formatted}${t.perMonth} will be charged via in-app purchase.`,
      [
        { text: locale === 'pt' ? 'Cancelar' : 'Cancel', style: 'cancel', onPress: () => setIsProcessing(false) },
        {
          text: locale === 'pt' ? 'Iniciar' : 'Start',
          onPress: async () => {
            try {
              await api.post('/subscription/subscribe', { plan: 'pro' });
              await fetchData();
              Alert.alert(
                '🎉 ' + (locale === 'pt' ? 'Bem-vindo!' : 'Welcome!'),
                locale === 'pt' 
                  ? 'Seu trial de 7 dias foi ativado! Aproveite todas as funcionalidades do Load Manager Pro.'
                  : 'Your 7-day trial is now active! Enjoy all Load Manager Pro features.'
              );
            } catch (error) {
              Alert.alert(
                locale === 'pt' ? 'Erro' : 'Error',
                locale === 'pt' ? 'Não foi possível ativar o trial' : 'Could not activate trial'
              );
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelSubscription = async () => {
    Alert.alert(
      t.cancelSubscription,
      locale === 'pt' 
        ? 'Para cancelar sua assinatura, acesse as configurações da App Store ou Google Play.\n\nDeseja abrir as configurações agora?'
        : 'To cancel your subscription, go to App Store or Google Play settings.\n\nWould you like to open settings now?',
      [
        { text: locale === 'pt' ? 'Não' : 'No', style: 'cancel' },
        {
          text: locale === 'pt' ? 'Abrir Configurações' : 'Open Settings',
          onPress: () => {
            // Open subscription management in app stores
            if (Platform.OS === 'ios') {
              Linking.openURL('https://apps.apple.com/account/subscriptions');
            } else {
              Linking.openURL('https://play.google.com/store/account/subscriptions');
            }
          },
        },
      ]
    );
  };

  const handleRestorePurchase = async () => {
    setIsProcessing(true);
    
    try {
      // In a real app, this would verify with App Store/Google Play
      await api.post('/subscription/restore');
      await fetchData();
      Alert.alert(
        locale === 'pt' ? 'Compra Restaurada' : 'Purchase Restored',
        locale === 'pt' 
          ? 'Sua assinatura foi restaurada com sucesso!'
          : 'Your subscription has been restored successfully!'
      );
    } catch (error) {
      Alert.alert(
        locale === 'pt' ? 'Nenhuma compra encontrada' : 'No purchase found',
        locale === 'pt' 
          ? 'Não encontramos uma assinatura anterior vinculada a esta conta.'
          : 'We could not find a previous subscription linked to this account.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusConfig = () => {
    if (!currentSubscription) return null;
    
    switch (currentSubscription.status) {
      case 'trial':
        return { color: colors.status.warning, label: t.statusTrial, icon: 'time' };
      case 'active':
        return { color: colors.status.success, label: t.statusActive, icon: 'checkmark-circle' };
      case 'cancelled':
        return { color: colors.status.error, label: t.statusCancelled, icon: 'close-circle' };
      case 'expired':
        return { color: colors.text.tertiary, label: t.statusExpired, icon: 'alert-circle' };
      default:
        return { color: colors.text.tertiary, label: '', icon: 'help-circle' };
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  const statusConfig = getStatusConfig();
  const isTrialOrActive = currentSubscription?.status === 'trial' || currentSubscription?.status === 'active';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.title}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Current Status Card */}
          {currentSubscription && statusConfig && (
            <View style={styles.statusCard}>
              <LinearGradient
                colors={['#8b5cf6', '#6d28d9']}
                style={styles.statusCardGradient}
              >
                <View style={styles.statusHeader}>
                  <View style={styles.statusIconContainer}>
                    <Ionicons name="rocket" size={32} color="#ffffff" />
                  </View>
                  <View style={styles.statusInfo}>
                    <Text style={styles.statusLabel}>{t.currentPlan}</Text>
                    <Text style={styles.statusPlanName}>
                      {currentSubscription.plan === 'free_trial' ? 'Pro Trial' : 'Pro'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '30' }]}>
                    <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
                    <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                </View>

                {currentSubscription.status === 'trial' && currentSubscription.days_remaining !== null && (
                  <View style={styles.trialCountdown}>
                    <Ionicons name="time-outline" size={20} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.trialCountdownText}>
                      {currentSubscription.days_remaining} {t.daysRemaining}
                    </Text>
                  </View>
                )}

                <View style={styles.statusFeatures}>
                  <View style={styles.statusFeature}>
                    <Ionicons name="checkmark" size={16} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.statusFeatureText}>{t.unlimitedAthletes}</Text>
                  </View>
                  <View style={styles.statusFeature}>
                    <Ionicons name="checkmark" size={16} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.statusFeatureText}>{t.allFeatures}</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Plan Card */}
          {plan && (
            <View style={styles.planCard}>
              {/* Trial Banner */}
              <View style={styles.trialBanner}>
                <Ionicons name="gift" size={24} color={colors.status.success} />
                <View style={styles.trialBannerText}>
                  <Text style={styles.trialBannerTitle}>{t.trialBanner}</Text>
                  <Text style={styles.trialBannerSubtitle}>{t.trialSubtitle}</Text>
                </View>
              </View>

              {/* Plan Header */}
              <View style={styles.planHeader}>
                <View style={styles.planNameContainer}>
                  <LinearGradient
                    colors={['#8b5cf6', '#6d28d9']}
                    style={styles.planIcon}
                  >
                    <Ionicons name="rocket" size={28} color="#ffffff" />
                  </LinearGradient>
                  <View>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                  </View>
                </View>
              </View>

              {/* Price */}
              <View style={styles.priceContainer}>
                <Text style={styles.priceValue}>{plan.price_formatted}</Text>
                <Text style={styles.pricePeriod}>{t.perMonth}</Text>
              </View>

              {/* Features List */}
              <View style={styles.featuresContainer}>
                {plan.features_list.map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <View style={styles.featureCheck}>
                      <Ionicons name="checkmark" size={14} color="#ffffff" />
                    </View>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              {/* Subscribe Button */}
              {!isTrialOrActive && (
                <TouchableOpacity
                  style={styles.subscribeButton}
                  onPress={handleStartTrial}
                  disabled={isProcessing}
                >
                  <LinearGradient
                    colors={['#8b5cf6', '#6d28d9']}
                    style={styles.subscribeButtonGradient}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Text style={styles.subscribeButtonText}>{t.startTrial}</Text>
                        <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Region Toggle */}
          <View style={styles.regionToggle}>
            <Text style={styles.regionLabel}>
              {locale === 'pt' ? 'Mostrando preços para:' : 'Showing prices for:'}
            </Text>
            <View style={styles.regionButtons}>
              <TouchableOpacity
                style={[styles.regionButton, region === 'BR' && styles.regionButtonActive]}
                onPress={() => setRegion('BR')}
              >
                <Text style={[styles.regionButtonText, region === 'BR' && styles.regionButtonTextActive]}>
                  🇧🇷 Brasil (R$)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.regionButton, region !== 'BR' && styles.regionButtonActive]}
                onPress={() => setRegion('US')}
              >
                <Text style={[styles.regionButtonText, region !== 'BR' && styles.regionButtonTextActive]}>
                  🌎 International ($)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Management Options */}
          <View style={styles.managementSection}>
            <TouchableOpacity 
              style={styles.managementButton}
              onPress={handleRestorePurchase}
              disabled={isProcessing}
            >
              <Ionicons name="refresh" size={20} color={colors.accent.primary} />
              <Text style={styles.managementButtonText}>{t.restorePurchase}</Text>
            </TouchableOpacity>

            {isTrialOrActive && currentSubscription?.plan !== 'free_trial' && (
              <TouchableOpacity 
                style={styles.managementButton}
                onPress={handleCancelSubscription}
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.status.error} />
                <Text style={[styles.managementButtonText, { color: colors.status.error }]}>
                  {t.cancelSubscription}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Legal Links */}
          <View style={styles.legalSection}>
            <TouchableOpacity 
              style={styles.legalLink}
              onPress={() => router.push('/terms-of-use')}
            >
              <Text style={styles.legalLinkText}>{t.termsOfUse}</Text>
            </TouchableOpacity>
            <Text style={styles.legalSeparator}>•</Text>
            <TouchableOpacity 
              style={styles.legalLink}
              onPress={() => router.push('/privacy-policy')}
            >
              <Text style={styles.legalLinkText}>{t.privacyPolicy}</Text>
            </TouchableOpacity>
          </View>

          {/* Info Notice */}
          <View style={styles.infoNotice}>
            <Ionicons name="information-circle" size={20} color={colors.accent.primary} />
            <Text style={styles.infoNoticeText}>
              {t.inAppPurchaseNote}
              {'\n\n'}
              {t.cancelNote}
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
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
    paddingBottom: 40,
  },
  statusCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  statusCardGradient: {
    padding: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusInfo: {
    flex: 1,
    marginLeft: 16,
  },
  statusLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  statusPlanName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  trialCountdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
    gap: 8,
  },
  trialCountdownText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  statusFeatures: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 20,
  },
  statusFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusFeatureText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  planCard: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#8b5cf6',
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  trialBannerText: {
    flex: 1,
  },
  trialBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.status.success,
  },
  trialBannerSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  planHeader: {
    marginBottom: 20,
  },
  planNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  planIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  planDescription: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  priceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.accent.primary,
  },
  pricePeriod: {
    fontSize: 16,
    color: colors.text.secondary,
    marginLeft: 4,
  },
  featuresContainer: {
    gap: 12,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.status.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
  },
  subscribeButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  subscribeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  regionToggle: {
    marginBottom: 20,
  },
  regionLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  regionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  regionButton: {
    flex: 1,
    backgroundColor: colors.dark.card,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  regionButtonActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: '#8b5cf6',
  },
  regionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  regionButtonTextActive: {
    color: '#8b5cf6',
  },
  managementSection: {
    gap: 12,
    marginBottom: 20,
  },
  managementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  managementButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  legalSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  legalLink: {
    paddingVertical: 8,
  },
  legalLinkText: {
    fontSize: 13,
    color: colors.text.tertiary,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    color: colors.text.tertiary,
  },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0, 212, 255, 0.08)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.15)',
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
});
