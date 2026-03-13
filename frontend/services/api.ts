import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// PRODUCTION: Hardcoded Railway URL to prevent build system from overwriting
// The Emergent deployment system was replacing env vars with wrong URLs
const RAILWAY_PRODUCTION_URL = 'https://paixao-production.up.railway.app';

// Use Railway URL directly for production builds
// Only use env var for local development if it points to localhost or the correct Railway URL
const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
const isValidEnvUrl = envUrl && (
  envUrl.includes('localhost') || 
  envUrl.includes('127.0.0.1') ||
  envUrl === RAILWAY_PRODUCTION_URL ||
  envUrl.includes('preview.emergentagent.com')
);

const API_URL = isValidEnvUrl ? envUrl : RAILWAY_PRODUCTION_URL;

// Debug: Log the API URL being used (will appear in device logs)
console.log('[API Config] EXPO_PUBLIC_BACKEND_URL:', envUrl);
console.log('[API Config] Using Railway URL:', RAILWAY_PRODUCTION_URL);
console.log('[API Config] Final API_URL:', API_URL);

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Storage abstraction
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

// Add token to requests
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await storage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      // Ignore storage errors for public routes
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await storage.deleteItem('access_token');
      } catch (e) {
        // Ignore deletion errors
      }
    }
    return Promise.reject(error);
  }
);

export default api;
