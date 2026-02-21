/**
 * RevenueCat Service
 * 
 * Serviço completo para gerenciamento de assinaturas via RevenueCat
 * Implementa trial de 7 dias, renovação automática e controle de acesso
 */

import { Platform, Linking } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';

// ============================================
// CONFIGURAÇÃO DO REVENUECAT
// ============================================

export const REVENUECAT_CONFIG = {
  // API Key fornecida pelo usuário
  APPLE_API_KEY: 'appl_eIJnPUEMyRzosbpoDejVevXnbti',
  
  // IDs de produto e entitlements
  PRO_ENTITLEMENT_ID: 'pro',
  PRODUCT_ID: 'pro_mensal',
  
  // Configurações de trial
  TRIAL_DAYS: 7,
  RENEWAL_DAYS: 30,
  RENEWAL_WARNING_DAYS: 3,
};

// ============================================
// TIPOS
// ============================================

export interface SubscriptionStatus {
  isActive: boolean;
  isPro: boolean;
  isTrialing: boolean;
  expirationDate: Date | null;
  daysRemaining: number;
  willRenew: boolean;
  managementURL: string | null;
}

export interface PurchaseResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
  errorCode?: PURCHASES_ERROR_CODE;
  userCancelled?: boolean;
}

export interface OfferingsResult {
  success: boolean;
  offerings?: PurchasesOfferings;
  currentPackage?: PurchasesPackage;
  error?: string;
}

// ============================================
// INICIALIZAÇÃO
// ============================================

let isInitialized = false;

/**
 * Inicializa o SDK do RevenueCat
 * Deve ser chamado uma única vez no início do app
 */
export const initializeRevenueCat = async (): Promise<boolean> => {
  if (isInitialized) {
    console.log('[RevenueCat] SDK já inicializado');
    return true;
  }

  try {
    // Habilita logs em desenvolvimento
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
    }

    // Configura o SDK baseado na plataforma
    if (Platform.OS === 'ios') {
      await Purchases.configure({
        apiKey: REVENUECAT_CONFIG.APPLE_API_KEY,
      });
      console.log('[RevenueCat] SDK iOS configurado com sucesso');
    } else if (Platform.OS === 'android') {
      // Para Android, seria necessário uma API key diferente
      console.log('[RevenueCat] Android não configurado ainda');
      return false;
    }

    isInitialized = true;
    return true;
  } catch (error) {
    console.error('[RevenueCat] Erro ao inicializar SDK:', error);
    return false;
  }
};

/**
 * Verifica se o SDK está inicializado
 */
export const isRevenueCatInitialized = (): boolean => {
  return isInitialized;
};

// ============================================
// GERENCIAMENTO DE USUÁRIO
// ============================================

/**
 * Vincula um usuário ao RevenueCat (login)
 * Permite sincronizar compras entre dispositivos
 */
export const loginUser = async (userId: string): Promise<CustomerInfo | null> => {
  try {
    if (!isInitialized) {
      await initializeRevenueCat();
    }
    
    const { customerInfo } = await Purchases.logIn(userId);
    console.log('[RevenueCat] Usuário logado:', userId);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Erro ao logar usuário:', error);
    return null;
  }
};

/**
 * Desvincula o usuário atual (logout)
 */
export const logoutUser = async (): Promise<CustomerInfo | null> => {
  try {
    const customerInfo = await Purchases.logOut();
    console.log('[RevenueCat] Usuário deslogado');
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Erro ao deslogar usuário:', error);
    return null;
  }
};

// ============================================
// INFORMAÇÕES DO CLIENTE
// ============================================

/**
 * Obtém informações atualizadas do cliente
 */
export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
  try {
    if (!isInitialized) {
      await initializeRevenueCat();
    }
    
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Erro ao obter informações do cliente:', error);
    return null;
  }
};

/**
 * Invalida o cache e obtém informações atualizadas
 */
export const refreshCustomerInfo = async (): Promise<CustomerInfo | null> => {
  try {
    await Purchases.invalidateCustomerInfoCache();
    return await getCustomerInfo();
  } catch (error) {
    console.error('[RevenueCat] Erro ao atualizar informações:', error);
    return null;
  }
};

// ============================================
// STATUS DA ASSINATURA
// ============================================

/**
 * Verifica se o usuário tem acesso PRO (trial ou assinatura paga)
 */
export const checkProAccess = (customerInfo: CustomerInfo | null): boolean => {
  if (!customerInfo) return false;
  
  const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
  return proEntitlement !== undefined;
};

/**
 * Verifica se o usuário está em período de trial
 */
export const isInTrialPeriod = (customerInfo: CustomerInfo | null): boolean => {
  if (!customerInfo) return false;
  
  const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
  if (!proEntitlement) return false;
  
  // Verifica se a compra original foi há menos de 7 dias
  const originalPurchaseDate = proEntitlement.originalPurchaseDate 
    ? new Date(proEntitlement.originalPurchaseDate) 
    : null;
    
  if (!originalPurchaseDate) return false;
  
  const now = new Date();
  const daysSincePurchase = Math.floor(
    (now.getTime() - originalPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return daysSincePurchase < REVENUECAT_CONFIG.TRIAL_DAYS;
};

/**
 * Obtém a data de expiração da assinatura
 */
export const getExpirationDate = (customerInfo: CustomerInfo | null): Date | null => {
  if (!customerInfo) return null;
  
  const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
  if (!proEntitlement || !proEntitlement.expirationDate) return null;
  
  return new Date(proEntitlement.expirationDate);
};

/**
 * Calcula dias restantes da assinatura
 */
export const getDaysRemaining = (expirationDate: Date | null): number => {
  if (!expirationDate) return 0;
  
  const now = new Date();
  const diffTime = expirationDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
};

/**
 * Verifica se deve mostrar aviso de renovação (3 dias antes)
 */
export const shouldShowRenewalWarning = (customerInfo: CustomerInfo | null): boolean => {
  if (!customerInfo) return false;
  
  const hasProAccess = checkProAccess(customerInfo);
  if (!hasProAccess) return false;
  
  const expirationDate = getExpirationDate(customerInfo);
  const daysRemaining = getDaysRemaining(expirationDate);
  
  // Mostra aviso se tem 3 dias ou menos
  return daysRemaining > 0 && daysRemaining <= REVENUECAT_CONFIG.RENEWAL_WARNING_DAYS;
};

/**
 * Verifica se a assinatura vai renovar automaticamente
 */
export const willAutoRenew = (customerInfo: CustomerInfo | null): boolean => {
  if (!customerInfo) return false;
  
  const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.PRO_ENTITLEMENT_ID];
  if (!proEntitlement) return false;
  
  return proEntitlement.willRenew === true;
};

/**
 * Obtém o status completo da assinatura
 */
export const getSubscriptionStatus = (customerInfo: CustomerInfo | null): SubscriptionStatus => {
  const isPro = checkProAccess(customerInfo);
  const isTrialing = isInTrialPeriod(customerInfo);
  const expirationDate = getExpirationDate(customerInfo);
  const daysRemaining = getDaysRemaining(expirationDate);
  const willRenew = willAutoRenew(customerInfo);
  
  // URL de gerenciamento da assinatura
  let managementURL: string | null = null;
  if (customerInfo?.managementURL) {
    managementURL = customerInfo.managementURL;
  }
  
  return {
    isActive: isPro,
    isPro,
    isTrialing,
    expirationDate,
    daysRemaining,
    willRenew,
    managementURL,
  };
};

// ============================================
// OFERTAS E PRODUTOS
// ============================================

/**
 * Obtém as ofertas disponíveis
 */
export const getOfferings = async (): Promise<OfferingsResult> => {
  try {
    if (!isInitialized) {
      await initializeRevenueCat();
    }
    
    const offerings = await Purchases.getOfferings();
    
    if (!offerings.current) {
      console.log('[RevenueCat] Nenhuma oferta atual disponível');
      return {
        success: false,
        error: 'Nenhuma oferta disponível',
      };
    }
    
    // Busca o pacote mensal
    const monthlyPackage = offerings.current.monthly;
    
    console.log('[RevenueCat] Ofertas carregadas:', {
      currentOffering: offerings.current.identifier,
      packages: offerings.current.availablePackages.map(p => p.identifier),
    });
    
    return {
      success: true,
      offerings,
      currentPackage: monthlyPackage || offerings.current.availablePackages[0],
    };
  } catch (error: any) {
    console.error('[RevenueCat] Erro ao obter ofertas:', error);
    return {
      success: false,
      error: error.message || 'Erro ao carregar ofertas',
    };
  }
};

// ============================================
// COMPRAS
// ============================================

/**
 * Realiza a compra de um pacote
 * O RevenueCat aplica automaticamente o trial se elegível
 */
export const purchasePackage = async (
  packageToPurchase: PurchasesPackage
): Promise<PurchaseResult> => {
  try {
    if (!isInitialized) {
      await initializeRevenueCat();
    }
    
    console.log('[RevenueCat] Iniciando compra:', packageToPurchase.identifier);
    
    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    
    // Verifica se o entitlement pro está ativo
    const isPro = checkProAccess(customerInfo);
    
    if (isPro) {
      console.log('[RevenueCat] Compra realizada com sucesso!');
      return {
        success: true,
        customerInfo,
      };
    } else {
      console.log('[RevenueCat] Compra concluída mas entitlement não ativo');
      return {
        success: false,
        customerInfo,
        error: 'Entitlement não foi ativado',
      };
    }
  } catch (error: any) {
    console.error('[RevenueCat] Erro na compra:', error);
    
    // Verifica se o usuário cancelou
    if (error.userCancelled) {
      return {
        success: false,
        userCancelled: true,
        error: 'Compra cancelada pelo usuário',
      };
    }
    
    // Determina o código de erro
    let errorCode: PURCHASES_ERROR_CODE | undefined;
    if (error.code) {
      errorCode = error.code;
    }
    
    return {
      success: false,
      error: error.message || 'Erro desconhecido na compra',
      errorCode,
    };
  }
};

/**
 * Realiza compra diretamente pelo product ID
 */
export const purchaseProduct = async (productId: string): Promise<PurchaseResult> => {
  try {
    const offeringsResult = await getOfferings();
    
    if (!offeringsResult.success || !offeringsResult.offerings) {
      return {
        success: false,
        error: 'Não foi possível carregar as ofertas',
      };
    }
    
    // Busca o pacote pelo product ID
    const allPackages = offeringsResult.offerings.current?.availablePackages || [];
    const targetPackage = allPackages.find(
      pkg => pkg.product.identifier === productId
    );
    
    if (!targetPackage) {
      return {
        success: false,
        error: `Produto ${productId} não encontrado`,
      };
    }
    
    return await purchasePackage(targetPackage);
  } catch (error: any) {
    console.error('[RevenueCat] Erro ao comprar produto:', error);
    return {
      success: false,
      error: error.message || 'Erro ao processar compra',
    };
  }
};

// ============================================
// RESTAURAÇÃO DE COMPRAS
// ============================================

/**
 * Restaura compras anteriores
 * Útil quando o usuário reinstala o app ou troca de dispositivo
 */
export const restorePurchases = async (): Promise<PurchaseResult> => {
  try {
    if (!isInitialized) {
      await initializeRevenueCat();
    }
    
    console.log('[RevenueCat] Restaurando compras...');
    
    const customerInfo = await Purchases.restorePurchases();
    const isPro = checkProAccess(customerInfo);
    
    if (isPro) {
      console.log('[RevenueCat] Compras restauradas com sucesso!');
      return {
        success: true,
        customerInfo,
      };
    } else {
      console.log('[RevenueCat] Nenhuma compra anterior encontrada');
      return {
        success: false,
        customerInfo,
        error: 'Nenhuma assinatura anterior encontrada',
      };
    }
  } catch (error: any) {
    console.error('[RevenueCat] Erro ao restaurar compras:', error);
    return {
      success: false,
      error: error.message || 'Erro ao restaurar compras',
    };
  }
};

/**
 * Sincroniza compras automaticamente (sem prompt de login)
 */
export const syncPurchases = async (): Promise<void> => {
  try {
    if (!isInitialized) {
      await initializeRevenueCat();
    }
    
    await Purchases.syncPurchases();
    console.log('[RevenueCat] Compras sincronizadas');
  } catch (error) {
    console.error('[RevenueCat] Erro ao sincronizar compras:', error);
  }
};

// ============================================
// GERENCIAMENTO DE ASSINATURA
// ============================================

/**
 * Abre a página de gerenciamento de assinaturas da App Store
 */
export const openManageSubscriptions = async (): Promise<void> => {
  try {
    const url = Platform.select({
      ios: 'https://apps.apple.com/account/subscriptions',
      android: 'https://play.google.com/store/account/subscriptions',
      default: '',
    });
    
    if (url) {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    }
  } catch (error) {
    console.error('[RevenueCat] Erro ao abrir gerenciamento:', error);
  }
};

// ============================================
// LISTENER DE ATUALIZAÇÕES
// ============================================

/**
 * Adiciona listener para atualizações de status
 * Retorna função para remover o listener
 */
export const addCustomerInfoListener = (
  callback: (customerInfo: CustomerInfo) => void
): (() => void) => {
  const listener = Purchases.addCustomerInfoUpdateListener((info) => {
    console.log('[RevenueCat] CustomerInfo atualizado');
    callback(info);
  });
  
  return () => {
    listener.remove();
  };
};

// ============================================
// HELPERS DE FORMATAÇÃO
// ============================================

/**
 * Formata o preço do produto
 */
export const formatPrice = (packageItem: PurchasesPackage): string => {
  return packageItem.product.priceString;
};

/**
 * Formata a descrição do trial
 */
export const formatTrialDescription = (packageItem: PurchasesPackage, locale: string = 'pt'): string => {
  const price = formatPrice(packageItem);
  
  if (locale === 'pt') {
    return `7 dias gratuitos, depois ${price}/mês`;
  }
  return `7 days free, then ${price}/month`;
};
