import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { User, AuthResponse } from '../types';

// Simple storage abstraction that works on web and native
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(key);
    } else {
      const SecureStore = await import('expo-secure-store');
      return SecureStore.getItemAsync(key);
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
    } else {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.setItemAsync(key, value);
    }
  },
  deleteItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
    } else {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.deleteItemAsync(key);
    }
  },
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await storage.getItem('access_token');
      if (token) {
        const response = await api.get('/auth/me');
        setUser(response.data);
      } else {
        // No token - ensure cache is clear for fresh start
        queryClient.clear();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      try {
        await storage.deleteItem('access_token');
      } catch (e) {
        // Ignore deletion errors
      }
      // Clear cache on auth failure
      queryClient.clear();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      // Clear any existing cache before login to ensure clean state
      queryClient.clear();
      
      const response = await api.post<AuthResponse>('/auth/login', {
        email,
        password,
      });
      await storage.setItem('access_token', response.data.access_token);
      setUser(response.data.user);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      // Clear any existing cache before registration to ensure clean state
      queryClient.clear();
      
      const response = await api.post<AuthResponse>('/auth/register', {
        email,
        password,
        name,
      });
      await storage.setItem('access_token', response.data.access_token);
      setUser(response.data.user);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  };

  const logout = useCallback(async () => {
    try {
      await storage.deleteItem('access_token');
    } catch (e) {
      // Ignore deletion errors
    }
    
    // CRITICAL: Clear ALL cached data to prevent data leakage between users
    queryClient.clear();
    
    // Also clear AsyncStorage cache keys that might store user-specific data
    try {
      const keys = await AsyncStorage.getAllKeys();
      const userDataKeys = keys.filter(key => 
        key.startsWith('athlete_') || 
        key.startsWith('gps_') || 
        key.startsWith('wellness_') ||
        key.startsWith('assessment_') ||
        key.startsWith('team_') ||
        key.startsWith('dashboard_')
      );
      if (userDataKeys.length > 0) {
        await AsyncStorage.multiRemove(userDataKeys);
      }
    } catch (e) {
      // Ignore AsyncStorage errors
    }
    
    setUser(null);
  }, [queryClient]);

  const updateProfile = async (name: string) => {
    try {
      const response = await api.put('/auth/profile', { name });
      setUser(response.data);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to update profile');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
