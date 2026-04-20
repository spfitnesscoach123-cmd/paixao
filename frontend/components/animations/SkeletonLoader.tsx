import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, ViewStyle, StyleProp } from 'react-native';
import { colors } from '../../constants/theme';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Single skeleton bar with shimmer animation.
 */
export const SkeletonBar: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.6, 0.3],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: 'rgba(124, 255, 58, 0.12)',
          opacity,
        },
        style,
      ]}
    />
  );
};

/**
 * Card skeleton layout - mimics a metric card.
 */
export const SkeletonCard: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => (
  <View style={[skStyles.card, style]}>
    <SkeletonBar width="40%" height={12} style={{ marginBottom: 10 }} />
    <SkeletonBar width="60%" height={28} style={{ marginBottom: 8 }} />
    <SkeletonBar width="80%" height={10} />
  </View>
);

/**
 * Dashboard skeleton layout - multiple cards + chart area.
 */
export const SkeletonDashboard: React.FC = () => (
  <View style={skStyles.container}>
    <View style={skStyles.row}>
      <SkeletonCard style={{ flex: 1, marginRight: 8 }} />
      <SkeletonCard style={{ flex: 1, marginLeft: 8 }} />
    </View>
    <View style={skStyles.chartSkeleton}>
      <SkeletonBar width="30%" height={12} style={{ marginBottom: 16 }} />
      <SkeletonBar width="100%" height={140} borderRadius={12} />
    </View>
    <View style={skStyles.row}>
      <SkeletonCard style={{ flex: 1, marginRight: 8 }} />
      <SkeletonCard style={{ flex: 1, marginLeft: 8 }} />
    </View>
  </View>
);

/**
 * List skeleton - mimics a list of items.
 */
export const SkeletonList: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <View style={skStyles.container}>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={skStyles.listItem}>
        <SkeletonBar width={44} height={44} borderRadius={22} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <SkeletonBar width="70%" height={14} style={{ marginBottom: 8 }} />
          <SkeletonBar width="40%" height={10} />
        </View>
      </View>
    ))}
  </View>
);

/**
 * Profile skeleton - for athlete profile loading.
 */
export const SkeletonProfile: React.FC = () => (
  <View style={skStyles.container}>
    <View style={{ alignItems: 'center', marginBottom: 20 }}>
      <SkeletonBar width={80} height={80} borderRadius={40} />
      <SkeletonBar width="50%" height={18} style={{ marginTop: 12 }} />
      <SkeletonBar width="30%" height={12} style={{ marginTop: 8 }} />
    </View>
    <View style={skStyles.row}>
      <SkeletonCard style={{ flex: 1, marginRight: 8 }} />
      <SkeletonCard style={{ flex: 1, marginLeft: 8 }} />
    </View>
    <SkeletonBar width="100%" height={100} borderRadius={12} style={{ marginTop: 12 }} />
  </View>
);

const skStyles = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: 'row', marginBottom: 12 },
  card: {
    backgroundColor: 'rgba(21, 28, 50, 0.6)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(124, 255, 58, 0.08)',
  },
  chartSkeleton: {
    backgroundColor: 'rgba(21, 28, 50, 0.6)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(124, 255, 58, 0.08)',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
});
