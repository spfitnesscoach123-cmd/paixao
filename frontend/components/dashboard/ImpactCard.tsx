import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface ImpactCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradientColors: string[];
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  onPress?: () => void;
}

export const ImpactCard: React.FC<ImpactCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  gradientColors,
  trend,
  trendValue,
  onPress,
}) => {
  const getTrendIcon = () => {
    if (trend === 'up') return 'trending-up';
    if (trend === 'down') return 'trending-down';
    return 'remove';
  };

  const getTrendColor = () => {
    if (trend === 'up') return '#10b981';
    if (trend === 'down') return '#ef4444';
    return '#6b7280';
  };

  const CardContent = (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={32} color="rgba(255,255,255,0.9)" />
      </View>
      
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value}>{value}</Text>
        
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
        
        {trend && trendValue && (
          <View style={styles.trendContainer}>
            <View style={[styles.trendBadge, { backgroundColor: getTrendColor() }]}>
              <Ionicons name={getTrendIcon()} size={12} color="#ffffff" />
              <Text style={styles.trendText}>{trendValue}</Text>
            </View>
          </View>
        )}
      </View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
        {CardContent}
      </TouchableOpacity>
    );
  }

  return <View style={styles.container}>{CardContent}</View>;
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  gradient: {
    padding: 20,
    minHeight: 140,
  },
  iconContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    opacity: 0.3,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  trendContainer: {
    marginTop: 8,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trendText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
