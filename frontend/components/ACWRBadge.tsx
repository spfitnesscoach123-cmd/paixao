import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

interface ACWRBadgeProps {
  value: number | null;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  locale?: string;
}

// ACWR Classification
// <0.8 - Losing performance (undertrained)
// 0.8-1.3 - Sweet Spot (optimal)
// 1.3-1.5 - Caution zone
// >1.5 - High Risk (overtrained)

export const getACWRClassification = (acwr: number | null, locale: string = 'en') => {
  if (acwr === null || acwr === undefined) {
    return {
      label: locale === 'pt' ? 'Sem dados' : 'No data',
      labelShort: '-',
      color: colors.text.tertiary,
      bgColor: 'rgba(107, 114, 128, 0.2)',
      icon: 'help-circle' as const,
      risk: 'unknown',
    };
  }
  
  if (acwr < 0.8) {
    return {
      label: locale === 'pt' ? 'Perda de Performance' : 'Losing Performance',
      labelShort: locale === 'pt' ? 'Subtreinado' : 'Undertrained',
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.2)',
      icon: 'trending-down' as const,
      risk: 'low',
    };
  }
  
  if (acwr >= 0.8 && acwr <= 1.3) {
    return {
      label: 'Sweet Spot',
      labelShort: locale === 'pt' ? 'Ótimo' : 'Optimal',
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.2)',
      icon: 'checkmark-circle' as const,
      risk: 'optimal',
    };
  }
  
  if (acwr > 1.3 && acwr <= 1.5) {
    return {
      label: locale === 'pt' ? 'Zona de Atenção' : 'Caution Zone',
      labelShort: locale === 'pt' ? 'Atenção' : 'Caution',
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.2)',
      icon: 'alert-circle' as const,
      risk: 'moderate',
    };
  }
  
  // acwr > 1.5
  return {
    label: locale === 'pt' ? 'Alto Risco' : 'High Risk',
    labelShort: locale === 'pt' ? 'Alto Risco' : 'High Risk',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.2)',
    icon: 'warning' as const,
    risk: 'high',
  };
};

export const ACWRBadge: React.FC<ACWRBadgeProps> = ({ 
  value, 
  size = 'medium', 
  showLabel = true,
  locale = 'en' 
}) => {
  const classification = getACWRClassification(value, locale);
  
  const sizeStyles = {
    small: { padding: 4, fontSize: 10, iconSize: 12, gap: 4 },
    medium: { padding: 8, fontSize: 12, iconSize: 16, gap: 6 },
    large: { padding: 12, fontSize: 14, iconSize: 20, gap: 8 },
  };
  
  const s = sizeStyles[size];
  
  return (
    <View style={[
      styles.badge,
      { backgroundColor: classification.bgColor, padding: s.padding, gap: s.gap }
    ]}>
      <Ionicons name={classification.icon} size={s.iconSize} color={classification.color} />
      <Text style={[styles.value, { fontSize: s.fontSize + 2, color: classification.color }]}>
        {value !== null ? value.toFixed(2) : '-'}
      </Text>
      {showLabel && (
        <Text style={[styles.label, { fontSize: s.fontSize, color: classification.color }]}>
          {classification.labelShort}
        </Text>
      )}
    </View>
  );
};

// ACWR Scale Legend Component
export const ACWRLegend: React.FC<{ locale?: string }> = ({ locale = 'en' }) => {
  const ranges = [
    { range: '<0.8', label: locale === 'pt' ? 'Perda de Performance' : 'Losing Performance', color: '#f59e0b' },
    { range: '0.8-1.3', label: 'Sweet Spot', color: '#10b981' },
    { range: '1.3-1.5', label: locale === 'pt' ? 'Atenção' : 'Caution', color: '#f59e0b' },
    { range: '>1.5', label: locale === 'pt' ? 'Alto Risco' : 'High Risk', color: '#ef4444' },
  ];
  
  return (
    <View style={styles.legend}>
      {ranges.map((item, i) => (
        <View key={i} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={styles.legendRange}>{item.range}</Text>
          <Text style={styles.legendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
  },
  value: {
    fontWeight: 'bold',
  },
  label: {
    fontWeight: '500',
  },
  legend: {
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendRange: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
    minWidth: 50,
  },
  legendLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
});

export default ACWRBadge;
