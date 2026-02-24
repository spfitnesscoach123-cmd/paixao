/**
 * Device ID Service
 * 
 * Generates and persists a unique device identifier for device limit enforcement.
 * Uses IDFV on iOS when available, otherwise generates and persists a UUID.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'loadmanager_device_id';

/**
 * Get or create a persistent device ID
 */
export const getDeviceId = async (): Promise<string> => {
  try {
    // First, check if we already have a stored device ID
    const storedId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (storedId) {
      return storedId;
    }

    let deviceId: string | null = null;

    // Try to get native device identifier
    if (Platform.OS === 'ios') {
      // Use identifierForVendor (IDFV) on iOS
      deviceId = await Application.getIosIdForVendorAsync();
    } else if (Platform.OS === 'android') {
      // Use Android ID
      deviceId = Application.getAndroidId();
    }

    // If no native ID available, generate UUID
    if (!deviceId) {
      deviceId = uuidv4();
    }

    // Persist the device ID
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    
    return deviceId;
  } catch (error) {
    console.error('[DeviceId] Error getting device ID:', error);
    // Fallback: generate and persist UUID
    const fallbackId = uuidv4();
    try {
      await AsyncStorage.setItem(DEVICE_ID_KEY, fallbackId);
    } catch (e) {
      // Ignore storage errors
    }
    return fallbackId;
  }
};

/**
 * Get device name (model/brand)
 */
export const getDeviceName = (): string => {
  try {
    if (Platform.OS === 'web') {
      return 'Web Browser';
    }
    
    const modelName = Device.modelName;
    const brand = Device.brand;
    
    if (modelName) {
      return modelName;
    }
    if (brand) {
      return `${brand} Device`;
    }
    return 'Unknown Device';
  } catch (error) {
    return 'Unknown Device';
  }
};

/**
 * Get platform name
 */
export const getPlatform = (): string => {
  if (Platform.OS === 'ios') {
    return 'iOS';
  } else if (Platform.OS === 'android') {
    return 'Android';
  } else if (Platform.OS === 'web') {
    return 'Web';
  }
  return 'Unknown';
};

/**
 * Get all device info at once
 */
export const getDeviceInfo = async (): Promise<{
  device_id: string;
  device_name: string;
  platform: string;
}> => {
  const device_id = await getDeviceId();
  const device_name = getDeviceName();
  const platform = getPlatform();
  
  return {
    device_id,
    device_name,
    platform,
  };
};
