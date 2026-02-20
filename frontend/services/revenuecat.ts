import { Platform } from 'react-native';

// RevenueCat configuration
// These keys should be configured in RevenueCat dashboard
export const REVENUECAT_CONFIG = {
  // Public API keys from RevenueCat dashboard (safe to include in client code)
  APPLE_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY || '',
  GOOGLE_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || '',
  
  // Entitlement identifier configured in RevenueCat dashboard
  // IMPORTANTE: Usar "pro" como identificador do entitlement (configurado no RevenueCat)
  PRO_ENTITLEMENT_ID: 'pro',
  
  // Product identifiers (must match App Store Connect / Google Play Console)
  PRODUCT_IDS: {
    PRO_MONTHLY: 'com.peakperform.pro.monthly',
  },
  
  // Offering identifier
  DEFAULT_OFFERING: 'default',
};

// Type definitions for RevenueCat
export interface RevenueCatPackage {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    price: number;
    priceString: string;
    currencyCode: string;
    introPrice?: {
      price: number;
      priceString: string;
      period: string;
      periodUnit: string;
      periodNumberOfUnits: number;
    };
  };
  offeringIdentifier: string;
}

export interface RevenueCatCustomerInfo {
  activeSubscriptions: string[];
  entitlements: {
    active: {
      [key: string]: {
        identifier: string;
        isActive: boolean;
        willRenew: boolean;
        periodType: string;
        latestPurchaseDate: string;
        originalPurchaseDate: string;
        expirationDate: string | null;
        productIdentifier: string;
        isSandbox: boolean;
      };
    };
    all: {
      [key: string]: any;
    };
  };
  originalAppUserId: string;
  firstSeen: string;
  requestDate: string;
  managementURL: string | null;
}

export interface PurchaseResult {
  success: boolean;
  customerInfo?: RevenueCatCustomerInfo;
  productIdentifier?: string;
  error?: string;
  userCancelled?: boolean;
}

/**
 * FONTE ÚNICA DA VERDADE: expirationDate
 * 
 * O acesso premium é determinado EXCLUSIVAMENTE pela expirationDate do entitlement "pro".
 * 
 * Regras:
 * - isPro = expirationDate > now
 * - NÃO usar: entitlements.active, isActive, isTrial, isSubscribed, isCancelled, cache
 * 
 * Comportamento:
 * 1. Trial ativo → acesso completo
 * 2. Trial cancelado mas dentro do período → acesso completo
 * 3. Assinatura ativa → acesso completo
 * 4. Assinatura cancelada mas dentro do período → acesso completo
 * 5. expirationDate < now → bloquear acesso
 */

/**
 * Obtém o entitlement "pro" de entitlements.all (NÃO de entitlements.active)
 * Isso garante que temos acesso à expirationDate mesmo após cancelamento
 */
export const getProEntitlement = (customerInfo: RevenueCatCustomerInfo | null): any | null => {
  if (!customerInfo) return null;
  
  // IMPORTANTE: Buscar de entitlements.all, NÃO de entitlements.active
  // entitlements.all contém todos os entitlements, incluindo cancelados
  const entitlement = customerInfo.entitlements.all[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
  
  return entitlement || null;
};

/**
 * Obtém a data de expiração do entitlement premium
 * Esta é a ÚNICA fonte de verdade para determinar acesso
 */
export const getSubscriptionExpirationDate = (customerInfo: RevenueCatCustomerInfo | null): Date | null => {
  const entitlement = getPremiumEntitlement(customerInfo);
  
  if (!entitlement || !entitlement.expirationDate) {
    return null;
  }
  
  return new Date(entitlement.expirationDate);
};

/**
 * FUNÇÃO PRINCIPAL: Verifica se o usuário tem acesso premium
 * 
 * REGRA ÚNICA: premium = expirationDate > now
 * 
 * NÃO usa: isActive, isTrial, entitlements.active, etc.
 */
export const checkPremiumAccessFromInfo = (customerInfo: RevenueCatCustomerInfo | null): boolean => {
  const entitlement = getPremiumEntitlement(customerInfo);
  
  if (!entitlement || !entitlement.expirationDate) {
    console.log('[PREMIUM] No entitlement or expirationDate found');
    return false;
  }
  
  const expirationDate = new Date(entitlement.expirationDate);
  const now = new Date();
  const hasAccess = expirationDate > now;
  
  console.log('[PREMIUM] Premium entitlement:', entitlement);
  console.log('[PREMIUM] Expiration date:', entitlement.expirationDate);
  console.log('[PREMIUM] Current date:', now.toISOString());
  console.log('[PREMIUM] Premium access:', hasAccess);
  
  return hasAccess;
};

/**
 * @deprecated Use checkPremiumAccessFromInfo instead
 * Mantido para compatibilidade, mas internamente usa a nova lógica
 */
export const hasProEntitlement = (customerInfo: RevenueCatCustomerInfo | null): boolean => {
  return checkPremiumAccessFromInfo(customerInfo);
};

/**
 * Verifica se está em período de trial (informativo apenas, NÃO afeta acesso)
 * O acesso é determinado EXCLUSIVAMENTE pela expirationDate
 */
export const isInTrialPeriod = (customerInfo: RevenueCatCustomerInfo | null): boolean => {
  const entitlement = getPremiumEntitlement(customerInfo);
  if (!entitlement) return false;
  
  return entitlement.periodType === 'trial';
};

/**
 * Helper to get management URL for subscription
 */
export const getManagementURL = (customerInfo: RevenueCatCustomerInfo | null): string | null => {
  if (!customerInfo) return null;
  return customerInfo.managementURL;
};

/**
 * Get platform-specific API key
 */
export const getApiKey = (): string => {
  if (Platform.OS === 'ios') {
    return REVENUECAT_CONFIG.APPLE_API_KEY;
  } else if (Platform.OS === 'android') {
    return REVENUECAT_CONFIG.GOOGLE_API_KEY;
  }
  return '';
};

export default REVENUECAT_CONFIG;
