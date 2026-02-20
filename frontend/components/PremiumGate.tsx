/**
 * PremiumGate Component
 * 
 * Componente de gate para features premium do LoadManager Pro.
 * Bloqueia acesso a features se o usuário não estiver em trial ou assinatura ativa.
 * 
 * IMPORTANTE: Este componente NÃO modifica nenhum cálculo, métrica ou gráfico.
 * Apenas controla o ACESSO às features.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRevenueCat } from '../contexts/RevenueCatContext';
import { useLanguage } from '../contexts/LanguageContext';
import { colors } from '../constants/theme';

const { width } = Dimensions.get('window');

interface PremiumGateProps {
  children: React.ReactNode;
  /** Nome da feature para exibição */
  featureName?: string;
  /** Se deve mostrar loading enquanto verifica status */
  showLoading?: boolean;
  /** Callback quando usuário clica em upgrade */
  onUpgradePress?: () => void;
}

/**
 * PremiumGate - Componente de proteção para features premium
 * 
 * Uso:
 * <PremiumGate featureName="VBT Camera">
 *   <VBTCameraContent />
 * </PremiumGate>
 * 
 * O gate verifica:
 * 1. isPro (assinatura ativa)
 * 2. isTrialing (trial ativo de 7 dias)
 * 3. expirationDate (acesso até expiração mesmo após cancelamento)
 */
export const PremiumGate: React.FC<PremiumGateProps> = ({
  children,
  featureName = 'Esta funcionalidade',
  showLoading = true,
  onUpgradePress,
}) => {
  const router = useRouter();
  const { locale } = useLanguage();
  const {
    isInitialized,
    isPro,
    isTrialing,
    expirationDate,
    isLoading,
  } = useRevenueCat();

  // Traduções
  const t = {
    loading: locale === 'pt' ? 'Verificando assinatura...' : 'Checking subscription...',
    premiumRequired: locale === 'pt' ? 'Funcionalidade Premium' : 'Premium Feature',
    featureRequires: locale === 'pt' 
      ? `${featureName} requer uma assinatura ativa.`
      : `${featureName} requires an active subscription.`,
    startTrial: locale === 'pt' ? 'Iniciar Trial Grátis (7 dias)' : 'Start Free Trial (7 days)',
    subscribe: locale === 'pt' ? 'Ver Planos' : 'View Plans',
    trialInfo: locale === 'pt' 
      ? 'Experimente grátis por 7 dias com acesso completo a todas as funcionalidades.'
      : 'Try free for 7 days with full access to all features.',
    back: locale === 'pt' ? 'Voltar' : 'Go Back',
  };

  // Verifica se está carregando
  if (!isInitialized || (isLoading && showLoading)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>{t.loading}</Text>
      </View>
    );
  }

  // Verifica se tem acesso premium
  const hasAccess = checkPremiumAccess(isPro, isTrialing, expirationDate);

  // Se tem acesso, renderiza o conteúdo
  if (hasAccess) {
    return <>{children}</>;
  }

  // Se não tem acesso, mostra tela de upgrade
  const handleUpgrade = () => {
    if (onUpgradePress) {
      onUpgradePress();
    } else {
      router.push('/subscription');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.primary, colors.dark.secondary]}
        style={styles.gradient}
      >
        {/* Header com botão voltar */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.backButton}
            data-testid="premium-gate-back-btn"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Conteúdo */}
        <View style={styles.content}>
          {/* Ícone Premium */}
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={['#8b5cf6', '#6d28d9']}
              style={styles.iconGradient}
            >
              <Ionicons name="lock-closed" size={48} color="#ffffff" />
            </LinearGradient>
          </View>

          {/* Título */}
          <Text style={styles.title}>{t.premiumRequired}</Text>
          
          {/* Descrição */}
          <Text style={styles.description}>{t.featureRequires}</Text>
          
          {/* Info do Trial */}
          <View style={styles.trialInfoBox}>
            <Ionicons name="gift-outline" size={24} color={colors.status.success} />
            <Text style={styles.trialInfoText}>{t.trialInfo}</Text>
          </View>

          {/* Botões */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleUpgrade}
            data-testid="premium-gate-upgrade-btn"
          >
            <LinearGradient
              colors={['#8b5cf6', '#6d28d9']}
              style={styles.primaryButtonGradient}
            >
              <Ionicons name="rocket" size={20} color="#ffffff" />
              <Text style={styles.primaryButtonText}>{t.startTrial}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.back()}
            data-testid="premium-gate-back-secondary-btn"
          >
            <Text style={styles.secondaryButtonText}>{t.back}</Text>
          </TouchableOpacity>
        </View>

        {/* Features incluídas */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresTitle}>
            {locale === 'pt' ? 'Incluso no Premium:' : 'Included in Premium:'}
          </Text>
          <View style={styles.featuresList}>
            {[
              locale === 'pt' ? 'VBT via Câmera' : 'VBT via Camera',
              locale === 'pt' ? 'Análise GPS' : 'GPS Analysis',
              locale === 'pt' ? 'Periodização' : 'Periodization',
              locale === 'pt' ? 'Relatórios PDF' : 'PDF Reports',
              locale === 'pt' ? 'Análise Científica com IA' : 'AI Scientific Analysis',
            ].map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={16} color={colors.status.success} />
                <Text style={styles.featureItemText}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

/**
 * Verifica se o usuário tem acesso premium
 * 
 * Regras:
 * 1. isPro === true -> Assinatura ativa
 * 2. isTrialing === true -> Trial ativo (7 dias)
 * 3. expirationDate > now -> Acesso até expiração (mesmo após cancelamento)
 */
export const checkPremiumAccess = (
  isPro: boolean,
  isTrialing: boolean,
  expirationDate: Date | null
): boolean => {
  // Assinatura ativa
  if (isPro) return true;
  
  // Trial ativo
  if (isTrialing) return true;
  
  // Verifica se ainda tem tempo de acesso (após cancelamento)
  if (expirationDate) {
    const now = new Date();
    if (expirationDate > now) return true;
  }
  
  return false;
};

/**
 * Hook para verificar acesso premium de forma programática
 */
export const usePremiumAccess = () => {
  const { isPro, isTrialing, expirationDate, isInitialized, isLoading } = useRevenueCat();
  
  const hasAccess = checkPremiumAccess(isPro, isTrialing, expirationDate);
  
  return {
    hasAccess,
    isPro,
    isTrialing,
    expirationDate,
    isInitialized,
    isLoading,
  };
};

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
    backgroundColor: colors.dark.primary,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text.secondary,
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  trialInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  trialInfoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: colors.text.tertiary,
  },
  featuresSection: {
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  featuresTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  featuresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  featureItemText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});

export default PremiumGate;
