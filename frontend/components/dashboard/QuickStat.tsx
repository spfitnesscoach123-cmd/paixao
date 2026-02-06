import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
      <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{value}</Text>
          {trend && (
            <Ionicons 
              name={trend === 'up' ? 'arrow-up' : 'arrow-down'} 
              size={16} 
              color={trend === 'up' ? '#10b981' : '#ef4444'} 
            />
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
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
});
