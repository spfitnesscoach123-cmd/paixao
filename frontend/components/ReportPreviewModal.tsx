import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import api from '../services/api';
import { colors } from '../constants/theme';

interface ReportPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  reportType: 'pdf' | 'csv' | 'body-comp-pdf';
  athleteId: string;
  athleteName: string;
  bodyCompositionId?: string;
  locale?: string;
}

interface ReportPreviewData {
  summary: {
    athlete_name: string;
    generated_at: string;
    total_sessions?: number;
    total_wellness_records?: number;
    period?: string;
  };
  gps_summary?: {
    avg_distance: number;
    max_speed: number;
    total_sprints: number;
    avg_hsr: number;
  };
  wellness_summary?: {
    avg_readiness: number;
    avg_sleep_hours: number;
    avg_fatigue: number;
    avg_stress: number;
  };
  body_composition?: {
    date: string;
    body_fat_percentage: number;
    lean_mass_kg: number;
    fat_mass_kg: number;
    bmi: number;
    bmi_classification: string;
  };
  csv_preview?: {
    headers: string[];
    sample_rows: string[][];
    total_rows: number;
  };
}

const { width: screenWidth } = Dimensions.get('window');

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  visible,
  onClose,
  reportType,
  athleteId,
  athleteName,
  bodyCompositionId,
  locale = 'pt',
}) => {
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState<ReportPreviewData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = {
    preview: locale === 'pt' ? 'Pré-visualização do Relatório' : 'Report Preview',
    loading: locale === 'pt' ? 'Carregando preview...' : 'Loading preview...',
    download: locale === 'pt' ? 'Baixar Relatório' : 'Download Report',
    close: locale === 'pt' ? 'Fechar' : 'Close',
    generatedAt: locale === 'pt' ? 'Gerado em' : 'Generated at',
    totalSessions: locale === 'pt' ? 'Total de Sessões GPS' : 'Total GPS Sessions',
    totalWellness: locale === 'pt' ? 'Registros de Wellness' : 'Wellness Records',
    period: locale === 'pt' ? 'Período' : 'Period',
    gpsSummary: locale === 'pt' ? 'Resumo GPS' : 'GPS Summary',
    wellnessSummary: locale === 'pt' ? 'Resumo Wellness' : 'Wellness Summary',
    bodyComposition: locale === 'pt' ? 'Composição Corporal' : 'Body Composition',
    avgDistance: locale === 'pt' ? 'Distância Média' : 'Avg Distance',
    maxSpeed: locale === 'pt' ? 'Velocidade Máxima' : 'Max Speed',
    totalSprints: locale === 'pt' ? 'Total de Sprints' : 'Total Sprints',
    avgHsr: locale === 'pt' ? 'HSR Médio' : 'Avg HSR',
    avgReadiness: locale === 'pt' ? 'Prontidão Média' : 'Avg Readiness',
    avgSleep: locale === 'pt' ? 'Sono Médio' : 'Avg Sleep',
    avgFatigue: locale === 'pt' ? 'Fadiga Média' : 'Avg Fatigue',
    avgStress: locale === 'pt' ? 'Estresse Médio' : 'Avg Stress',
    bodyFat: locale === 'pt' ? '% Gordura' : 'Body Fat %',
    leanMass: locale === 'pt' ? 'Massa Magra' : 'Lean Mass',
    fatMass: locale === 'pt' ? 'Massa Gorda' : 'Fat Mass',
    csvPreview: locale === 'pt' ? 'Preview dos Dados (CSV)' : 'Data Preview (CSV)',
    totalRows: locale === 'pt' ? 'Total de linhas' : 'Total rows',
    errorLoading: locale === 'pt' ? 'Erro ao carregar preview' : 'Error loading preview',
    noData: locale === 'pt' ? 'Sem dados disponíveis' : 'No data available',
  };

  useEffect(() => {
    if (visible) {
      loadPreviewData();
    }
  }, [visible, reportType, athleteId, bodyCompositionId]);

  const loadPreviewData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let endpoint = '';
      
      switch (reportType) {
        case 'pdf':
          endpoint = `/reports/athlete/${athleteId}/preview?lang=${locale}`;
          break;
        case 'csv':
          endpoint = `/reports/athlete/${athleteId}/csv-preview?lang=${locale}`;
          break;
        case 'body-comp-pdf':
          if (!bodyCompositionId) {
            setError(labels.noData);
            setLoading(false);
            return;
          }
          endpoint = `/reports/body-composition/${bodyCompositionId}/preview?lang=${locale}`;
          break;
      }
      
      const response = await api.get(endpoint);
      setPreviewData(response.data);
    } catch (err: any) {
      console.error('Preview error:', err);
      setError(err.response?.data?.detail || labels.errorLoading);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    
    try {
      let endpoint = '';
      
      switch (reportType) {
        case 'pdf':
          endpoint = `/reports/athlete/${athleteId}/pdf?lang=${locale}`;
          break;
        case 'csv':
          endpoint = `/reports/athlete/${athleteId}/csv?data_type=all&lang=${locale}`;
          break;
        case 'body-comp-pdf':
          endpoint = `/reports/body-composition/${bodyCompositionId}/pdf?lang=${locale}`;
          break;
      }
      
      const baseUrl = api.defaults.baseURL?.replace('/api', '') || '';
      const fullUrl = `${baseUrl}/api${endpoint}`;
      
      if (Platform.OS === 'web') {
        window.open(fullUrl, '_blank');
      } else {
        await Linking.openURL(fullUrl);
      }
      
      onClose();
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const renderPDFPreview = () => {
    if (!previewData) return null;
    
    return (
      <ScrollView style={styles.previewContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>{athleteName}</Text>
          <Text style={styles.previewSubtitle}>
            {labels.generatedAt}: {previewData.summary.generated_at}
          </Text>
          {previewData.summary.period && (
            <Text style={styles.previewPeriod}>{labels.period}: {previewData.summary.period}</Text>
          )}
        </View>
        
        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          {previewData.summary.total_sessions !== undefined && (
            <View style={styles.statCard}>
              <Ionicons name="location" size={24} color="#10b981" />
              <Text style={styles.statValue}>{previewData.summary.total_sessions}</Text>
              <Text style={styles.statLabel}>{labels.totalSessions}</Text>
            </View>
          )}
          {previewData.summary.total_wellness_records !== undefined && (
            <View style={styles.statCard}>
              <Ionicons name="heart" size={24} color="#f59e0b" />
              <Text style={styles.statValue}>{previewData.summary.total_wellness_records}</Text>
              <Text style={styles.statLabel}>{labels.totalWellness}</Text>
            </View>
          )}
        </View>
        
        {/* GPS Summary */}
        {previewData.gps_summary && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="speedometer" size={16} color={colors.accent.primary} />
              {' '}{labels.gpsSummary}
            </Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.gps_summary.avg_distance.toFixed(0)}m</Text>
                <Text style={styles.metricLabel}>{labels.avgDistance}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.gps_summary.max_speed.toFixed(1)} km/h</Text>
                <Text style={styles.metricLabel}>{labels.maxSpeed}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.gps_summary.total_sprints}</Text>
                <Text style={styles.metricLabel}>{labels.totalSprints}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.gps_summary.avg_hsr.toFixed(0)}m</Text>
                <Text style={styles.metricLabel}>{labels.avgHsr}</Text>
              </View>
            </View>
          </View>
        )}
        
        {/* Wellness Summary */}
        {previewData.wellness_summary && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="heart" size={16} color="#ef4444" />
              {' '}{labels.wellnessSummary}
            </Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={[styles.metricValue, { color: previewData.wellness_summary.avg_readiness >= 7 ? '#10b981' : '#f59e0b' }]}>
                  {previewData.wellness_summary.avg_readiness.toFixed(1)}
                </Text>
                <Text style={styles.metricLabel}>{labels.avgReadiness}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.wellness_summary.avg_sleep_hours.toFixed(1)}h</Text>
                <Text style={styles.metricLabel}>{labels.avgSleep}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.wellness_summary.avg_fatigue.toFixed(1)}</Text>
                <Text style={styles.metricLabel}>{labels.avgFatigue}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.wellness_summary.avg_stress.toFixed(1)}</Text>
                <Text style={styles.metricLabel}>{labels.avgStress}</Text>
              </View>
            </View>
          </View>
        )}
        
        {/* Body Composition */}
        {previewData.body_composition && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="body" size={16} color="#7c3aed" />
              {' '}{labels.bodyComposition}
            </Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={[styles.metricValue, { color: '#f59e0b' }]}>
                  {previewData.body_composition.body_fat_percentage.toFixed(1)}%
                </Text>
                <Text style={styles.metricLabel}>{labels.bodyFat}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={[styles.metricValue, { color: '#10b981' }]}>
                  {previewData.body_composition.lean_mass_kg.toFixed(1)} kg
                </Text>
                <Text style={styles.metricLabel}>{labels.leanMass}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.body_composition.fat_mass_kg.toFixed(1)} kg</Text>
                <Text style={styles.metricLabel}>{labels.fatMass}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{previewData.body_composition.bmi.toFixed(1)}</Text>
                <Text style={styles.metricLabel}>BMI</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderCSVPreview = () => {
    if (!previewData?.csv_preview) return null;
    
    return (
      <ScrollView style={styles.previewContent} showsVerticalScrollIndicator={false}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>{athleteName}</Text>
          <Text style={styles.previewSubtitle}>{labels.csvPreview}</Text>
          <Text style={styles.previewPeriod}>
            {labels.totalRows}: {previewData.csv_preview.total_rows}
          </Text>
        </View>
        
        {/* CSV Table Preview */}
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.csvTable}>
            {/* Headers */}
            <View style={styles.csvRow}>
              {previewData.csv_preview.headers.map((header, i) => (
                <View key={i} style={[styles.csvCell, styles.csvHeaderCell]}>
                  <Text style={styles.csvHeaderText} numberOfLines={1}>
                    {header}
                  </Text>
                </View>
              ))}
            </View>
            
            {/* Sample Rows */}
            {previewData.csv_preview.sample_rows.map((row, rowIndex) => (
              <View key={rowIndex} style={[styles.csvRow, rowIndex % 2 === 1 && styles.csvRowAlternate]}>
                {row.map((cell, cellIndex) => (
                  <View key={cellIndex} style={styles.csvCell}>
                    <Text style={styles.csvCellText} numberOfLines={1}>
                      {cell}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleContainer}>
              <Ionicons 
                name={reportType === 'csv' ? 'document-text' : 'document'} 
                size={24} 
                color={reportType === 'csv' ? '#10b981' : '#dc2626'} 
              />
              <Text style={styles.modalTitle}>{labels.preview}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          
          {/* Content */}
          <View style={styles.contentContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent.primary} />
                <Text style={styles.loadingText}>{labels.loading}</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color="#ef4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              reportType === 'csv' ? renderCSVPreview() : renderPDFPreview()
            )}
          </View>
          
          {/* Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>{labels.close}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.downloadButton, (loading || error) && styles.downloadButtonDisabled]}
              onPress={handleDownload}
              disabled={loading || !!error || downloading}
            >
              <LinearGradient
                colors={reportType === 'csv' ? ['#059669', '#047857'] : ['#dc2626', '#b91c1c']}
                style={styles.downloadButtonGradient}
              >
                {downloading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="download" size={20} color="#fff" />
                    <Text style={styles.downloadButtonText}>{labels.download}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.dark.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  closeButton: {
    padding: 4,
  },
  contentContainer: {
    flex: 1,
    minHeight: 300,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  previewContent: {
    flex: 1,
    padding: 20,
  },
  previewHeader: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  previewSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  previewPeriod: {
    fontSize: 12,
    color: colors.accent.primary,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.secondary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  csvTable: {
    marginTop: 12,
  },
  csvRow: {
    flexDirection: 'row',
  },
  csvRowAlternate: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  csvCell: {
    width: 100,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  csvHeaderCell: {
    backgroundColor: colors.accent.primary,
  },
  csvHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  csvCellText: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.dark.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  downloadButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  downloadButtonDisabled: {
    opacity: 0.5,
  },
  downloadButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default ReportPreviewModal;
