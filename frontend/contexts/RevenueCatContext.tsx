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
  periodType: 'trial' | 'intro' | 'normal' | null; // ISSUE 2 FIX: Adicionado periodType
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
  periodType: null, // ISSUE 2 FIX
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
  const [periodType, setPeriodType] = useState<'trial' | 'intro' | 'normal' | null>(null); // ISSUE 2 FIX
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
    // OVERRIDE: Se o usuário tem pro_access_override, sempre concede acesso PRO
    if (user?.pro_access_override === true) {
      setIsPro(true);
      setIsTrialing(false);
      setExpirationDate(null);
      setDaysRemaining(999);
      setWillRenew(true);
      setHasTrialAvailable(false);
      return;
    }
    
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
  }, [user?.pro_access_override]);

  // ============================================
  // CLEAR STATE (para logout)
  // ============================================
  
  const clearRevenueCatState = useCallback(() => {
    setCustomerInfo(null);
    setCurrentPackage(null);
    setIsPro(false);
    setIsTrialing(false);
    setHasTrialAvailable(true);
    setExpirationDate(null);
    setDaysRemaining(0);
    setWillRenew(false);
    setTrialPromptDismissed(false);
    setRenewalWarningDismissed(false);
    setIsInitialized(false);
  }, []);

  // ============================================
  // INICIALIZAÇÃO (SOMENTE APÓS AUTENTICAÇÃO)
  // ============================================
  
  const initialize = useCallback(async () => {
    // ISSUE 1 FIX: Só inicializa se usuário está autenticado
    if (!isAuthenticated || !user) {
      console.log('[RevenueCat] Aguardando autenticação para inicializar');
      setIsLoading(false);
      return;
    }
    
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
  }, [updateStatus, isAuthenticated, user]);

  // ============================================
  // EFEITOS
  // ============================================
  
  // Inicialização SOMENTE quando autenticado
  useEffect(() => {
    if (isAuthenticated && user) {
      initialize();
    }
  }, [isAuthenticated, user, initialize]);
  
  // Logout do RevenueCat quando usuário desautentica
  useEffect(() => {
    const handleLogout = async () => {
      if (!isAuthenticated && isInitialized) {
        console.log('[RevenueCat] Usuário deslogou, limpando estado');
        // ISSUE 1 FIX: Chamar Purchases.logOut() e limpar estado
        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          try {
            await RevenueCatService.logoutUser();
          } catch (error) {
            console.error('[RevenueCat] Erro ao fazer logout:', error);
          }
        }
        clearRevenueCatState();
      }
    };
    
    handleLogout();
  }, [isAuthenticated, isInitialized, clearRevenueCatState]);
  
  // Vincula usuário ao RevenueCat quando autenticado
  useEffect(() => {
    const handleUserLogin = async () => {
      if (isAuthenticated && user?.id && isInitialized) {
        // OVERRIDE: Se usuário tem pro_access_override, aplicar imediatamente
        if (user?.pro_access_override === true) {
          updateStatus(null);
          return;
        }
        
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
  }, [isAuthenticated, user?.id, user?.pro_access_override, isInitialized, updateStatus]);
  
  // Listener de mudanças de status (SOMENTE se autenticado e inicializado)
  useEffect(() => {
    // ISSUE 1 FIX: Só adiciona listener se autenticado
    if (!isInitialized || !isAuthenticated) return;
    
    const removeListener = RevenueCatService.addCustomerInfoListener((info) => {
      setCustomerInfo(info);
      updateStatus(info);
    });
    
    return () => {
      removeListener();
    };
  }, [isInitialized, isAuthenticated, updateStatus]);
  
  // Atualiza quando app volta ao foreground (SOMENTE se autenticado)
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      // ISSUE 1 FIX: Só atualiza se autenticado e inicializado
      if (nextState === 'active' && isInitialized && isAuthenticated) {
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
  }, [isInitialized, isAuthenticated, updateStatus]);

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
