/**
 * FatigueVisualOverlay Component
 * 
 * Exibe uma BORDA VISUAL colorida ao redor da tela da câmera
 * para indicar o nível de fadiga baseado na perda de velocidade.
 * 
 * IMPORTANTE: Este é um componente 100% VISUAL.
 * NÃO acessa câmera, frame processor, ou modifica cálculos VBT.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';

interface FatigueVisualOverlayProps {
  /** Percentual de queda de velocidade (0-100) */
  velocityDropPercent: number;
  /** Se o overlay deve ser visível */
  visible?: boolean;
}

/**
 * Calcula a cor da borda baseado na perda de velocidade
 * 0-8%: Verde (#00C853) - Fadiga baixa
 * 8-15%: Laranja (#FF6D00) - Fadiga moderada  
 * 15%+: Vermelho (#D50000) - Fadiga alta
 */
const getBorderColor = (velocityDrop: number): string => {
  if (velocityDrop < 8) {
    return '#00C853'; // Verde - Fadiga baixa
  } else if (velocityDrop < 15) {
    return '#FF6D00'; // Laranja - Fadiga moderada
  } else {
    return '#D50000'; // Vermelho - Fadiga alta
  }
};

const FatigueVisualOverlay: React.FC<FatigueVisualOverlayProps> = ({
  velocityDropPercent,
  visible = true,
}) => {
  if (!visible) return null;

  const borderColor = getBorderColor(velocityDropPercent);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.overlay,
        { borderColor }
      ]}
    />
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 8,
    zIndex: 9999,
  },
});

export default React.memo(FatigueVisualOverlay);
