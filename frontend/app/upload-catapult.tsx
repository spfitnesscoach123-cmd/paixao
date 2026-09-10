import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import api from '../services/api';
import { parseCatapultCSV, validateCatapultCSV } from '../utils/csvParser';
import { Athlete } from '../types';
import { colors } from '../constants/theme';

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
  const [recordsPerPlayer, setRecordsPerPlayer] = useState<{[key: string]: number}>({});

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
      
      // Generate unique session ID for this CSV upload
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sessionDate = records[0]?.date || new Date().toISOString().split('T')[0];
      const sessionName = fileName?.replace('.csv', '') || `Sessão ${sessionDate}`;
      
      // Create a copy of matchedAthletes to update
      const updatedMatchedAthletes = { ...matchedAthletes };
      
      // If createMissing is true, create new athletes FIRST
      if (createMissing && unmatchedPlayers.length > 0) {
        for (const playerName of unmatchedPlayers) {
          try {
            const response = await api.post('/athletes', {
              name: playerName,
              birth_date: '2000-01-01',
              position: 'Não especificado',
            });
            
            const newAthlete = response.data;
            updatedMatchedAthletes[playerName] = newAthlete.id || newAthlete._id;
          } catch (error) {
            console.error(`Error creating athlete ${playerName}:`, error);
          }
        }
      }
      
      let successCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      const importedByPlayer: {[key: string]: number} = {};

      // Group records by player name and import each player's data to their profile
      for (const record of records) {
        const playerName = record.player_name;
        
        if (!playerName) {
          skippedCount++;
          continue;
        }

        // Find matching athlete ID
        const athleteId = updatedMatchedAthletes[playerName];
        
        if (!athleteId) {
          skippedCount++;
          if (!errors.includes(`Atleta não encontrado: ${playerName}`)) {
            errors.push(`Atleta não encontrado: ${playerName}`);
          }
          continue;
        }

        try {
          // Import GPS data for THIS specific athlete with session info
          await api.post('/gps-data', {
            athlete_id: athleteId,
            date: record.date,
            session_id: sessionId,
            session_name: sessionName,
            period_name: record.period_name || 'Full Session',
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
          importedByPlayer[playerName] = (importedByPlayer[playerName] || 0) + 1;
        } catch (error: any) {
          errors.push(`Erro ao importar ${playerName}: ${error.message}`);
        }
      }

      return { successCount, skippedCount, errors, importedByPlayer };
    },
    onSuccess: ({ successCount, skippedCount, errors, importedByPlayer }) => {
      queryClient.invalidateQueries({ queryKey: ['gps'] });
      queryClient.invalidateQueries({ queryKey: ['athletes'] });
      
      // Build detailed success message
      let message = `✅ ${successCount} registros importados com sucesso!\n\n`;
      message += '📊 Por atleta:\n';
      Object.entries(importedByPlayer).forEach(([name, count]) => {
        message += `• ${name}: ${count} registro(s)\n`;
      });
      
      if (skippedCount > 0) {
        message += `\n⚠️ ${skippedCount} registros ignorados.`;
      }
      if (errors.length > 0) {
        message += `\n\n❌ Erros:\n${errors.slice(0, 3).join('\n')}`;
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

  const matchPlayerNames = (playerNamesFromCSV: string[], csvContent: string) => {
    if (!athletes) return;

    const matched: {[key: string]: string} = {};
    const unmatched: string[] = [];
    const recordsCount: {[key: string]: number} = {};

    // Count records per player
    const { data: records } = parseCatapultCSV(csvContent);
    records.forEach(record => {
      if (record.player_name) {
        recordsCount[record.player_name] = (recordsCount[record.player_name] || 0) + 1;
      }
    });
    setRecordsPerPlayer(recordsCount);

    playerNamesFromCSV.forEach(playerName => {
      let athlete = athletes.find(a => 
        a.name.toLowerCase().trim() === playerName.toLowerCase().trim()
      );

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
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setIsProcessing(true);
        const file = result.assets[0];
        setFileName(file.name);

        const response = await fetch(file.uri);
        const content = await response.text();
        setFileContent(content);

        try {
          const { data: records } = parseCatapultCSV(content);
          setRecordCount(records.length);
          
          const uniquePlayerNames = [...new Set(
            records
              .map(r => r.player_name)
              .filter(name => name) as string[]
          )];
          
          setPlayerNames(uniquePlayerNames);
          matchPlayerNames(uniquePlayerNames, content);
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

    const matchedCount = Object.keys(matchedAthletes).length;
    const totalPlayers = playerNames.length;

    if (unmatchedPlayers.length > 0) {
      Alert.alert(
        'Criar Atletas Automaticamente?',
        `${unmatchedPlayers.length} jogadores não foram encontrados:\n\n${unmatchedPlayers.slice(0, 5).join('\n')}${unmatchedPlayers.length > 5 ? '\n...' : ''}\n\nDeseja criar perfis para esses atletas?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Ignorar',
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
        `Importar dados para ${totalPlayers} atletas?\n\nCada atleta receberá apenas seus próprios dados GPS.`,
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
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import CSV Catapult</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <View style={styles.infoCard}>
            <LinearGradient
              colors={colors.gradients.card}
              style={styles.infoGradient}
            >
              <Ionicons name="information-circle" size={48} color={colors.accent.primary} />
              <Text style={styles.infoTitle}>Import Inteligente</Text>
              <Text style={styles.infoText}>
                O sistema associa automaticamente os dados de cada jogador ao seu perfil pelo nome no CSV.
              </Text>
            </LinearGradient>
          </View>

          <TouchableOpacity
            style={styles.pickButton}
            onPress={pickDocument}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator color={colors.accent.primary} />
            ) : (
              <>
                <Ionicons name="document" size={28} color={colors.accent.primary} />
                <Text style={styles.pickButtonText}>Selecionar Arquivo CSV</Text>
              </>
            )}
          </TouchableOpacity>

          {fileName && (
            <View style={styles.fileCard}>
              <View style={styles.fileHeader}>
                <View style={styles.fileIconContainer}>
                  <Ionicons name="document-text" size={32} color={colors.status.success} />
                </View>
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
                      <Ionicons name="checkmark-circle" size={18} color={colors.status.success} />
                      <Text style={styles.matchText}>{playerName}</Text>
                      <Text style={styles.matchCount}>
                        {recordsPerPlayer[playerName] || 0} reg.
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Unmatched Players */}
              {unmatchedPlayers.length > 0 && (
                <View style={styles.unmatchSection}>
                  <Text style={styles.unmatchTitle}>
                    ➕ Novos Atletas ({unmatchedPlayers.length})
                  </Text>
                  <Text style={styles.unmatchSubtitle}>
                    Serão criados automaticamente se você confirmar:
                  </Text>
                  {unmatchedPlayers.map(playerName => (
                    <View key={playerName} style={styles.unmatchItem}>
                      <Ionicons name="person-add" size={18} color={colors.accent.primary} />
                      <Text style={styles.unmatchText}>{playerName}</Text>
                      <Text style={styles.matchCount}>
                        {recordsPerPlayer[playerName] || 0} reg.
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.uploadButton,
                  uploadMutation.isPending && styles.uploadButtonDisabled
                ]}
                onPress={handleUpload}
                disabled={uploadMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={uploadMutation.isPending ? [colors.text.tertiary, colors.text.tertiary] : colors.gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.uploadGradient}
                >
                  {uploadMutation.isPending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={24} color="#ffffff" />
                      <Text style={styles.uploadButtonText}>Importar Dados</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    color: colors.text.primary,
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
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  infoGradient: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: colors.border.default,
    borderStyle: 'dashed',
    gap: 12,
  },
  pickButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  fileCard: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 16,
  },
  fileIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  fileRecords: {
    fontSize: 14,
    color: colors.status.success,
    fontWeight: '500',
  },
  matchSection: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  matchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.status.success,
    marginBottom: 12,
  },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  matchText: {
    fontSize: 14,
    color: colors.text.primary,
    flex: 1,
  },
  matchCount: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontWeight: '500',
  },
  unmatchSection: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  unmatchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent.primary,
    marginBottom: 4,
  },
  unmatchSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 12,
  },
  unmatchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  unmatchText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '500',
    flex: 1,
  },
  uploadButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  uploadButtonDisabled: {
    shadowOpacity: 0,
  },
  uploadGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 10,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
