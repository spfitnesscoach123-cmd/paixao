import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import api from '../services/api';
import { colors } from '../constants/theme';
import { ReportPreviewModal } from './ReportPreviewModal';

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
  const [previewModal, setPreviewModal] = useState<{
    visible: boolean;
    type: 'pdf' | 'csv' | 'body-comp-pdf';
  }>({ visible: false, type: 'pdf' });

  const handleDirectExport = async (type: 'csv' | 'pdf' | 'body-comp-pdf', dataType: string = 'all') => {
    setLoading(type);
    try {
      let endpoint = '';
      
      switch (type) {
        case 'csv':
          endpoint = `/reports/athlete/${athleteId}/csv?data_type=${dataType}&lang=${locale}`;
          break;
        case 'pdf':
          endpoint = `/reports/athlete/${athleteId}/pdf?lang=${locale}`;
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

  const openPreview = (type: 'pdf' | 'csv' | 'body-comp-pdf') => {
    setPreviewModal({ visible: true, type });
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
    preview: locale === 'pt' ? 'Visualizar antes de baixar' : 'Preview before download',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        <Ionicons name="download-outline" size={16} color={colors.text.secondary} />
        {' '}{labels.exportData}
      </Text>
      
      <Text style={styles.previewHint}>
        <Ionicons name="eye-outline" size={12} color={colors.text.tertiary} />
        {' '}{labels.preview}
      </Text>
      
      <View style={styles.buttonsGrid}>
        {/* CSV Export Button with Preview */}
        <TouchableOpacity 
          style={styles.exportButton}
          onPress={() => openPreview('csv')}
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
                <Ionicons name="eye" size={16} color="rgba(255,255,255,0.7)" style={{ marginRight: -4 }} />
                <Ionicons name="document-text" size={20} color="#fff" />
                <Text style={styles.exportButtonText}>{labels.csv}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        
        {/* PDF Report Button with Preview */}
        <TouchableOpacity 
          style={styles.exportButton}
          onPress={() => openPreview('pdf')}
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
                <Ionicons name="eye" size={16} color="rgba(255,255,255,0.7)" style={{ marginRight: -4 }} />
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
            onPress={() => openPreview('body-comp-pdf')}
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
                  <Ionicons name="eye" size={16} color="rgba(255,255,255,0.7)" style={{ marginRight: -4 }} />
                  <Ionicons name="body" size={20} color="#fff" />
                  <Text style={styles.exportButtonText}>{labels.bodyCompPdf}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
      
      {/* CSV Data Type Options (Direct download) */}
      <View style={styles.csvOptions}>
        <Text style={styles.csvOptionsLabel}>{locale === 'pt' ? 'Download direto CSV:' : 'Direct CSV download:'}</Text>
        {['all', 'gps', 'wellness', 'strength'].map((type) => (
          <TouchableOpacity
            key={type}
            style={styles.csvOption}
            onPress={() => handleDirectExport('csv', type)}
            disabled={loading !== null}
          >
            <Text style={styles.csvOptionText}>
              {labels[type as keyof typeof labels]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Preview Modal */}
      <ReportPreviewModal
        visible={previewModal.visible}
        onClose={() => setPreviewModal({ ...previewModal, visible: false })}
        reportType={previewModal.type}
        athleteId={athleteId}
        athleteName={athleteName}
        bodyCompositionId={bodyCompositionId}
        locale={locale}
      />
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
    marginBottom: 4,
  },
  previewHint: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginBottom: 12,
    fontStyle: 'italic',
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
