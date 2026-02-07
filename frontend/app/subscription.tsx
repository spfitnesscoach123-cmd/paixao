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
  export_pdf: boolean;
  export_csv: boolean;
  advanced_analytics: boolean;
  ai_insights: boolean;
  fatigue_alerts: boolean;
  multi_user: boolean;
  max_users: number;
  features: string[];
  trial_days: number;
  description: string;
  features_list: string[];
  limitations: string[];
  popular: boolean;
}

interface CurrentSubscription {
  plan: string;
  plan_name: string;
  status: string;
  price: number;
  max_athletes: number;
  current_athletes: number;
  history_months: number;
  days_remaining: number | null;
  trial_end_date: string | null;
  features: {
    export_pdf: boolean;
    export_csv: boolean;
    advanced_analytics: boolean;
    ai_insights: boolean;
    fatigue_alerts: boolean;
    multi_user: boolean;
    priority_support: boolean;
  };
  limits_reached: {
    athletes: boolean;
    export_pdf: boolean;
    export_csv: boolean;
    advanced_analytics: boolean;
    ai_insights: boolean;
  };
}

export default function Subscription() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const [plans, setPlans] = useState<Plan[]>([]);
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
      
      // Fetch plans first (public endpoint)
      try {
        const plansRes = await api.get(`/subscription/plans?lang=${lang}&region=${region}`);
        setPlans(plansRes.data);
      } catch (plansError) {
        console.error('Error fetching plans:', plansError);
      }
      
      // Fetch current subscription (requires auth, may fail)
      try {
        const currentRes = await api.get(`/subscription/current?lang=${lang}&region=${region}`);
        setCurrentSubscription(currentRes.data);
      } catch (subError) {
        console.error('Error fetching current subscription:', subError);
        // Don't fail entirely - user may not be logged in
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

  const handleSubscribe = async (planId: string) => {
    setIsProcessing(true);
    const plan = plans.find(p => p.id === planId);
    
    Alert.alert(
      locale === 'pt' ? 'Iniciar Trial Gratuito' : 'Start Free Trial',
      locale === 'pt' 
        ? `Deseja iniciar o trial de 7 dias do plano ${plan?.name}?\n\nApós o período de teste, será cobrado ${plan?.price_formatted}/mês via compra no app.`
        : `Start the 7-day trial of ${plan?.name} plan?\n\nAfter the trial period, ${plan?.price_formatted}/month will be charged via in-app purchase.`,
      [
        { text: locale === 'pt' ? 'Cancelar' : 'Cancel', style: 'cancel', onPress: () => setIsProcessing(false) },
        {
          text: locale === 'pt' ? 'Iniciar Trial' : 'Start Trial',
          onPress: async () => {
            try {
              await api.post('/subscription/subscribe', { plan: planId });
              await fetchData();
              Alert.alert(
                '🎉 ' + (locale === 'pt' ? 'Sucesso!' : 'Success!'),
                locale === 'pt' 
                  ? `Trial do plano ${plan?.name} ativado! Você tem 7 dias para experimentar todas as funcionalidades.`
                  : `${plan?.name} plan trial activated! You have 7 days to try all features.`
              );
            } catch (error) {
              Alert.alert(
                locale === 'pt' ? 'Erro' : 'Error',
                locale === 'pt' ? 'Não foi possível ativar o plano' : 'Could not activate plan'
              );
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = async () => {
    Alert.alert(
      locale === 'pt' ? 'Cancelar Assinatura' : 'Cancel Subscription',
      locale === 'pt' 
        ? 'Tem certeza que deseja cancelar? Você perderá acesso às funcionalidades premium.'
        : 'Are you sure you want to cancel? You will lose access to premium features.',
      [
        { text: locale === 'pt' ? 'Não' : 'No', style: 'cancel' },
        {
          text: locale === 'pt' ? 'Sim, Cancelar' : 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/subscription/cancel');
              await fetchData();
              Alert.alert(
                locale === 'pt' ? 'Assinatura Cancelada' : 'Subscription Cancelled',
                locale === 'pt' 
                  ? 'Sua assinatura foi cancelada. Você ainda pode acessar até o final do período.'
                  : 'Your subscription has been cancelled. You can still access until the end of the period.'
              );
            } catch (error) {
              Alert.alert(locale === 'pt' ? 'Erro' : 'Error', locale === 'pt' ? 'Erro ao cancelar' : 'Error cancelling');
            }
          },
        },
      ]
    );
  };

  const getStatusBadge = () => {
    if (!currentSubscription) return null;
    
    const statusConfig: { [key: string]: { color: string; label: string } } = {
      trial: { color: colors.status.warning, label: locale === 'pt' ? 'TRIAL' : 'TRIAL' },
      active: { color: colors.status.success, label: locale === 'pt' ? 'ATIVO' : 'ACTIVE' },
      cancelled: { color: colors.status.error, label: locale === 'pt' ? 'CANCELADO' : 'CANCELLED' },
      expired: { color: colors.text.tertiary, label: locale === 'pt' ? 'EXPIRADO' : 'EXPIRED' },
    };
    
    const config = statusConfig[currentSubscription.status] || statusConfig.expired;
    
    return (
      <View style={[styles.statusBadge, { backgroundColor: config.color + '20' }]}>
        <Text style={[styles.statusBadgeText, { color: config.color }]}>{config.label}</Text>
      </View>
    );
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'essencial': return 'leaf';
      case 'profissional': return 'rocket';
      case 'elite': return 'diamond';
      default: return 'gift';
    }
  };

  const getPlanGradient = (planId: string): readonly [string, string, ...string[]] => {
    switch (planId) {
      case 'essencial': return ['#3b82f6', '#1d4ed8'];
      case 'profissional': return ['#8b5cf6', '#6d28d9'];
      case 'elite': return ['#f59e0b', '#d97706'];
      default: return ['#6b7280', '#4b5563'];
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('subscription.title')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Current Subscription Card */}
          {currentSubscription && (
            <View style={styles.currentPlanCard}>
              <LinearGradient
                colors={currentSubscription.plan === 'free_trial' 
                  ? [colors.dark.tertiary, colors.dark.card] 
                  : getPlanGradient(currentSubscription.plan)}
                style={styles.currentPlanGradient}
              >
                <View style={styles.currentPlanHeader}>
                  <Ionicons 
                    name={getPlanIcon(currentSubscription.plan)} 
                    size={32} 
                    color="#ffffff" 
                  />
                  <View style={styles.currentPlanInfo}>
                    <Text style={styles.currentPlanLabel}>{t('subscription.currentPlan')}</Text>
                    <Text style={styles.currentPlanName}>{currentSubscription.plan_name}</Text>
                  </View>
                  {getStatusBadge()}
                </View>
                
                {currentSubscription.status === 'trial' && currentSubscription.days_remaining !== null && (
                  <View style={styles.trialInfo}>
                    <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.trialText}>
                      {currentSubscription.days_remaining} {locale === 'pt' ? 'dias restantes no trial' : 'days remaining in trial'}
                    </Text>
                  </View>
                )}

                <View style={styles.subscriptionDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="people" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.detailText}>
                      {currentSubscription.current_athletes} / {currentSubscription.max_athletes === -1 ? '∞' : currentSubscription.max_athletes} {locale === 'pt' ? 'atletas' : 'athletes'}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Trial Banner */}
          {currentSubscription?.status !== 'trial' && (
            <View style={styles.trialBanner}>
              <LinearGradient
                colors={['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)']}
                style={styles.trialBannerGradient}
              >
                <Ionicons name="gift" size={24} color={colors.status.success} />
                <View style={styles.trialBannerText}>
                  <Text style={styles.trialBannerTitle}>
                    {locale === 'pt' ? '7 dias grátis em todos os planos!' : '7 days free on all plans!'}
                  </Text>
                  <Text style={styles.trialBannerSubtitle}>
                    {locale === 'pt' ? 'Experimente antes de assinar' : 'Try before you subscribe'}
                  </Text>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Plans Section */}
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? 'Escolha seu plano' : 'Choose your plan'}
          </Text>

          {plans.map((plan) => {
            const isCurrentPlan = currentSubscription?.plan === plan.id;
            const isPopular = plan.popular;
            
            return (
              <View 
                key={plan.id} 
                style={[
                  styles.planCard,
                  isCurrentPlan && styles.planCardActive,
                  isPopular && styles.planCardPopular
                ]}
              >
                {isPopular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>
                      {locale === 'pt' ? '⭐ MAIS POPULAR' : '⭐ MOST POPULAR'}
                    </Text>
                  </View>
                )}
                
                <View style={styles.planHeader}>
                  <View style={styles.planHeaderLeft}>
                    <LinearGradient
                      colors={getPlanGradient(plan.id)}
                      style={styles.planIconContainer}
                    >
                      <Ionicons name={getPlanIcon(plan.id)} size={24} color="#ffffff" />
                    </LinearGradient>
                    <View>
                      <Text style={styles.planName}>{plan.name}</Text>
                      <View style={styles.priceRow}>
                        <Text style={styles.planPrice}>{plan.price_formatted}</Text>
                        <Text style={styles.planPeriod}>/{locale === 'pt' ? 'mês' : 'month'}</Text>
                      </View>
                    </View>
                  </View>
                  {isCurrentPlan && (
                    <View style={styles.currentBadge}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.status.success} />
                      <Text style={styles.currentBadgeText}>{locale === 'pt' ? 'Atual' : 'Current'}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.planDescription}>{plan.description}</Text>

                {/* Features List */}
                <View style={styles.featuresContainer}>
                  {plan.features_list.map((feature, index) => (
                    <View key={index} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.status.success} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                  {plan.limitations.map((limitation, index) => (
                    <View key={`limit-${index}`} style={styles.featureRow}>
                      <Ionicons name="close-circle" size={18} color={colors.status.error} />
                      <Text style={[styles.featureText, styles.limitationText]}>{limitation}</Text>
                    </View>
                  ))}
                </View>

                {/* Action Button */}
                {!isCurrentPlan && (
                  <TouchableOpacity
                    style={[styles.selectButton, isPopular && styles.selectButtonHighlight]}
                    onPress={() => handleSubscribe(plan.id)}
                    disabled={isProcessing}
                  >
                    <LinearGradient
                      colors={getPlanGradient(plan.id)}
                      style={styles.selectButtonGradient}
                    >
                      {isProcessing ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <>
                          <Text style={styles.selectButtonText}>
                            {locale === 'pt' ? 'Começar Trial Grátis' : 'Start Free Trial'}
                          </Text>
                          <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Cancel Subscription */}
          {currentSubscription && 
           currentSubscription.plan !== 'free_trial' && 
           currentSubscription.status !== 'cancelled' && 
           currentSubscription.status !== 'expired' && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>
                {locale === 'pt' ? 'Cancelar Assinatura' : 'Cancel Subscription'}
              </Text>
            </TouchableOpacity>
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

          {/* Info Notice */}
          <View style={styles.infoNotice}>
            <Ionicons name="information-circle" size={20} color={colors.accent.primary} />
            <Text style={styles.infoNoticeText}>
              {locale === 'pt' 
                ? 'O pagamento será processado via compra no aplicativo (In-App Purchase) através da App Store ou Google Play.'
                : 'Payment will be processed via In-App Purchase through App Store or Google Play.'}
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
  currentPlanCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  currentPlanGradient: {
    padding: 20,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentPlanInfo: {
    marginLeft: 16,
    flex: 1,
  },
  currentPlanLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  currentPlanName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  trialInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 16,
    gap: 8,
  },
  trialText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  subscriptionDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  trialBanner: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  trialBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  planCardActive: {
    borderColor: colors.status.success,
    borderWidth: 2,
  },
  planCardPopular: {
    borderColor: '#8b5cf6',
    borderWidth: 2,
  },
  popularBadge: {
    position: 'absolute',
    top: -1,
    right: 20,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  popularBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.accent.primary,
  },
  planPeriod: {
    fontSize: 14,
    color: colors.text.secondary,
    marginLeft: 2,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.status.success,
  },
  planDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  featuresContainer: {
    gap: 8,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
  },
  limitationText: {
    color: colors.text.tertiary,
  },
  selectButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  selectButtonHighlight: {
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  selectButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.status.error,
  },
  regionToggle: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
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
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
    borderColor: colors.accent.primary,
  },
  regionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  regionButtonTextActive: {
    color: colors.accent.primary,
  },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
});
