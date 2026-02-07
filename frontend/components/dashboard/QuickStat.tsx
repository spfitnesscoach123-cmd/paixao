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
  const { colors } = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: colors.dark.card, borderColor: colors.border.default }]}>
      <View style={[styles.iconCircle, { backgroundColor: color + '20', borderColor: color + '40' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: colors.text.primary }]}>{value}</Text>
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
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
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
  },
  trendBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
