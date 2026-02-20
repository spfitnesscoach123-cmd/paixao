/**
 * FatigueVisualOverlay Component
 * 
 * Exibe uma BORDA VISUAL colorida ao redor da tela da câmera
 * para indicar o nível de fadiga baseado na perda de velocidade.
 * 
 * IMPORTANTE: Este é um componente 100% VISUAL.
 * NÃO acessa câmera, frame processor, ou modifica cálculos VBT.
 * 
 * Melhorias Visuais:
 * - Transição gradual contínua de cor (interpolação linear)
 * - Animação fade suave (300ms ease-out)
 * - Indicador visual de tendência (↓ ↑ →)
 * - Indicador percentual em tempo real
 * - Modo Elite: pulso sutil quando velocityDropPercent > 25%
 */

import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

interface FatigueVisualOverlayProps {
  /** Percentual de queda de velocidade (0-100) - usado EXATAMENTE como fornecido */
  velocityDropPercent: number;
  /** Se o overlay deve ser visível */
  visible?: boolean;
}

/**
 * Interpola linearmente entre duas cores hex
 */
const interpolateHexColor = (color1: string, color2: string, factor: number): string => {
  const clampedFactor = Math.max(0, Math.min(1, factor));
  
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  
  const r = Math.round(r1 + (r2 - r1) * clampedFactor);
  const g = Math.round(g1 + (g2 - g1) * clampedFactor);
  const b = Math.round(b1 + (b2 - b1) * clampedFactor);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
};

/**
 * PARTE 1 — TRANSIÇÃO GRADUAL CONTÍNUA DE COR
 * 
 * Interpola linearmente entre:
 * 0% → #00C853 (verde)
 * 15% → #FF6D00 (laranja)
 * 30% → #D50000 (vermelho)
 * 30%+ → manter vermelho puro
 * 
 * Exemplos:
 * 3% → verde levemente mais quente
 * 7% → verde-amarelado
 * 12% → entre verde e laranja
 * 18% → laranja-avermelhado
 * 25% → vermelho intermediário
 * 30%+ → vermelho puro
 */
const getInterpolatedColor = (velocityDropPercent: number): string => {
  const GREEN = '#00C853';   // 0%
  const ORANGE = '#FF6D00';  // 15%
  const RED = '#D50000';     // 30%+
  
  if (velocityDropPercent <= 0) {
    return GREEN;
  } else if (velocityDropPercent < 15) {
    // Interpolar de verde para laranja (0% - 15%)
    const factor = velocityDropPercent / 15;
    return interpolateHexColor(GREEN, ORANGE, factor);
  } else if (velocityDropPercent < 30) {
    // Interpolar de laranja para vermelho (15% - 30%)
    const factor = (velocityDropPercent - 15) / 15;
    return interpolateHexColor(ORANGE, RED, factor);
  } else {
    // 30%+ → vermelho puro
    return RED;
  }
};

/**
 * Determina o indicador de tendência baseado na comparação com valor anterior
 */
type TrendDirection = 'increasing' | 'decreasing' | 'stable';

const getTrendIndicator = (direction: TrendDirection): string => {
  switch (direction) {
    case 'increasing': return '↓'; // Fadiga aumentando (pior)
    case 'decreasing': return '↑'; // Fadiga diminuindo (melhor)
    case 'stable': return '→';     // Estável
  }
};

const FatigueVisualOverlay: React.FC<FatigueVisualOverlayProps> = ({
  velocityDropPercent,
  visible = true,
}) => {
  // PARTE 3 — Referência para valor anterior (puramente visual, local)
  const previousValueRef = useRef<number>(velocityDropPercent);
  const trendRef = useRef<TrendDirection>('stable');
  
  // PARTE 2 — Animação fade suave
  const borderColorAnim = useRef(new Animated.Value(0)).current;
  const currentColorRef = useRef<string>(getInterpolatedColor(velocityDropPercent));
  const targetColorRef = useRef<string>(getInterpolatedColor(velocityDropPercent));
  
  // PARTE 6 — Modo Elite: animação de pulso
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  
  // Calcular tendência baseada no valor anterior (PARTE 3)
  useEffect(() => {
    const diff = velocityDropPercent - previousValueRef.current;
    const threshold = 0.5; // Diferença mínima para considerar mudança
    
    if (diff > threshold) {
      trendRef.current = 'increasing'; // Fadiga aumentou
    } else if (diff < -threshold) {
      trendRef.current = 'decreasing'; // Fadiga diminuiu
    } else {
      trendRef.current = 'stable';
    }
    
    previousValueRef.current = velocityDropPercent;
  }, [velocityDropPercent]);
  
  // PARTE 2 — Animar transição de cor (300ms ease-out)
  useEffect(() => {
    const newColor = getInterpolatedColor(velocityDropPercent);
    
    if (newColor !== targetColorRef.current) {
      currentColorRef.current = targetColorRef.current;
      targetColorRef.current = newColor;
      
      borderColorAnim.setValue(0);
      Animated.timing(borderColorAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false, // Necessário para animação de cor
      }).start();
    }
  }, [velocityDropPercent, borderColorAnim]);
  
  // PARTE 6 — Modo Elite: ativar/desativar pulso quando > 25%
  useEffect(() => {
    if (velocityDropPercent > 25) {
      // Iniciar pulso sutil
      if (!pulseAnimationRef.current) {
        pulseAnimationRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 0.85,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            }),
          ])
        );
        pulseAnimationRef.current.start();
      }
    } else {
      // Parar pulso e resetar
      if (pulseAnimationRef.current) {
        pulseAnimationRef.current.stop();
        pulseAnimationRef.current = null;
        pulseAnim.setValue(1);
      }
    }
    
    return () => {
      if (pulseAnimationRef.current) {
        pulseAnimationRef.current.stop();
        pulseAnimationRef.current = null;
      }
    };
  }, [velocityDropPercent, pulseAnim]);
  
  // Manter: if (!visible) return null;
  if (!visible) return null;
  
  // PARTE 5 — Cor sincronizada para borda, seta e texto
  const displayColor = getInterpolatedColor(velocityDropPercent);
  const trendIndicator = getTrendIndicator(trendRef.current);
  
  // Interpolação animada da cor da borda
  const animatedBorderColor = borderColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [currentColorRef.current, targetColorRef.current],
  });
  
  // Combinar pulso com opacidade da borda (PARTE 6)
  const animatedOpacity = pulseAnim.interpolate({
    inputRange: [0.85, 1],
    outputRange: [0.7, 1],
  });

  return (
    <View
      pointerEvents="none"
      style={styles.container}
    >
      {/* Borda animada com transição de cor e pulso */}
      <Animated.View
        style={[
          styles.overlay,
          {
            borderColor: animatedBorderColor,
            opacity: animatedOpacity,
          }
        ]}
      />
      
      {/* PARTE 3 & 4 — Indicador de tendência e percentual */}
      <View style={styles.indicatorContainer}>
        <View style={[styles.indicatorBox, { backgroundColor: 'rgba(0, 0, 0, 0.6)' }]}>
          {/* Seta de tendência com cor sincronizada */}
          <Text style={[styles.trendArrow, { color: displayColor }]}>
            {trendIndicator}
          </Text>
          {/* Percentual com cor sincronizada - usando EXATAMENTE o valor recebido */}
          <Text style={[styles.percentText, { color: displayColor }]}>
            {velocityDropPercent > 0 ? `-${velocityDropPercent.toFixed(1)}%` : '0%'}
          </Text>
        </View>
        
        {/* Indicador de Modo Elite ativo */}
        {velocityDropPercent > 25 && (
          <View style={styles.eliteModeIndicator}>
            <Text style={styles.eliteModeText}>FADIGA ALTA</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // PARTE 7 — Container mantém estrutura obrigatória
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  // Borda animada - mantém borderWidth: 8
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 8,
  },
  // Container do indicador - canto superior direito
  indicatorContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    alignItems: 'flex-end',
  },
  // Box do indicador
  indicatorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  // Seta de tendência
  trendArrow: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  // Texto do percentual
  percentText: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  // Indicador de Modo Elite
  eliteModeIndicator: {
    marginTop: 8,
    backgroundColor: 'rgba(213, 0, 0, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  eliteModeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});

// Manter React.memo exatamente como está
export default React.memo(FatigueVisualOverlay);
