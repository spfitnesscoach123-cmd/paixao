import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

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
      // Request PDF from backend
      const response = await api.get(`/reports/athlete/${athleteId}/pdf?lang=${locale}`, {
        responseType: 'blob'
      });
      
      if (Platform.OS === 'web') {
        // For web, create download link
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
      } else {
        // For native platforms, use dynamic imports
        try {
          const FileSystem = await import('expo-file-system');
          const Sharing = await import('expo-sharing');
          
          // Convert blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(response.data);
          reader.onloadend = async () => {
            const base64data = reader.result as string;
            const base64 = base64data.split(',')[1];
            
            const filename = `report_${athleteName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
            const fileUri = `${FileSystem.documentDirectory}${filename}`;
            
            await FileSystem.writeAsStringAsync(fileUri, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            
            const isAvailable = await Sharing.isAvailableAsync();
            
            if (isAvailable) {
              await Sharing.shareAsync(fileUri, {
                mimeType: 'application/pdf',
                dialogTitle: t('reports.shareReport'),
              });
            } else {
              Alert.alert(t('common.success'), `${t('reports.savedTo')}: ${fileUri}`);
            }
          };
        } catch (nativeError) {
          console.log('Native sharing not available:', nativeError);
          Alert.alert(t('common.error'), t('reports.exportError'));
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
