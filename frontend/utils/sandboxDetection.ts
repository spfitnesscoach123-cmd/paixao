/**
 * Sandbox Detection Utility
 * 
 * Detecta se o app está rodando em ambiente Sandbox/TestFlight
 * Usado para ocultar avisos de expiração que mostram datas incorretas
 * devido à compressão de tempo em ambiente de teste da Apple.
 * 
 * Em Sandbox:
 * - Trial de 7 dias = ~3 minutos
 * - Assinatura mensal = ~5 minutos
 * - Assinatura anual = ~1 hora
 */

import { CustomerInfo } from 'react-native-purchases';

/**
 * Detecta se estamos em ambiente Sandbox usando múltiplas verificações
 * 
 * @param customerInfo - CustomerInfo do RevenueCat
 * @param entitlementId - ID do entitlement (default: 'pro')
 * @returns true se detectar ambiente Sandbox
 */
export function detectSandboxEnvironment(
  customerInfo: CustomerInfo | null,
  entitlementId: string = 'pro'
): boolean {
  if (!customerInfo) {
    // Se não temos customerInfo, assumir que não é sandbox
    // para não bloquear avisos em produção
    return false;
  }
  
  // MÉTODO 1: Flag direta do CustomerInfo
  // Esta é a forma oficial, mas pode não funcionar em todas as versões do SDK
  if (customerInfo.isSandbox === true) {
    return true;
  }
  
  // MÉTODO 2: Flag do Entitlement específico
  const entitlement = customerInfo.entitlements?.active?.[entitlementId];
  if (entitlement?.isSandbox === true) {
    return true;
  }
  
  // MÉTODO 3: Detectar pelo tempo anormalmente curto entre compra e expiração
  // Em produção: 7 dias trial = 168 horas
  // Em sandbox: 7 dias trial = ~3-5 minutos
  if (entitlement?.expirationDate && entitlement?.latestPurchaseDate) {
    try {
      const expiration = new Date(entitlement.expirationDate);
      const purchase = new Date(entitlement.latestPurchaseDate);
      const diffMillis = expiration.getTime() - purchase.getTime();
      const diffHours = diffMillis / (1000 * 60 * 60);
      
      // Se a diferença é menor que 24 horas, é quase certamente sandbox
      // Assinaturas reais têm no mínimo 7 dias (168 horas) para trials
      // ou 30 dias (720 horas) para mensais
      if (diffHours < 24 && diffHours > 0) {
        return true;
      }
    } catch (e) {
      // Se der erro no parse de datas, ignorar este método
      console.warn('[SandboxDetection] Error parsing dates:', e);
    }
  }
  
  // MÉTODO 4: Verificar se originalPurchaseDate é muito recente com expiração próxima
  // Isso indica um trial de teste
  if (entitlement?.expirationDate && entitlement?.originalPurchaseDate) {
    try {
      const expiration = new Date(entitlement.expirationDate);
      const originalPurchase = new Date(entitlement.originalPurchaseDate);
      const now = new Date();
      
      const timeSincePurchase = now.getTime() - originalPurchase.getTime();
      const timeUntilExpiration = expiration.getTime() - now.getTime();
      
      // Se comprou há menos de 1 hora e expira em menos de 1 hora
      // É quase certamente sandbox
      const hourInMillis = 60 * 60 * 1000;
      if (timeSincePurchase < hourInMillis && timeUntilExpiration < hourInMillis && timeUntilExpiration > 0) {
        return true;
      }
    } catch (e) {
      console.warn('[SandboxDetection] Error in method 4:', e);
    }
  }
  
  return false;
}

/**
 * Versão simplificada que retorna objeto com detalhes da detecção
 * Útil para debugging
 */
export function detectSandboxWithDetails(
  customerInfo: CustomerInfo | null,
  entitlementId: string = 'pro'
): {
  isSandbox: boolean;
  method: string | null;
  details: Record<string, any>;
} {
  const details: Record<string, any> = {};
  
  if (!customerInfo) {
    return { isSandbox: false, method: null, details: { reason: 'no_customer_info' } };
  }
  
  // Check isSandbox flag on CustomerInfo
  details.customerInfoIsSandbox = customerInfo.isSandbox;
  if (customerInfo.isSandbox === true) {
    return { isSandbox: true, method: 'customerInfo.isSandbox', details };
  }
  
  const entitlement = customerInfo.entitlements?.active?.[entitlementId];
  details.hasEntitlement = !!entitlement;
  
  if (entitlement) {
    // Check isSandbox flag on Entitlement
    details.entitlementIsSandbox = entitlement.isSandbox;
    if (entitlement.isSandbox === true) {
      return { isSandbox: true, method: 'entitlement.isSandbox', details };
    }
    
    // Check duration
    if (entitlement.expirationDate && entitlement.latestPurchaseDate) {
      try {
        const expiration = new Date(entitlement.expirationDate);
        const purchase = new Date(entitlement.latestPurchaseDate);
        const diffHours = (expiration.getTime() - purchase.getTime()) / (1000 * 60 * 60);
        
        details.expirationDate = entitlement.expirationDate;
        details.latestPurchaseDate = entitlement.latestPurchaseDate;
        details.durationHours = diffHours;
        
        if (diffHours < 24 && diffHours > 0) {
          return { isSandbox: true, method: 'duration_check', details };
        }
      } catch (e) {
        details.durationCheckError = String(e);
      }
    }
  }
  
  return { isSandbox: false, method: null, details };
}
