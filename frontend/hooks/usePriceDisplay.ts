/**
 * usePriceDisplay
 *
 * Hook que controla a exibição do preço da assinatura vindo do RevenueCat.
 *
 * Estratégia:
 *  1. Preço real (currentPackage.product.priceString) = estado PRINCIPAL
 *  2. 'Loading Price' = fallback TRANSITÓRIO durante fetch inicial
 *  3. 'Unavailable' = fallback CONTROLADO após timeout (4s) sem resposta
 *
 * Regras:
 *  - `shouldRender` é false enquanto o fetch está em andamento, evitando
 *    que a UI mostre "Loading Price" como estado padrão. Só vira true
 *    quando há preço real OU o timeout expirou.
 *  - Nenhum valor hardcoded em USD.
 */

import { useEffect, useState } from 'react';
import { useRevenueCat } from '../contexts/RevenueCatContext';
import { formatPrice } from '../services/revenuecat';

const PRICE_FETCH_TIMEOUT_MS = 7000;

export interface PriceDisplayState {
  price: string;
  isFetchingPrice: boolean;
  priceTimeoutExceeded: boolean;
  shouldRender: boolean;
}

export function usePriceDisplay(): PriceDisplayState {
  const { currentPackage } = useRevenueCat();
  const [isFetchingPrice, setIsFetchingPrice] = useState(true);
  const [priceTimeoutExceeded, setPriceTimeoutExceeded] = useState(false);

  // Sai do estado de fetch assim que o pacote do RevenueCat chega
  useEffect(() => {
    if (currentPackage) {
      setIsFetchingPrice(false);
    }
  }, [currentPackage]);

  // Timeout de segurança: após 4s sem resposta, marca como indisponível
  useEffect(() => {
    const timer = setTimeout(() => {
      setPriceTimeoutExceeded(true);
      setIsFetchingPrice(false);
    }, PRICE_FETCH_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  let price: string;
  if (currentPackage) {
    price = formatPrice(currentPackage);
  } else if (isFetchingPrice && !priceTimeoutExceeded) {
    price = 'Loading Price';
  } else {
    price = 'Unavailable';
  }

  const shouldRender = !!currentPackage || priceTimeoutExceeded;

  return { price, isFetchingPrice, priceTimeoutExceeded, shouldRender };
}
