import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../constants/theme';

const ROLE_SELECTED_KEY = 'role_selected';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    checkRoleAndRedirect();
  }, [isAuthenticated, isLoading]);

  const checkRoleAndRedirect = async () => {
    if (isLoading) return;

    try {
      // Check if user has already selected a role
      const roleSelected = await AsyncStorage.getItem(ROLE_SELECTED_KEY);

      if (!roleSelected) {
        // First time opening the app - show role selection
        setRedirectTo('/role-select');
        return;
      }

      // Role was selected before - check authentication
      if (isAuthenticated) {
        setRedirectTo('/(tabs)/athletes');
      } else {
        // If role is 'coach', go to login; if 'athlete', go to token entry
        if (roleSelected === 'coach') {
          setRedirectTo('/login');
        } else {
          setRedirectTo('/athlete-token');
        }
      }
    } catch (error) {
      // On error, default to role selection
      setRedirectTo('/role-select');
    } finally {
      setIsChecking(false);
    }
  };

  // Show loading while checking
  if (isLoading || isChecking || !redirectTo) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  // Use Redirect component for navigation
  return <Redirect href={redirectTo as any} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
  },
});
