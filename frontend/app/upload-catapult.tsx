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
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import api from '../services/api';
import { parseCatapultCSV, validateCatapultCSV } from '../utils/csvParser';
import { Athlete } from '../types';

export default function UploadCatapultCSV() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [matchedAthletes, setMatchedAthletes] = useState<{[key: string]: string}>({});
  const [unmatchedPlayers, setUnmatchedPlayers] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Get all athletes
  const { data: athletes } = useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const response = await api.get<Athlete[]>('/athletes');
      return response.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ csvData, createMissing }: { csvData: string, createMissing: boolean }) => {
      const validation = validateCatapultCSV(csvData);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const { data: records } = parseCatapultCSV(csvData);
      
      // If createMissing is true, create new athletes
      if (createMissing && unmatchedPlayers.length > 0) {
        for (const playerName of unmatchedPlayers) {
          try {
            const response = await api.post('/athletes', {
              name: playerName,
              birth_date: '2000-01-01', // Default date
              position: 'Não especificado',
            });
            
            // Add to matched athletes
            const newAthlete = response.data;
            matchedAthletes[playerName] = newAthlete.id || newAthlete._id;
          } catch (error) {
            console.error(`Error creating athlete ${playerName}:`, error);
          }
        }
      }
      
      let successCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      // Import records for each player
      for (const record of records) {
        const playerName = record.player_name;
        
        if (!playerName) {
          skippedCount++;
          continue;
        }

        // Find matching athlete
        const athleteId = matchedAthletes[playerName];
        
        if (!athleteId) {
          skippedCount++;
          errors.push(`Atleta não encontrado: ${playerName}`);
          continue;
        }

        try {
          await api.post('/gps-data', {
            athlete_id: athleteId,
            date: record.date,
            total_distance: record.total_distance,
            high_intensity_distance: record.high_intensity_distance,
            high_speed_running: record.high_speed_running,
            sprint_distance: record.sprint_distance,
            number_of_sprints: record.number_of_sprints,
            number_of_accelerations: record.number_of_accelerations,
            number_of_decelerations: record.number_of_decelerations,
            max_speed: record.max_speed,
            max_acceleration: record.max_acceleration,
            max_deceleration: record.max_deceleration,
            notes: record.period_name ? `Período: ${record.period_name}` : undefined,
          });
          successCount++;
        } catch (error: any) {
          errors.push(`Erro ao importar ${playerName}: ${error.message}`);
        }
      }

      return { successCount, skippedCount, errors };
    },
    onSuccess: ({ successCount, skippedCount, errors }) => {
      queryClient.invalidateQueries({ queryKey: ['gps'] });
      
      let message = `${successCount} registros importados com sucesso!`;
      if (skippedCount > 0) {
        message += `\n${skippedCount} registros ignorados.`;
      }
      if (errors.length > 0) {
        message += `\n\nErros:\n${errors.slice(0, 3).join('\n')}`;
        if (errors.length > 3) {
          message += `\n... e mais ${errors.length - 3} erros`;
        }
      }
      
      Alert.alert('Import Concluído', message);
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.message || 'Erro ao importar dados');
    },
  });

  const matchPlayerNames = (playerNamesFromCSV: string[]) => {
    if (!athletes) return;

    const matched: {[key: string]: string} = {};
    const unmatched: string[] = [];

    playerNamesFromCSV.forEach(playerName => {
      // Try to match by exact name first
      let athlete = athletes.find(a => 
        a.name.toLowerCase().trim() === playerName.toLowerCase().trim()
      );

      // If not found, try partial match (contains)
      if (!athlete) {
        athlete = athletes.find(a => 
          a.name.toLowerCase().includes(playerName.toLowerCase()) ||
          playerName.toLowerCase().includes(a.name.toLowerCase())
        );
      }

      if (athlete) {
        matched[playerName] = athlete.id || athlete._id || '';
      } else {
        unmatched.push(playerName);
      }
    });

    setMatchedAthletes(matched);
    setUnmatchedPlayers(unmatched);
  };

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

        // Parse and extract player names
        try {
          const { data: records } = parseCatapultCSV(content);
          setRecordCount(records.length);
          
          // Get unique player names
          const uniquePlayerNames = [...new Set(
            records
              .map(r => r.player_name)
              .filter(name => name) as string[]
          )];
          
          setPlayerNames(uniquePlayerNames);
          matchPlayerNames(uniquePlayerNames);
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

    if (unmatchedPlayers.length > 0) {
      Alert.alert(
        'Criar Atletas Automaticamente?',
        `${unmatchedPlayers.length} jogadores não foram encontrados:\n\n${unmatchedPlayers.join('\n')}\n\nDeseja criar esses atletas automaticamente?`,
        [
          { 
            text: 'Cancelar', 
            style: 'cancel' 
          },
          {
            text: 'Ignorar e Importar',
            onPress: () => uploadMutation.mutate({ csvData: fileContent, createMissing: false }),
          },
          {
            text: 'Criar e Importar',
            onPress: () => uploadMutation.mutate({ csvData: fileContent, createMissing: true }),
            style: 'default',
          },
        ]
      );
    } else {
      Alert.alert(
        'Confirmar Import',
        `Deseja importar ${recordCount} registros para ${playerNames.length} atletas?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Importar',
            onPress: () => uploadMutation.mutate({ csvData: fileContent, createMissing: false }),
          },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import CSV Catapult</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={48} color="#2563eb" />
          <Text style={styles.infoTitle}>Import para Múltiplos Atletas</Text>
          <Text style={styles.infoText}>
            O sistema irá associar automaticamente os dados do CSV aos atletas cadastrados pelo nome.
          </Text>
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
                <Text style={styles.fileRecords}>
                  {recordCount} registros • {playerNames.length} jogadores
                </Text>
              </View>
            </View>

            {/* Matched Athletes */}
            {Object.keys(matchedAthletes).length > 0 && (
              <View style={styles.matchSection}>
                <Text style={styles.matchTitle}>
                  ✅ Atletas Encontrados ({Object.keys(matchedAthletes).length})
                </Text>
                {Object.keys(matchedAthletes).map(playerName => (
                  <View key={playerName} style={styles.matchItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                    <Text style={styles.matchText}>{playerName}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Unmatched Players */}
            {unmatchedPlayers.length > 0 && (
              <View style={styles.unmatchSection}>
                <Text style={styles.unmatchTitle}>
                  ⚠️ Não Encontrados ({unmatchedPlayers.length})
                </Text>
                {unmatchedPlayers.map(playerName => (
                  <View key={playerName} style={styles.unmatchItem}>
                    <Ionicons name="alert-circle" size={16} color="#f59e0b" />
                    <Text style={styles.unmatchText}>{playerName}</Text>
                  </View>
                ))}
                <Text style={styles.unmatchHint}>
                  Cadastre esses atletas no sistema antes de importar os dados.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.uploadButton,
                (uploadMutation.isPending || Object.keys(matchedAthletes).length === 0) && styles.uploadButtonDisabled
              ]}
              onPress={handleUpload}
              disabled={uploadMutation.isPending || Object.keys(matchedAthletes).length === 0}
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
  matchSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
  },
  matchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803d',
    marginBottom: 8,
  },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  matchText: {
    fontSize: 13,
    color: '#166534',
  },
  unmatchSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#fffbeb',
    borderRadius: 8,
  },
  unmatchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b45309',
    marginBottom: 8,
  },
  unmatchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  unmatchText: {
    fontSize: 13,
    color: '#92400e',
  },
  unmatchHint: {
    fontSize: 12,
    color: '#92400e',
    marginTop: 8,
    fontStyle: 'italic',
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
    backgroundColor: '#d1d5db',
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
