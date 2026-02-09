import { Platform } from 'react-native';

// RevenueCat configuration
// These keys should be configured in RevenueCat dashboard
export const REVENUECAT_CONFIG = {
  // Public API keys from RevenueCat dashboard (safe to include in client code)
  APPLE_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY || '',
  GOOGLE_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || '',
  
  // Entitlement identifier configured in RevenueCat dashboard
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

// Helper to check if user has Pro access
export const hasProEntitlement = (customerInfo: RevenueCatCustomerInfo | null): boolean => {
  if (!customerInfo) return false;
  return typeof customerInfo.entitlements.active[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID] !== 'undefined';
};

// Helper to get subscription expiration date
export const getSubscriptionExpirationDate = (customerInfo: RevenueCatCustomerInfo | null): Date | null => {
  if (!customerInfo) return null;
  
  const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
  if (!proEntitlement || !proEntitlement.expirationDate) return null;
  
  return new Date(proEntitlement.expirationDate);
};

// Helper to check if user is in trial period
export const isInTrialPeriod = (customerInfo: RevenueCatCustomerInfo | null): boolean => {
  if (!customerInfo) return false;
  
  const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
  if (!proEntitlement) return false;
  
  return proEntitlement.periodType === 'trial';
};

// Helper to get management URL for subscription
export const getManagementURL = (customerInfo: RevenueCatCustomerInfo | null): string | null => {
  if (!customerInfo) return null;
  return customerInfo.managementURL;
};

// Get platform-specific API key
export const getApiKey = (): string => {
  if (Platform.OS === 'ios') {
    return REVENUECAT_CONFIG.APPLE_API_KEY;
  } else if (Platform.OS === 'android') {
    return REVENUECAT_CONFIG.GOOGLE_API_KEY;
  }
  return '';
};

export default REVENUECAT_CONFIG;
