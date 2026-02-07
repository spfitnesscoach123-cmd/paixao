import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import api from '../services/api';
import { colors } from '../constants/theme';

interface ExportButtonsProps {
  athleteId: string;
  athleteName?: string;
  locale?: string;
  bodyCompositionId?: string;
  showBodyCompReport?: boolean;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({ 
  athleteId, 
  athleteName = 'Athlete',
  locale = 'pt',
  bodyCompositionId,
  showBodyCompReport = false
}) => {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (type: 'csv' | 'pdf' | 'body-comp-pdf', dataType: string = 'all') => {
    setLoading(type);
    try {
      let endpoint = '';
      let filename = '';
      
      switch (type) {
        case 'csv':
          endpoint = `/reports/athlete/${athleteId}/csv?data_type=${dataType}&lang=${locale}`;
          filename = `${athleteName.replace(/\s+/g, '_')}_${dataType}_export.csv`;
          break;
        case 'pdf':
          endpoint = `/reports/athlete/${athleteId}/pdf?lang=${locale}`;
          filename = `${athleteName.replace(/\s+/g, '_')}_report.pdf`;
          break;
        case 'body-comp-pdf':
          if (!bodyCompositionId) {
            Alert.alert(
              locale === 'pt' ? 'Erro' : 'Error',
              locale === 'pt' ? 'Nenhuma avaliação de composição corporal encontrada' : 'No body composition assessment found'
            );
            setLoading(null);
            return;
          }
          endpoint = `/reports/body-composition/${bodyCompositionId}/pdf?lang=${locale}`;
          filename = `${athleteName.replace(/\s+/g, '_')}_body_composition.pdf`;
          break;
      }
      
      // Get the file URL
      const baseUrl = api.defaults.baseURL?.replace('/api', '') || '';
      const fullUrl = `${baseUrl}/api${endpoint}`;
      
      // Open in browser for download
      if (Platform.OS === 'web') {
        window.open(fullUrl, '_blank');
      } else {
        await Linking.openURL(fullUrl);
      }
      
      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Arquivo exportado com sucesso!' : 'File exported successfully!'
      );
    } catch (error: any) {
      console.error('Export error:', error);
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        error.response?.data?.detail || (locale === 'pt' ? 'Erro ao exportar' : 'Export failed')
      );
    } finally {
      setLoading(null);
    }
  };

  const labels = {
    exportData: locale === 'pt' ? 'Exportar Dados' : 'Export Data',
    csv: locale === 'pt' ? 'CSV (Planilha)' : 'CSV (Spreadsheet)',
    pdf: locale === 'pt' ? 'PDF (Relatório)' : 'PDF (Report)',
    bodyCompPdf: locale === 'pt' ? 'PDF Composição Corporal' : 'Body Comp PDF',
    all: locale === 'pt' ? 'Todos os dados' : 'All data',
    gps: locale === 'pt' ? 'GPS' : 'GPS',
    wellness: 'Wellness',
    strength: locale === 'pt' ? 'Força' : 'Strength',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        <Ionicons name="download-outline" size={16} color={colors.text.secondary} />
        {' '}{labels.exportData}
      </Text>
      
      <View style={styles.buttonsGrid}>
        {/* CSV Export Button */}
        <TouchableOpacity 
          style={styles.exportButton}
          onPress={() => handleExport('csv', 'all')}
          disabled={loading !== null}
        >
          <LinearGradient 
            colors={['#059669', '#047857']} 
            style={styles.exportButtonGradient}
          >
            {loading === 'csv' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="document-text" size={20} color="#fff" />
                <Text style={styles.exportButtonText}>{labels.csv}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        
        {/* PDF Report Button */}
        <TouchableOpacity 
          style={styles.exportButton}
          onPress={() => handleExport('pdf')}
          disabled={loading !== null}
        >
          <LinearGradient 
            colors={['#dc2626', '#b91c1c']} 
            style={styles.exportButtonGradient}
          >
            {loading === 'pdf' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="document" size={20} color="#fff" />
                <Text style={styles.exportButtonText}>{labels.pdf}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        
        {/* Body Composition PDF - only show if available */}
        {showBodyCompReport && (
          <TouchableOpacity 
            style={[styles.exportButton, styles.exportButtonWide]}
            onPress={() => handleExport('body-comp-pdf')}
            disabled={loading !== null}
          >
            <LinearGradient 
              colors={['#7c3aed', '#6d28d9']} 
              style={styles.exportButtonGradient}
            >
              {loading === 'body-comp-pdf' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="body" size={20} color="#fff" />
                  <Text style={styles.exportButtonText}>{labels.bodyCompPdf}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
      
      {/* CSV Data Type Options */}
      <View style={styles.csvOptions}>
        <Text style={styles.csvOptionsLabel}>CSV:</Text>
        {['all', 'gps', 'wellness', 'strength'].map((type) => (
          <TouchableOpacity
            key={type}
            style={styles.csvOption}
            onPress={() => handleExport('csv', type)}
            disabled={loading !== null}
          >
            <Text style={styles.csvOptionText}>
              {labels[type as keyof typeof labels]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 12,
  },
  buttonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  exportButton: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 10,
    overflow: 'hidden',
  },
  exportButtonWide: {
    minWidth: '100%',
  },
  exportButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  csvOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  csvOptionsLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginRight: 4,
  },
  csvOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.dark.secondary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  csvOptionText: {
    fontSize: 11,
    color: colors.text.secondary,
  },
});

export default ExportButtons;
