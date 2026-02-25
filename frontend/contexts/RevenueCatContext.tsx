/**
 * RevenueCat Context
 * 
 * Sistema de controle de assinatura com 3 estados:
 * - UNKNOWN: Aguardando verificação (UI normal, sem paywall)
 * - ACTIVE: Assinatura ativa (acesso completo)
 * - INACTIVE: Sem assinatura (mostrar paywall)
 * 
 * Entitlement ID: "pro"
 * Product ID: "pro_mensal"
 * 
 * EXCEÇÃO: contato@loadmanagerpro.com.br = ALWAYS ACTIVE
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
// CONSTANTES
// ============================================

// Email do administrador com acesso permanente
const ADMIN_EMAIL = 'contato@loadmanagerpro.com.br';

// Entitlement ID oficial do RevenueCat
const PRO_ENTITLEMENT_ID = 'pro';

// Timeout de segurança (10 segundos)
const REVENUECAT_TIMEOUT_MS = 10000;

// Intervalo de retry após timeout (30 segundos)
const RETRY_INTERVAL_MS = 30000;

// ============================================
// TIPOS
// ============================================

/**
 * Estados possíveis da assinatura (ÚNICA FONTE DE VERDADE)
 */
export type SubscriptionStatus = 'UNKNOWN' | 'ACTIVE' | 'INACTIVE';

interface RevenueCatContextType {
  // Estado principal (ÚNICA FONTE DE VERDADE)
  subscriptionStatus: SubscriptionStatus;
  
  // Dados auxiliares
  isPro: boolean;
  isTrialing: boolean;
  periodType: 'trial' | 'intro' | 'normal' | null;
  expirationDate: Date | null;
  daysRemaining: number;
  willRenew: boolean;
  
  // UI Flags
  shouldShowPaywall: boolean;
  shouldShowRenewalWarning: boolean;
  
  // Dados RevenueCat
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
  isPro: false,
  isTrialing: false,
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
  // Estado principal - ÚNICA FONTE DE VERDADE
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('UNKNOWN');
  
  // Dados auxiliares
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentPackage, setCurrentPackage] = useState<PurchasesPackage | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isTrialing, setIsTrialing] = useState(false);
  const [periodType, setPeriodType] = useState<'trial' | 'intro' | 'normal' | null>(null);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [willRenew, setWillRenew] = useState(false);
  
  // UI Control
  const [paywallDismissed, setPaywallDismissed] = useState(false);
  const [renewalWarningDismissed, setRenewalWarningDismissed] = useState(false);
  
  // Refs
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCheckingRef = useRef(false);
  const listenerRemoveRef = useRef<(() => void) | null>(null);
  
  const { user, isAuthenticated } = useAuth();

  // ============================================
  // LOGGING
  // ============================================
  
  const log = useCallback((message: string, data?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    if (data !== undefined) {
      console.log(`[RevenueCat ${timestamp}] ${message}`, data);
    } else {
      console.log(`[RevenueCat ${timestamp}] ${message}`);
    }
  }, []);

  // ============================================
  // VERIFICAÇÃO DE ACESSO PRO (REGRA CRÍTICA 3)
  // ============================================
  
  const checkProAccess = useCallback((info: CustomerInfo | null): boolean => {
    if (!info) return false;
    
    // Verificação oficial: entitlements.active["pro"] !== undefined
    const hasProAccess = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
    
    log(`Pro access check: ${hasProAccess}`, {
      entitlementId: PRO_ENTITLEMENT_ID,
      activeEntitlements: Object.keys(info.entitlements.active),
    });
    
    return hasProAccess;
  }, [log]);

  // ============================================
  // ATUALIZAÇÃO DE STATUS
  // ============================================
  
  const updateFromCustomerInfo = useCallback((info: CustomerInfo | null, source: string) => {
    log(`Updating from customerInfo (source: ${source})`);
    
    const hasProAccess = checkProAccess(info);
    
    if (hasProAccess) {
      log('Subscription status changed to ACTIVE');
      setSubscriptionStatus('ACTIVE');
      setIsPro(true);
      
      // Extrair detalhes do entitlement
      const proEntitlement = info?.entitlements.active[PRO_ENTITLEMENT_ID];
      if (proEntitlement) {
        // Verificar periodType
        const pt = proEntitlement.periodType?.toLowerCase();
        if (pt === 'trial') {
          setPeriodType('trial');
          setIsTrialing(true);
        } else if (pt === 'intro') {
          setPeriodType('intro');
          setIsTrialing(false);
        } else {
          setPeriodType('normal');
          setIsTrialing(false);
        }
        
        // Expiração
        if (proEntitlement.expirationDate) {
          const expDate = new Date(proEntitlement.expirationDate);
          setExpirationDate(expDate);
          const now = new Date();
          const diffMs = expDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          setDaysRemaining(Math.max(0, diffDays));
        }
        
        setWillRenew(proEntitlement.willRenew ?? false);
      }
    } else {
      log('Subscription status changed to INACTIVE');
      setSubscriptionStatus('INACTIVE');
      setIsPro(false);
      setIsTrialing(false);
      setPeriodType(null);
      setExpirationDate(null);
      setDaysRemaining(0);
      setWillRenew(false);
    }
    
    setCustomerInfo(info);
  }, [checkProAccess, log]);

  // ============================================
  // CLEAR TIMEOUTS
  // ============================================
  
  const clearAllTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // ============================================
  // VERIFICAÇÃO COM TIMEOUT (REGRA CRÍTICA 5)
  // ============================================
  
  const checkSubscriptionWithTimeout = useCallback(async (source: string): Promise<void> => {
    // Evita verificações simultâneas
    if (isCheckingRef.current) {
      log('Already checking subscription, skipping...');
      return;
    }
    
    isCheckingRef.current = true;
    log(`Starting subscription check (source: ${source})`);
    
    // Cria promise com timeout
    const checkPromise = new Promise<CustomerInfo | null>(async (resolve, reject) => {
      try {
        // Inicializa SDK se necessário
        await RevenueCatService.initializeRevenueCat();
        
        // Obtém customerInfo
        const info = await RevenueCatService.getCustomerInfo();
        resolve(info);
      } catch (error) {
        reject(error);
      }
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutRef.current = setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, REVENUECAT_TIMEOUT_MS);
    });
    
    try {
      const info = await Promise.race([checkPromise, timeoutPromise]);
      clearAllTimeouts();
      updateFromCustomerInfo(info, source);
      
      // Carrega ofertas
      const offeringsResult = await RevenueCatService.getOfferings();
      if (offeringsResult.success && offeringsResult.currentPackage) {
        setCurrentPackage(offeringsResult.currentPackage);
      }
      
    } catch (error: any) {
      clearAllTimeouts();
      
      if (error.message === 'TIMEOUT') {
        // REGRA CRÍTICA 5: Timeout mantém UNKNOWN e tenta novamente
        log('Timeout occurred - keeping UNKNOWN, will retry');
        // NÃO muda para INACTIVE
        // Agenda retry
        retryTimeoutRef.current = setTimeout(() => {
          log('Retrying subscription check after timeout');
          checkSubscriptionWithTimeout('retry_after_timeout');
        }, RETRY_INTERVAL_MS);
      } else {
        log('Error checking subscription', error.message);
        // Em caso de erro, define como INACTIVE (não é timeout)
        setSubscriptionStatus('INACTIVE');
        setIsPro(false);
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, [clearAllTimeouts, updateFromCustomerInfo, log]);

  // ============================================
  // VERIFICAÇÃO PRINCIPAL (REGRA CRÍTICA 8)
  // ============================================
  
  const verifySubscription = useCallback(async (source: string) => {
    // EXCEÇÃO ADMINISTRADOR: Acesso total e permanente
    if (user?.email === ADMIN_EMAIL) {
      log('ADMIN USER detected - forcing ACTIVE status');
      setSubscriptionStatus('ACTIVE');
      setIsPro(true);
      setDaysRemaining(999);
      setWillRenew(true);
      return;
    }
    
    // PRO ACCESS OVERRIDE do backend
    if (user?.pro_access_override === true) {
      log('PRO ACCESS OVERRIDE detected - forcing ACTIVE status');
      setSubscriptionStatus('ACTIVE');
      setIsPro(true);
      setDaysRemaining(999);
      setWillRenew(true);
      return;
    }
    
    // Plataformas não-móveis (web) - INACTIVE direto
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      log('Non-mobile platform - setting INACTIVE');
      setSubscriptionStatus('INACTIVE');
      setIsPro(false);
      return;
    }
    
    // Verificação normal via RevenueCat
    await checkSubscriptionWithTimeout(source);
  }, [user?.email, user?.pro_access_override, checkSubscriptionWithTimeout, log]);

  // ============================================
  // SETUP LISTENER (REGRA CRÍTICA 4)
  // ============================================
  
  const setupListener = useCallback(() => {
    // Não configura listener para admin ou web
    if (user?.email === ADMIN_EMAIL) return;
    if (user?.pro_access_override === true) return;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    
    // Remove listener anterior se existir
    if (listenerRemoveRef.current) {
      listenerRemoveRef.current();
      listenerRemoveRef.current = null;
    }
    
    log('Setting up customer info listener');
    
    listenerRemoveRef.current = RevenueCatService.addCustomerInfoListener((info) => {
      log('Customer info updated via listener');
      updateFromCustomerInfo(info, 'listener');
    });
  }, [user?.email, user?.pro_access_override, updateFromCustomerInfo, log]);

  // ============================================
  // CLEAR STATE (LOGOUT)
  // ============================================
  
  const clearState = useCallback(() => {
    log('Clearing RevenueCat state');
    clearAllTimeouts();
    
    if (listenerRemoveRef.current) {
      listenerRemoveRef.current();
      listenerRemoveRef.current = null;
    }
    
    setSubscriptionStatus('UNKNOWN');
    setCustomerInfo(null);
    setCurrentPackage(null);
    setIsPro(false);
    setIsTrialing(false);
    setPeriodType(null);
    setExpirationDate(null);
    setDaysRemaining(0);
    setWillRenew(false);
    setPaywallDismissed(false);
    setRenewalWarningDismissed(false);
    isCheckingRef.current = false;
  }, [clearAllTimeouts, log]);

  // ============================================
  // EFEITOS
  // ============================================
  
  // Efeito principal: Login/Logout (REGRA CRÍTICA 8)
  useEffect(() => {
    if (isAuthenticated && user) {
      log('User authenticated - starting verification');
      log('Subscription status set to UNKNOWN');
      setSubscriptionStatus('UNKNOWN');
      verifySubscription('login');
      setupListener();
    } else if (!isAuthenticated) {
      // Logout
      clearState();
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        RevenueCatService.logoutUser().catch(() => {});
      }
    }
  }, [isAuthenticated, user, verifySubscription, setupListener, clearState, log]);
  
  // App foreground (REGRA CRÍTICA 9)
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isAuthenticated && user) {
        // Não verifica para admin
        if (user.email === ADMIN_EMAIL) return;
        if (user.pro_access_override === true) return;
        
        log('App returned to foreground - refreshing');
        verifySubscription('foreground');
      }
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isAuthenticated, user, verifySubscription, log]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      clearAllTimeouts();
      if (listenerRemoveRef.current) {
        listenerRemoveRef.current();
      }
    };
  }, [clearAllTimeouts]);

  // ============================================
  // AÇÕES
  // ============================================
  
  const startTrial = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentPackage) {
      const offeringsResult = await RevenueCatService.getOfferings();
      if (!offeringsResult.success || !offeringsResult.currentPackage) {
        return { success: false, error: 'Não foi possível carregar as ofertas.' };
      }
      setCurrentPackage(offeringsResult.currentPackage);
    }
    
    const pkg = currentPackage;
    if (!pkg) {
      return { success: false, error: 'Pacote não disponível.' };
    }
    
    log('Starting trial purchase');
    
    try {
      const result = await RevenueCatService.purchasePackage(pkg);
      
      if (result.success && result.customerInfo) {
        updateFromCustomerInfo(result.customerInfo, 'purchase_success');
        setPaywallDismissed(true);
        log('Purchase successful');
        return { success: true };
      }
      
      if (result.userCancelled) {
        return { success: false, error: 'cancelled' };
      }
      
      return { success: false, error: result.error || 'Erro ao processar compra.' };
    } catch (err: any) {
      log('Purchase error', err.message);
      return { success: false, error: err.message };
    }
  }, [currentPackage, updateFromCustomerInfo, log]);
  
  const purchaseSubscription = useCallback(async () => startTrial(), [startTrial]);
  
  const restorePurchases = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    log('Restoring purchases');
    
    try {
      const result = await RevenueCatService.restorePurchases();
      
      if (result.success && result.customerInfo) {
        updateFromCustomerInfo(result.customerInfo, 'restore_purchases');
        log('Restore successful');
        return { success: true };
      }
      
      return { success: false, error: result.error || 'Nenhuma compra encontrada.' };
    } catch (err: any) {
      log('Restore error', err.message);
      return { success: false, error: err.message };
    }
  }, [updateFromCustomerInfo, log]);
  
  const refreshStatus = useCallback(async () => {
    log('Manual refresh requested');
    await verifySubscription('manual_refresh');
  }, [verifySubscription, log]);
  
  const openManageSubscriptions = useCallback(async () => {
    await RevenueCatService.openManageSubscriptions();
  }, []);
  
  const dismissPaywall = useCallback(() => {
    log('Paywall dismissed');
    setPaywallDismissed(true);
  }, [log]);
  
  const dismissRenewalWarning = useCallback(() => {
    setRenewalWarningDismissed(true);
  }, []);

  // ============================================
  // FLAGS DE UI (REGRA CRÍTICA 6)
  // ============================================
  
  // Paywall SOMENTE quando INACTIVE (NUNCA durante UNKNOWN)
  const shouldShowPaywall = 
    isAuthenticated && 
    subscriptionStatus === 'INACTIVE' && 
    !paywallDismissed &&
    user?.role === 'coach' &&
    user?.email !== ADMIN_EMAIL;
  
  // Aviso de renovação
  const shouldShowRenewalWarning = 
    subscriptionStatus === 'ACTIVE' && 
    periodType === 'normal' &&
    daysRemaining > 0 && 
    daysRemaining <= 3 && 
    !renewalWarningDismissed &&
    user?.email !== ADMIN_EMAIL;

  // ============================================
  // VALOR DO CONTEXTO
  // ============================================
  
  const value: RevenueCatContextType = {
    subscriptionStatus,
    isPro,
    isTrialing,
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
