import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../constants/theme';

const ROLE_SELECTED_KEY = 'role_selected';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [checkingRole, setCheckingRole] = useState(true);

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
        router.replace('/role-select');
        return;
      }

      // Role was selected before - check authentication
      if (isAuthenticated) {
        router.replace('/(tabs)/athletes');
      } else {
        // If role is 'coach', go to login; if 'athlete', go to token entry
        if (roleSelected === 'coach') {
          router.replace('/login');
        } else {
          router.replace('/athlete-token');
        }
      }
    } catch (error) {
      // On error, default to role selection
      router.replace('/role-select');
    } finally {
      setCheckingRole(false);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.dark.primary,
  },
});
