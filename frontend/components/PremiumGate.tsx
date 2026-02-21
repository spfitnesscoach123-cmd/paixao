/**
 * PremiumGate Component
 * 
 * Componente que bloqueia acesso a funcionalidades premium
 * Usuários sem assinatura ou trial ativo veem uma tela de bloqueio
 */

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRevenueCat } from '../contexts/RevenueCatContext';
import { useLanguage } from '../contexts/LanguageContext';
import { colors } from '../constants/theme';

// ============================================
// TIPOS
// ============================================

interface PremiumGateProps {
  children: ReactNode;
  feature?: string;
  featureName?: string;
  onUpgradePress?: () => void;
  showLoading?: boolean;
}

// ============================================
// COMPONENTE PREMIUM GATE
// ============================================

const PremiumGate: React.FC<PremiumGateProps> = ({
  children,
  feature,
  featureName,
  onUpgradePress,
  showLoading = true,
}) => {
  const router = useRouter();
  const { locale } = useLanguage();
  const { isPro, isLoading, isInitialized } = useRevenueCat();

  // Se está carregando e showLoading está ativo, mostra loading
  if (isLoading && showLoading && !isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>
          {locale === 'pt' ? 'Verificando assinatura...' : 'Checking subscription...'}
        </Text>
      </View>
    );
  }

  // Se tem acesso PRO (trial ou pago), libera o conteúdo
  if (isPro) {
    return <>{children}</>;
  }

  // Usuário não tem acesso - mostra tela de bloqueio
  const handleUpgrade = () => {
    if (onUpgradePress) {
      onUpgradePress();
    } else {
      router.push('/subscription');
    }
  };

  const getFeatureDisplayName = () => {
    if (featureName) return featureName;
    
    // Nomes padrão para features conhecidas
    const featureNames: Record<string, { pt: string; en: string }> = {
      vbt: { pt: 'VBT (Treino Baseado em Velocidade)', en: 'VBT (Velocity Based Training)' },
      gps: { pt: 'Análise de Carga GPS', en: 'GPS Load Analysis' },
      periodization: { pt: 'Periodização Individual', en: 'Individual Periodization' },
      jump: { pt: 'Análise de Salto', en: 'Jump Analysis' },
      pdf: { pt: 'Exportação de PDF', en: 'PDF Export' },
      dashboard: { pt: 'Dashboard da Equipe', en: 'Team Dashboard' },
      wellness: { pt: 'Sistema de Wellness', en: 'Wellness System' },
      scientific: { pt: 'Análise Científica', en: 'Scientific Analysis' },
    };
    
    if (feature && featureNames[feature]) {
      return locale === 'pt' ? featureNames[feature].pt : featureNames[feature].en;
    }
    
    return locale === 'pt' ? 'Esta Funcionalidade' : 'This Feature';
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(99, 102, 241, 0.1)', 'rgba(99, 102, 241, 0.05)']}
        style={styles.gradient}
      >
        {/* Ícone de bloqueio */}
        <View style={styles.iconContainer}>
          <View style={styles.iconBackground}>
            <Ionicons name="lock-closed" size={48} color={colors.accent.primary} />
          </View>
        </View>

        {/* Título */}
        <Text style={styles.title}>
          {locale === 'pt' ? 'Funcionalidade Premium' : 'Premium Feature'}
        </Text>

        {/* Descrição */}
        <Text style={styles.description}>
          {locale === 'pt'
            ? `${getFeatureDisplayName()} requer uma assinatura ativa.`
            : `${getFeatureDisplayName()} requires an active subscription.`}
        </Text>

        {/* Benefícios */}
        <View style={styles.benefitsContainer}>
          <Text style={styles.benefitsTitle}>
            {locale === 'pt' ? 'Com o plano Pro você terá:' : 'With Pro plan you get:'}
          </Text>
          
          <View style={styles.benefitItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.status.success} />
            <Text style={styles.benefitText}>
              {locale === 'pt' ? '7 dias de teste gratuito' : '7 days free trial'}
            </Text>
          </View>
          
          <View style={styles.benefitItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.status.success} />
            <Text style={styles.benefitText}>
              {locale === 'pt' ? 'Acesso a todas as funcionalidades' : 'Access to all features'}
            </Text>
          </View>
          
          <View style={styles.benefitItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.status.success} />
            <Text style={styles.benefitText}>
              {locale === 'pt' ? 'Cancele a qualquer momento' : 'Cancel anytime'}
            </Text>
          </View>
        </View>

        {/* Botão de upgrade */}
        <TouchableOpacity 
          style={styles.upgradeButton} 
          onPress={handleUpgrade}
          data-testid="premium-gate-upgrade-btn"
        >
          <LinearGradient
            colors={[colors.accent.primary, colors.accent.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.upgradeButtonGradient}
          >
            <Ionicons name="star" size={20} color="#FFFFFF" />
            <Text style={styles.upgradeButtonText}>
              {locale === 'pt' ? 'Iniciar Teste Gratuito' : 'Start Free Trial'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Preço */}
        <Text style={styles.priceText}>
          {locale === 'pt'
            ? 'Após o trial: $39.99/mês'
            : 'After trial: $39.99/month'}
        </Text>
      </LinearGradient>
    </View>
  );
};

// ============================================
// HOOK PARA VERIFICAR ACESSO PREMIUM
// ============================================

export const usePremiumAccess = () => {
  const { isPro, isLoading, refreshStatus } = useRevenueCat();
  
  return {
    isPremium: isPro,
    isLoading,
    refreshPremiumStatus: refreshStatus,
  };
};

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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
  iconContainer: {
    marginBottom: 24,
  },
  iconBackground: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  benefitsContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitText: {
    fontSize: 15,
    color: colors.text.secondary,
    marginLeft: 12,
  },
  upgradeButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  upgradeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 10,
  },
  priceText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
});

export default PremiumGate;
