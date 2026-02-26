/**
 * Subscription Guard
 * 
 * Sistema de gate de assinatura com 3 estados:
 * - UNKNOWN: UI carrega normalmente, sem paywall, sem bloqueio
 * - ACTIVE: Acesso completo liberado
 * - INACTIVE: Paywall exibido
 * 
 * REGRA: O app NUNCA trava
 * REGRA: Paywall NUNCA aparece durante UNKNOWN
 * REGRA: Children SEMPRE são renderizados
 */

import React, { useState } from 'react';
import { Alert, View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRevenueCat } from '../contexts/RevenueCatContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  TrialRequiredModal,
  RenewalWarningModal,
} from './SubscriptionModals';
import { formatPrice } from '../services/revenuecat';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children }) => {
  const { locale } = useLanguage();
  const { colors } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const {
    subscriptionStatus,
    shouldShowPaywall,
    shouldShowRenewalWarning,
    daysRemaining,
    currentPackage,
    customerInfo,
    startTrial,
    restorePurchases,
    openManageSubscriptions,
    dismissPaywall,
    dismissRenewalWarning,
  } = useRevenueCat();

  const [isProcessing, setIsProcessing] = useState(false);
  
  // SANDBOX: Bloqueia modal de renovação em ambiente de teste
  // Verifica isSandbox no entitlement 'pro' pois é mais confiável
  const proEntitlement = customerInfo?.entitlements?.active?.['pro'];
  const isSandbox = proEntitlement?.isSandbox === true || customerInfo?.isSandbox === true;
  const showRenewalModal = shouldShowRenewalWarning && !isSandbox;

  // ============================================
  // HANDLERS
  // ============================================

  const handleStartTrial = async () => {
    setIsProcessing(true);
    
    try {
      const result = await startTrial();
      
      if (result.success) {
        Alert.alert(
          locale === 'pt' ? 'Bem-vindo!' : 'Welcome!',
          locale === 'pt'
            ? 'Seu período de testes de 7 dias foi ativado! Aproveite todas as funcionalidades do LoadManager Pro.'
            : 'Your 7-day trial period is activated! Enjoy all features of LoadManager Pro.'
        );
      } else if (result.error !== 'cancelled') {
        Alert.alert(
          locale === 'pt' ? 'Erro' : 'Error',
          result.error || (locale === 'pt' 
            ? 'Não foi possível iniciar o trial. Tente novamente.'
            : 'Could not start trial. Please try again.')
        );
      }
    } catch (error) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' 
          ? 'Ocorreu um erro. Verifique sua conexão e tente novamente.'
          : 'An error occurred. Please check your connection and try again.'
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
            : 'Your subscription has been restored successfully!'
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
        locale === 'pt' 
          ? 'Ocorreu um erro ao restaurar compras.'
          : 'An error occurred while restoring purchases.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManageSubscription = async () => {
    await openManageSubscriptions();
  };

  const handleDismissRenewal = () => {
    dismissRenewalWarning();
  };

  // ============================================
  // HELPERS
  // ============================================

  const getPrice = () => {
    if (currentPackage) {
      return formatPrice(currentPackage);
    }
    return 'R$ 39,99';
  };

  // ============================================
  // RENDER
  // ============================================
  
  // Children SEMPRE renderizados - UI NUNCA bloqueia
  // Paywall só aparece quando subscriptionStatus === 'INACTIVE'
  // Durante UNKNOWN: UI normal, sem paywall, sem bloqueio
  
  return (
    <>
      {/* Children SEMPRE renderizados */}
      {children}

      {/* Indicador sutil durante UNKNOWN (apenas visual) */}
      {subscriptionStatus === 'UNKNOWN' && isAuthenticated && user?.role === 'coach' && (
        <View style={styles.unknownIndicator}>
          <ActivityIndicator size="small" color={colors.accent.primary} />
          <Text style={[styles.unknownText, { color: colors.text.secondary }]}>
            {locale === 'pt' ? 'Verificando assinatura...' : 'Checking subscription...'}
          </Text>
        </View>
      )}

      {/* Paywall - SOMENTE quando status === 'INACTIVE' */}
      <TrialRequiredModal
        visible={shouldShowPaywall}
        onStartTrial={handleStartTrial}
        onRestorePurchases={handleRestorePurchases}
        isLoading={isProcessing}
        price={getPrice()}
      />

      {/* Modal de Aviso de Renovação - Bloqueado em Sandbox */}
      <RenewalWarningModal
        visible={showRenewalModal}
        daysRemaining={daysRemaining}
        onDismiss={handleDismissRenewal}
        onManageSubscription={handleManageSubscription}
        isSandbox={isSandbox}
      />
    </>
  );
};

const styles = StyleSheet.create({
  unknownIndicator: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 1000,
    gap: 8,
  },
  unknownText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default SubscriptionGuard;
