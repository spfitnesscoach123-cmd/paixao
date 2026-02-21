/**
 * Subscription Page
 * 
 * Tela de gerenciamento de assinatura com integração RevenueCat
 * Mostra status atual, funcionalidades e opções de compra/cancelamento
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';
import { useRevenueCat } from '../contexts/RevenueCatContext';
import { formatPrice } from '../services/revenuecat';

// ============================================
// TIPOS E CONSTANTES
// ============================================

interface FeatureSection {
  title: { pt: string; en: string };
  icon: string;
  features: { pt: string; en: string }[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: { 
      pt: "O que você terá acesso", 
      en: "What You'll Access" 
    },
    icon: "rocket-outline",
    features: [
      { pt: "Gestão automática de carga baseada em GPS", en: "GPS-Based Automatic Load Management and Prescription" },
      { pt: "Periodização diária e semanal individualizada em segundos", en: "Individualized daily and weekly periodization in seconds" },
      { pt: "Baseado no histórico próprio do atleta", en: "Based on the athlete's own history" },
      { pt: "Modelos científicos validados aplicados automaticamente", en: "Validated scientific models applied automatically" },
      { pt: "Controle preciso de carga externa e progressão", en: "Precise control of external load and progression" },
    ],
  },
  {
    title: { 
      pt: "Métricas Completas de Performance GPS", 
      en: "Complete GPS Performance Metrics" 
    },
    icon: "analytics-outline",
    features: [
      { pt: "Distância Total", en: "Total Distance" },
      { pt: "High Speed Running (HSR)", en: "High Speed Running (HSR)" },
      { pt: "High Intensity Distance (HID)", en: "High Intensity Distance (HID)" },
      { pt: "Distância de Sprint", en: "Sprint Distance" },
      { pt: "Número de sprints", en: "Number of sprints" },
      { pt: "Acelerações e desacelerações", en: "Accelerations and decelerations" },
      { pt: "Monitoramento longitudinal e análise de tendências", en: "Longitudinal monitoring and trend analysis" },
    ],
  },
  {
    title: { 
      pt: "Sistema VBT Integrado via Vídeo", 
      en: "Integrated Video-Based VBT System" 
    },
    icon: "videocam-outline",
    features: [
      { pt: "Medição de velocidade em tempo real usando a câmera", en: "Real-time velocity measurement using the camera" },
      { pt: "Análise precisa de repetições e execução", en: "Precise analysis of repetitions and execution" },
      { pt: "Feedback imediato para ajuste de carga", en: "Immediate feedback for load adjustment" },
      { pt: "Sem necessidade de hardware adicional", en: "No additional hardware required" },
    ],
  },
  {
    title: { 
      pt: "Avaliação Neuromuscular e Monitoramento de Fadiga", 
      en: "Neuromuscular Assessment and Fatigue Monitoring" 
    },
    icon: "fitness-outline",
    features: [
      { pt: "Análise de CMJ, DJ e SL-CMJ", en: "Analysis of CMJ, DJ, and SL-CMJ" },
      { pt: "Cálculo automático de RSI (Reactive Strength Index)", en: "Automatic calculation of RSI (Reactive Strength Index)" },
      { pt: "Índice de fadiga individualizado", en: "Individualized fatigue index" },
      { pt: "Identificação de assimetrias de membros inferiores", en: "Identification of lower limb asymmetries" },
      { pt: "Insights automáticos para suporte à decisão", en: "Automatic insights for decision-making support" },
    ],
  },
  {
    title: { 
      pt: "Avaliação Física e Composição Corporal", 
      en: "Physical Assessment and Body Composition" 
    },
    icon: "body-outline",
    features: [
      { pt: "Registro estruturado de avaliações físicas", en: "Structured record of physical assessments" },
      { pt: "Monitoramento longitudinal da evolução", en: "Longitudinal monitoring of evolution" },
      { pt: "Centralização de todos os dados do atleta em um único ambiente", en: "Centralization of all athlete data in a single environment" },
    ],
  },
  {
    title: { 
      pt: "Sistema Inteligente de Wellness via Token", 
      en: "Intelligent Wellness Collection System via Token" 
    },
    icon: "heart-outline",
    features: [
      { pt: "Integração direta entre treinador e atleta", en: "Direct integration between coach and athlete" },
      { pt: "O treinador envia um token único", en: "The coach sends a unique token" },
      { pt: "O atleta acessa sem login e sem precisar de conta", en: "The athlete accesses without login and without needing an account" },
      { pt: "Preenchimento rápido e intuitivo", en: "Fast and intuitive filling" },
      { pt: "Dados enviados automaticamente ao dashboard do treinador", en: "Data sent automatically to the coach's dashboard" },
    ],
  },
  {
    title: { 
      pt: "Dashboard Profissional e Inteligência Aplicada", 
      en: "Professional Dashboard and Applied Intelligence" 
    },
    icon: "bar-chart-outline",
    features: [
      { pt: "Visualização clara e estruturada de dados", en: "Clear and structured data visualization" },
      { pt: "Insights automáticos baseados em ciência", en: "Automatic science-based insights" },
      { pt: "Identificação de padrões, riscos e oportunidades", en: "Identification of patterns, risks, and opportunities" },
      { pt: "Suporte direto à tomada de decisão baseada em evidências", en: "Direct support for evidence-based decision making" },
    ],
  },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function Subscription() {
  const router = useRouter();
  const { locale } = useLanguage();
  const {
    isPro,
    isTrialing,
    isLoading,
    daysRemaining,
    expirationDate,
    willRenew,
    currentPackage,
    startTrial,
    purchaseSubscription,
    restorePurchases,
    openManageSubscriptions,
    refreshStatus,
  } = useRevenueCat();

  const [isProcessing, setIsProcessing] = useState(false);

  // Atualiza status ao montar
  useEffect(() => {
    refreshStatus();
  }, []);

  // ============================================
  // HANDLERS
  // ============================================

  const handleStartTrial = async () => {
    setIsProcessing(true);
    
    try {
      const result = await startTrial();
      
      if (result.success) {
        Alert.alert(
          locale === 'pt' ? 'Sucesso!' : 'Success!',
          locale === 'pt'
            ? 'Seu período de testes foi ativado! Aproveite todas as funcionalidades.'
            : 'Your trial period is activated! Enjoy all features.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else if (result.error === 'cancelled') {
        // Usuário cancelou, não mostra alerta
      } else {
        Alert.alert(
          locale === 'pt' ? 'Erro' : 'Error',
          result.error || (locale === 'pt' ? 'Não foi possível iniciar o trial.' : 'Could not start trial.')
        );
      }
    } catch (error) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Ocorreu um erro. Tente novamente.' : 'An error occurred. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestorePurchases = async () => {
    setIsProcessing(true);
    
    try {
      const result = await restorePurchases();
      
      if (result.success) {
        Alert.alert(
          locale === 'pt' ? 'Sucesso!' : 'Success!',
          locale === 'pt'
            ? 'Sua assinatura foi restaurada com sucesso!'
            : 'Your subscription has been restored successfully!',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          locale === 'pt' ? 'Aviso' : 'Notice',
          result.error || (locale === 'pt' 
            ? 'Nenhuma compra anterior encontrada para esta conta.'
            : 'No previous purchases found for this account.')
        );
      }
    } catch (error) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' ? 'Ocorreu um erro. Tente novamente.' : 'An error occurred. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManageSubscription = async () => {
    await openManageSubscriptions();
  };

  // ============================================
  // HELPERS
  // ============================================

  const getPrice = () => {
    if (currentPackage) {
      return formatPrice(currentPackage);
    }
    return '$39.99';
  };

  const formatExpirationDate = () => {
    if (!expirationDate) return '';
    
    return expirationDate.toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const getStatusBadge = () => {
    if (isTrialing) {
      return {
        text: locale === 'pt' ? 'TRIAL ATIVO' : 'TRIAL ACTIVE',
        color: colors.status.info,
      };
    }
    if (isPro) {
      return {
        text: locale === 'pt' ? 'PRO ATIVO' : 'PRO ACTIVE',
        color: colors.status.success,
      };
    }
    return {
      text: locale === 'pt' ? 'SEM ASSINATURA' : 'NO SUBSCRIPTION',
      color: colors.status.error,
    };
  };

  const statusBadge = getStatusBadge();

  // ============================================
  // RENDER
  // ============================================

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>
            {locale === 'pt' ? 'Carregando...' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[colors.dark.primary, colors.dark.secondary]}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            data-testid="subscription-back-btn"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Assinatura' : 'Subscription'}
          </Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Status Section (se tem assinatura ativa) */}
          {isPro && (
            <View style={styles.statusSection}>
              <View style={[styles.statusBadge, { backgroundColor: statusBadge.color + '20' }]}>
                <Ionicons
                  name={isTrialing ? 'time' : 'checkmark-circle'}
                  size={16}
                  color={statusBadge.color}
                />
                <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                  {statusBadge.text}
                </Text>
              </View>
              
              <View style={styles.statusInfo}>
                {isTrialing && (
                  <Text style={styles.statusText}>
                    {locale === 'pt'
                      ? `${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'} restantes do trial`
                      : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining in trial`}
                  </Text>
                )}
                
                {expirationDate && (
                  <Text style={styles.expirationText}>
                    {locale === 'pt'
                      ? `${willRenew ? 'Renova' : 'Expira'} em: ${formatExpirationDate()}`
                      : `${willRenew ? 'Renews' : 'Expires'} on: ${formatExpirationDate()}`}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Plan Header */}
          <View style={styles.planHeader}>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
            <Text style={styles.planTitle}>
              {locale === 'pt' ? 'Plano Pro' : 'Pro Plan'}
            </Text>
            <View style={styles.priceContainer}>
              <Text style={styles.priceValue}>{getPrice()}</Text>
              <Text style={styles.pricePeriod}>
                /{locale === 'pt' ? 'mês' : 'month'}
              </Text>
            </View>
            <View style={styles.cancelPolicyContainer}>
              <Ionicons name="checkmark-circle" size={18} color={colors.status.success} />
              <Text style={styles.cancelPolicyText}>
                {locale === 'pt' ? 'Cancelamento a qualquer momento' : 'Cancel anytime'}
              </Text>
            </View>
            <Text style={styles.cancelPolicySubtext}>
              {locale === 'pt'
                ? 'A assinatura permanece ativa até o final do período vigente.'
                : 'Subscription remains active until the end of the current period.'}
            </Text>
          </View>

          {/* Feature Sections */}
          {FEATURE_SECTIONS.map((section, index) => (
            <View key={index} style={styles.featureSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Ionicons
                    name={section.icon as any}
                    size={22}
                    color={colors.accent.primary}
                  />
                </View>
                <Text style={styles.sectionTitle}>
                  {locale === 'pt' ? section.title.pt : section.title.en}
                </Text>
              </View>
              <View style={styles.featureList}>
                {section.features.map((feature, featureIndex) => (
                  <View key={featureIndex} style={styles.featureItem}>
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={colors.accent.primary}
                      style={styles.featureCheck}
                    />
                    <Text style={styles.featureText}>
                      {locale === 'pt' ? feature.pt : feature.en}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* CTA Buttons */}
          <View style={styles.ctaContainer}>
            {!isPro ? (
              // Não tem assinatura - mostrar botão de trial
              <>
                <TouchableOpacity
                  style={styles.trialButton}
                  onPress={handleStartTrial}
                  disabled={isProcessing}
                  data-testid="start-trial-btn"
                >
                  <LinearGradient
                    colors={[colors.accent.primary, colors.accent.secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.trialButtonGradient}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="play-circle" size={24} color="#FFFFFF" />
                        <Text style={styles.trialButtonText}>
                          {locale === 'pt' ? 'Iniciar 7 Dias Grátis' : 'Start 7-Day Free Trial'}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={handleRestorePurchases}
                  disabled={isProcessing}
                  data-testid="restore-purchases-btn"
                >
                  <Text style={styles.restoreButtonText}>
                    {locale === 'pt' ? 'Restaurar Compras' : 'Restore Purchases'}
                  </Text>
                </TouchableOpacity>

                {/* Trial Info */}
                <View style={styles.trialInfoBox}>
                  <Ionicons name="information-circle" size={20} color={colors.text.secondary} />
                  <Text style={styles.trialInfoText}>
                    {locale === 'pt'
                      ? `7 dias gratuitos. Após o trial, será cobrado ${getPrice()} USD/mês automaticamente. Cancele a qualquer momento.`
                      : `7 days free. After trial, ${getPrice()} USD/month will be charged automatically. Cancel anytime.`}
                  </Text>
                </View>
              </>
            ) : (
              // Tem assinatura - mostrar botão de gerenciar
              <>
                <TouchableOpacity
                  style={styles.manageButton}
                  onPress={handleManageSubscription}
                  data-testid="manage-subscription-btn"
                >
                  <Ionicons name="settings-outline" size={22} color={colors.text.primary} />
                  <Text style={styles.manageButtonText}>
                    {locale === 'pt' ? 'Gerenciar Assinatura' : 'Manage Subscription'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.manageHint}>
                  {locale === 'pt'
                    ? 'Você será redirecionado para as configurações da App Store para gerenciar ou cancelar sua assinatura.'
                    : 'You will be redirected to App Store settings to manage or cancel your subscription.'}
                </Text>
              </>
            )}
          </View>

          {/* Footer spacing */}
          <View style={styles.footer} />
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

// ============================================
// ESTILOS
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  statusSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  statusInfo: {
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  expirationText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  planHeader: {
    alignItems: 'center',
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  proBadge: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  proBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  planTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  priceValue: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.text.primary,
  },
  pricePeriod: {
    fontSize: 18,
    color: colors.text.secondary,
    marginLeft: 4,
  },
  cancelPolicyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelPolicyText: {
    fontSize: 16,
    color: colors.status.success,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelPolicySubtext: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  featureSection: {
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    flex: 1,
  },
  featureList: {
    paddingLeft: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  featureCheck: {
    marginRight: 10,
    marginTop: 2,
  },
  featureText: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
    lineHeight: 20,
  },
  ctaContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  trialButton: {
    marginBottom: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  trialButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  trialButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 10,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    marginBottom: 20,
  },
  restoreButtonText: {
    color: colors.text.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  trialInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 14,
  },
  trialInfoText: {
    fontSize: 13,
    color: colors.text.tertiary,
    marginLeft: 10,
    flex: 1,
    lineHeight: 18,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    marginBottom: 12,
  },
  manageButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  manageHint: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    height: 40,
  },
});
