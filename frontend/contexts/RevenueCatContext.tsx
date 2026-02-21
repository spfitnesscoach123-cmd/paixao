/**
 * RevenueCat Context
 * 
 * Context completo para gerenciamento de assinaturas no LoadManager Pro
 * Implementa trial obrigatório de 7 dias, controle de acesso e sincronização
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import * as RevenueCatService from '../services/revenuecat';
import { useAuth } from './AuthContext';

// ============================================
// TIPOS
// ============================================

interface RevenueCatContextType {
  // Estado de inicialização
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Status da assinatura
  isPro: boolean;
  isTrialing: boolean;
  hasTrialAvailable: boolean;
  expirationDate: Date | null;
  daysRemaining: number;
  willRenew: boolean;
  
  // Flags de UI
  shouldShowTrialPrompt: boolean;
  shouldShowRenewalWarning: boolean;
  shouldShowExpiredPrompt: boolean;
  
  // Dados
  customerInfo: CustomerInfo | null;
  currentPackage: PurchasesPackage | null;
  
  // Ações
  startTrial: () => Promise<{ success: boolean; error?: string }>;
  purchaseSubscription: () => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; error?: string }>;
  refreshStatus: () => Promise<void>;
  openManageSubscriptions: () => Promise<void>;
  dismissTrialPrompt: () => void;
  dismissRenewalWarning: () => void;
}

const defaultContext: RevenueCatContextType = {
  isInitialized: false,
  isLoading: true,
  error: null,
  isPro: false,
  isTrialing: false,
  hasTrialAvailable: true,
  expirationDate: null,
  daysRemaining: 0,
  willRenew: false,
  shouldShowTrialPrompt: false,
  shouldShowRenewalWarning: false,
  shouldShowExpiredPrompt: false,
  customerInfo: null,
  currentPackage: null,
  startTrial: async () => ({ success: false }),
  purchaseSubscription: async () => ({ success: false }),
  restorePurchases: async () => ({ success: false }),
  refreshStatus: async () => {},
  openManageSubscriptions: async () => {},
  dismissTrialPrompt: () => {},
  dismissRenewalWarning: () => {},
};

const RevenueCatContext = createContext<RevenueCatContextType>(defaultContext);

export const useRevenueCat = () => useContext(RevenueCatContext);

// ============================================
// PROVIDER
// ============================================

interface RevenueCatProviderProps {
  children: ReactNode;
}

export const RevenueCatProvider: React.FC<RevenueCatProviderProps> = ({ children }) => {
  // Estados
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentPackage, setCurrentPackage] = useState<PurchasesPackage | null>(null);
  
  const [isPro, setIsPro] = useState(false);
  const [isTrialing, setIsTrialing] = useState(false);
  const [hasTrialAvailable, setHasTrialAvailable] = useState(true);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [willRenew, setWillRenew] = useState(false);
  
  const [trialPromptDismissed, setTrialPromptDismissed] = useState(false);
  const [renewalWarningDismissed, setRenewalWarningDismissed] = useState(false);
  
  const { user, isAuthenticated } = useAuth();

  // ============================================
  // ATUALIZAÇÃO DE STATUS
  // ============================================
  
  const updateStatus = useCallback((info: CustomerInfo | null) => {
    if (!info) {
      setIsPro(false);
      setIsTrialing(false);
      setExpirationDate(null);
      setDaysRemaining(0);
      setWillRenew(false);
      return;
    }
    
    const status = RevenueCatService.getSubscriptionStatus(info);
    
    setIsPro(status.isPro);
    setIsTrialing(status.isTrialing);
    setExpirationDate(status.expirationDate);
    setDaysRemaining(status.daysRemaining);
    setWillRenew(status.willRenew);
    
    // Se não tem acesso pro, trial está disponível
    setHasTrialAvailable(!status.isPro);
  }, []);

  // ============================================
  // INICIALIZAÇÃO
  // ============================================
  
  const initialize = useCallback(async () => {
    // Só inicializa em plataformas móveis
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      console.log('[RevenueCat] Plataforma não suportada');
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Inicializa o SDK
      const initSuccess = await RevenueCatService.initializeRevenueCat();
      
      if (!initSuccess) {
        throw new Error('Falha ao inicializar RevenueCat');
      }
      
      // Carrega ofertas
      const offeringsResult = await RevenueCatService.getOfferings();
      if (offeringsResult.success && offeringsResult.currentPackage) {
        setCurrentPackage(offeringsResult.currentPackage);
      }
      
      // Obtém info do cliente
      const info = await RevenueCatService.getCustomerInfo();
      setCustomerInfo(info);
      updateStatus(info);
      
      setIsInitialized(true);
      console.log('[RevenueCat] Contexto inicializado com sucesso');
    } catch (err: any) {
      console.error('[RevenueCat] Erro na inicialização:', err);
      setError(err.message || 'Erro ao inicializar');
    } finally {
      setIsLoading(false);
    }
  }, [updateStatus]);

  // ============================================
  // EFEITOS
  // ============================================
  
  // Inicialização ao montar
  useEffect(() => {
    initialize();
  }, [initialize]);
  
  // Vincula usuário ao RevenueCat quando autenticado
  useEffect(() => {
    const handleUserLogin = async () => {
      if (isAuthenticated && user?.id && isInitialized) {
        try {
          const info = await RevenueCatService.loginUser(user.id);
          if (info) {
            setCustomerInfo(info);
            updateStatus(info);
          }
        } catch (error) {
          console.error('[RevenueCat] Erro ao vincular usuário:', error);
        }
      }
    };
    
    handleUserLogin();
  }, [isAuthenticated, user?.id, isInitialized, updateStatus]);
  
  // Listener de mudanças de status
  useEffect(() => {
    if (!isInitialized) return;
    
    const removeListener = RevenueCatService.addCustomerInfoListener((info) => {
      setCustomerInfo(info);
      updateStatus(info);
    });
    
    return () => {
      removeListener();
    };
  }, [isInitialized, updateStatus]);
  
  // Atualiza quando app volta ao foreground
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active' && isInitialized) {
        console.log('[RevenueCat] App voltou ao foreground, atualizando status');
        const info = await RevenueCatService.refreshCustomerInfo();
        if (info) {
          setCustomerInfo(info);
          updateStatus(info);
        }
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [isInitialized, updateStatus]);

  // ============================================
  // AÇÕES
  // ============================================
  
  /**
   * Inicia o período de trial (compra com trial)
   */
  const startTrial = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentPackage) {
      // Tenta recarregar ofertas
      const offeringsResult = await RevenueCatService.getOfferings();
      if (!offeringsResult.success || !offeringsResult.currentPackage) {
        return {
          success: false,
          error: 'Não foi possível carregar as ofertas. Verifique sua conexão.',
        };
      }
      setCurrentPackage(offeringsResult.currentPackage);
    }
    
    const packageToPurchase = currentPackage;
    if (!packageToPurchase) {
      return {
        success: false,
        error: 'Pacote de assinatura não disponível',
      };
    }
    
    setIsLoading(true);
    
    try {
      const result = await RevenueCatService.purchasePackage(packageToPurchase);
      
      if (result.success && result.customerInfo) {
        setCustomerInfo(result.customerInfo);
        updateStatus(result.customerInfo);
        setTrialPromptDismissed(true);
        return { success: true };
      }
      
      if (result.userCancelled) {
        return {
          success: false,
          error: 'cancelled',
        };
      }
      
      return {
        success: false,
        error: result.error || 'Erro ao iniciar trial',
      };
    } catch (err: any) {
      console.error('[RevenueCat] Erro ao iniciar trial:', err);
      return {
        success: false,
        error: err.message || 'Erro desconhecido',
      };
    } finally {
      setIsLoading(false);
    }
  }, [currentPackage, updateStatus]);
  
  /**
   * Compra assinatura (mesma lógica do trial, RevenueCat decide se aplica trial)
   */
  const purchaseSubscription = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    return startTrial();
  }, [startTrial]);
  
  /**
   * Restaura compras anteriores
   */
  const restorePurchases = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    
    try {
      const result = await RevenueCatService.restorePurchases();
      
      if (result.success && result.customerInfo) {
        setCustomerInfo(result.customerInfo);
        updateStatus(result.customerInfo);
        return { success: true };
      }
      
      return {
        success: false,
        error: result.error || 'Nenhuma compra anterior encontrada',
      };
    } catch (err: any) {
      console.error('[RevenueCat] Erro ao restaurar:', err);
      return {
        success: false,
        error: err.message || 'Erro ao restaurar compras',
      };
    } finally {
      setIsLoading(false);
    }
  }, [updateStatus]);
  
  /**
   * Atualiza status manualmente
   */
  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const info = await RevenueCatService.refreshCustomerInfo();
      if (info) {
        setCustomerInfo(info);
        updateStatus(info);
      }
      
      // Recarrega ofertas também
      const offeringsResult = await RevenueCatService.getOfferings();
      if (offeringsResult.success && offeringsResult.currentPackage) {
        setCurrentPackage(offeringsResult.currentPackage);
      }
    } catch (error) {
      console.error('[RevenueCat] Erro ao atualizar status:', error);
    }
  }, [updateStatus]);
  
  /**
   * Abre página de gerenciamento de assinaturas
   */
  const openManageSubscriptions = useCallback(async (): Promise<void> => {
    await RevenueCatService.openManageSubscriptions();
  }, []);
  
  /**
   * Dispensa prompt de trial temporariamente
   */
  const dismissTrialPrompt = useCallback(() => {
    setTrialPromptDismissed(true);
  }, []);
  
  /**
   * Dispensa aviso de renovação temporariamente
   */
  const dismissRenewalWarning = useCallback(() => {
    setRenewalWarningDismissed(true);
  }, []);

  // ============================================
  // FLAGS DE UI
  // ============================================
  
  // Mostra prompt de trial se:
  // - Está autenticado
  // - Não tem acesso pro
  // - Não dispensou o prompt
  // - Não está carregando
  const shouldShowTrialPrompt = 
    isAuthenticated && 
    !isPro && 
    !trialPromptDismissed && 
    !isLoading &&
    isInitialized;
  
  // Mostra aviso de renovação se:
  // - Tem acesso pro
  // - Faltam 3 dias ou menos
  // - Não dispensou o aviso
  const shouldShowRenewalWarning = 
    isPro && 
    daysRemaining > 0 && 
    daysRemaining <= 3 && 
    !renewalWarningDismissed;
  
  // Mostra prompt de expirado se:
  // - Estava com pro mas expirou
  // - Não tem mais acesso
  const shouldShowExpiredPrompt = 
    isAuthenticated &&
    !isPro && 
    customerInfo !== null && 
    !isLoading;

  // ============================================
  // VALOR DO CONTEXTO
  // ============================================
  
  const value: RevenueCatContextType = {
    isInitialized,
    isLoading,
    error,
    isPro,
    isTrialing,
    hasTrialAvailable,
    expirationDate,
    daysRemaining,
    willRenew,
    shouldShowTrialPrompt,
    shouldShowRenewalWarning,
    shouldShowExpiredPrompt,
    customerInfo,
    currentPackage,
    startTrial,
    purchaseSubscription,
    restorePurchases,
    refreshStatus,
    openManageSubscriptions,
    dismissTrialPrompt,
    dismissRenewalWarning,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatContext;
