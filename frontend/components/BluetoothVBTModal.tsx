import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Device } from 'react-native-ble-plx';
import { colors } from '../constants/theme';
import { useBluetoothVBT, VBTDeviceType } from '../contexts/BluetoothVBTContext';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDeviceConnected?: () => void;
}

const getDeviceIcon = (type: VBTDeviceType): string => {
  switch (type) {
    case 'push_band': return 'fitness';
    case 'vitruve': return 'speedometer';
    case 'beast': return 'flash';
    default: return 'bluetooth';
  }
};

const getDeviceColor = (type: VBTDeviceType): string => {
  switch (type) {
    case 'push_band': return '#FF6B35';
    case 'vitruve': return '#00D4AA';
    case 'beast': return '#FFD700';
    default: return colors.accent.primary;
  }
};

const getDeviceTypeName = (type: VBTDeviceType): string => {
  switch (type) {
    case 'push_band': return 'PUSH Band 2.0';
    case 'vitruve': return 'Vitruve';
    case 'beast': return 'Beast Sensor';
    default: return 'VBT Device';
  }
};

const identifyDeviceType = (deviceName: string | null): VBTDeviceType => {
  if (!deviceName) return 'unknown';
  const name = deviceName.toUpperCase();
  if (name.includes('PUSH') || name.includes('PB-')) return 'push_band';
  if (name.includes('VITRUVE') || name.includes('VIT-')) return 'vitruve';
  if (name.includes('BEAST') || name.includes('BS-')) return 'beast';
  return 'unknown';
};

export const BluetoothVBTModal: React.FC<Props> = ({ visible, onClose, onDeviceConnected }) => {
  const { locale } = useLanguage();
  const {
    isScanning,
    isBluetoothEnabled,
    discoveredDevices,
    connectedDevice,
    error,
    startScan,
    stopScan,
    connectToDevice,
    disconnectDevice,
  } = useBluetoothVBT();
  
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const t = {
    title: locale === 'pt' ? 'Conectar Dispositivo VBT' : 'Connect VBT Device',
    scanning: locale === 'pt' ? 'Procurando dispositivos...' : 'Scanning for devices...',
    noDevices: locale === 'pt' ? 'Nenhum dispositivo encontrado' : 'No devices found',
    startScan: locale === 'pt' ? 'Iniciar Busca' : 'Start Scan',
    stopScan: locale === 'pt' ? 'Parar Busca' : 'Stop Scan',
    connected: locale === 'pt' ? 'Conectado' : 'Connected',
    connect: locale === 'pt' ? 'Conectar' : 'Connect',
    disconnect: locale === 'pt' ? 'Desconectar' : 'Disconnect',
    bluetoothOff: locale === 'pt' ? 'Bluetooth desligado' : 'Bluetooth is off',
    enableBluetooth: locale === 'pt' ? 'Ative o Bluetooth nas configurações' : 'Enable Bluetooth in settings',
    webNotSupported: locale === 'pt' ? 'Bluetooth não disponível no navegador' : 'Bluetooth not available in browser',
    useApp: locale === 'pt' ? 'Use o app no celular para conectar dispositivos' : 'Use the mobile app to connect devices',
    supportedDevices: locale === 'pt' ? 'Dispositivos Suportados' : 'Supported Devices',
    instructions: locale === 'pt' 
      ? 'Ligue seu dispositivo VBT e certifique-se que está em modo de pareamento.'
      : 'Turn on your VBT device and make sure it\'s in pairing mode.',
  };

  const handleConnect = async (device: Device) => {
    setConnectingId(device.id);
    const success = await connectToDevice(device);
    setConnectingId(null);
    if (success && onDeviceConnected) {
      onDeviceConnected();
    }
  };

  const renderDevice = ({ item }: { item: Device }) => {
    const deviceType = identifyDeviceType(item.name);
    const isConnecting = connectingId === item.id;
    const isConnected = connectedDevice?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.deviceItem, isConnected && styles.deviceItemConnected]}
        onPress={() => isConnected ? disconnectDevice() : handleConnect(item)}
        disabled={isConnecting}
      >
        <View style={[styles.deviceIcon, { backgroundColor: getDeviceColor(deviceType) + '20' }]}>
          <Ionicons 
            name={getDeviceIcon(deviceType) as any} 
            size={24} 
            color={getDeviceColor(deviceType)} 
          />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
          <Text style={styles.deviceType}>{getDeviceTypeName(deviceType)}</Text>
          {item.rssi && (
            <View style={styles.signalContainer}>
              <Ionicons 
                name="cellular" 
                size={12} 
                color={item.rssi > -70 ? colors.status.success : item.rssi > -85 ? colors.status.warning : colors.status.error} 
              />
              <Text style={styles.signalText}>{item.rssi} dBm</Text>
            </View>
          )}
        </View>
        <View style={styles.deviceAction}>
          {isConnecting ? (
            <ActivityIndicator color={colors.accent.primary} />
          ) : isConnected ? (
            <View style={styles.connectedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={colors.status.success} />
              <Text style={styles.connectedText}>{t.connected}</Text>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={24} color={colors.text.secondary} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSupportedDevices = () => (
    <View style={styles.supportedSection}>
      <Text style={styles.supportedTitle}>{t.supportedDevices}</Text>
      <View style={styles.supportedDevices}>
        {[
          { type: 'push_band' as VBTDeviceType, name: 'PUSH Band 2.0' },
          { type: 'vitruve' as VBTDeviceType, name: 'Vitruve' },
          { type: 'beast' as VBTDeviceType, name: 'Beast Sensor' },
        ].map((device) => (
          <View key={device.type} style={styles.supportedDevice}>
            <View style={[styles.supportedIcon, { backgroundColor: getDeviceColor(device.type) + '20' }]}>
              <Ionicons 
                name={getDeviceIcon(device.type) as any} 
                size={20} 
                color={getDeviceColor(device.type)} 
              />
            </View>
            <Text style={styles.supportedName}>{device.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="bluetooth" size={24} color={colors.accent.primary} />
            </View>
            <Text style={styles.title}>{t.title}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {Platform.OS === 'web' ? (
              // Web fallback
              <View style={styles.messageContainer}>
                <Ionicons name="phone-portrait-outline" size={64} color={colors.text.secondary} />
                <Text style={styles.messageTitle}>{t.webNotSupported}</Text>
                <Text style={styles.messageText}>{t.useApp}</Text>
                {renderSupportedDevices()}
              </View>
            ) : !isBluetoothEnabled ? (
              // Bluetooth off
              <View style={styles.messageContainer}>
                <Ionicons name="bluetooth-outline" size={64} color={colors.status.error} />
                <Text style={styles.messageTitle}>{t.bluetoothOff}</Text>
                <Text style={styles.messageText}>{t.enableBluetooth}</Text>
              </View>
            ) : (
              // Bluetooth enabled - show devices
              <>
                <Text style={styles.instructions}>{t.instructions}</Text>
                
                {/* Connected device */}
                {connectedDevice && (
                  <View style={styles.connectedSection}>
                    <View style={[styles.deviceItem, styles.deviceItemConnected]}>
                      <View style={[styles.deviceIcon, { backgroundColor: getDeviceColor(connectedDevice.type) + '20' }]}>
                        <Ionicons 
                          name={getDeviceIcon(connectedDevice.type) as any} 
                          size={24} 
                          color={getDeviceColor(connectedDevice.type)} 
                        />
                      </View>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>{connectedDevice.name}</Text>
                        <Text style={styles.deviceType}>{getDeviceTypeName(connectedDevice.type)}</Text>
                      </View>
                      <TouchableOpacity 
                        style={styles.disconnectButton}
                        onPress={disconnectDevice}
                      >
                        <Text style={styles.disconnectText}>{t.disconnect}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Scan button */}
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={isScanning ? stopScan : startScan}
                >
                  <LinearGradient
                    colors={isScanning ? ['#666', '#444'] : colors.gradients.primary}
                    style={styles.scanGradient}
                  >
                    {isScanning ? (
                      <>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={styles.scanText}>{t.stopScan}</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="search" size={20} color="#fff" />
                        <Text style={styles.scanText}>{t.startScan}</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Device list */}
                {isScanning && discoveredDevices.length === 0 ? (
                  <View style={styles.scanningContainer}>
                    <ActivityIndicator color={colors.accent.primary} />
                    <Text style={styles.scanningText}>{t.scanning}</Text>
                  </View>
                ) : discoveredDevices.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="bluetooth" size={48} color={colors.text.tertiary} />
                    <Text style={styles.emptyText}>{t.noDevices}</Text>
                    {renderSupportedDevices()}
                  </View>
                ) : (
                  <FlatList
                    data={discoveredDevices}
                    renderItem={renderDevice}
                    keyExtractor={(item) => item.id}
                    style={styles.deviceList}
                    showsVerticalScrollIndicator={false}
                  />
                )}

                {/* Error message */}
                {error && (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color={colors.status.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.dark.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  instructions: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  scanButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  scanGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  scanText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  deviceList: {
    maxHeight: 300,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.secondary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  deviceItemConnected: {
    borderColor: colors.status.success,
    backgroundColor: colors.status.success + '10',
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  deviceType: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  signalText: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
  deviceAction: {
    marginLeft: 8,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectedText: {
    fontSize: 12,
    color: colors.status.success,
    fontWeight: '600',
  },
  connectedSection: {
    marginBottom: 16,
  },
  disconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.status.error + '20',
    borderRadius: 8,
  },
  disconnectText: {
    fontSize: 12,
    color: colors.status.error,
    fontWeight: '600',
  },
  scanningContainer: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  scanningText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: 12,
    marginBottom: 24,
  },
  messageContainer: {
    alignItems: 'center',
    padding: 32,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.status.error + '20',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.status.error,
  },
  supportedSection: {
    marginTop: 24,
    width: '100%',
  },
  supportedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  supportedDevices: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  supportedDevice: {
    alignItems: 'center',
  },
  supportedIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  supportedName: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
});

export default BluetoothVBTModal;
