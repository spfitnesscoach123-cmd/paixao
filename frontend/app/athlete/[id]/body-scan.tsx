/**
 * body-scan.tsx — Tela principal do Body Scan
 *
 * Fluxo:
 *   1. Config (altura, peso) -> Iniciar
 *   2. Camera + Scanner overlay (posicionamento + captura)
 *   3. Resultado (BodyParams)
 *
 * State machine controlada por useBodyScan.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useBodyScan } from '../../../hooks/useBodyScan';
import { CameraScanner } from '../../../components/body-composition/CameraScanner';
import { ScannerOverlay } from '../../../components/body-composition/ScannerOverlay';

const { width: SCREEN_W } = Dimensions.get('window');

export default function BodyScanScreen() {
  const { id: athleteId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();

  // PHASE 1A SAFETY: Freeze athleteId at scan start to prevent cross-athlete navigation
  const recordingAthleteIdRef = useRef<string | null>(null);

  // Config
  const [athleteHeight, setAthleteHeight] = useState('175');
  const [athleteWeight, setAthleteWeight] = useState('75');

  // UI phase: 'config' -> 'scanning' -> 'results'
  const [uiPhase, setUiPhase] = useState<'config' | 'scanning' | 'results'>('config');
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);

  // Body Scan hook
  const bodyScan = useBodyScan({
    athleteHeightCm: parseFloat(athleteHeight) || 175,
    targetFrames: 75,
    minValidFrames: 45,
  });

  // Transicao automatica para results quando completo
  useEffect(() => {
    if (bodyScan.phase === 'complete') {
      setUiPhase('results');
    }
  }, [bodyScan.phase]);

  // Labels
  const t = {
    title: locale === 'pt' ? 'Body Scan' : 'Body Scan',
    config: locale === 'pt' ? 'Configuracao' : 'Configuration',
    height: locale === 'pt' ? 'Altura (cm)' : 'Height (cm)',
    weight: locale === 'pt' ? 'Peso (kg)' : 'Weight (kg)',
    start: locale === 'pt' ? 'Iniciar Scanner' : 'Start Scanner',
    tips: locale === 'pt' ? 'Dicas' : 'Tips',
    tip1: locale === 'pt' ? 'Posicione o atleta de frente para a camera' : 'Position athlete facing the camera',
    tip2: locale === 'pt' ? 'Corpo inteiro deve estar visivel' : 'Full body must be visible',
    tip3: locale === 'pt' ? 'Boa iluminacao melhora a precisao' : 'Good lighting improves accuracy',
    tip4: locale === 'pt' ? 'Roupas ajustadas facilitam a deteccao' : 'Fitted clothing helps detection',
    results: locale === 'pt' ? 'Resultado do Scan' : 'Scan Results',
    scanAgain: locale === 'pt' ? 'Escanear Novamente' : 'Scan Again',
    useResults: locale === 'pt' ? 'Usar Resultados' : 'Use Results',
    shoulder: locale === 'pt' ? 'Largura Ombros' : 'Shoulder Width',
    hip: locale === 'pt' ? 'Largura Quadril' : 'Hip Width',
    torso: locale === 'pt' ? 'Comprimento Torso' : 'Torso Length',
    leftArm: locale === 'pt' ? 'Braco Esquerdo' : 'Left Arm',
    rightArm: locale === 'pt' ? 'Braco Direito' : 'Right Arm',
    leftLeg: locale === 'pt' ? 'Perna Esquerda' : 'Left Leg',
    rightLeg: locale === 'pt' ? 'Perna Direita' : 'Right Leg',
    shRatio: locale === 'pt' ? 'Ratio Ombro/Quadril' : 'Shoulder/Hip Ratio',
    quality: locale === 'pt' ? 'Qualidade' : 'Quality',
    framesUsed: locale === 'pt' ? 'Frames Usados' : 'Frames Used',
    scanError: locale === 'pt' ? 'Erro no Scan' : 'Scan Error',
    retry: locale === 'pt' ? 'Tentar Novamente' : 'Try Again',
    noPermission: locale === 'pt' ? 'Permissao de camera necessaria' : 'Camera permission required',
    grantPermission: locale === 'pt' ? 'Conceder' : 'Grant',
    proportions: locale === 'pt' ? 'Proporcoes Corporais (cm)' : 'Body Proportions (cm)',
  };

  // Iniciar scan
  const handleStartScan = useCallback(() => {
    if (!permission?.granted) {
      requestPermission();
      return;
    }
    // PHASE 1A SAFETY: Freeze athleteId at scan start
    recordingAthleteIdRef.current = athleteId;
    setCameraActive(true);
    setScannerReady(false);
    setUiPhase('scanning');
  }, [permission, requestPermission, athleteId]);

  // Camera pronta -> iniciar posicionamento
  const handleCameraReady = useCallback(() => {
    setScannerReady(true);
    bodyScan.startPositioning();
  }, [bodyScan]);

  // Voltar da camera
  const handleBackFromCamera = useCallback(() => {
    setCameraActive(false);
    setScannerReady(false);
    bodyScan.reset();
    setUiPhase('config');
  }, [bodyScan]);

  // Usar resultados → navegar para selecao de protocolo
  const handleUseResults = useCallback(() => {
    if (!bodyScan.result) return;
    // PHASE 1A SAFETY: Use frozen athleteId, fallback to current
    const ownerAthleteId = recordingAthleteIdRef.current || athleteId;
    router.push({
      pathname: `/athlete/${ownerAthleteId}/protocol-select`,
      params: {
        scanWeight: athleteWeight,
        scanHeight: athleteHeight,
      },
    });
  }, [bodyScan.result, athleteId, athleteWeight, athleteHeight, router]);

  // ============================================================
  // RENDER: CONFIG
  // ============================================================
  if (uiPhase === 'config') {
    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              data-testid="body-scan-back-btn"
            >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.title}>{t.title}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <LinearGradient colors={['#8b5cf6', '#3b82f6']} style={styles.iconGradient}>
              <Ionicons name="body" size={48} color="#ffffff" />
            </LinearGradient>
            <Text style={styles.subtitle}>
              {locale === 'pt'
                ? 'Escaneie o corpo do atleta para gerar proporcoes automaticas'
                : 'Scan the athlete body to auto-generate proportions'}
            </Text>
          </View>

          {/* Config Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t.config}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t.height}</Text>
              <TextInput
                style={styles.input}
                value={athleteHeight}
                onChangeText={setAthleteHeight}
                keyboardType="numeric"
                placeholder="175"
                placeholderTextColor={colors.text.tertiary}
                data-testid="body-scan-height-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t.weight}</Text>
              <TextInput
                style={styles.input}
                value={athleteWeight}
                onChangeText={setAthleteWeight}
                keyboardType="numeric"
                placeholder="75"
                placeholderTextColor={colors.text.tertiary}
                data-testid="body-scan-weight-input"
              />
            </View>
          </View>

          {/* Tips */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t.tips}</Text>
            {[t.tip1, t.tip2, t.tip3, t.tip4].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Ionicons
                  name={['person', 'resize', 'sunny', 'shirt'][i] as any}
                  size={16}
                  color={colors.accent.primary}
                />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>

          {/* Permissao */}
          {permission && !permission.granted && (
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermission}
              data-testid="body-scan-permission-btn"
            >
              <Ionicons name="camera" size={20} color="#ffffff" />
              <Text style={styles.permissionText}>{t.grantPermission}</Text>
            </TouchableOpacity>
          )}

          {/* Start Button */}
          <TouchableOpacity
            style={styles.startButton}
            onPress={handleStartScan}
            data-testid="body-scan-start-btn"
          >
            <LinearGradient colors={['#22c55e', '#16a34a']} style={styles.startButtonGradient}>
              <Ionicons name="scan" size={24} color="#ffffff" />
              <Text style={styles.startButtonText}>{t.start}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  // ============================================================
  // RENDER: SCANNING (camera + overlay)
  // ============================================================
  if (uiPhase === 'scanning') {
    return (
      <View style={styles.container}>
        {/* Camera */}
        <CameraScanner
          isActive={cameraActive}
          onLandmarks={bodyScan.processFrame}
          onReady={handleCameraReady}
          style={StyleSheet.absoluteFill}
        />

        {/* Scanner Overlay */}
        {scannerReady && (
          <ScannerOverlay
            phase={bodyScan.phase}
            poseValidation={bodyScan.poseValidation}
            progress={bodyScan.progress}
            framesCollected={bodyScan.framesCollected}
            landmarks={bodyScan.currentLandmarks}
            stateLabel={bodyScan.stateLabel}
          />
        )}

        {/* Header overlay */}
        <View style={[styles.cameraHeader, { paddingTop: insets.top }]}>
          <TouchableOpacity
            onPress={handleBackFromCamera}
            style={styles.backButton}
            data-testid="body-scan-camera-back-btn"
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>{t.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Error state */}
        {bodyScan.phase === 'error' && (
          <View style={styles.errorOverlay}>
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={48} color="#ef4444" />
              <Text style={styles.errorTitle}>{t.scanError}</Text>
              <Text style={styles.errorText}>{bodyScan.error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  bodyScan.reset();
                  bodyScan.startPositioning();
                }}
                data-testid="body-scan-retry-btn"
              >
                <Text style={styles.retryText}>{t.retry}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom: cancel button */}
        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleBackFromCamera}
            data-testid="body-scan-cancel-btn"
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================
  // RENDER: RESULTS
  // ============================================================
  if (uiPhase === 'results' && bodyScan.result) {
    const bp = bodyScan.result.bodyParams;
    const qualityPct = Math.round(bodyScan.result.captureQuality * 100);

    const metrics = [
      { label: t.shoulder, value: bp.shoulderWidth.toFixed(1), unit: 'cm' },
      { label: t.hip, value: bp.hipWidth.toFixed(1), unit: 'cm' },
      { label: t.torso, value: bp.torsoLength.toFixed(1), unit: 'cm' },
      { label: t.leftArm, value: bp.leftArmLength.toFixed(1), unit: 'cm' },
      { label: t.rightArm, value: bp.rightArmLength.toFixed(1), unit: 'cm' },
      { label: t.leftLeg, value: bp.leftLegLength.toFixed(1), unit: 'cm' },
      { label: t.rightLeg, value: bp.rightLegLength.toFixed(1), unit: 'cm' },
      { label: t.shRatio, value: bp.shoulderToHipRatio.toFixed(2), unit: '' },
    ];

    return (
      <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                bodyScan.reset();
                setCameraActive(false);
                setUiPhase('config');
              }}
              style={styles.backButton}
              data-testid="body-scan-results-back-btn"
            >
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.title}>{t.results}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Success banner */}
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
            <Text style={styles.successText}>
              {locale === 'pt' ? 'Scan Completo!' : 'Scan Complete!'}
            </Text>
          </View>

          {/* Quality badge */}
          <View style={styles.qualityRow}>
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityLabel}>{t.quality}</Text>
              <Text style={[styles.qualityValue, { color: qualityPct >= 80 ? '#22c55e' : '#eab308' }]}>
                {qualityPct}%
              </Text>
            </View>
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityLabel}>{t.framesUsed}</Text>
              <Text style={styles.qualityValue}>{bodyScan.result.framesUsed}</Text>
            </View>
          </View>

          {/* Metrics Grid */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t.proportions}</Text>
            <View style={styles.metricsGrid}>
              {metrics.map((m, i) => (
                <View key={i} style={styles.metricItem} data-testid={`metric-${i}`}>
                  <Text style={styles.metricValue}>
                    {m.value}
                    {m.unit ? <Text style={styles.metricUnit}> {m.unit}</Text> : null}
                  </Text>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                bodyScan.reset();
                setUiPhase('scanning');
                setCameraActive(true);
              }}
              data-testid="body-scan-again-btn"
            >
              <Ionicons name="refresh" size={20} color={colors.accent.primary} />
              <Text style={styles.secondaryButtonText}>{t.scanAgain}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleUseResults}
              data-testid="body-scan-use-results-btn"
            >
              <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={styles.primaryButtonGradient}>
                <Ionicons name="checkmark" size={20} color="#ffffff" />
                <Text style={styles.primaryButtonText}>{t.useResults}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Fallback: loading
  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    </LinearGradient>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e1a',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },

  // Icon
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Card
  card: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },

  // Input
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.input.background,
    borderWidth: 1,
    borderColor: colors.input.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.text.primary,
  },

  // Tips
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  tipText: {
    color: colors.text.secondary,
    fontSize: 13,
    flex: 1,
  },

  // Permission
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  permissionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Start button
  startButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },

  // Camera overlay header
  cameraHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 100,
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Camera bottom
  cameraBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  cancelButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Error overlay
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 90,
  },
  errorCard: {
    backgroundColor: 'rgba(15, 22, 41, 0.95)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    maxWidth: 300,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  errorText: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.accent.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Results
  successBanner: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successText: {
    color: '#22c55e',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  qualityBadge: {
    flex: 1,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  qualityLabel: {
    color: colors.text.secondary,
    fontSize: 12,
  },
  qualityValue: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricItem: {
    width: (SCREEN_W - 72) / 2,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderRadius: 10,
    padding: 12,
  },
  metricValue: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  metricUnit: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.text.secondary,
  },
  metricLabel: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.dark.card,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  secondaryButtonText: {
    color: colors.accent.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
