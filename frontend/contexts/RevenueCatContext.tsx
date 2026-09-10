import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import { 
  REVENUECAT_CONFIG, 
  RevenueCatCustomerInfo, 
  RevenueCatPackage, 
  PurchaseResult,
  hasProEntitlement,
  isInTrialPeriod,
  getSubscriptionExpirationDate,
  getManagementURL,
} from '../services/revenuecat';

// Check if we're on a native platform where RevenueCat can work
const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

interface RevenueCatContextType {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  customerInfo: RevenueCatCustomerInfo | null;
  packages: RevenueCatPackage[];
  error: string | null;
  
  // Computed
  isPro: boolean;
  isTrialing: boolean;
  expirationDate: Date | null;
  managementURL: string | null;
  
  // Actions
  fetchOfferings: () => Promise<void>;
  purchasePackage: (pkg: RevenueCatPackage) => Promise<PurchaseResult>;
  restorePurchases: () => Promise<PurchaseResult>;
  checkSubscriptionStatus: () => Promise<boolean>;
  loginUser: (userId: string) => Promise<void>;
  logoutUser: () => Promise<void>;
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

  // Computed values
  const isPro = hasProEntitlement(customerInfo);
  const isTrialing = isInTrialPeriod(customerInfo);
  const expirationDate = getSubscriptionExpirationDate(customerInfo);
  const managementURL = getManagementURL(customerInfo);

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
          console.log('RevenueCat: Customer info updated');
          setCustomerInfo(info);
        });

        // Get initial customer info
        const info = await PurchasesSDK.getCustomerInfo();
        setCustomerInfo(info);

        setIsInitialized(true);
        console.log('RevenueCat: Initialized successfully');
      } catch (err) {
        console.error('RevenueCat: Failed to initialize', err);
        setError('Failed to initialize purchases');
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
      
      const success = hasProEntitlement(updatedInfo);
      
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
      
      const success = hasProEntitlement(restoredInfo);
      
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

  // Check subscription status
  const checkSubscriptionStatus = useCallback(async (): Promise<boolean> => {
    if (!isNativePlatform || !Purchases) {
      return false;
    }

    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      return hasProEntitlement(info);
    } catch (err) {
      console.error('RevenueCat: Failed to check subscription status', err);
      return false;
    }
  }, [Purchases]);

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
    
    // Computed
    isPro,
    isTrialing,
    expirationDate,
    managementURL,
    
    // Actions
    fetchOfferings,
    purchasePackage,
    restorePurchases,
    checkSubscriptionStatus,
    loginUser,
    logoutUser,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatProvider;
