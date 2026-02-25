/**
 * RevenueCat Context
 * 
 * Context completo para gerenciamento de assinaturas no LoadManager Pro
 * Implementa sistema de 3 estados: UNKNOWN, ACTIVE, INACTIVE
 * Garante que o app nunca trava e o paywall aparece corretamente
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import * as RevenueCatService from '../services/revenuecat';
import { useAuth } from './AuthContext';

// ============================================
// TIPOS E CONSTANTES
// ============================================

/**
 * Estados possíveis da assinatura
 * UNKNOWN - Ainda verificando com RevenueCat
 * ACTIVE - Assinatura ativa ou trial ativo
 * INACTIVE - Sem assinatura, deve mostrar paywall
 */
export type SubscriptionStatus = 'UNKNOWN' | 'ACTIVE' | 'INACTIVE';

// Timeout de segurança para RevenueCat (10 segundos)
const REVENUECAT_TIMEOUT_MS = 10000;

interface RevenueCatContextType {
  // Estado principal da assinatura (3 estados)
  subscriptionStatus: SubscriptionStatus;
  
  // Estado de inicialização
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Status detalhado da assinatura
  isPro: boolean;
  isTrialing: boolean;
  hasTrialAvailable: boolean;
  periodType: 'trial' | 'intro' | 'normal' | null;
  expirationDate: Date | null;
  daysRemaining: number;
  willRenew: boolean;
  
  // Flags de UI
  shouldShowPaywall: boolean;
  shouldShowRenewalWarning: boolean;
  
  // Dados
  customerInfo: CustomerInfo | null;
  currentPackage: PurchasesPackage | null;
  
  // Ações
  startTrial: () => Promise<{ success: boolean; error?: string }>;
  purchaseSubscription: () => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; error?: string }>;
  refreshStatus: () => Promise<void>;
  openManageSubscriptions: () => Promise<void>;
  dismissPaywall: () => void;
  dismissRenewalWarning: () => void;
}

const defaultContext: RevenueCatContextType = {
  subscriptionStatus: 'UNKNOWN',
  isInitialized: false,
  isLoading: false,
  error: null,
  isPro: false,
  isTrialing: false,
  hasTrialAvailable: true,
  periodType: null,
  expirationDate: null,
  daysRemaining: 0,
  willRenew: false,
  shouldShowPaywall: false,
  shouldShowRenewalWarning: false,
  customerInfo: null,
  currentPackage: null,
  startTrial: async () => ({ success: false }),
  purchaseSubscription: async () => ({ success: false }),
  restorePurchases: async () => ({ success: false }),
  refreshStatus: async () => {},
  openManageSubscriptions: async () => {},
  dismissPaywall: () => {},
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
  // Estado principal - 3 estados
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('UNKNOWN');
  
  // Estados de controle
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dados do RevenueCat
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentPackage, setCurrentPackage] = useState<PurchasesPackage | null>(null);
  
  // Status detalhado
  const [isPro, setIsPro] = useState(false);
  const [isTrialing, setIsTrialing] = useState(false);
  const [hasTrialAvailable, setHasTrialAvailable] = useState(true);
  const [periodType, setPeriodType] = useState<'trial' | 'intro' | 'normal' | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [willRenew, setWillRenew] = useState(false);
  
  // Controle de UI
  const [paywallDismissed, setPaywallDismissed] = useState(false);
  const [renewalWarningDismissed, setRenewalWarningDismissed] = useState(false);
  
  // Refs para timeout
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initializingRef = useRef(false);
  
  const { user, isAuthenticated } = useAuth();

  // ============================================
  // LOGGING
  // ============================================
  
  const log = useCallback((message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[RevenueCat ${timestamp}] ${message}`, data);
    } else {
      console.log(`[RevenueCat ${timestamp}] ${message}`);
    }
  }, []);

  // ============================================
  // ATUALIZAÇÃO DE STATUS
  // ============================================
  
  const updateSubscriptionStatus = useCallback((info: CustomerInfo | null, source: string) => {
    log(`Updating status from: ${source}`);
    
    // OVERRIDE: Se o usuário tem pro_access_override, sempre ACTIVE
    if (user?.pro_access_override === true) {
      log('PRO ACCESS OVERRIDE detected - setting ACTIVE');
      setSubscriptionStatus('ACTIVE');
      setIsPro(true);
      setIsTrialing(false);
      setPeriodType(null);
      setExpirationDate(null);
      setDaysRemaining(999);
      setWillRenew(true);
      setHasTrialAvailable(false);
      return;
    }
    
    if (!info) {
      log('No customerInfo - setting INACTIVE');
      setSubscriptionStatus('INACTIVE');
      setIsPro(false);
      setIsTrialing(false);
      setPeriodType(null);
      setExpirationDate(null);
      setDaysRemaining(0);
      setWillRenew(false);
      return;
    }
    
    const status = RevenueCatService.getSubscriptionStatus(info);
    
    if (status.isPro) {
      log('Subscription status changed to ACTIVE', { isTrialing: status.isTrialing });
      setSubscriptionStatus('ACTIVE');
    } else {
      log('Subscription status changed to INACTIVE');
      setSubscriptionStatus('INACTIVE');
    }
    
    setIsPro(status.isPro);
    setIsTrialing(status.isTrialing);
    setPeriodType(status.periodType);
    setExpirationDate(status.expirationDate);
    setDaysRemaining(status.daysRemaining);
    setWillRenew(status.willRenew);
    setHasTrialAvailable(!status.isPro);
  }, [user?.pro_access_override, log]);

  // ============================================
  // TIMEOUT DE SEGURANÇA
  // ============================================
  
  const startTimeout = useCallback(() => {
    // Limpa timeout anterior se existir
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    log(`Starting safety timeout (${REVENUECAT_TIMEOUT_MS}ms)`);
    
    timeoutRef.current = setTimeout(() => {
      log('TIMEOUT: RevenueCat did not respond in time - setting INACTIVE');
      if (subscriptionStatus === 'UNKNOWN') {
        setSubscriptionStatus('INACTIVE');
        setIsInitialized(true);
        setIsLoading(false);
      }
    }, REVENUECAT_TIMEOUT_MS);
  }, [subscriptionStatus, log]);
  
  const clearTimeoutSafely = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // ============================================
  // INICIALIZAÇÃO
  // ============================================
  
  const initialize = useCallback(async () => {
    // Evita múltiplas inicializações simultâneas
    if (initializingRef.current) {
      log('Already initializing, skipping...');
      return;
    }
    
    // Só inicializa se usuário está autenticado
    if (!isAuthenticated || !user) {
      log('Waiting for authentication to initialize');
      setSubscriptionStatus('UNKNOWN');
      setIsLoading(false);
      return;
    }
    
    // Plataformas não-móveis (web) - define INACTIVE diretamente
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      log('Non-mobile platform detected - setting INACTIVE');
      setSubscriptionStatus('INACTIVE');
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }
    
    // Verifica PRO override primeiro
    if (user?.pro_access_override === true) {
      log('PRO ACCESS OVERRIDE - immediate ACTIVE');
      setSubscriptionStatus('ACTIVE');
      setIsPro(true);
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }
    
    initializingRef.current = true;
    log('RevenueCat fetch started');
    setSubscriptionStatus('UNKNOWN');
    setIsLoading(true);
    setError(null);
    
    // Inicia timeout de segurança
    startTimeout();
    
    try {
      // Inicializa o SDK
      const initSuccess = await RevenueCatService.initializeRevenueCat();
      
      if (!initSuccess) {
        throw new Error('Failed to initialize RevenueCat SDK');
      }
      
      // Carrega ofertas
      const offeringsResult = await RevenueCatService.getOfferings();
      if (offeringsResult.success && offeringsResult.currentPackage) {
        setCurrentPackage(offeringsResult.currentPackage);
      }
      
      // Obtém info do cliente
      const info = await RevenueCatService.getCustomerInfo();
      setCustomerInfo(info);
      updateSubscriptionStatus(info, 'initialize');
      
      log('RevenueCat fetch completed successfully');
      setIsInitialized(true);
      
    } catch (err: any) {
      log('RevenueCat initialization error', err.message);
      setError(err.message || 'Error initializing RevenueCat');
      // Em caso de erro, define como INACTIVE para mostrar paywall
      setSubscriptionStatus('INACTIVE');
      setIsInitialized(true);
      
    } finally {
      clearTimeoutSafely();
      setIsLoading(false);
      initializingRef.current = false;
    }
  }, [isAuthenticated, user, startTimeout, clearTimeoutSafely, updateSubscriptionStatus, log]);

  // ============================================
  // CLEAR STATE (para logout)
  // ============================================
  
  const clearRevenueCatState = useCallback(() => {
    log('Clearing RevenueCat state (logout)');
    clearTimeoutSafely();
    setSubscriptionStatus('UNKNOWN');
    setCustomerInfo(null);
    setCurrentPackage(null);
    setIsPro(false);
    setIsTrialing(false);
    setPeriodType(null);
    setHasTrialAvailable(true);
    setExpirationDate(null);
    setDaysRemaining(0);
    setWillRenew(false);
    setPaywallDismissed(false);
    setRenewalWarningDismissed(false);
    setIsInitialized(false);
    initializingRef.current = false;
  }, [clearTimeoutSafely, log]);

  // ============================================
  // EFEITOS
  // ============================================
  
  // Inicialização quando autenticado
  useEffect(() => {
    if (isAuthenticated && user) {
      initialize();
    }
  }, [isAuthenticated, user, initialize]);
  
  // Logout do RevenueCat quando usuário desautentica
  useEffect(() => {
    const handleLogout = async () => {
      if (!isAuthenticated && isInitialized) {
        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          try {
            await RevenueCatService.logoutUser();
          } catch (error) {
            log('Error during RevenueCat logout', error);
          }
        }
        clearRevenueCatState();
      }
    };
    
    handleLogout();
  }, [isAuthenticated, isInitialized, clearRevenueCatState, log]);
  
  // Vincula usuário ao RevenueCat quando autenticado
  useEffect(() => {
    const handleUserLogin = async () => {
      if (isAuthenticated && user?.id && isInitialized && subscriptionStatus !== 'UNKNOWN') {
        if (user?.pro_access_override === true) {
          updateSubscriptionStatus(null, 'pro_override');
          return;
        }
        
        try {
          const info = await RevenueCatService.loginUser(user.id);
          if (info) {
            setCustomerInfo(info);
            updateSubscriptionStatus(info, 'user_login');
          }
        } catch (error) {
          log('Error linking user to RevenueCat', error);
        }
      }
    };
    
    handleUserLogin();
  }, [isAuthenticated, user?.id, user?.pro_access_override, isInitialized, subscriptionStatus, updateSubscriptionStatus, log]);
  
  // Listener de mudanças de status (REGRA CRÍTICA 5)
  useEffect(() => {
    if (!isInitialized || !isAuthenticated) return;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    
    log('Adding customer info listener');
    
    const removeListener = RevenueCatService.addCustomerInfoListener((info) => {
      log('Customer info updated via listener');
      setCustomerInfo(info);
      updateSubscriptionStatus(info, 'listener');
      // Remove paywall automaticamente se assinatura ativar
      if (info && RevenueCatService.checkProAccess(info)) {
        setPaywallDismissed(false); // Reset para permitir re-exibição se necessário
      }
    });
    
    return () => {
      removeListener();
    };
  }, [isInitialized, isAuthenticated, updateSubscriptionStatus, log]);
  
  // Atualiza quando app volta ao foreground
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active' && isInitialized && isAuthenticated) {
        log('App returned to foreground - refreshing status');
        const info = await RevenueCatService.refreshCustomerInfo();
        if (info) {
          setCustomerInfo(info);
          updateSubscriptionStatus(info, 'foreground');
        }
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [isInitialized, isAuthenticated, updateSubscriptionStatus, log]);
  
  // Cleanup do timeout no unmount
  useEffect(() => {
    return () => {
      clearTimeoutSafely();
    };
  }, [clearTimeoutSafely]);

  // ============================================
  // AÇÕES
  // ============================================
  
  const startTrial = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentPackage) {
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
    log('Starting trial purchase');
    
    try {
      const result = await RevenueCatService.purchasePackage(packageToPurchase);
      
      if (result.success && result.customerInfo) {
        setCustomerInfo(result.customerInfo);
        updateSubscriptionStatus(result.customerInfo, 'purchase_success');
        setPaywallDismissed(true);
        log('Trial started successfully');
        return { success: true };
      }
      
      if (result.userCancelled) {
        return { success: false, error: 'cancelled' };
      }
      
      return {
        success: false,
        error: result.error || 'Erro ao iniciar trial',
      };
    } catch (err: any) {
      log('Error starting trial', err.message);
      return {
        success: false,
        error: err.message || 'Erro desconhecido',
      };
    } finally {
      setIsLoading(false);
    }
  }, [currentPackage, updateSubscriptionStatus, log]);
  
  const purchaseSubscription = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    return startTrial();
  }, [startTrial]);
  
  const restorePurchases = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    log('Restoring purchases');
    
    try {
      const result = await RevenueCatService.restorePurchases();
      
      if (result.success && result.customerInfo) {
        setCustomerInfo(result.customerInfo);
        updateSubscriptionStatus(result.customerInfo, 'restore_purchases');
        log('Purchases restored successfully');
        return { success: true };
      }
      
      return {
        success: false,
        error: result.error || 'Nenhuma compra anterior encontrada',
      };
    } catch (err: any) {
      log('Error restoring purchases', err.message);
      return {
        success: false,
        error: err.message || 'Erro ao restaurar compras',
      };
    } finally {
      setIsLoading(false);
    }
  }, [updateSubscriptionStatus, log]);
  
  const refreshStatus = useCallback(async (): Promise<void> => {
    log('Manual status refresh');
    try {
      const info = await RevenueCatService.refreshCustomerInfo();
      if (info) {
        setCustomerInfo(info);
        updateSubscriptionStatus(info, 'manual_refresh');
      }
      
      const offeringsResult = await RevenueCatService.getOfferings();
      if (offeringsResult.success && offeringsResult.currentPackage) {
        setCurrentPackage(offeringsResult.currentPackage);
      }
    } catch (error) {
      log('Error refreshing status', error);
    }
  }, [updateSubscriptionStatus, log]);
  
  const openManageSubscriptions = useCallback(async (): Promise<void> => {
    await RevenueCatService.openManageSubscriptions();
  }, []);
  
  const dismissPaywall = useCallback(() => {
    log('Paywall dismissed by user');
    setPaywallDismissed(true);
  }, [log]);
  
  const dismissRenewalWarning = useCallback(() => {
    setRenewalWarningDismissed(true);
  }, []);

  // ============================================
  // FLAGS DE UI (REGRA CRÍTICA 3)
  // ============================================
  
  // Paywall aparece SOMENTE quando status == INACTIVE
  // NUNCA durante UNKNOWN
  const shouldShowPaywall = 
    isAuthenticated && 
    subscriptionStatus === 'INACTIVE' && 
    !paywallDismissed &&
    user?.role === 'coach';
  
  // Aviso de renovação apenas para assinatura paga prestes a expirar
  const shouldShowRenewalWarning = 
    subscriptionStatus === 'ACTIVE' && 
    periodType === 'normal' &&
    daysRemaining > 0 && 
    daysRemaining <= 3 && 
    !renewalWarningDismissed;

  // ============================================
  // VALOR DO CONTEXTO
  // ============================================
  
  const value: RevenueCatContextType = {
    subscriptionStatus,
    isInitialized,
    isLoading,
    error,
    isPro,
    isTrialing,
    hasTrialAvailable,
    periodType,
    expirationDate,
    daysRemaining,
    willRenew,
    shouldShowPaywall,
    shouldShowRenewalWarning,
    customerInfo,
    currentPackage,
    startTrial,
    purchaseSubscription,
    restorePurchases,
    refreshStatus,
    openManageSubscriptions,
    dismissPaywall,
    dismissRenewalWarning,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatContext;
