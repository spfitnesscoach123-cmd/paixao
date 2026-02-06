import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import api from '../../../services/api';
import { parseCatapultCSV, validateCatapultCSV } from '../../../utils/csvParser';

export default function UploadGPS() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const validation = validateCatapultCSV(csvData);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const records = parseCatapultCSV(csvData);
      const promises = records.map(record =>
        api.post('/gps-data', {
          athlete_id: id,
          ...record,
        })
      );

      await Promise.all(promises);
      return records.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['gps', id] });
      Alert.alert('Sucesso', `${count} registros importados com sucesso!`);
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.message || 'Erro ao importar dados');
    },
  });

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setIsProcessing(true);
        const file = result.assets[0];
        setFileName(file.name);

        // Read file content
        const response = await fetch(file.uri);
        const content = await response.text();
        setFileContent(content);

        // Preview record count
        try {
          const records = parseCatapultCSV(content);
          setRecordCount(records.length);
        } catch (error) {
          Alert.alert('Aviso', 'Não foi possível analisar o arquivo. Verifique o formato.');
        }

        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Erro', 'Não foi possível selecionar o arquivo');
      setIsProcessing(false);
    }
  };

  const handleUpload = () => {
    if (!fileContent) {
      Alert.alert('Erro', 'Nenhum arquivo selecionado');
      return;
    }

    Alert.alert(
      'Confirmar Import', 
      `Deseja importar ${recordCount} registros?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: () => uploadMutation.mutate(fileContent),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload CSV Catapult</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={48} color="#2563eb" />
          <Text style={styles.infoTitle}>Formato do Arquivo</Text>
          <Text style={styles.infoText}>
            O arquivo CSV deve conter colunas com dados GPS do Catapult, incluindo:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Data do treino</Text>
            <Text style={styles.bulletItem}>• Distância total</Text>
            <Text style={styles.bulletItem}>• Distância em alta intensidade</Text>
            <Text style={styles.bulletItem}>• Distância em sprints</Text>
            <Text style={styles.bulletItem}>• Número de sprints</Text>
            <Text style={styles.bulletItem}>• Acelerações e desacelerações</Text>
            <Text style={styles.bulletItem}>• Velocidade máxima</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.pickButton}
          onPress={pickDocument}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <>
              <Ionicons name="document" size={24} color="#2563eb" />
              <Text style={styles.pickButtonText}>Selecionar Arquivo CSV</Text>
            </>
          )}
        </TouchableOpacity>

        {fileName && (
          <View style={styles.fileCard}>
            <View style={styles.fileHeader}>
              <Ionicons name="document-text" size={32} color="#10b981" />
              <View style={styles.fileInfo}>
                <Text style={styles.fileName}>{fileName}</Text>
                <Text style={styles.fileRecords}>{recordCount} registros detectados</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.uploadButton, uploadMutation.isPending && styles.uploadButtonDisabled]}
              onPress={handleUpload}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={24} color="#ffffff" />
                  <Text style={styles.uploadButtonText}>Importar Dados</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.exampleCard}>
          <Text style={styles.exampleTitle}>Exemplo de CSV</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {`date,total distance,hi distance,sprint distance,sprints,accel,decel,max speed
2026-02-01,10500,2300,450,15,35,32,34.5
2026-02-02,9800,2100,380,12,28,30,33.2`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2563eb',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e40af',
    marginTop: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    textAlign: 'center',
    marginBottom: 12,
  },
  bulletList: {
    alignSelf: 'stretch',
  },
  bulletItem: {
    fontSize: 13,
    color: '#1e40af',
    marginBottom: 6,
    marginLeft: 20,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
    gap: 12,
  },
  pickButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  fileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  fileRecords: {
    fontSize: 14,
    color: '#10b981',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  uploadButtonDisabled: {
    backgroundColor: '#86efac',
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  exampleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  exampleTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  codeBlock: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    fontSize: 11,
    color: '#10b981',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
