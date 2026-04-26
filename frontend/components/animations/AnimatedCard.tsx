import React, { useRef, useCallback } from 'react';
import { Animated, Pressable, ViewStyle, StyleProp } from 'react-native';

interface AnimatedCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  disabled?: boolean;
  scaleDown?: number;
  duration?: number;
}

/**
 * Animated card wrapper with press physics (scale feedback).
 * Uses RN Animated API for web compatibility.
 */
export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  style,
  onPress,
  onLongPress,
  delayLongPress = 600,
  disabled = false,
  scaleDown = 0.97,
  duration = 140,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: scaleDown,
      duration,
      useNativeDriver: true,
    }).start();
  }, [scaleDown, duration]);

  const handlePressOut = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: duration + 40,
      useNativeDriver: true,
    }).start();
  }, [duration]);

  if (disabled || (!onPress && !onLongPress)) {
    return (
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};
