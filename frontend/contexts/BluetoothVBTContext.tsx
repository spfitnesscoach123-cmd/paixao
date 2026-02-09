import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';

// Conditional import for BLE - only on native platforms
let BleManager: any = null;
let State: any = { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff' };

// We'll dynamically import on native platforms
const initBLE = async () => {
  if (Platform.OS !== 'web') {
    try {
      const ble = await import('react-native-ble-plx');
      BleManager = ble.BleManager;
      State = ble.State;
      return true;
    } catch (e) {
      console.warn('BLE not available:', e);
      return false;
    }
  }
  return false;
};

// Type definitions (since we can't import them directly)
type Device = any;
type Characteristic = any;

// VBT Device Types
export type VBTDeviceType = 'push_band' | 'vitruve' | 'beast' | 'unknown';

// VBT Data from device
export interface VBTReading {
  timestamp: number;
  meanVelocity: number;      // m/s
  peakVelocity: number;      // m/s
  power: number;             // watts
  rom: number;               // cm (range of motion)
  reps: number;
  loadKg?: number;
}

// Connected device info
export interface ConnectedVBTDevice {
  id: string;
  name: string;
  type: VBTDeviceType;
  rssi: number;
  isConnected: boolean;
  batteryLevel?: number;
}

// Device identification patterns
const DEVICE_PATTERNS: Record<VBTDeviceType, { namePatterns: string[], serviceUUIDs: string[] }> = {
  push_band: {
    namePatterns: ['PUSH', 'Push Band', 'PB-'],
    serviceUUIDs: ['0000fff0-0000-1000-8000-00805f9b34fb'],
  },
  vitruve: {
    namePatterns: ['Vitruve', 'VIT-', 'VITRUVE'],
    serviceUUIDs: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'], // Nordic UART service common in encoders
  },
  beast: {
    namePatterns: ['Beast', 'BEAST', 'BS-'],
    serviceUUIDs: ['0000ffe0-0000-1000-8000-00805f9b34fb'],
  },
  unknown: {
    namePatterns: [],
    serviceUUIDs: [],
  },
};

// Common VBT characteristic UUIDs (generic patterns)
const VBT_CHARACTERISTICS = {
  velocity: '0000fff1-0000-1000-8000-00805f9b34fb',
  power: '0000fff2-0000-1000-8000-00805f9b34fb',
  battery: '00002a19-0000-1000-8000-00805f9b34fb', // Standard battery level
  notify: '0000fff4-0000-1000-8000-00805f9b34fb',
};

interface BluetoothVBTContextType {
  // State
  isScanning: boolean;
  isBluetoothEnabled: boolean;
  discoveredDevices: Device[];
  connectedDevice: ConnectedVBTDevice | null;
  lastReading: VBTReading | null;
  liveReadings: VBTReading[];
  error: string | null;
  
  // Actions
  startScan: () => Promise<void>;
  stopScan: () => void;
  connectToDevice: (device: Device) => Promise<boolean>;
  disconnectDevice: () => Promise<void>;
  clearReadings: () => void;
  setManualReading: (reading: Partial<VBTReading>) => void;
}

const BluetoothVBTContext = createContext<BluetoothVBTContextType | null>(null);

export const useBluetoothVBT = () => {
  const context = useContext(BluetoothVBTContext);
  if (!context) {
    throw new Error('useBluetoothVBT must be used within BluetoothVBTProvider');
  }
  return context;
};

interface Props {
  children: React.ReactNode;
}

export const BluetoothVBTProvider: React.FC<Props> = ({ children }) => {
  const bleManagerRef = useRef<BleManager | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<ConnectedVBTDevice | null>(null);
  const [lastReading, setLastReading] = useState<VBTReading | null>(null);
  const [liveReadings, setLiveReadings] = useState<VBTReading[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize BLE Manager
  useEffect(() => {
    // Skip BLE initialization on web
    if (Platform.OS === 'web') {
      setError('Bluetooth não disponível no navegador');
      return;
    }

    bleManagerRef.current = new BleManager();
    
    const subscription = bleManagerRef.current.onStateChange((state) => {
      setIsBluetoothEnabled(state === State.PoweredOn);
      if (state === State.PoweredOff) {
        setError('Bluetooth desligado');
      } else {
        setError(null);
      }
    }, true);

    return () => {
      subscription.remove();
      bleManagerRef.current?.destroy();
    };
  }, []);

  // Identify device type from name
  const identifyDeviceType = (deviceName: string | null): VBTDeviceType => {
    if (!deviceName) return 'unknown';
    
    for (const [type, config] of Object.entries(DEVICE_PATTERNS)) {
      if (type === 'unknown') continue;
      for (const pattern of config.namePatterns) {
        if (deviceName.toUpperCase().includes(pattern.toUpperCase())) {
          return type as VBTDeviceType;
        }
      }
    }
    return 'unknown';
  };

  // Request permissions (Android)
  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        
        return Object.values(granted).every(
          (status) => status === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        console.error('Permission error:', err);
        return false;
      }
    }
    return true; // iOS handles permissions differently
  };

  // Start scanning for VBT devices
  const startScan = useCallback(async () => {
    if (!bleManagerRef.current) {
      setError('Bluetooth não inicializado');
      return;
    }

    if (Platform.OS === 'web') {
      setError('Bluetooth não disponível no navegador. Use o app no celular.');
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      setError('Permissões de Bluetooth negadas');
      Alert.alert(
        'Permissões Necessárias',
        'Para conectar dispositivos VBT, permita acesso ao Bluetooth e Localização nas configurações.'
      );
      return;
    }

    setIsScanning(true);
    setDiscoveredDevices([]);
    setError(null);

    // Collect service UUIDs from all device types
    const allServiceUUIDs = Object.values(DEVICE_PATTERNS)
      .flatMap(config => config.serviceUUIDs)
      .filter(uuid => uuid.length > 0);

    bleManagerRef.current.startDeviceScan(
      allServiceUUIDs.length > 0 ? allServiceUUIDs : null,
      { allowDuplicates: false },
      (scanError, device) => {
        if (scanError) {
          console.error('Scan error:', scanError);
          setError(`Erro no scan: ${scanError.message}`);
          setIsScanning(false);
          return;
        }

        if (device && device.name) {
          const deviceType = identifyDeviceType(device.name);
          
          // Only add VBT devices or devices with relevant names
          if (deviceType !== 'unknown' || 
              device.name.toLowerCase().includes('vbt') ||
              device.name.toLowerCase().includes('velocity')) {
            setDiscoveredDevices((prev) => {
              const exists = prev.some((d) => d.id === device.id);
              if (!exists) {
                return [...prev, device];
              }
              return prev;
            });
          }
        }
      }
    );

    // Auto-stop after 15 seconds
    setTimeout(() => {
      stopScan();
    }, 15000);
  }, []);

  // Stop scanning
  const stopScan = useCallback(() => {
    bleManagerRef.current?.stopDeviceScan();
    setIsScanning(false);
  }, []);

  // Parse VBT data from characteristic value
  const parseVBTData = (value: string | null, deviceType: VBTDeviceType): Partial<VBTReading> => {
    if (!value) return {};
    
    try {
      // Decode base64 to bytes
      const bytes = Buffer.from(value, 'base64');
      
      // Different devices have different data formats
      // This is a generic parser - real implementation would need device-specific parsing
      switch (deviceType) {
        case 'push_band':
          // PUSH Band typically sends velocity as 16-bit integer (mm/s)
          if (bytes.length >= 4) {
            const meanVelocity = bytes.readUInt16LE(0) / 1000; // Convert mm/s to m/s
            const peakVelocity = bytes.readUInt16LE(2) / 1000;
            return { meanVelocity, peakVelocity };
          }
          break;
        case 'vitruve':
          // Vitruve encoder format
          if (bytes.length >= 8) {
            const meanVelocity = bytes.readFloatLE(0);
            const power = bytes.readFloatLE(4);
            return { meanVelocity, power };
          }
          break;
        case 'beast':
          // Beast sensor format
          if (bytes.length >= 6) {
            const meanVelocity = bytes.readUInt16LE(0) / 1000;
            const power = bytes.readUInt16LE(2);
            const reps = bytes.readUInt16LE(4);
            return { meanVelocity, power, reps };
          }
          break;
      }
    } catch (err) {
      console.error('Error parsing VBT data:', err);
    }
    
    return {};
  };

  // Connect to a device
  const connectToDevice = useCallback(async (device: Device): Promise<boolean> => {
    if (!bleManagerRef.current) return false;

    stopScan();
    setError(null);

    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      
      const deviceType = identifyDeviceType(device.name);
      
      setConnectedDevice({
        id: device.id,
        name: device.name || 'VBT Device',
        type: deviceType,
        rssi: device.rssi || -100,
        isConnected: true,
      });

      // Set up notifications for VBT data
      const services = await connected.services();
      
      for (const service of services) {
        const characteristics = await service.characteristics();
        
        for (const char of characteristics) {
          if (char.isNotifiable) {
            char.monitor((charError, characteristic) => {
              if (charError) {
                console.error('Characteristic error:', charError);
                return;
              }
              
              if (characteristic?.value) {
                const parsedData = parseVBTData(characteristic.value, deviceType);
                
                if (parsedData.meanVelocity !== undefined) {
                  const reading: VBTReading = {
                    timestamp: Date.now(),
                    meanVelocity: parsedData.meanVelocity || 0,
                    peakVelocity: parsedData.peakVelocity || parsedData.meanVelocity || 0,
                    power: parsedData.power || 0,
                    rom: parsedData.rom || 0,
                    reps: parsedData.reps || 1,
                  };
                  
                  setLastReading(reading);
                  setLiveReadings((prev) => [...prev.slice(-50), reading]); // Keep last 50 readings
                }
              }
            });
          }
        }
      }

      // Monitor disconnection
      device.onDisconnected(() => {
        setConnectedDevice(null);
        setError('Dispositivo desconectado');
      });

      return true;
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(`Erro ao conectar: ${err.message}`);
      return false;
    }
  }, [stopScan]);

  // Disconnect from device
  const disconnectDevice = useCallback(async () => {
    if (!bleManagerRef.current || !connectedDevice) return;

    try {
      await bleManagerRef.current.cancelDeviceConnection(connectedDevice.id);
      setConnectedDevice(null);
    } catch (err: any) {
      console.error('Disconnect error:', err);
    }
  }, [connectedDevice]);

  // Clear readings
  const clearReadings = useCallback(() => {
    setLiveReadings([]);
    setLastReading(null);
  }, []);

  // Set manual reading (for manual input mode)
  const setManualReading = useCallback((reading: Partial<VBTReading>) => {
    const fullReading: VBTReading = {
      timestamp: Date.now(),
      meanVelocity: reading.meanVelocity || 0,
      peakVelocity: reading.peakVelocity || reading.meanVelocity || 0,
      power: reading.power || 0,
      rom: reading.rom || 0,
      reps: reading.reps || 1,
      loadKg: reading.loadKg,
    };
    
    setLastReading(fullReading);
    setLiveReadings((prev) => [...prev, fullReading]);
  }, []);

  const value: BluetoothVBTContextType = {
    isScanning,
    isBluetoothEnabled,
    discoveredDevices,
    connectedDevice,
    lastReading,
    liveReadings,
    error,
    startScan,
    stopScan,
    connectToDevice,
    disconnectDevice,
    clearReadings,
    setManualReading,
  };

  return (
    <BluetoothVBTContext.Provider value={value}>
      {children}
    </BluetoothVBTContext.Provider>
  );
};

export default BluetoothVBTContext;
