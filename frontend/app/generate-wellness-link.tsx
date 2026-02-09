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

export default function GenerateWellnessLink() {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{
    token: string;
    expiresAt: string;
    shareUrl: string;
  } | null>(null);
  const [expiresHours, setExpiresHours] = useState(24); // Default 24 hours

  // Duration options in hours
  const DURATION_OPTIONS = [
    { value: 0.5, label: '30 min', labelPt: '30 min' },
    { value: 2, label: '2 hours', labelPt: '2 horas' },
    { value: 8, label: '8 hours', labelPt: '8 horas' },
    { value: 24, label: '24 hours', labelPt: '24 horas' },
  ];

  const handleGenerateLink = async () => {
    setIsGenerating(true);
    try {
      const response = await api.post(`/wellness/generate-link?expires_hours=${expiresHours}`);
      
      // Use the app's domain for wellness links
      // This will work with both deep links and web fallback
      const baseUrl = 'https://loadmanager.app';
      
      const fullUrl = `${baseUrl}/wellness-form/${response.data.link_token}`;
      
      setGeneratedLink({
        token: response.data.link_token,
        expiresAt: response.data.expires_at,
        shareUrl: fullUrl,
      });
    } catch (error: any) {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao gerar link');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (generatedLink) {
      await Clipboard.setStringAsync(generatedLink.shareUrl);
      Alert.alert('Copiado!', 'Link copiado para a área de transferência');
    }
  };

  const handleShareLink = async () => {
    if (generatedLink) {
      try {
        await Share.share({
          message: `Preencha seu questionário de bem-estar diário:\n\n${generatedLink.shareUrl}`,
          title: 'Questionário de Bem-Estar',
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Link Wellness</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={48} color={colors.accent.primary} />
            <Text style={styles.infoTitle}>Questionário para Atletas</Text>
            <Text style={styles.infoText}>
              Gere um link compartilhável para que seus atletas preencham o questionário 
              de bem-estar diretamente do celular, sem precisar de cadastro no app.
            </Text>
          </View>

          {!generatedLink ? (
            <>
              <View style={styles.optionsCard}>
                <Text style={styles.optionLabel}>Validade do Link:</Text>
                <View style={styles.daysSelector}>
                  {DURATION_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dayButton,
                        expiresHours === option.value && styles.dayButtonActive,
                      ]}
                      onPress={() => setExpiresHours(option.value)}
                    >
                      <Text
                        style={[
                          styles.dayButtonText,
                          expiresHours === option.value && styles.dayButtonTextActive,
                        ]}
                      >
                        {option.labelPt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleGenerateLink}
                disabled={isGenerating}
                activeOpacity={0.8}
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
                      <Ionicons name="link" size={24} color="#ffffff" />
                      <Text style={styles.generateText}>Gerar Link</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.resultCard}>
              <View style={styles.successHeader}>
                <Ionicons name="checkmark-circle" size={32} color={colors.status.success} />
                <Text style={styles.successTitle}>Link Gerado!</Text>
              </View>

              <View style={styles.linkBox}>
                <Text style={styles.linkText} numberOfLines={2}>
                  {generatedLink.shareUrl}
                </Text>
              </View>

              <View style={styles.expiryInfo}>
                <Ionicons name="time-outline" size={16} color={colors.text.secondary} />
                <Text style={styles.expiryText}>
                  Válido até: {formatDate(generatedLink.expiresAt)}
                </Text>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleCopyLink}
                >
                  <Ionicons name="copy-outline" size={22} color={colors.accent.primary} />
                  <Text style={styles.actionButtonText}>Copiar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.shareButton]}
                  onPress={handleShareLink}
                >
                  <LinearGradient
                    colors={colors.gradients.primary}
                    style={styles.shareGradient}
                  >
                    <Ionicons name="share-outline" size={22} color="#ffffff" />
                    <Text style={styles.shareButtonText}>Compartilhar</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.newLinkButton}
                onPress={() => setGeneratedLink(null)}
              >
                <Text style={styles.newLinkText}>Gerar Novo Link</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>Como Funciona:</Text>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>1</Text>
              </View>
              <Text style={styles.instructionText}>
                Compartilhe o link com seus atletas via WhatsApp, e-mail ou outro meio
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>2</Text>
              </View>
              <Text style={styles.instructionText}>
                O atleta acessa o link e seleciona seu nome da lista
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>3</Text>
              </View>
              <Text style={styles.instructionText}>
                Após preencher, os dados são automaticamente salvos no perfil do atleta
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
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 12,
  },
  daysSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  dayButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.dark.tertiary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  dayButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  dayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  dayButtonTextActive: {
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
  linkBox: {
    backgroundColor: colors.dark.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  linkText: {
    fontSize: 13,
    color: colors.accent.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  expiryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  expiryText: {
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
  newLinkButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  newLinkText: {
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
