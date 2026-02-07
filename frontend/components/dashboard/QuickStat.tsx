import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface QuickStatProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  trend?: 'up' | 'down';
}

export const QuickStat: React.FC<QuickStatProps> = ({ label, value, icon, color, trend }) => {
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: color + '20', borderColor: color + '40' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{value}</Text>
          {trend && (
            <View style={[styles.trendBadge, { backgroundColor: trend === 'up' ? colors.accent.tertiary : colors.status.error }]}>
              <Ionicons 
                name={trend === 'up' ? 'arrow-up' : 'arrow-down'} 
                size={12} 
                color="#ffffff"
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  value: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  trendBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
