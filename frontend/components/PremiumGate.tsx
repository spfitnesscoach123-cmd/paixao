/**
 * PremiumGate Component
 * 
 * DESATIVADO - Todas as features estão liberadas
 * Página mantida para futura implementação de monetização
 */

import React, { ReactNode } from 'react';

interface PremiumGateProps {
  children: ReactNode;
  feature?: string;
  onUpgradePress?: () => void;
}

/**
 * PremiumGate - PASSTHROUGH
 * Todas as features estão liberadas enquanto o sistema de assinaturas é reconstruído
 */
const PremiumGate: React.FC<PremiumGateProps> = ({ children }) => {
  // Sempre libera o conteúdo - sistema de assinaturas desativado
  return <>{children}</>;
};

/**
 * Hook para verificar acesso premium
 * Sempre retorna true enquanto o sistema está desativado
 */
export const usePremiumAccess = () => {
  return {
    isPremium: true,
    isLoading: false,
    refreshPremiumStatus: async () => true,
  };
};

export default PremiumGate;
