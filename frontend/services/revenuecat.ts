/**
 * RevenueCat Service
 * 
 * DESATIVADO - Sistema de assinaturas removido para reconstrução
 * Arquivo mantido apenas para evitar erros de importação
 */

// Configuração vazia - será preenchida na reconstrução
export const REVENUECAT_CONFIG = {
  APPLE_API_KEY: '',
  GOOGLE_API_KEY: '',
  PRO_ENTITLEMENT_ID: '',
  PRODUCT_IDS: {
    PRO_MONTHLY: '',
  },
  DEFAULT_OFFERING: 'default',
};

// Tipos mantidos para compatibilidade
export interface RevenueCatCustomerInfo {
  entitlements: {
    all: Record<string, any>;
    active: Record<string, any>;
  };
  managementURL: string | null;
}

export interface RevenueCatPackage {
  identifier: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    priceString: string;
    price: number;
    currencyCode: string;
    introPrice?: {
      priceString: string;
      periodUnit: string;
      periodNumberOfUnits: number;
    };
  };
}

export interface PurchaseResult {
  success: boolean;
  customerInfo?: RevenueCatCustomerInfo;
  error?: string;
}

// Funções stub - retornam valores padrão
export const checkProAccessFromInfo = (): boolean => true;
export const isInTrialPeriod = (): boolean => false;
export const getSubscriptionExpirationDate = (): Date | null => null;
export const getManagementURL = (): string | null => null;
