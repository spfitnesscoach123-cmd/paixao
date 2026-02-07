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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Picker } from '@react-native-picker/picker';
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

const SKINFOLD_LABELS: { [key: string]: { pt: string; en: string } } = {
  triceps: { pt: 'Tríceps', en: 'Triceps' },
  subscapular: { pt: 'Subescapular', en: 'Subscapular' },
  suprailiac: { pt: 'Suprailíaca', en: 'Suprailiac' },
  abdominal: { pt: 'Abdominal', en: 'Abdominal' },
  chest: { pt: 'Peitoral', en: 'Chest' },
  midaxillary: { pt: 'Axilar Média', en: 'Midaxillary' },
  thigh: { pt: 'Coxa', en: 'Thigh' },
  calf: { pt: 'Panturrilha', en: 'Calf' },
  biceps: { pt: 'Bíceps', en: 'Biceps' },
};

export default function AddBodyComposition() {
  const { id: athleteId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useLanguage();
  
  const [protocol, setProtocol] = useState('pollock_jackson_7');
  const [gender, setGender] = useState('male');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [skinfolds, setSkinfolds] = useState<{ [key: string]: string }>({});
  const [notes, setNotes] = useState('');
  
  // Fetch available protocols
  const { data: protocols } = useQuery({
    queryKey: ['body-composition-protocols'],
    queryFn: async () => {
      const response = await api.get<ProtocolsResponse>(`/body-composition/protocols?lang=${locale}`);
      return response.data;
    },
  });
  
  // Get required sites for current protocol and gender
  const getRequiredSites = (): string[] => {
    if (!protocols || !protocols[protocol]) return [];
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
  
  // Create body composition mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/body-composition', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['body-compositions', athleteId] });
      queryClient.invalidateQueries({ queryKey: ['body-composition-analysis', athleteId] });
      Alert.alert(
        locale === 'pt' ? 'Sucesso' : 'Success',
        locale === 'pt' ? 'Avaliação de composição corporal salva!' : 'Body composition assessment saved!',
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
    // Validate required fields
    if (!weight || !height || !age) {
      Alert.alert(
        locale === 'pt' ? 'Campos obrigatórios' : 'Required fields',
        locale === 'pt' ? 'Preencha peso, altura e idade' : 'Please fill weight, height and age'
      );
      return;
    }
    
    // Check if all required skinfolds are filled
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
  
  const renderSkinfoldInput = (site: string) => {
    const label = SKINFOLD_LABELS[site]?.[locale === 'pt' ? 'pt' : 'en'] || site;
    const isRequired = requiredSites.includes(site);
    
    return (
      <View key={site} style={styles.inputRow}>
        <View style={styles.labelContainer}>
          <Text style={styles.inputLabel}>
            {label} {isRequired && <Text style={styles.requiredStar}>*</Text>}
          </Text>
          <Text style={styles.inputUnit}>(mm)</Text>
        </View>
        <TextInput
          style={[styles.input, styles.smallInput, !isRequired && styles.optionalInput]}
          value={skinfolds[site] || ''}
          onChangeText={(text) => setSkinfolds(prev => ({ ...prev, [site]: text }))}
          keyboardType="decimal-pad"
          placeholder="0.0"
          placeholderTextColor={colors.text.tertiary}
        />
      </View>
    );
  };
  
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
            {locale === 'pt' ? 'Protocolo de Avaliação' : 'Assessment Protocol'}
          </Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={protocol}
              onValueChange={(value) => setProtocol(value)}
              style={styles.picker}
              dropdownIconColor={colors.text.primary}
            >
              {protocols && Object.entries(protocols).map(([key, proto]) => (
                <Picker.Item
                  key={key}
                  label={locale === 'pt' ? proto.name : proto.name_en}
                  value={key}
                  color={colors.text.primary}
                />
              ))}
            </Picker>
          </View>
          {protocols && protocols[protocol] && (
            <Text style={styles.protocolDescription}>
              {locale === 'pt' ? protocols[protocol].description_pt : protocols[protocol].description_en}
            </Text>
          )}
        </View>
        
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? 'Dados Básicos' : 'Basic Data'}
          </Text>
          
          <View style={styles.inputRow}>
            <View style={styles.labelContainer}>
              <Text style={styles.inputLabel}>
                {locale === 'pt' ? 'Sexo' : 'Gender'} <Text style={styles.requiredStar}>*</Text>
              </Text>
            </View>
            <View style={styles.genderButtons}>
              <TouchableOpacity
                style={[styles.genderButton, gender === 'male' && styles.genderButtonActive]}
                onPress={() => setGender('male')}
              >
                <Ionicons name="male" size={20} color={gender === 'male' ? '#ffffff' : colors.text.secondary} />
                <Text style={[styles.genderText, gender === 'male' && styles.genderTextActive]}>
                  {locale === 'pt' ? 'Masculino' : 'Male'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genderButton, gender === 'female' && styles.genderButtonActive]}
                onPress={() => setGender('female')}
              >
                <Ionicons name="female" size={20} color={gender === 'female' ? '#ffffff' : colors.text.secondary} />
                <Text style={[styles.genderText, gender === 'female' && styles.genderTextActive]}>
                  {locale === 'pt' ? 'Feminino' : 'Female'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.inputRow}>
            <View style={styles.labelContainer}>
              <Text style={styles.inputLabel}>
                {locale === 'pt' ? 'Peso' : 'Weight'} <Text style={styles.requiredStar}>*</Text>
              </Text>
              <Text style={styles.inputUnit}>(kg)</Text>
            </View>
            <TextInput
              style={[styles.input, styles.smallInput]}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="75.5"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>
          
          <View style={styles.inputRow}>
            <View style={styles.labelContainer}>
              <Text style={styles.inputLabel}>
                {locale === 'pt' ? 'Altura' : 'Height'} <Text style={styles.requiredStar}>*</Text>
              </Text>
              <Text style={styles.inputUnit}>(cm)</Text>
            </View>
            <TextInput
              style={[styles.input, styles.smallInput]}
              value={height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
              placeholder="178"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>
          
          <View style={styles.inputRow}>
            <View style={styles.labelContainer}>
              <Text style={styles.inputLabel}>
                {locale === 'pt' ? 'Idade' : 'Age'} <Text style={styles.requiredStar}>*</Text>
              </Text>
              <Text style={styles.inputUnit}>({locale === 'pt' ? 'anos' : 'years'})</Text>
            </View>
            <TextInput
              style={[styles.input, styles.smallInput]}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholder="25"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>
        </View>
        
        {/* Skinfold Measurements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? 'Dobras Cutâneas' : 'Skinfold Measurements'}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {locale === 'pt' 
              ? `Protocolo ${protocols?.[protocol]?.name || protocol} requer ${requiredSites.length} dobras`
              : `${protocols?.[protocol]?.name_en || protocol} protocol requires ${requiredSites.length} skinfolds`
            }
          </Text>
          
          {/* Required sites first */}
          {requiredSites.map(site => renderSkinfoldInput(site))}
          
          {/* Optional sites */}
          {protocol === 'pollock_jackson_9' && (
            <>
              {['biceps', 'calf'].filter(s => !requiredSites.includes(s)).map(site => renderSkinfoldInput(site))}
            </>
          )}
        </View>
        
        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {locale === 'pt' ? 'Observações' : 'Notes'}
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
          <LinearGradient colors={colors.gradients.accent} style={styles.submitGradient}>
            {createMutation.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={24} color="#ffffff" />
                <Text style={styles.submitText}>
                  {locale === 'pt' ? 'Salvar Avaliação' : 'Save Assessment'}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        
        <View style={{ height: 40 }} />
      </ScrollView>
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
    color: colors.text.primary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 16,
  },
  pickerContainer: {
    backgroundColor: colors.dark.secondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginTop: 12,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text.primary,
    height: 50,
  },
  protocolDescription: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  labelContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '600',
  },
  inputUnit: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  requiredStar: {
    color: colors.status.error,
  },
  input: {
    backgroundColor: colors.dark.secondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  smallInput: {
    width: 100,
    textAlign: 'center',
  },
  optionalInput: {
    opacity: 0.7,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    marginTop: 12,
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  genderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.dark.secondary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  genderButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  genderText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  genderTextActive: {
    color: '#ffffff',
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
