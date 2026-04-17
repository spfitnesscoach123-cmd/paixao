/**
 * report.tsx — Relatorio de composicao corporal com Avatar 3D animado
 *
 * Recebe FullReport via params e exibe:
 * - Avatar 3D com heatmap (nativo) ou SVG (web fallback)
 * - Metricas de composicao corporal
 * - Assimetrias
 * - Insights automaticos
 * - Salva no backend via POST /api/body-composition
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions,
  Animated as RNAnimated, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { SKINFOLD_LABELS, type FullReport, type SkinfoldSite } from '../../../types/protocols';
import api from '../../../services/api';
import { useQueryClient } from '@tanstack/react-query';

const { width: SW } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';

// Lazy-load Avatar3D only on native
let Avatar3D: any = null;
if (!IS_WEB) {
  try {
    Avatar3D = require('../../../components/body-composition/Avatar3D').Avatar3D;
  } catch (e) {
    console.error('[report] Avatar3D import failed:', e);
  }
}

// ============================================================
// HELPERS
// ============================================================

function heatColor(value: number): string {
  if (value <= 10) return '#22c55e';
  if (value <= 20) return value < 15 ? '#84cc16' : '#eab308';
  if (value <= 30) return '#f59e0b';
  return '#ef4444';
}

function bodyPartColor(part: string, measurements: Record<string, number | undefined>): string {
  const mapping: Record<string, string[]> = {
    torso: ['subscapular', 'suprailiac', 'abdominal', 'chest', 'midaxillary'],
    leftArm: ['triceps', 'biceps'],
    rightArm: ['triceps', 'biceps'],
    leftLeg: ['thigh', 'calf'],
    rightLeg: ['thigh', 'calf'],
  };
  const sites = mapping[part] || [];
  const values = sites.map((s) => measurements[s]).filter((v): v is number => v !== undefined && v > 0);
  if (values.length === 0) return colors.dark.secondary;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return heatColor(avg);
}

/** Converte medidas de dobras para heatmap do Avatar3D (mesh names do AVATAR DC ULTIMATE, normalizado 0-1) */
function buildHeatmapValues(measurements: Record<string, number | undefined>): Record<string, number> {
  // Mapeamento 1:1: mesh name → skinfold site
  const meshToSite: Record<string, SkinfoldSite> = {
    PEITORAL: 'chest',
    SUBESCAPULAR: 'subscapular',
    AXILAR_MEDIA: 'midaxillary',
    ABDOMINAL: 'abdominal',
    SUPRA_ILIACA: 'suprailiac',
    BICEPS: 'biceps',
    TRICEPS: 'triceps',
    COXA: 'thigh',
    PANTURILHA: 'calf',
  };

  const result: Record<string, number> = {};
  for (const [meshName, site] of Object.entries(meshToSite)) {
    const value = measurements[site];
    if (value !== undefined && value > 0) {
      // Normalizar: 0-50mm → 0-1
      result[meshName] = Math.min(value / 50, 1);
    }
  }
  return result;
}

export default function ReportScreen() {
  const { id: athleteId, report: reportStr, returnPath } = useLocalSearchParams<{ id: string; report: string; returnPath?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale } = useLanguage();
  const queryClient = useQueryClient();
  const pt = locale === 'pt';

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const report: FullReport | null = useMemo(() => {
    try {
      return reportStr ? JSON.parse(reportStr) : null;
    } catch {
      return null;
    }
  }, [reportStr]);

  // Rotation animation for SVG fallback
  const rotAnim = useRef(new RNAnimated.Value(0)).current;
  const [rotDeg, setRotDeg] = useState(0);

  useEffect(() => {
    if (IS_WEB || !Avatar3D) {
      const anim = RNAnimated.loop(
        RNAnimated.timing(rotAnim, { toValue: 1, duration: 8000, useNativeDriver: false })
      );
      anim.start();
      const listener = rotAnim.addListener(({ value }) => setRotDeg(value * 360));
      return () => { anim.stop(); rotAnim.removeListener(listener); };
    }
  }, [rotAnim]);

  // Heatmap values para Avatar3D
  const heatmapValues = useMemo(() => {
    if (!report) return {};
    return buildHeatmapValues(report.measurements);
  }, [report]);

  const handleSave = useCallback(async () => {
    if (!report || !athleteId || saving || saved) return;
    setSaving(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      await api.post('/body-composition', {
        athlete_id: athleteId,
        date: today,
        protocol: report.protocol.protocolId,
        weight: report.athleteWeight,
        height: report.athleteHeight,
        age: report.age,
        gender: report.gender,
        triceps: report.measurements.triceps || null,
        subscapular: report.measurements.subscapular || null,
        suprailiac: report.measurements.suprailiac || null,
        abdominal: report.measurements.abdominal || null,
        chest: report.measurements.chest || null,
        midaxillary: report.measurements.midaxillary || null,
        thigh: report.measurements.thigh || null,
        calf: report.measurements.calf || null,
        biceps: report.measurements.biceps || null,
      });

      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['body-composition', athleteId] });
      queryClient.invalidateQueries({ queryKey: ['assessments', athleteId] });
      Alert.alert(
        pt ? 'Salvo' : 'Saved',
        pt ? 'Avaliacao salva com sucesso!' : 'Assessment saved successfully!'
      );
    } catch (e: any) {
      Alert.alert(
        pt ? 'Erro' : 'Error',
        pt ? 'Nao foi possivel salvar a avaliacao.' : 'Failed to save assessment.'
      );
    } finally {
      setSaving(false);
    }
  }, [report, athleteId, saving, saved, pt, queryClient]);

  if (!report) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text.primary }}>No report data</Text>
      </View>
    );
  }

  const { composition: c, protocol: p, symmetry: s, measurements: m } = report;

  // Scale X para pseudo-3D no SVG (fallback web)
  const scaleX = Math.cos((rotDeg * Math.PI) / 180) * 0.3 + 0.7;

  const metrics = [
    { label: pt ? '% Gordura' : 'Body Fat %', value: `${c.bodyFatPercent}%`, icon: 'flame', color: c.bodyFatPercent > 25 ? '#ef4444' : c.bodyFatPercent > 18 ? '#eab308' : '#22c55e' },
    { label: pt ? 'Massa Gorda' : 'Fat Mass', value: `${c.fatMass} kg`, icon: 'scale', color: '#f59e0b' },
    { label: pt ? 'Massa Magra' : 'Lean Mass', value: `${c.leanMass} kg`, icon: 'fitness', color: '#22c55e' },
    { label: pt ? 'Agua Corporal' : 'Body Water', value: `${c.waterEstimate} kg`, icon: 'water', color: '#3b82f6' },
    { label: pt ? 'Massa Ossea' : 'Bone Mass', value: `${c.boneEstimate} kg`, icon: 'bonfire', color: '#a78bfa' },
    { label: pt ? 'IMC' : 'BMI', value: `${c.imc}`, icon: 'analytics', color: '#6366f1' },
  ];

  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} data-testid="report-back-btn">
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>{pt ? 'Relatorio' : 'Report'}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Protocol badge */}
        <View style={styles.protocolBadge}>
          <Ionicons name="document-text" size={16} color="#a78bfa" />
          <Text style={styles.protocolBadgeText}>{p.protocolName}</Text>
          <Text style={styles.protocolBadgeSub}>{p.sumOfFolds}mm total</Text>
        </View>

        {/* Classification */}
        <View style={styles.classCard}>
          <Text style={styles.classLabel}>{pt ? 'Classificacao' : 'Classification'}</Text>
          <Text style={[styles.classValue, { color: c.bodyFatPercent > 25 ? '#ef4444' : c.bodyFatPercent > 18 ? '#eab308' : '#22c55e' }]}>
            {pt ? c.classificationPt : c.classification}
          </Text>
          <Text style={styles.classFat}>{c.bodyFatPercent}% {pt ? 'gordura corporal' : 'body fat'}</Text>
        </View>

        {/* Avatar 3D (nativo) ou SVG animado (web fallback) */}
        <View style={styles.avatarContainer}>
          {Avatar3D && !IS_WEB ? (
            <Avatar3D
              autoRotate={true}
              heatmapValues={heatmapValues}
              style={{ height: 350, alignSelf: 'stretch' }}
            />
          ) : (
            <View style={{ alignItems: 'center' }}>
              <View style={[styles.avatarWrap, { transform: [{ scaleX }] }]}>
                <Svg width={180} height={280} viewBox="0 0 180 280">
                  <Circle cx="90" cy="25" r="20" fill={colors.dark.secondary} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <Rect x="82" y="43" width="16" height="12" fill={colors.dark.secondary} />
                  <Path d="M50 55 L130 55 L140 80 L145 130 L130 160 L50 160 L35 130 L40 80 Z" fill={bodyPartColor('torso', m)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <Path d="M35 60 L15 60 L5 130 L20 130 L35 80" fill={bodyPartColor('leftArm', m)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <Path d="M145 60 L165 60 L175 130 L160 130 L145 80" fill={bodyPartColor('rightArm', m)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <Path d="M50 160 L130 160 L120 180 L60 180 Z" fill={bodyPartColor('torso', m)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <Path d="M60 180 L80 180 L75 260 L55 260 Z" fill={bodyPartColor('leftLeg', m)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <Path d="M100 180 L120 180 L125 260 L105 260 Z" fill={bodyPartColor('rightLeg', m)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                </Svg>
              </View>
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} /><Text style={styles.legendText}>{pt ? 'Baixo' : 'Low'}</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#eab308' }]} /><Text style={styles.legendText}>{pt ? 'Moderado' : 'Moderate'}</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} /><Text style={styles.legendText}>{pt ? 'Alto' : 'High'}</Text></View>
              </View>
            </View>
          )}
        </View>

        {/* Metrics grid */}
        <Text style={styles.sectionTitle}>{pt ? 'Composicao Corporal' : 'Body Composition'}</Text>
        <View style={styles.metricsGrid}>
          {metrics.map((item, i) => (
            <View key={i} style={styles.metricCard} data-testid={`metric-${i}`}>
              <Ionicons name={item.icon as any} size={20} color={item.color} />
              <Text style={[styles.metricValue, { color: item.color }]}>{item.value}</Text>
              <Text style={styles.metricLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Symmetry */}
        <Text style={styles.sectionTitle}>{pt ? 'Simetria' : 'Symmetry'}</Text>
        <View style={styles.symmetryCard}>
          <View style={styles.symmetryRow}>
            <Text style={styles.symmetryLabel}>{pt ? 'Tronco vs Membros' : 'Trunk vs Limbs'}</Text>
            <Text style={[styles.symmetryValue, { color: s.lateralDiff > 20 ? '#ef4444' : '#22c55e' }]}>
              {s.lateralDiff}%
            </Text>
          </View>
          <Text style={styles.symmetryDesc}>{s.lateralLabel}</Text>
          <View style={[styles.symmetryRow, { marginTop: 10 }]}>
            <Text style={styles.symmetryLabel}>{pt ? 'Superior vs Inferior' : 'Upper vs Lower'}</Text>
            <Text style={[styles.symmetryValue, { color: s.verticalDiff > 20 ? '#ef4444' : '#22c55e' }]}>
              {s.verticalDiff}%
            </Text>
          </View>
          <Text style={styles.symmetryDesc}>{s.verticalLabel}</Text>
        </View>

        {/* Insights */}
        <Text style={styles.sectionTitle}>{pt ? 'Insights' : 'Insights'}</Text>
        <View style={styles.insightsCard}>
          {(pt ? s.insightsPt : s.insights).map((insight, i) => (
            <View key={i} style={styles.insightRow}>
              <Ionicons name="bulb" size={16} color="#f59e0b" />
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </View>

        {/* Measurements detail */}
        <Text style={styles.sectionTitle}>{pt ? 'Dobras Cutaneas' : 'Skinfold Measurements'}</Text>
        <View style={styles.measurementsCard}>
          {Object.entries(m).filter(([, v]) => v !== undefined && v > 0).map(([site, value]) => (
            <View key={site} style={styles.measurementRow}>
              <View style={[styles.measurementDot, { backgroundColor: heatColor(value as number) }]} />
              <Text style={styles.measurementSite}>
                {pt ? SKINFOLD_LABELS[site as keyof typeof SKINFOLD_LABELS]?.pt : SKINFOLD_LABELS[site as keyof typeof SKINFOLD_LABELS]?.en}
              </Text>
              <Text style={styles.measurementValue}>{value} mm</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()} data-testid="report-edit-btn">
            <Ionicons name="create" size={18} color={colors.accent.primary} />
            <Text style={styles.secondaryBtnText}>{pt ? 'Editar' : 'Edit'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, saved && { opacity: 0.6 }]}
            onPress={saved ? () => {
              if (returnPath === 'station') {
                router.replace('/(tabs)/athletes' as any);
              } else if (returnPath === 'hub') {
                router.replace('/(tabs)/athletes' as any);
              } else {
                router.replace(`/athlete/${athleteId}`);
              }
            } : handleSave}
            disabled={saving}
            data-testid="report-done-btn"
          >
            <LinearGradient colors={saved ? ['#16a34a', '#059669'] : ['#22c55e', '#16a34a']} style={styles.primaryBtnGrad}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name={saved ? 'checkmark-done' : 'save'} size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {saved ? (pt ? 'Concluir' : 'Done') : (pt ? 'Salvar' : 'Save')}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text.primary },
  protocolBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 10, padding: 10, marginBottom: 12 },
  protocolBadgeText: { fontSize: 13, fontWeight: '600', color: '#a78bfa', flex: 1 },
  protocolBadgeSub: { fontSize: 12, color: colors.text.tertiary },
  classCard: { backgroundColor: colors.dark.card, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.border.default },
  classLabel: { fontSize: 12, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  classValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  classFat: { fontSize: 14, color: colors.text.secondary, marginTop: 2 },
  avatarContainer: { marginBottom: 20, backgroundColor: colors.dark.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border.default, overflow: 'hidden', minHeight: 350 },
  avatarWrap: { paddingVertical: 20 },
  legend: { flexDirection: 'row', gap: 16, paddingBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.text.secondary },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  metricCard: { width: Math.floor((SW - 32 - 16) / 3), backgroundColor: colors.dark.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border.default, marginBottom: 8 },
  metricValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  metricLabel: { fontSize: 10, color: colors.text.secondary, marginTop: 2, textAlign: 'center' },
  symmetryCard: { backgroundColor: colors.dark.card, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.border.default },
  symmetryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  symmetryLabel: { fontSize: 13, color: colors.text.primary, fontWeight: '500' },
  symmetryValue: { fontSize: 18, fontWeight: '800' },
  symmetryDesc: { fontSize: 12, color: colors.text.tertiary, marginTop: 2 },
  insightsCard: { backgroundColor: colors.dark.card, borderRadius: 14, padding: 14, marginBottom: 20, gap: 8, borderWidth: 1, borderColor: colors.border.default },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  insightText: { flex: 1, fontSize: 13, color: colors.text.primary, lineHeight: 18 },
  measurementsCard: { backgroundColor: colors.dark.card, borderRadius: 14, padding: 14, marginBottom: 20, gap: 6, borderWidth: 1, borderColor: colors.border.default },
  measurementRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  measurementDot: { width: 8, height: 8, borderRadius: 4 },
  measurementSite: { flex: 1, fontSize: 13, color: colors.text.primary },
  measurementValue: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  actionsRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.dark.card, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: colors.border.default },
  secondaryBtnText: { color: colors.accent.primary, fontSize: 14, fontWeight: '600' },
  primaryBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  primaryBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
