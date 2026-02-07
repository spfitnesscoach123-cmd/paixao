import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect, G, Text as SvgText } from 'react-native-svg';
import api from '../../../services/api';
import { colors } from '../../../constants/theme';
import { useLanguage } from '../../../contexts/LanguageContext';

interface Protocol {
  name: string;
  name_en: string;
  description_pt: string;
  description_en: string;
  sites: string[];
  sites_male?: string[];
  sites_female?: string[];
  sites_count: number;
}

interface ProtocolsResponse {
  [key: string]: Protocol;
}

const SKINFOLD_LABELS: { [key: string]: { pt: string; en: string; bodyPart: string } } = {
  triceps: { pt: 'Tríceps', en: 'Triceps', bodyPart: 'arm' },
  biceps: { pt: 'Bíceps', en: 'Biceps', bodyPart: 'arm' },
  subscapular: { pt: 'Subescapular', en: 'Subscapular', bodyPart: 'back' },
  suprailiac: { pt: 'Suprailíaca', en: 'Suprailiac', bodyPart: 'waist' },
  abdominal: { pt: 'Abdominal', en: 'Abdominal', bodyPart: 'trunk' },
  chest: { pt: 'Peitoral', en: 'Chest', bodyPart: 'trunk' },
  midaxillary: { pt: 'Axilar Média', en: 'Midaxillary', bodyPart: 'trunk' },
  thigh: { pt: 'Coxa', en: 'Thigh', bodyPart: 'leg' },
  calf: { pt: 'Panturrilha', en: 'Calf', bodyPart: 'leg' },
};

// Body Model SVG Component showing measurement points
const BodyMeasurementModel = ({ requiredSites, skinfolds }: { requiredSites: string[], skinfolds: { [key: string]: string } }) => {
  const getSitePosition = (site: string) => {
    const positions: { [key: string]: { x: number; y: number } } = {
      triceps: { x: 25, y: 95 },
      biceps: { x: 155, y: 95 },
      chest: { x: 70, y: 85 },
      subscapular: { x: 110, y: 90 },
      midaxillary: { x: 55, y: 105 },
      abdominal: { x: 90, y: 130 },
      suprailiac: { x: 65, y: 145 },
      thigh: { x: 75, y: 195 },
      calf: { x: 75, y: 250 },
    };
    return positions[site] || { x: 90, y: 100 };
  };

  const getColor = (site: string) => {
    if (!requiredSites.includes(site)) return colors.dark.secondary;
    if (skinfolds[site] && parseFloat(skinfolds[site]) > 0) return '#10b981';
    return colors.accent.primary;
  };

  return (
    <Svg width={180} height={280} viewBox="0 0 180 280">
      {/* Head */}
      <Circle cx="90" cy="25" r="20" fill={colors.dark.secondary} stroke={colors.border.default} strokeWidth="1" />
      
      {/* Neck */}
      <Rect x="82" y="43" width="16" height="12" fill={colors.dark.secondary} />
      
      {/* Torso */}
      <Path
        d="M50 55 L130 55 L140 80 L145 130 L130 160 L50 160 L35 130 L40 80 Z"
        fill={colors.dark.secondary}
        stroke={colors.border.default}
        strokeWidth="1"
      />
      
      {/* Left Arm */}
      <Path
        d="M35 60 L15 60 L5 130 L20 130 L35 80"
        fill={colors.dark.secondary}
        stroke={colors.border.default}
        strokeWidth="1"
      />
      
      {/* Right Arm */}
      <Path
        d="M145 60 L165 60 L175 130 L160 130 L145 80"
        fill={colors.dark.secondary}
        stroke={colors.border.default}
        strokeWidth="1"
      />
      
      {/* Pelvis */}
      <Path
        d="M50 160 L130 160 L120 180 L60 180 Z"
        fill={colors.dark.secondary}
        stroke={colors.border.default}
        strokeWidth="1"
      />
      
      {/* Left Leg */}
      <Path
        d="M60 180 L80 180 L75 260 L55 260 Z"
        fill={colors.dark.secondary}
        stroke={colors.border.default}
        strokeWidth="1"
      />
      
      {/* Right Leg */}
      <Path
        d="M100 180 L120 180 L125 260 L105 260 Z"
        fill={colors.dark.secondary}
        stroke={colors.border.default}
        strokeWidth="1"
      />
      
      {/* Measurement Points */}
      {Object.keys(SKINFOLD_LABELS).map((site) => {
        const pos = getSitePosition(site);
        const isRequired = requiredSites.includes(site);
        const isFilled = skinfolds[site] && parseFloat(skinfolds[site]) > 0;
        
        if (!isRequired) return null;
        
        return (
          <G key={site}>
            <Circle
              cx={pos.x}
              cy={pos.y}
              r={8}
              fill={isFilled ? '#10b981' : colors.accent.primary}
              stroke="#ffffff"
              strokeWidth="2"
            />
            {isFilled && (
              <SvgText
                x={pos.x}
                y={pos.y + 4}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8"
                fontWeight="bold"
              >
                ✓
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
};

export default function AddBodyComposition() {
  const { id: athleteId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useLanguage();
  
  const [protocol, setProtocol] = useState('');
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  const [gender, setGender] = useState('male');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [skinfolds, setSkinfolds] = useState<{ [key: string]: string }>({});
  const [notes, setNotes] = useState('');
  
  // Fetch available protocols
  const { data: protocols, isLoading: protocolsLoading } = useQuery({
    queryKey: ['body-composition-protocols'],
    queryFn: async () => {
      const response = await api.get<ProtocolsResponse>(`/body-composition/protocols?lang=${locale}`);
      return response.data;
    },
  });
  
  // Set default protocol when data loads
  useEffect(() => {
    if (protocols && !protocol) {
      setProtocol('guedes');
    }
  }, [protocols]);
  
  // Get required sites for current protocol and gender
  const getRequiredSites = (): string[] => {
    if (!protocols || !protocol || !protocols[protocol]) return [];
    const proto = protocols[protocol];
    if (gender === 'male' && proto.sites_male) {
      return proto.sites_male;
    }
    if (gender === 'female' && proto.sites_female) {
      return proto.sites_female;
    }
    return proto.sites || [];
  };
  
  const requiredSites = getRequiredSites();
  
  // Reset skinfolds when protocol changes
  useEffect(() => {
    setSkinfolds({});
  }, [protocol, gender]);
  
  // Create body composition mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/body-composition', data);
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['body-compositions', athleteId] });
      queryClient.invalidateQueries({ queryKey: ['body-composition-analysis', athleteId] });
      
      // Show results
      Alert.alert(
        locale === 'pt' ? 'Resultado da Avaliação' : 'Assessment Result',
        locale === 'pt' 
          ? `% Gordura: ${result.body_fat_percentage.toFixed(1)}%\nMassa Magra: ${result.lean_mass_kg.toFixed(1)} kg\nMassa Gorda: ${result.fat_mass_kg.toFixed(1)} kg\nIMC: ${result.bmi.toFixed(1)}`
          : `Body Fat: ${result.body_fat_percentage.toFixed(1)}%\nLean Mass: ${result.lean_mass_kg.toFixed(1)} kg\nFat Mass: ${result.fat_mass_kg.toFixed(1)} kg\nBMI: ${result.bmi.toFixed(1)}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: any) => {
      Alert.alert(
        locale === 'pt' ? 'Erro' : 'Error',
        error.response?.data?.detail || (locale === 'pt' ? 'Falha ao salvar' : 'Failed to save')
      );
    },
  });
  
  const handleSubmit = () => {
    if (!protocol) {
      Alert.alert(
        locale === 'pt' ? 'Selecione um protocolo' : 'Select a protocol',
        locale === 'pt' ? 'Escolha o protocolo de avaliação' : 'Choose the assessment protocol'
      );
      return;
    }
    
    if (!weight || !height || !age) {
      Alert.alert(
        locale === 'pt' ? 'Campos obrigatórios' : 'Required fields',
        locale === 'pt' ? 'Preencha peso, altura e idade' : 'Please fill weight, height and age'
      );
      return;
    }
    
    const missingFields = requiredSites.filter(site => !skinfolds[site] || parseFloat(skinfolds[site]) <= 0);
    if (missingFields.length > 0) {
      Alert.alert(
        locale === 'pt' ? 'Dobras faltando' : 'Missing skinfolds',
        locale === 'pt' 
          ? `Preencha: ${missingFields.map(s => SKINFOLD_LABELS[s]?.pt || s).join(', ')}`
          : `Fill in: ${missingFields.map(s => SKINFOLD_LABELS[s]?.en || s).join(', ')}`
      );
      return;
    }
    
    const data = {
      athlete_id: athleteId,
      date: new Date().toISOString().split('T')[0],
      protocol,
      weight: parseFloat(weight),
      height: parseFloat(height),
      age: parseInt(age),
      gender,
      ...Object.fromEntries(
        Object.entries(skinfolds).map(([key, value]) => [key, value ? parseFloat(value) : null])
      ),
      notes: notes || null,
    };
    
    createMutation.mutate(data);
  };
  
  const selectedProtocol = protocols?.[protocol];
  
  return (
    <View style={styles.container}>
      <LinearGradient colors={colors.gradients.primary} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Composição Corporal' : 'Body Composition'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {locale === 'pt' ? 'Nova Avaliação' : 'New Assessment'}
          </Text>
        </View>
      </LinearGradient>
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Protocol Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? '1. Protocolo de Avaliação' : '1. Assessment Protocol'}
          </Text>
          
          <TouchableOpacity 
            style={styles.protocolSelector}
            onPress={() => setShowProtocolModal(true)}
          >
            <View style={styles.protocolSelectorContent}>
              <Ionicons name="document-text" size={24} color={colors.accent.primary} />
              <View style={styles.protocolSelectorText}>
                <Text style={styles.protocolSelectorLabel}>
                  {selectedProtocol 
                    ? (locale === 'pt' ? selectedProtocol.name : selectedProtocol.name_en)
                    : (locale === 'pt' ? 'Selecione o protocolo' : 'Select protocol')
                  }
                </Text>
                {selectedProtocol && (
                  <Text style={styles.protocolSelectorDesc}>
                    {selectedProtocol.sites_count} {locale === 'pt' ? 'dobras cutâneas' : 'skinfolds'}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-down" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          
          {selectedProtocol && (
            <Text style={styles.protocolDescription}>
              {locale === 'pt' ? selectedProtocol.description_pt : selectedProtocol.description_en}
            </Text>
          )}
        </View>
        
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? '2. Dados Básicos' : '2. Basic Data'}
          </Text>
          
          {/* Gender Selection */}
          <Text style={styles.fieldLabel}>{locale === 'pt' ? 'Sexo' : 'Gender'}</Text>
          <View style={styles.genderButtons}>
            <TouchableOpacity
              style={[styles.genderButton, gender === 'male' && styles.genderButtonActive]}
              onPress={() => setGender('male')}
            >
              <Ionicons name="male" size={24} color={gender === 'male' ? '#ffffff' : colors.text.secondary} />
              <Text style={[styles.genderText, gender === 'male' && styles.genderTextActive]}>
                {locale === 'pt' ? 'Masculino' : 'Male'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.genderButton, gender === 'female' && styles.genderButtonActive]}
              onPress={() => setGender('female')}
            >
              <Ionicons name="female" size={24} color={gender === 'female' ? '#ffffff' : colors.text.secondary} />
              <Text style={[styles.genderText, gender === 'female' && styles.genderTextActive]}>
                {locale === 'pt' ? 'Feminino' : 'Female'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Weight, Height, Age */}
          <View style={styles.inputsRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{locale === 'pt' ? 'Peso (kg)' : 'Weight (kg)'}</Text>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="75.5"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{locale === 'pt' ? 'Altura (cm)' : 'Height (cm)'}</Text>
              <TextInput
                style={styles.input}
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
                placeholder="178"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{locale === 'pt' ? 'Idade' : 'Age'}</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                placeholder="25"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>
          </View>
        </View>
        
        {/* Skinfold Measurements with Body Model */}
        {protocol && requiredSites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {locale === 'pt' ? '3. Dobras Cutâneas (mm)' : '3. Skinfold Measurements (mm)'}
            </Text>
            
            <View style={styles.measurementContainer}>
              {/* Body Model */}
              <View style={styles.bodyModelWrapper}>
                <BodyMeasurementModel requiredSites={requiredSites} skinfolds={skinfolds} />
                <Text style={styles.bodyModelHint}>
                  {locale === 'pt' ? 'Pontos de medição' : 'Measurement points'}
                </Text>
              </View>
              
              {/* Skinfold Inputs */}
              <View style={styles.skinfoldInputs}>
                {requiredSites.map((site) => (
                  <View key={site} style={styles.skinfoldRow}>
                    <View style={styles.skinfoldLabelContainer}>
                      <View style={[
                        styles.skinfoldDot,
                        { backgroundColor: skinfolds[site] && parseFloat(skinfolds[site]) > 0 ? '#10b981' : colors.accent.primary }
                      ]} />
                      <Text style={styles.skinfoldLabel}>
                        {SKINFOLD_LABELS[site]?.[locale === 'pt' ? 'pt' : 'en'] || site}
                      </Text>
                    </View>
                    <TextInput
                      style={styles.skinfoldInput}
                      value={skinfolds[site] || ''}
                      onChangeText={(text) => setSkinfolds(prev => ({ ...prev, [site]: text }))}
                      keyboardType="decimal-pad"
                      placeholder="0.0"
                      placeholderTextColor={colors.text.tertiary}
                    />
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
        
        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? '4. Observações' : '4. Notes'}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholder={locale === 'pt' ? 'Observações adicionais...' : 'Additional notes...'}
            placeholderTextColor={colors.text.tertiary}
          />
        </View>
        
        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={createMutation.isPending}
        >
          <LinearGradient colors={['#10b981', '#059669']} style={styles.submitGradient}>
            {createMutation.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="calculator" size={24} color="#ffffff" />
                <Text style={styles.submitText}>
                  {locale === 'pt' ? 'Calcular e Salvar' : 'Calculate and Save'}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        
        <View style={{ height: 40 }} />
      </ScrollView>
      
      {/* Protocol Selection Modal */}
      <Modal
        visible={showProtocolModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProtocolModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {locale === 'pt' ? 'Selecionar Protocolo' : 'Select Protocol'}
              </Text>
              <TouchableOpacity onPress={() => setShowProtocolModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            {protocols && Object.entries(protocols).map(([key, proto]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.protocolOption,
                  protocol === key && styles.protocolOptionActive
                ]}
                onPress={() => {
                  setProtocol(key);
                  setShowProtocolModal(false);
                }}
              >
                <View style={styles.protocolOptionContent}>
                  <Text style={styles.protocolOptionName}>
                    {locale === 'pt' ? proto.name : proto.name_en}
                  </Text>
                  <Text style={styles.protocolOptionDesc}>
                    {proto.sites_count} {locale === 'pt' ? 'dobras' : 'skinfolds'} - {locale === 'pt' ? proto.description_pt : proto.description_en}
                  </Text>
                </View>
                {protocol === key && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.accent.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent.primary,
    marginBottom: 16,
  },
  protocolSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  protocolSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  protocolSelectorText: {
    flex: 1,
  },
  protocolSelectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  protocolSelectorDesc: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  protocolDescription: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 12,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  genderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.dark.secondary,
    borderWidth: 2,
    borderColor: colors.border.default,
  },
  genderButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  genderText: {
    fontSize: 16,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  genderTextActive: {
    color: '#ffffff',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.dark.secondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    textAlign: 'center',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    textAlign: 'left',
  },
  measurementContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  bodyModelWrapper: {
    alignItems: 'center',
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  bodyModelHint: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 4,
  },
  skinfoldInputs: {
    flex: 1,
    gap: 10,
  },
  skinfoldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.secondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  skinfoldLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skinfoldDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  skinfoldLabel: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '500',
  },
  skinfoldInput: {
    width: 70,
    backgroundColor: colors.dark.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text.primary,
    fontSize: 14,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.dark.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  protocolOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: colors.dark.card,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  protocolOptionActive: {
    borderColor: colors.accent.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  protocolOptionContent: {
    flex: 1,
    marginRight: 12,
  },
  protocolOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  protocolOptionDesc: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
});
