import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import api from '../services/api';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

export default function GenerateWellnessToken() {
  const router = useRouter();
  const { t } = useLanguage();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<{
    tokenId: string;
    expiresAt: string;
    maxUses: number;
  } | null>(null);
  
  // Configuration state
  const [expiresIn, setExpiresIn] = useState('24h');
  const [maxUses, setMaxUses] = useState(30);

  // Duration options
  const DURATION_OPTIONS = [
    { value: '30min', label: '30 min' },
    { value: '1h', label: '1h' },
    { value: '2h', label: '2h' },
    { value: '8h', label: '8h' },
    { value: '24h', label: '24h' },
  ];

  // Max uses options
  const MAX_USES_OPTIONS = [5, 10, 20, 30, 50];

  const handleGenerateToken = async () => {
    setIsGenerating(true);
    try {
      const response = await api.post('/wellness/token', {
        max_uses: maxUses,
        expires_in: expiresIn,
      });
      
      setGeneratedToken({
        tokenId: response.data.token_id,
        expiresAt: response.data.expires_at,
        maxUses: response.data.max_uses,
      });
    } catch (error: any) {
      Alert.alert(
        t('common.error') || 'Erro',
        error.response?.data?.detail || t('common.tryAgain') || 'Tente novamente'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToken = async () => {
    if (generatedToken) {
      await Clipboard.setStringAsync(generatedToken.tokenId);
      Alert.alert(
        t('common.success') || 'Sucesso',
        t('token.copied') || 'Token copiado!'
      );
    }
  };

  const handleShareToken = async () => {
    if (generatedToken) {
      try {
        await Share.share({
          message: `${t('token.shareMessage') || 'Use este código para acessar o questionário de bem-estar'}:\n\n${generatedToken.tokenId}`,
          title: t('token.shareTitle') || 'Código de Bem-Estar',
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} testID="back-button">
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {t('token.generateToken') || 'Gerar Token Wellness'}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <View style={styles.infoCard}>
            <Ionicons name="key-outline" size={48} color={colors.accent.primary} />
            <Text style={styles.infoTitle}>
              {t('token.tokenTitle') || 'Token de Acesso'}
            </Text>
            <Text style={styles.infoText}>
              {t('token.tokenDescription') || 'Gere um código para seus atletas preencherem o questionário de bem-estar diretamente no app.'}
            </Text>
          </View>

          {!generatedToken ? (
            <>
              {/* Duration Selection */}
              <View style={styles.optionsCard}>
                <Text style={styles.optionLabel}>
                  {t('token.expiresIn') || 'Tempo de expiração'}:
                </Text>
                <View style={styles.optionsRow}>
                  {DURATION_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.optionButton,
                        expiresIn === option.value && styles.optionButtonActive,
                      ]}
                      onPress={() => setExpiresIn(option.value)}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          expiresIn === option.value && styles.optionButtonTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Max Uses Selection */}
              <View style={styles.optionsCard}>
                <Text style={styles.optionLabel}>
                  {t('token.maxUses') || 'Número máximo de usos'}:
                </Text>
                <View style={styles.optionsRow}>
                  {MAX_USES_OPTIONS.map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[
                        styles.optionButton,
                        maxUses === num && styles.optionButtonActive,
                      ]}
                      onPress={() => setMaxUses(num)}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          maxUses === num && styles.optionButtonTextActive,
                        ]}
                      >
                        {num}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Generate Button */}
              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleGenerateToken}
                disabled={isGenerating}
                activeOpacity={0.8}
                testID="generate-button"
              >
                <LinearGradient
                  colors={colors.gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.generateGradient}
                >
                  {isGenerating ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="key" size={24} color="#ffffff" />
                      <Text style={styles.generateText}>
                        {t('token.generateToken') || 'Gerar Token'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.resultCard}>
              <View style={styles.successHeader}>
                <Ionicons name="checkmark-circle" size={32} color={colors.status.success} />
                <Text style={styles.successTitle}>
                  {t('token.tokenGenerated') || 'Token Gerado!'}
                </Text>
              </View>

              {/* Token Display */}
              <View style={styles.tokenBox}>
                <Text style={styles.tokenText}>{generatedToken.tokenId}</Text>
              </View>

              <View style={styles.tokenInfo}>
                <View style={styles.tokenInfoItem}>
                  <Ionicons name="time-outline" size={16} color={colors.text.secondary} />
                  <Text style={styles.tokenInfoText}>
                    {t('token.expiresAt') || 'Expira em'}: {formatDate(generatedToken.expiresAt)}
                  </Text>
                </View>
                <View style={styles.tokenInfoItem}>
                  <Ionicons name="people-outline" size={16} color={colors.text.secondary} />
                  <Text style={styles.tokenInfoText}>
                    {t('token.maxUsesLabel') || 'Máximo de usos'}: {generatedToken.maxUses}
                  </Text>
                </View>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleCopyToken}
                  testID="copy-button"
                >
                  <Ionicons name="copy-outline" size={22} color={colors.accent.primary} />
                  <Text style={styles.actionButtonText}>
                    {t('common.copy') || 'Copiar'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.shareButton]}
                  onPress={handleShareToken}
                  testID="share-button"
                >
                  <LinearGradient
                    colors={colors.gradients.primary}
                    style={styles.shareGradient}
                  >
                    <Ionicons name="share-outline" size={22} color="#ffffff" />
                    <Text style={styles.shareButtonText}>
                      {t('common.share') || 'Compartilhar'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.newTokenButton}
                onPress={() => setGeneratedToken(null)}
              >
                <Text style={styles.newTokenText}>
                  {t('token.generateNew') || 'Gerar Novo Token'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Instructions */}
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>
              {t('token.howItWorks') || 'Como funciona'}:
            </Text>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>1</Text>
              </View>
              <Text style={styles.instructionText}>
                {t('token.step1') || 'Gere um token com duração e limite de uso'}
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>2</Text>
              </View>
              <Text style={styles.instructionText}>
                {t('token.step2') || 'Compartilhe o código com seus atletas'}
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>3</Text>
              </View>
              <Text style={styles.instructionText}>
                {t('token.step3') || 'Atletas digitam o código no app e respondem o questionário'}
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>4</Text>
              </View>
              <Text style={styles.instructionText}>
                {t('token.step4') || 'Cada atleta pode usar o token apenas uma vez'}
              </Text>
            </View>
          </View>
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
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  infoTitle: {
    fontSize: 20,
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
  optionsCard: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.dark.tertiary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
    minWidth: 60,
  },
  optionButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  optionButtonTextActive: {
    color: '#ffffff',
  },
  generateButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
    marginTop: 8,
  },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  generateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  resultCard: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.status.success,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.status.success,
  },
  tokenBox: {
    backgroundColor: colors.dark.primary,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  tokenText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.accent.primary,
    letterSpacing: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tokenInfo: {
    gap: 8,
    marginBottom: 20,
  },
  tokenInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tokenInfoText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.dark.tertiary,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  shareButton: {
    backgroundColor: 'transparent',
    padding: 0,
    borderWidth: 0,
    overflow: 'hidden',
  },
  shareGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  newTokenButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  newTokenText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  instructionsCard: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
