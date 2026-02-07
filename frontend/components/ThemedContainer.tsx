import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  gradient?: boolean;
}

export const ThemedContainer: React.FC<ThemedContainerProps> = ({ 
  children, 
  style,
  gradient = true 
}) => {
  const { colors, isDark } = useTheme();

  if (gradient) {
    return (
      <LinearGradient
        colors={colors.gradients.background}
        style={[styles.container, style]}
      >
        {children}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.dark.primary }, style]}>
      {children}
    </View>
  );
};

export const ThemedCard: React.FC<ThemedContainerProps> = ({ 
  children, 
  style 
}) => {
  const { colors } = useTheme();

  return (
    <View style={[
      styles.card, 
      { 
        backgroundColor: colors.dark.cardSolid,
        borderColor: colors.border.default,
      }, 
      style
    ]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
});
