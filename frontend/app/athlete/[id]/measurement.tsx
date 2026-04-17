/**
 * measurement.tsx — Tela de medicoes com Avatar 3D interativo
 *
 * Fluxo: Tap no avatar 3D -> Mapeamento mesh->site -> Modal de input -> Calcular
 * Usa Avatar3D (Three.js) com raycasting para selecao de partes do corpo
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, G, Text as SvgText } from 'react-native-svg';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  getProtocolById, getProtocolSites, validateMeasurements, calculateProtocol,
} from '../../../engine/body-composition/protocolEngine';
import { calculateComposition } from '../../../engine/body-composition/bodyComposition';
import { calculateSymmetry } from '../../../engine/body-composition/symmetryEngine';
import { MeasurementInputModal } from '../../../components/body-composition/MeasurementInputModal';
import {
  SKINFOLD_LABELS, type SkinfoldSite, type Measurements, type Gender, type FullReport,
} from '../../../types/protocols';

const { width: SW } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';

// ============================================================
// MAPEAMENTO: Mesh 3D (AVATAR DC ULTIMATE) → Sites de dobras cutaneas
// Cada mesh mapeia 1:1 para um site de dobra cutanea
// ============================================================

const MESH_TO_SITES: Record<string, SkinfoldSite[]> = {
  PEITORAL: ['chest'],
  SUBESCAPULAR: ['subscapular'],
  AXILAR_MEDIA: ['midaxillary'],
  ABDOMINAL: ['abdominal'],
  SUPRA_ILIACA: ['suprailiac'],
  BICEPS: ['biceps'],
  TRICEPS: ['triceps'],
  COXA: ['thigh'],
  PANTURILHA: ['calf'],
};

// SVG body site positions (fallback para web)
const SITE_POS: Record<SkinfoldSite, { x: number; y: number }> = {
  triceps: { x: 28, y: 100 },
  biceps: { x: 152, y: 100 },
  chest: { x: 72, y: 88 },
  subscapular: { x: 108, y: 92 },
  midaxillary: { x: 55, y: 108 },
  abdominal: { x: 90, y: 135 },
  suprailiac: { x: 65, y: 148 },
  thigh: { x: 78, y: 200 },
  calf: { x: 78, y: 252 },
};

// Lazy-load Avatar3D only on native (Three.js doesn't work well on web)
let Avatar3D: any = null;
if (!IS_WEB) {
  try {
    Avatar3D = require('../../../components/body-composition/Avatar3D').Avatar3D;
  } catch (e) {
    console.error('[measurement] Avatar3D import failed:', e);
  }
}

export default function MeasurementScreen() {
  const params = useLocalSearchParams<{
    protocolId: string; gender: string; age: string; weight: string; height: string;
  }>();
  const { id: athleteId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale } = useLanguage();
  const pt = locale === 'pt';

  const protocol = getProtocolById(params.protocolId ?? '');
  const gender = (params.gender as Gender) || 'male';
  const age = parseInt(params.age ?? '25');
  const weight = parseFloat(params.weight ?? '75');
  const height = parseFloat(params.height ?? '175');
  const sites = protocol ? getProtocolSites(protocol, gender) : [];

  const [measurements, setMeasurements] = useState<Measurements>({});
  const [modalSite, setModalSite] = useState<SkinfoldSite | null>(null);
  const [sitePickerOptions, setSitePickerOptions] = useState<SkinfoldSite[]>([]);
  const [highlightedMesh, setHighlightedMesh] = useState<string | null>(null);

  const validation = useMemo(() => {
    if (!protocol) return { valid: false, missing: [] as SkinfoldSite[] };
    return validateMeasurements(protocol, gender, measurements);
  }, [protocol, gender, measurements]);

  const filledCount = sites.filter((s) => (measurements[s] ?? 0) > 0).length;

  // Heatmap values for Avatar3D: purple indicator for unfilled protocol sites, color gradient for filled
  const heatmapValues = useMemo(() => {
    const values: Record<string, number> = {};
    for (const [meshName, sitesForMesh] of Object.entries(MESH_TO_SITES)) {
      const protocolSites = sitesForMesh.filter((s) => sites.includes(s));
      if (protocolSites.length === 0) continue;
      const filledSite = protocolSites.find((s) => (measurements[s] ?? 0) > 0);
      if (filledSite) {
        values[meshName] = Math.min((measurements[filledSite] ?? 0) / 50, 1);
      } else {
        values[meshName] = -1; // indicator: purple "tap here"
      }
    }
    return values;
  }, [sites, measurements]);

  const handleSaveMeasurement = useCallback((site: SkinfoldSite, value: number) => {
    setMeasurements((prev) => ({ ...prev, [site]: value }));
  }, []);

  // Quando usuario toca em um mesh 3D do avatar
  const handleMeshSelect = useCallback((meshName: string) => {
    const possibleSites = MESH_TO_SITES[meshName] || [];
    // Filtrar apenas sites que fazem parte do protocolo atual
    const protocolSites = possibleSites.filter((s) => sites.includes(s));

    if (protocolSites.length === 0) return; // Mesh nao faz parte do protocolo

    setHighlightedMesh(meshName);

    if (protocolSites.length === 1) {
      // Unico site - abrir modal direto
      setModalSite(protocolSites[0]);
      setSitePickerOptions([]);
    } else {
      // Multiplos sites mapeados a este mesh - mostrar picker
      setSitePickerOptions(protocolSites);
    }
  }, [sites]);

  const handleCalculate = useCallback(() => {
    if (!protocol || !validation.valid) return;

    const protocolResult = calculateProtocol(protocol.id, measurements, gender, age);
    if (!protocolResult) return;

    const composition = calculateComposition(protocolResult.bodyFatPercent, weight, height, gender);
    const symmetry = calculateSymmetry(measurements);

    const report: FullReport = {
      protocol: protocolResult,
      composition,
      symmetry,
      measurements,
      athleteWeight: weight,
      athleteHeight: height,
      gender,
      age,
      timestamp: Date.now(),
    };

    router.push({
      pathname: `/athlete/${athleteId}/report`,
      params: { report: JSON.stringify(report) },
    });
  }, [protocol, validation, measurements, gender, age, weight, height, athleteId, router]);

  if (!protocol) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text.primary }}>Protocol not found</Text>
      </View>
    );
  }

  // Determinar quais meshes devem ser destacados (protocol-specific)
  const highlightedMeshNames = useMemo(() => {
    const meshes = new Set<string>();
    for (const site of sites) {
      for (const [mesh, sitesForMesh] of Object.entries(MESH_TO_SITES)) {
        if (sitesForMesh.includes(site)) meshes.add(mesh);
      }
    }
    return Array.from(meshes);
  }, [sites]);

  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} data-testid="measurement-back-btn">
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.title}>{pt ? protocol.namePt : protocol.name}</Text>
            <Text style={styles.subtitle}>{filledCount}/{sites.length} {pt ? 'medidas' : 'measurements'}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Instrucao */}
        <View style={styles.instructionBadge}>
          <Ionicons name="hand-left" size={16} color="#a78bfa" />
          <Text style={styles.instructionText}>
            {pt
              ? 'Toque nas regioes destacadas do avatar para inserir as medidas'
              : 'Tap highlighted regions on the avatar to enter measurements'}
          </Text>
        </View>

        {/* Avatar 3D ou SVG fallback */}
        <View style={styles.avatarContainer}>
          {Avatar3D && !IS_WEB ? (
            <Avatar3D
              onPartSelect={handleMeshSelect}
              highlightedPart={highlightedMesh}
              heatmapValues={heatmapValues}
              autoRotate={false}
              style={{ height: 380 }}
            />
          ) : (
            /* SVG Body Model fallback (web) */
            <View style={styles.svgContainer}>
              <Svg width={180} height={280} viewBox="0 0 180 280">
                <Circle cx="90" cy="25" r="20" fill={colors.dark.secondary} stroke={colors.border.default} strokeWidth="1" />
                <Rect x="82" y="43" width="16" height="12" fill={colors.dark.secondary} />
                <Path d="M50 55 L130 55 L140 80 L145 130 L130 160 L50 160 L35 130 L40 80 Z" fill={colors.dark.secondary} stroke={colors.border.default} strokeWidth="1" />
                <Path d="M35 60 L15 60 L5 130 L20 130 L35 80" fill={colors.dark.secondary} stroke={colors.border.default} strokeWidth="1" />
                <Path d="M145 60 L165 60 L175 130 L160 130 L145 80" fill={colors.dark.secondary} stroke={colors.border.default} strokeWidth="1" />
                <Path d="M50 160 L130 160 L120 180 L60 180 Z" fill={colors.dark.secondary} stroke={colors.border.default} strokeWidth="1" />
                <Path d="M60 180 L80 180 L75 260 L55 260 Z" fill={colors.dark.secondary} stroke={colors.border.default} strokeWidth="1" />
                <Path d="M100 180 L120 180 L125 260 L105 260 Z" fill={colors.dark.secondary} stroke={colors.border.default} strokeWidth="1" />
                {sites.map((site) => {
                  const pos = SITE_POS[site];
                  if (!pos) return null;
                  const filled = (measurements[site] ?? 0) > 0;
                  return (
                    <G key={site}>
                      <Circle
                        cx={pos.x} cy={pos.y} r={filled ? 8 : 6}
                        fill={filled ? '#22c55e' : '#8b5cf6'}
                        opacity={0.9}
                        onPress={() => setModalSite(site)}
                      />
                      {filled && (
                        <SvgText x={pos.x} y={pos.y + 3} textAnchor="middle" fontSize="7" fill="#fff" fontWeight="bold">
                          {measurements[site]}
                        </SvgText>
                      )}
                    </G>
                  );
                })}
              </Svg>
            </View>
          )}
        </View>

        {/* Site Picker (quando mesh mapeia para multiplos sites) */}
        {sitePickerOptions.length > 0 && (
          <View style={styles.pickerOverlay}>
            <Text style={styles.pickerTitle}>{pt ? 'Qual dobra?' : 'Which skinfold?'}</Text>
            {sitePickerOptions.map((site) => {
              const filled = (measurements[site] ?? 0) > 0;
              return (
                <TouchableOpacity
                  key={site}
                  style={styles.pickerOption}
                  onPress={() => {
                    setModalSite(site);
                    setSitePickerOptions([]);
                  }}
                  data-testid={`picker-${site}`}
                >
                  <Ionicons
                    name={filled ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={filled ? '#22c55e' : '#8b5cf6'}
                  />
                  <Text style={styles.pickerOptionText}>
                    {pt ? SKINFOLD_LABELS[site].pt : SKINFOLD_LABELS[site].en}
                  </Text>
                  {filled && <Text style={styles.pickerValue}>{measurements[site]} mm</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.pickerCancel}
              onPress={() => setSitePickerOptions([])}
            >
              <Text style={styles.pickerCancelText}>{pt ? 'Cancelar' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sites list */}
        <View style={styles.sitesList}>
          {sites.map((site) => {
            const filled = (measurements[site] ?? 0) > 0;
            const label = pt ? SKINFOLD_LABELS[site].pt : SKINFOLD_LABELS[site].en;
            return (
              <TouchableOpacity
                key={site}
                style={[styles.siteRow, filled && styles.siteRowFilled]}
                onPress={() => setModalSite(site)}
                data-testid={`site-${site}`}
              >
                <Ionicons
                  name={filled ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={filled ? '#22c55e' : colors.text.tertiary}
                />
                <Text style={[styles.siteLabel, filled && styles.siteLabelFilled]}>{label}</Text>
                <Text style={styles.siteValue}>
                  {filled ? `${measurements[site]} mm` : '--'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Calculate button */}
        <TouchableOpacity
          style={[styles.calcBtn, !validation.valid && styles.calcBtnDisabled]}
          onPress={handleCalculate}
          disabled={!validation.valid}
          data-testid="calculate-btn"
        >
          <LinearGradient
            colors={validation.valid ? ['#22c55e', '#16a34a'] : ['#374151', '#1f2937']}
            style={styles.calcBtnGrad}
          >
            <Ionicons name="calculator" size={20} color={validation.valid ? '#fff' : '#6b7280'} />
            <Text style={[styles.calcBtnText, !validation.valid && { color: '#6b7280' }]}>
              {pt ? 'Calcular Composicao' : 'Calculate Composition'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {!validation.valid && validation.missing.length > 0 && (
          <Text style={styles.missingText}>
            {pt ? `Faltam: ${validation.missing.map(s => SKINFOLD_LABELS[s].pt).join(', ')}` :
              `Missing: ${validation.missing.map(s => SKINFOLD_LABELS[s].en).join(', ')}`}
          </Text>
        )}
      </ScrollView>

      {/* Modal de input */}
      <MeasurementInputModal
        visible={modalSite !== null}
        site={modalSite}
        currentValue={modalSite ? measurements[modalSite] : undefined}
        locale={locale}
        onSave={handleSaveMeasurement}
        onClose={() => setModalSite(null)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text.primary },
  subtitle: { fontSize: 13, color: colors.accent.primary, fontWeight: '600' },
  instructionBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 10, padding: 10, marginBottom: 12 },
  instructionText: { flex: 1, fontSize: 12, color: colors.text.secondary, lineHeight: 16 },
  avatarContainer: { backgroundColor: colors.dark.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border.default, overflow: 'hidden', marginBottom: 16, minHeight: 380 },
  svgContainer: { alignItems: 'center', paddingVertical: 30 },
  pickerOverlay: { backgroundColor: colors.dark.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#8b5cf6', gap: 6 },
  pickerTitle: { fontSize: 13, fontWeight: '600', color: '#a78bfa', marginBottom: 4 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4 },
  pickerOptionText: { flex: 1, fontSize: 14, color: colors.text.primary },
  pickerValue: { fontSize: 13, color: '#22c55e', fontWeight: '600' },
  pickerCancel: { alignItems: 'center', paddingTop: 6 },
  pickerCancelText: { fontSize: 13, color: colors.text.tertiary },
  sitesList: { gap: 4, marginBottom: 16 },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.dark.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border.default },
  siteRowFilled: { borderColor: 'rgba(34,197,94,0.3)' },
  siteLabel: { flex: 1, fontSize: 14, color: colors.text.secondary },
  siteLabelFilled: { color: colors.text.primary, fontWeight: '500' },
  siteValue: { fontSize: 14, fontWeight: '700', color: colors.text.secondary },
  calcBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  calcBtnDisabled: { opacity: 0.7 },
  calcBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  calcBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  missingText: { textAlign: 'center', fontSize: 12, color: colors.text.tertiary, marginTop: 8 },
});
