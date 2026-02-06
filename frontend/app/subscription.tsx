import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../constants/theme';

// Mock subscription data - Replace with RevenueCat integration later
const SUBSCRIPTION_PLANS = {
  free: {
    id: 'free',
    name: 'Gratuito',
    price: 'R$ 0',
    priceValue: 0,
    period: '',
    features: [
      'Até 5 atletas',
      'Dados GPS básicos',
      'Questionário de wellness',
      '7 dias de histórico',
    ],
    limitations: [
      'Sem análise ACWR',
      'Sem comparações avançadas',
      'Sem exportação de relatórios',
    ],
  },
  monthly: {
    id: 'monthly',
    name: 'Mensal',
    price: 'R$ 49,90',
    priceValue: 49.90,
    period: '/mês',
    features: [
      'Atletas ilimitados',
      'Todos os dados GPS',
      'Análise ACWR completa',
      'Comparações avançadas',
      'Histórico ilimitado',
      'Exportação de relatórios',
      'Link wellness para atletas',
      'Suporte prioritário',
    ],
    limitations: [],
  },
  yearly: {
    id: 'yearly',
    name: 'Anual',
    price: 'R$ 399,90',
    priceValue: 399.90,
    period: '/ano',
    discount: 'Economia de R$ 199',
    features: [
      'Tudo do plano mensal',
      '2 meses grátis',
      'Acesso antecipado a novidades',
      'Consultoria de setup (1h)',
    ],
    limitations: [],
  },
};

const STORAGE_KEY = 'subscription_data';

interface SubscriptionData {
  planId: string;
  startDate: string;
  expiresAt: string;
  status: 'active' | 'cancelled' | 'expired';
  autoRenew: boolean;
}

export default function Subscription() {
  const router = useRouter();
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const subscription = JSON.parse(data) as SubscriptionData;
        // Check if expired
        if (new Date(subscription.expiresAt) < new Date() && subscription.status === 'active') {
          subscription.status = 'expired';
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(subscription));
        }
        setCurrentSubscription(subscription);
      } else {
        // Default to free plan
        const freeSubscription: SubscriptionData = {
          planId: 'free',
          startDate: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          autoRenew: false,
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freeSubscription));
        setCurrentSubscription(freeSubscription);
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (planId === 'free') {
      Alert.alert('Plano Gratuito', 'Você já está no plano gratuito.');
      return;
    }

    setIsProcessing(true);
    
    // Mock payment processing
    Alert.alert(
      'Confirmar Assinatura',
      `Deseja assinar o plano ${SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS].name} por ${SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS].price}${SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS].period}?\n\n(MOCK - Pagamento simulado)`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setIsProcessing(false) },
        {
          text: 'Confirmar',
          onPress: async () => {
            // Simulate payment delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const expiresAt = planId === 'yearly' 
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            
            const newSubscription: SubscriptionData = {
              planId,
              startDate: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
              status: 'active',
              autoRenew: true,
            };
            
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSubscription));
            setCurrentSubscription(newSubscription);
            setIsProcessing(false);
            
            Alert.alert('Sucesso! 🎉', 'Sua assinatura foi ativada com sucesso!');
          },
        },
      ]
    );
  };

  const handleChangePlan = async (newPlanId: string) => {
    if (newPlanId === currentSubscription?.planId) {
      Alert.alert('Mesmo Plano', 'Você já está neste plano.');
      return;
    }

    setIsProcessing(true);
    
    const plan = SUBSCRIPTION_PLANS[newPlanId as keyof typeof SUBSCRIPTION_PLANS];
    
    Alert.alert(
      'Alterar Plano',
      `Deseja alterar para o plano ${plan.name}?\n\n${plan.price}${plan.period}\n\n(MOCK - Alteração simulada)`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setIsProcessing(false) },
        {
          text: 'Confirmar',
          onPress: async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const expiresAt = newPlanId === 'yearly' 
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              : newPlanId === 'monthly'
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            
            const updatedSubscription: SubscriptionData = {
              planId: newPlanId,
              startDate: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
              status: 'active',
              autoRenew: newPlanId !== 'free',
            };
            
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSubscription));
            setCurrentSubscription(updatedSubscription);
            setIsProcessing(false);
            
            Alert.alert('Plano Alterado', `Seu plano foi alterado para ${plan.name}.`);
          },
        },
      ]
    );
  };

  const handleCancelSubscription = async () => {
    Alert.alert(
      'Cancelar Assinatura',
      'Tem certeza que deseja cancelar sua assinatura?\n\nVocê continuará tendo acesso até o final do período já pago.',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: async () => {
            if (currentSubscription) {
              const updatedSubscription: SubscriptionData = {
                ...currentSubscription,
                status: 'cancelled',
                autoRenew: false,
              };
              await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSubscription));
              setCurrentSubscription(updatedSubscription);
              Alert.alert('Assinatura Cancelada', 'Sua assinatura foi cancelada. Você terá acesso até o final do período atual.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const currentPlan = currentSubscription 
    ? SUBSCRIPTION_PLANS[currentSubscription.planId as keyof typeof SUBSCRIPTION_PLANS]
    : SUBSCRIPTION_PLANS.free;

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
          <Text style={styles.headerTitle}>Assinatura</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Current Plan Status */}
          <View style={styles.currentPlanCard}>
            <LinearGradient
              colors={currentPlan.id === 'free' ? [colors.dark.tertiary, colors.dark.card] : colors.gradients.primary}
              style={styles.currentPlanGradient}
            >
              <View style={styles.currentPlanHeader}>
                <Ionicons 
                  name={currentPlan.id === 'free' ? 'gift-outline' : 'diamond'} 
                  size={32} 
                  color="#ffffff" 
                />
                <View style={styles.currentPlanInfo}>
                  <Text style={styles.currentPlanLabel}>Seu Plano Atual</Text>
                  <Text style={styles.currentPlanName}>{currentPlan.name}</Text>
                </View>
                {currentSubscription?.status === 'active' && currentPlan.id !== 'free' && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ATIVO</Text>
                  </View>
                )}
                {currentSubscription?.status === 'cancelled' && (
                  <View style={[styles.activeBadge, { backgroundColor: colors.status.warning + '30' }]}>
                    <Text style={[styles.activeBadgeText, { color: colors.status.warning }]}>CANCELADO</Text>
                  </View>
                )}
              </View>
              
              {currentPlan.id !== 'free' && currentSubscription && (
                <View style={styles.subscriptionDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.detailText}>
                      {currentSubscription.status === 'cancelled' ? 'Acesso até:' : 'Renova em:'} {formatDate(currentSubscription.expiresAt)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.detailText}>
                      Renovação automática: {currentSubscription.autoRenew ? 'Ativada' : 'Desativada'}
                    </Text>
                  </View>
                </View>
              )}
            </LinearGradient>
          </View>

          {/* Available Plans */}
          <Text style={styles.sectionTitle}>Planos Disponíveis</Text>

          {Object.values(SUBSCRIPTION_PLANS).map((plan) => (
            <View 
              key={plan.id} 
              style={[
                styles.planCard,
                currentPlan.id === plan.id && styles.planCardActive
              ]}
            >
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.planPrice}>{plan.price}</Text>
                    <Text style={styles.planPeriod}>{plan.period}</Text>
                  </View>
                  {plan.discount && (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountText}>{plan.discount}</Text>
                    </View>
                  )}
                </View>
                {currentPlan.id === plan.id && (
                  <View style={styles.currentBadge}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.status.success} />
                    <Text style={styles.currentBadgeText}>Atual</Text>
                  </View>
                )}
              </View>

              <View style={styles.featuresContainer}>
                {plan.features.map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <Ionicons name="checkmark" size={18} color={colors.status.success} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
                {plan.limitations.map((limitation, index) => (
                  <View key={`limit-${index}`} style={styles.featureRow}>
                    <Ionicons name="close" size={18} color={colors.status.error} />
                    <Text style={[styles.featureText, styles.limitationText]}>{limitation}</Text>
                  </View>
                ))}
              </View>

              {currentPlan.id !== plan.id && (
                <TouchableOpacity
                  style={[styles.selectButton, plan.id === 'yearly' && styles.selectButtonHighlight]}
                  onPress={() => currentPlan.id === 'free' ? handleSubscribe(plan.id) : handleChangePlan(plan.id)}
                  disabled={isProcessing}
                >
                  <LinearGradient
                    colors={plan.id === 'yearly' ? colors.gradients.primary : [colors.dark.tertiary, colors.dark.tertiary]}
                    style={styles.selectButtonGradient}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.selectButtonText}>
                        {plan.id === 'free' ? 'Downgrade' : currentPlan.id === 'free' ? 'Assinar' : 'Alterar'}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {/* Cancel Subscription */}
          {currentPlan.id !== 'free' && currentSubscription?.status === 'active' && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelSubscription}
            >
              <Text style={styles.cancelButtonText}>Cancelar Assinatura</Text>
            </TouchableOpacity>
          )}

          {/* Mock Notice */}
          <View style={styles.mockNotice}>
            <Ionicons name="information-circle" size={20} color={colors.status.warning} />
            <Text style={styles.mockNoticeText}>
              Sistema de pagamento em modo de demonstração. Nenhuma cobrança real será realizada.
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
    marginBottom: 24,
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
  activeBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.status.success,
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
    borderColor: colors.accent.primary,
    borderWidth: 2,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  planPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.accent.primary,
  },
  planPeriod: {
    fontSize: 14,
    color: colors.text.secondary,
    marginLeft: 4,
  },
  discountBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  discountText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.status.success,
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
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  selectButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
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
  mockNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  mockNoticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.status.warning,
    lineHeight: 18,
  },
});
