import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import { 
  REVENUECAT_CONFIG, 
  RevenueCatCustomerInfo, 
  RevenueCatPackage, 
  PurchaseResult,
  checkProAccessFromInfo,
  isInTrialPeriod,
  getSubscriptionExpirationDate,
  getManagementURL,
} from '../services/revenuecat';

// Check if we're on a native platform where RevenueCat can work
const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * FONTE ÚNICA DA VERDADE: expirationDate
 * 
 * isPremium = expirationDate > now
 * 
 * NÃO USAR: entitlements.active, isActive, isTrial, isSubscribed, isCancelled, cache
 */
interface RevenueCatContextType {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  customerInfo: RevenueCatCustomerInfo | null;
  packages: RevenueCatPackage[];
  error: string | null;
  
  // FONTE ÚNICA: isPremium baseado em expirationDate > now
  isPremium: boolean;
  
  // Informativo apenas (NÃO usa para determinar acesso)
  isTrialing: boolean;
  expirationDate: Date | null;
  managementURL: string | null;
  
  // @deprecated - mantido para compatibilidade, usa isPremium
  isPro: boolean;
  
  // Actions
  fetchOfferings: () => Promise<void>;
  purchasePackage: (pkg: RevenueCatPackage) => Promise<PurchaseResult>;
  restorePurchases: () => Promise<PurchaseResult>;
  checkPremiumAccess: () => Promise<boolean>;
  loginUser: (userId: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  
  // @deprecated - usa checkPremiumAccess
  checkSubscriptionStatus: () => Promise<boolean>;
}

const RevenueCatContext = createContext<RevenueCatContextType | null>(null);

export const useRevenueCat = () => {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
};

interface RevenueCatProviderProps {
  children: ReactNode;
}

export const RevenueCatProvider: React.FC<RevenueCatProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<RevenueCatCustomerInfo | null>(null);
  const [packages, setPackages] = useState<RevenueCatPackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [Purchases, setPurchases] = useState<any>(null);
  
  // FONTE ÚNICA DA VERDADE: isPremium baseado em expirationDate > now
  const [isPremium, setIsPremium] = useState(false);

  // Valores informativos (NÃO usados para determinar acesso)
  const isTrialing = isInTrialPeriod(customerInfo);
  const expirationDate = getSubscriptionExpirationDate(customerInfo);
  const managementURL = getManagementURL(customerInfo);
  
  // @deprecated - mantido para compatibilidade
  const isPro = isPremium;

  /**
   * FUNÇÃO GLOBAL: checkPremiumAccess
   * 
   * SEMPRE busca do RevenueCat usando Purchases.getCustomerInfo()
   * NUNCA usa cache local como fonte de verdade
   * 
   * REGRA: isPro = expirationDate > now
   */
  const checkPremiumAccess = useCallback(async (): Promise<boolean> => {
    if (!isNativePlatform || !Purchases) {
      console.log('[PREMIUM] Non-native platform or Purchases not initialized');
      return false;
    }

    try {
      // SEMPRE buscar do RevenueCat, NUNCA usar cache
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      
      // Verificar acesso usando APENAS expirationDate
      const entitlement = info.entitlements.all[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
      
      if (!entitlement || !entitlement.expirationDate) {
        console.log('[PRO] No entitlement or expirationDate found');
        setIsPremium(false);
        return false;
      }
      
      const expDate = new Date(entitlement.expirationDate);
      const now = new Date();
      const hasAccess = expDate > now;
      
      console.log('[PRO] Pro entitlement:', entitlement);
      console.log('[PRO] Expiration date:', entitlement.expirationDate);
      console.log('[PRO] Current date:', now.toISOString());
      console.log('[PRO] Pro access:', hasAccess);
      
      setIsPremium(hasAccess);
      return hasAccess;
    } catch (err) {
      console.error('[PRO] Error checking pro access:', err);
      setIsPremium(false);
      return false;
    }
  }, [Purchases]);

  // Initialize RevenueCat SDK (only on native platforms)
  useEffect(() => {
    const initializeRevenueCat = async () => {
      if (!isNativePlatform) {
        console.log('RevenueCat: Web platform detected, skipping initialization');
        setIsInitialized(true);
        return;
      }

      try {
        // Dynamically import RevenueCat only on native
        const PurchasesModule = await import('react-native-purchases');
        const PurchasesSDK = PurchasesModule.default;
        setPurchases(PurchasesSDK);

        // Set log level for debugging
        if (__DEV__) {
          PurchasesSDK.setLogLevel(PurchasesModule.LOG_LEVEL.VERBOSE);
        }

        // Get the appropriate API key for the platform
        const apiKey = Platform.OS === 'ios' 
          ? REVENUECAT_CONFIG.APPLE_API_KEY 
          : REVENUECAT_CONFIG.GOOGLE_API_KEY;

        if (!apiKey) {
          console.warn('RevenueCat: No API key configured for this platform');
          setIsInitialized(true);
          return;
        }

        // Configure RevenueCat
        await PurchasesSDK.configure({ apiKey });

        // Set up listener for customer info updates
        PurchasesSDK.addCustomerInfoUpdateListener((info: RevenueCatCustomerInfo) => {
          console.log('[PRO] Customer info updated via listener');
          setCustomerInfo(info);
          
          // IMPORTANTE: Recalcular isPremium quando customerInfo atualiza
          const entitlement = info.entitlements.all[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
          if (entitlement && entitlement.expirationDate) {
            const expDate = new Date(entitlement.expirationDate);
            const now = new Date();
            const hasAccess = expDate > now;
            console.log('[PRO] Listener update - Pro access:', hasAccess);
            setIsPremium(hasAccess);
          } else {
            setIsPremium(false);
          }
        });

        // EXECUTAR OBRIGATORIAMENTE AO ABRIR O APP
        // Verificar premium status imediatamente
        const info = await PurchasesSDK.getCustomerInfo();
        setCustomerInfo(info);
        
        // Verificar acesso usando APENAS expirationDate
        const entitlement = info.entitlements.all[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
        if (entitlement && entitlement.expirationDate) {
          const expDate = new Date(entitlement.expirationDate);
          const now = new Date();
          const hasAccess = expDate > now;
          console.log('[PRO] Initial check - Expiration:', entitlement.expirationDate);
          console.log('[PRO] Initial check - Pro access:', hasAccess);
          setIsPremium(hasAccess);
        } else {
          console.log('[PRO] Initial check - No entitlement found');
          setIsPremium(false);
        }

        setIsInitialized(true);
        console.log('RevenueCat: Initialized successfully');
      } catch (err) {
        console.error('RevenueCat: Failed to initialize', err);
        setError('Failed to initialize purchases');
        setIsPremium(false);
        setIsInitialized(true);
      }
    };

    initializeRevenueCat();
  }, []);

  // Fetch available offerings/packages
  const fetchOfferings = useCallback(async () => {
    if (!isNativePlatform || !Purchases) {
      console.log('RevenueCat: fetchOfferings skipped (not native or not initialized)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const offerings = await Purchases.getOfferings();
      
      if (offerings.current?.availablePackages) {
        setPackages(offerings.current.availablePackages);
        console.log('RevenueCat: Loaded', offerings.current.availablePackages.length, 'packages');
      } else {
        console.log('RevenueCat: No packages available');
        setPackages([]);
      }
    } catch (err: any) {
      console.error('RevenueCat: Failed to fetch offerings', err);
      setError(err.message || 'Failed to load subscription options');
    } finally {
      setIsLoading(false);
    }
  }, [Purchases]);

  // Purchase a package
  // IMPORTANTE: Verificar premium IMEDIATAMENTE após compra/trial
  const purchasePackage = useCallback(async (pkg: RevenueCatPackage): Promise<PurchaseResult> => {
    if (!isNativePlatform || !Purchases) {
      return { 
        success: false, 
        error: 'In-app purchases are only available in the mobile app' 
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      const { customerInfo: updatedInfo, productIdentifier } = await Purchases.purchasePackage(pkg);
      
      setCustomerInfo(updatedInfo);
      
      // EXECUTAR IMEDIATAMENTE APÓS INICIAR TRIAL OU COMPRA
      // Verificar acesso usando APENAS expirationDate
      const entitlement = updatedInfo.entitlements.all[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
      let success = false;
      
      if (entitlement && entitlement.expirationDate) {
        const expDate = new Date(entitlement.expirationDate);
        const now = new Date();
        success = expDate > now;
        
        console.log('[PRO] Purchase complete - Expiration:', entitlement.expirationDate);
        console.log('[PRO] Purchase complete - Pro access:', success);
        
        setIsPremium(success);
      } else {
        console.log('[PRO] Purchase complete - No entitlement found');
        setIsPremium(false);
      }
      
      return {
        success,
        customerInfo: updatedInfo,
        productIdentifier,
      };
    } catch (err: any) {
      const userCancelled = err.userCancelled === true;
      
      if (!userCancelled) {
        setError(err.message || 'Purchase failed');
      }
      
      return {
        success: false,
        error: err.message,
        userCancelled,
      };
    } finally {
      setIsLoading(false);
    }
  }, [Purchases]);

  // Restore purchases
  // IMPORTANTE: Verificar premium IMEDIATAMENTE após restore
  const restorePurchases = useCallback(async (): Promise<PurchaseResult> => {
    if (!isNativePlatform || !Purchases) {
      return { 
        success: false, 
        error: 'Restore purchases is only available in the mobile app' 
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      const restoredInfo = await Purchases.restorePurchases();
      setCustomerInfo(restoredInfo);
      
      // Verificar acesso usando APENAS expirationDate
      const entitlement = restoredInfo.entitlements.all[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
      let success = false;
      
      if (entitlement && entitlement.expirationDate) {
        const expDate = new Date(entitlement.expirationDate);
        const now = new Date();
        success = expDate > now;
        
        console.log('[PRO] Restore complete - Expiration:', entitlement.expirationDate);
        console.log('[PRO] Restore complete - Pro access:', success);
        
        setIsPremium(success);
      } else {
        console.log('[PRO] Restore complete - No entitlement found');
        setIsPremium(false);
      }
      
      return {
        success,
        customerInfo: restoredInfo,
      };
    } catch (err: any) {
      setError(err.message || 'Failed to restore purchases');
      return {
        success: false,
        error: err.message,
      };
    } finally {
      setIsLoading(false);
    }
  }, [Purchases]);

  // @deprecated - Use checkPremiumAccess instead
  const checkSubscriptionStatus = useCallback(async (): Promise<boolean> => {
    return checkPremiumAccess();
  }, [checkPremiumAccess]);

  // Login user (link RevenueCat with your user ID)
  const loginUser = useCallback(async (userId: string) => {
    if (!isNativePlatform || !Purchases) {
      return;
    }

    try {
      const { customerInfo: info } = await Purchases.logIn(userId);
      setCustomerInfo(info);
      console.log('RevenueCat: User logged in', userId);
    } catch (err) {
      console.error('RevenueCat: Failed to log in user', err);
    }
  }, [Purchases]);

  // Logout user
  const logoutUser = useCallback(async () => {
    if (!isNativePlatform || !Purchases) {
      return;
    }

    try {
      const info = await Purchases.logOut();
      setCustomerInfo(info);
      console.log('RevenueCat: User logged out');
    } catch (err) {
      console.error('RevenueCat: Failed to log out user', err);
    }
  }, [Purchases]);

  const value: RevenueCatContextType = {
    // State
    isInitialized,
    isLoading,
    customerInfo,
    packages,
    error,
    
    // FONTE ÚNICA DA VERDADE: isPremium baseado em expirationDate > now
    isPremium,
    
    // Informativo apenas (NÃO usa para determinar acesso)
    isTrialing,
    expirationDate,
    managementURL,
    
    // @deprecated - mantido para compatibilidade
    isPro,
    
    // Actions
    fetchOfferings,
    purchasePackage,
    restorePurchases,
    checkPremiumAccess,
    loginUser,
    logoutUser,
    
    // @deprecated
    checkSubscriptionStatus,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatProvider;
