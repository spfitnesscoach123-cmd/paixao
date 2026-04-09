/**
 * protocol-select.tsx — Selecao de protocolo + dados do atleta
 *
 * Fluxo: Selecionar protocolo -> Informar genero/idade/peso/altura -> Ir para medicoes
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PROTOCOLS, getProtocolSites } from '../../../engine/body-composition/protocolEngine';
import { SKINFOLD_LABELS, type Gender } from '../../../types/protocols';

export default function ProtocolSelectScreen() {
  const { id: athleteId, scanWeight, scanHeight } = useLocalSearchParams<{
    id: string; scanWeight?: string; scanHeight?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale } = useLanguage();

  const [selectedProtocol, setSelectedProtocol] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('25');
  const [weight, setWeight] = useState(scanWeight || '75');
  const [height, setHeight] = useState(scanHeight || '175');

  const protocol = PROTOCOLS.find((p) => p.id === selectedProtocol);
  const sites = protocol ? getProtocolSites(protocol, gender) : [];

  const handleNext = useCallback(() => {
    if (!selectedProtocol || !age || !weight || !height) return;
    const params = {
      protocolId: selectedProtocol,
      gender,
      age,
      weight,
      height,
    };
    router.push({
      pathname: `/athlete/${athleteId}/measurement`,
      params,
    });
  }, [selectedProtocol, gender, age, weight, height, athleteId, router]);

  const pt = locale === 'pt';

  return (
    <LinearGradient colors={[colors.dark.primary, colors.dark.secondary]} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} data-testid="protocol-back-btn">
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>{pt ? 'Selecionar Protocolo' : 'Select Protocol'}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Protocols */}
        <Text style={styles.sectionTitle}>{pt ? 'Protocolos' : 'Protocols'}</Text>
        {PROTOCOLS.map((p) => {
          const isSelected = selectedProtocol === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.protocolCard, isSelected && styles.protocolCardSelected]}
              onPress={() => setSelectedProtocol(p.id)}
              data-testid={`protocol-${p.id}`}
            >
              <View style={styles.protocolRow}>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.protocolName, isSelected && styles.protocolNameSelected]}>
                    {pt ? p.namePt : p.name}
                  </Text>
                  <Text style={styles.protocolDesc}>{pt ? p.descriptionPt : p.description}</Text>
                </View>
              </View>
              {isSelected && sites.length > 0 && (
                <View style={styles.sitesRow}>
                  {sites.map((s) => (
                    <View key={s} style={styles.siteBadge}>
                      <Text style={styles.siteText}>{pt ? SKINFOLD_LABELS[s].pt : SKINFOLD_LABELS[s].en}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Dados do Atleta */}
        {selectedProtocol && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{pt ? 'Dados do Atleta' : 'Athlete Data'}</Text>

            {/* Genero */}
            <View style={styles.genderRow}>
              <TouchableOpacity
                style={[styles.genderBtn, gender === 'male' && styles.genderBtnActive]}
                onPress={() => setGender('male')}
                data-testid="gender-male"
              >
                <Ionicons name="male" size={20} color={gender === 'male' ? '#fff' : colors.text.secondary} />
                <Text style={[styles.genderText, gender === 'male' && styles.genderTextActive]}>
                  {pt ? 'Masculino' : 'Male'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genderBtn, gender === 'female' && styles.genderBtnActive]}
                onPress={() => setGender('female')}
                data-testid="gender-female"
              >
                <Ionicons name="female" size={20} color={gender === 'female' ? '#fff' : colors.text.secondary} />
                <Text style={[styles.genderText, gender === 'female' && styles.genderTextActive]}>
                  {pt ? 'Feminino' : 'Female'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inputs */}
            <View style={styles.inputsRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{pt ? 'Idade' : 'Age'}</Text>
                <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" data-testid="input-age" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{pt ? 'Peso (kg)' : 'Weight (kg)'}</Text>
                <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" data-testid="input-weight" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{pt ? 'Altura (cm)' : 'Height (cm)'}</Text>
                <TextInput style={styles.input} value={height} onChangeText={setHeight} keyboardType="numeric" data-testid="input-height" />
              </View>
            </View>

            {/* Botao */}
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext} data-testid="protocol-next-btn">
              <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={styles.nextBtnGradient}>
                <Text style={styles.nextBtnText}>{pt ? 'Iniciar Medicoes' : 'Start Measurements'}</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text.primary },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text.secondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  protocolCard: { backgroundColor: colors.dark.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border.default },
  protocolCardSelected: { borderColor: '#8b5cf6' },
  protocolRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border.default, justifyContent: 'center', alignItems: 'center' },
  radioSelected: { borderColor: '#8b5cf6' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#8b5cf6' },
  protocolName: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  protocolNameSelected: { color: '#a78bfa' },
  protocolDesc: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  sitesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingLeft: 34 },
  siteBadge: { backgroundColor: 'rgba(139,92,246,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  siteText: { fontSize: 11, color: '#a78bfa', fontWeight: '500' },
  genderRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  genderBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.dark.card, borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: colors.border.default },
  genderBtnActive: { borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.15)' },
  genderText: { fontSize: 14, fontWeight: '600', color: colors.text.secondary },
  genderTextActive: { color: '#a78bfa' },
  inputsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 12, color: colors.text.secondary, marginBottom: 4 },
  input: { backgroundColor: colors.input.background, borderWidth: 1, borderColor: colors.input.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '600', color: colors.text.primary, textAlign: 'center' },
  nextBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  nextBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
