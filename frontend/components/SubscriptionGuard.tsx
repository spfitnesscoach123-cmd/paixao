/**
 * Subscription Guard
 * 
 * Componente wrapper que exibe modais obrigatórios de assinatura
 * Deve ser usado no layout principal para garantir que:
 * - Usuários novos vejam o modal de trial obrigatório
 * - Usuários com assinatura expirando vejam o aviso de renovação
 * - Usuários com assinatura expirada vejam o modal de renovação
 */

import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useRevenueCat } from '../contexts/RevenueCatContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  TrialRequiredModal,
  RenewalWarningModal,
  SubscriptionExpiredModal,
} from './SubscriptionModals';
import { formatPrice } from '../services/revenuecat';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children }) => {
  const { locale } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const {
    isPro,
    isTrialing,
    isLoading,
    isInitialized,
    shouldShowTrialPrompt,
    shouldShowRenewalWarning,
    daysRemaining,
    currentPackage,
    startTrial,
    purchaseSubscription,
    restorePurchases,
    openManageSubscriptions,
    dismissTrialPrompt,
    dismissRenewalWarning,
  } = useRevenueCat();

  const [isProcessing, setIsProcessing] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  // Verifica se deve mostrar modal de expirado
  useEffect(() => {
    // Se o usuário estava autenticado, o SDK inicializou, 
    // não está carregando e não tem acesso pro
    if (isAuthenticated && isInitialized && !isLoading && !isPro) {
      // Verifica se é um coach (não mostra para atletas)
      if (user?.role === 'coach') {
        setShowExpiredModal(true);
      }
    } else {
      setShowExpiredModal(false);
    }
  }, [isAuthenticated, isInitialized, isLoading, isPro, user?.role]);

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

  const handleSubscribe = async () => {
    setIsProcessing(true);
    
    try {
      const result = await purchaseSubscription();
      
      if (result.success) {
        setShowExpiredModal(false);
        Alert.alert(
          locale === 'pt' ? 'Sucesso!' : 'Success!',
          locale === 'pt'
            ? 'Sua assinatura foi ativada! Bem-vindo de volta ao LoadManager Pro.'
            : 'Your subscription is activated! Welcome back to LoadManager Pro.'
        );
      } else if (result.error !== 'cancelled') {
        Alert.alert(
          locale === 'pt' ? 'Erro' : 'Error',
          result.error || (locale === 'pt' 
            ? 'Não foi possível processar a assinatura.'
            : 'Could not process subscription.')
        );
      }
    } catch (error) {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        locale === 'pt' 
          ? 'Ocorreu um erro. Tente novamente.'
          : 'An error occurred. Please try again.'
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
        setShowExpiredModal(false);
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

  const handleCloseExpired = () => {
    // Permite fechar apenas para ver o app, mas vai aparecer novamente
    setShowExpiredModal(false);
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

  // ============================================
  // RENDER
  // ============================================

  return (
    <>
      {children}

      {/* Modal de Trial Obrigatório */}
      <TrialRequiredModal
        visible={shouldShowTrialPrompt && user?.role === 'coach'}
        onStartTrial={handleStartTrial}
        onRestorePurchases={handleRestorePurchases}
        isLoading={isProcessing}
        price={getPrice()}
      />

      {/* Modal de Aviso de Renovação */}
      <RenewalWarningModal
        visible={shouldShowRenewalWarning}
        daysRemaining={daysRemaining}
        onDismiss={handleDismissRenewal}
        onManageSubscription={handleManageSubscription}
      />

      {/* Modal de Assinatura Expirada */}
      <SubscriptionExpiredModal
        visible={showExpiredModal && user?.role === 'coach'}
        onClose={handleCloseExpired}
        onSubscribe={handleSubscribe}
        onRestorePurchases={handleRestorePurchases}
        isLoading={isProcessing}
        price={getPrice()}
      />
    </>
  );
};

export default SubscriptionGuard;
