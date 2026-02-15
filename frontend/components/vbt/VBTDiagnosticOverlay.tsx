/**
 * VBT Diagnostic Overlay Component
 * 
 * Displays real-time diagnostic information on screen during VBT recording.
 * Shows all protection layer statuses, thresholds, and blocking reasons.
 * 
 * IMPORTANT: Also shows MediaPipe frame reception status to help diagnose
 * the "Waiting for first frame" issue.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { vbtDiagnostics, VBTDiagnosticFrame, BlockingDiagnosis } from '../../services/vbt/diagnostics';

interface DiagnosticOverlayProps {
  visible?: boolean;
  compact?: boolean;
  onClose?: () => void;
  /** Number of frames received from MediaPipe */
  frameCount?: number;
  /** Is MediaPipe available */
  mediapipeAvailable?: boolean;
  /** Current platform */
  currentPlatform?: string;
}

export const VBTDiagnosticOverlay: React.FC<DiagnosticOverlayProps> = ({
  visible = true,
  compact = false,
  onClose,
}) => {
  const [diagnosticData, setDiagnosticData] = useState<VBTDiagnosticFrame | null>(null);
  const [blockingDiagnosis, setBlockingDiagnosis] = useState<BlockingDiagnosis | null>(null);
  
  useEffect(() => {
    // Subscribe to diagnostic updates
    const unsubscribe = vbtDiagnostics.subscribe((diag) => {
      setDiagnosticData(diag);
      setBlockingDiagnosis(vbtDiagnostics.getBlockingDiagnosis());
    });
    
    return () => unsubscribe();
  }, []);
  
  if (!visible) return null;
  
  const overlayData = vbtDiagnostics.getOverlayData();
  
  const getStatusColor = (status: string): string => {
    if (status === 'PASS' || status === 'ALLOWED' || status === 'SET') return '#10b981';
    if (status === 'FAIL' || status === 'BLOCKED' || status === 'NOT SET') return '#ef4444';
    if (status === 'SKIP') return '#6b7280';
    return '#f59e0b';
  };
  
  const getStateColor = (state: string): string => {
    switch (state) {
      case 'executing': return '#10b981';
      case 'ready': return '#f59e0b';
      case 'noHuman': return '#ef4444';
      default: return '#6b7280';
    }
  };
  
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <Text style={[styles.compactLabel, { color: getStateColor(overlayData.currentState) }]}>
            {overlayData.currentState.toUpperCase()}
          </Text>
          <Text style={[styles.compactValue, { color: getStatusColor(overlayData.trackingPoint) }]}>
            TP: {overlayData.trackingPoint}
          </Text>
          <Text style={[styles.compactValue, { color: getStatusColor(overlayData.humanPresence) }]}>
            HP: {overlayData.humanPresence}
          </Text>
          <Text style={[styles.compactValue, { color: getStatusColor(overlayData.recording) }]}>
            REC: {overlayData.recording}
          </Text>
        </View>
        {overlayData.blockedBy !== 'NONE' && (
          <View style={styles.compactBlockedRow}>
            <Text style={styles.compactBlockedText}>
              BLOCKED: {overlayData.blockedBy}
            </Text>
          </View>
        )}
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>VBT DIAGNOSTIC</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>X</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current State */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>CURRENT STATE:</Text>
            <View style={[styles.stateBadge, { backgroundColor: getStateColor(overlayData.currentState) }]}>
              <Text style={styles.stateBadgeText}>{overlayData.currentState.toUpperCase()}</Text>
            </View>
          </View>
        </View>
        
        {/* Protection Layers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROTECTION LAYERS</Text>
          
          <View style={styles.row}>
            <Text style={styles.label}>TRACKING POINT:</Text>
            <Text style={[styles.value, { color: getStatusColor(overlayData.trackingPoint) }]}>
              {overlayData.trackingPoint}
            </Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>HUMAN PRESENCE:</Text>
            <Text style={[styles.value, { color: getStatusColor(overlayData.humanPresence) }]}>
              {overlayData.humanPresence}
            </Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>STABILITY:</Text>
            <Text style={styles.value}>{overlayData.stability}</Text>
          </View>
        </View>
        
        {/* Thresholds */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>THRESHOLDS</Text>
          
          <View style={styles.row}>
            <Text style={styles.label}>CONFIDENCE:</Text>
            <Text style={styles.thresholdValue}>{overlayData.confidence}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>MOVEMENT:</Text>
            <Text style={styles.thresholdValue}>{overlayData.movementDelta}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>VELOCITY:</Text>
            <Text style={styles.thresholdValue}>{overlayData.velocity}</Text>
          </View>
        </View>
        
        {/* Recording Status */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>RECORDING:</Text>
            <View style={[
              styles.recordingBadge, 
              { backgroundColor: overlayData.recording === 'ALLOWED' ? '#10b981' : '#ef4444' }
            ]}>
              <Text style={styles.recordingBadgeText}>{overlayData.recording}</Text>
            </View>
          </View>
        </View>
        
        {/* Blocking Info */}
        {overlayData.blockedBy !== 'NONE' && (
          <View style={styles.blockingSection}>
            <Text style={styles.blockingTitle}>BLOCKED BY:</Text>
            <Text style={styles.blockingLayer}>{overlayData.blockedBy}</Text>
            <Text style={styles.blockingReason}>{overlayData.reason}</Text>
          </View>
        )}
        
        {/* Detailed Blocking Diagnosis */}
        {blockingDiagnosis?.blocked && (
          <View style={styles.diagnosisSection}>
            <Text style={styles.diagnosisTitle}>BLOCKING DIAGNOSIS</Text>
            <Text style={styles.diagnosisText}>Layer: {blockingDiagnosis.blockingLayer}</Text>
            <Text style={styles.diagnosisText}>Function: {blockingDiagnosis.blockingFunction}</Text>
            <Text style={styles.diagnosisText}>Variable: {blockingDiagnosis.blockingVariable}</Text>
            <Text style={styles.diagnosisText}>Expected: {String(blockingDiagnosis.expectedValue)}</Text>
            <Text style={styles.diagnosisText}>Actual: {String(blockingDiagnosis.actualValue)}</Text>
            {blockingDiagnosis.file && (
              <Text style={styles.diagnosisFile}>
                {blockingDiagnosis.file}:{blockingDiagnosis.line}
              </Text>
            )}
          </View>
        )}
        
        {/* Frame Info */}
        {diagnosticData && (
          <View style={styles.frameInfo}>
            <Text style={styles.frameInfoText}>
              Frame #{diagnosticData.frameNumber} | {new Date(diagnosticData.timestamp).toLocaleTimeString()}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    right: 10,
    width: 280,
    maxHeight: 400,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#1f2937',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: {
    color: '#10b981',
    fontWeight: 'bold',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    padding: 8,
  },
  section: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  label: {
    color: '#9ca3af',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  value: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  thresholdValue: {
    color: '#60a5fa',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  stateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stateBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  recordingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recordingBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  blockingSection: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  blockingTitle: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  blockingLayer: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  blockingReason: {
    color: '#fca5a5',
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  diagnosisSection: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  diagnosisTitle: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  diagnosisText: {
    color: '#fcd34d',
    fontSize: 9,
    fontFamily: 'monospace',
  },
  diagnosisFile: {
    color: '#9ca3af',
    fontSize: 8,
    fontFamily: 'monospace',
    marginTop: 4,
    fontStyle: 'italic',
  },
  frameInfo: {
    marginTop: 8,
    alignItems: 'center',
  },
  frameInfoText: {
    color: '#6b7280',
    fontSize: 8,
    fontFamily: 'monospace',
  },
  // Compact styles
  compactContainer: {
    position: 'absolute',
    top: 60,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    padding: 4,
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  compactLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  compactValue: {
    fontSize: 9,
    fontFamily: 'monospace',
  },
  compactBlockedRow: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 2,
    padding: 2,
    marginTop: 2,
  },
  compactBlockedText: {
    color: '#fca5a5',
    fontSize: 9,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});

export default VBTDiagnosticOverlay;
