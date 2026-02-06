import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import api from '../services/api';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';
import Constants from 'expo-constants';

interface ExportPDFButtonProps {
  athleteId: string;
  athleteName: string;
}

export const ExportPDFButton: React.FC<ExportPDFButtonProps> = ({ athleteId, athleteName }) => {
  const { t, locale } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    setIsExporting(true);
    
    try {
      // Get the backend URL
      const backendUrl = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';
      
      // For web, we can directly open the PDF URL
      if (Platform.OS === 'web') {
        // Get the auth token from api interceptor
        const token = api.defaults.headers.common['Authorization'];
        
        if (token) {
          // Create a temporary form to submit with auth
          const pdfUrl = `${backendUrl}/api/reports/athlete/${athleteId}/pdf?lang=${locale}`;
          
          // Open in new tab with token
          const response = await api.get(`/reports/athlete/${athleteId}/pdf?lang=${locale}`, {
            responseType: 'blob'
          });
          
          // Create blob URL and download
          const blob = new Blob([response.data], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `report_${athleteName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          
          Alert.alert(t('common.success'), t('reports.downloadStarted'));
        }
      } else {
        // For native, download and share
        const response = await api.get(`/reports/athlete/${athleteId}/pdf?lang=${locale}`, {
          responseType: 'arraybuffer'
        });
        
        // Convert to base64
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        
        // Save to file
        const filename = `report_${athleteName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        // Check if sharing is available
        const isAvailable = await Sharing.isAvailableAsync();
        
        if (isAvailable) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/pdf',
            dialogTitle: t('reports.shareReport'),
          });
        } else {
          Alert.alert(t('common.success'), t('reports.savedTo') + `: ${fileUri}`);
        }
      }
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      Alert.alert(t('common.error'), t('reports.exportError'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handleExportPDF}
      disabled={isExporting}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={['#10b981', '#059669']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {isExporting ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Ionicons name="document-text" size={20} color="#ffffff" />
        )}
        <Text style={styles.buttonText}>
          {isExporting ? t('reports.generating') : t('reports.exportPDF')}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 8,
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
