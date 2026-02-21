/**
 * RevenueCat Context
 * 
 * DESATIVADO - Sistema de assinaturas removido para reconstrução
 * Mantido apenas a estrutura básica para evitar erros de importação
 */

import React, { createContext, useContext, ReactNode } from 'react';

interface RevenueCatContextType {
  isInitialized: boolean;
  isLoading: boolean;
  isPremium: boolean;
  isPro: boolean;
  isTrialing: boolean;
  expirationDate: Date | null;
  managementURL: string | null;
  packages: any[];
  error: string | null;
  customerInfo: any | null;
  fetchOfferings: () => Promise<void>;
  purchasePackage: (pkg: any) => Promise<{ success: boolean }>;
  restorePurchases: () => Promise<{ success: boolean }>;
  checkPremiumAccess: () => Promise<boolean>;
  loginUser: (userId: string) => Promise<void>;
  logoutUser: () => Promise<void>;
}

const defaultContext: RevenueCatContextType = {
  isInitialized: true,
  isLoading: false,
  isPremium: true, // Sempre true - features liberadas
  isPro: true,     // Sempre true - features liberadas
  isTrialing: false,
  expirationDate: null,
  managementURL: null,
  packages: [],
  error: null,
  customerInfo: null,
  fetchOfferings: async () => {},
  purchasePackage: async () => ({ success: true }),
  restorePurchases: async () => ({ success: true }),
  checkPremiumAccess: async () => true,
  loginUser: async () => {},
  logoutUser: async () => {},
};

const RevenueCatContext = createContext<RevenueCatContextType>(defaultContext);

export const useRevenueCat = () => useContext(RevenueCatContext);

interface RevenueCatProviderProps {
  children: ReactNode;
}

/**
 * RevenueCatProvider - DESATIVADO
 * Apenas passa os valores padrão sem inicializar o SDK
 */
export const RevenueCatProvider: React.FC<RevenueCatProviderProps> = ({ children }) => {
  return (
    <RevenueCatContext.Provider value={defaultContext}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatContext;
