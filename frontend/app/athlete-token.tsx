import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

export default function AthleteToken() {
  const router = useRouter();
  const { t } = useLanguage();
  const [token, setToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (token.trim().length < 4) {
      setError(t('token.enterCode') || 'Digite o código do seu treinador');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const response = await api.post('/wellness/token/validate', {
        token: token.trim().toUpperCase(),
      });

      if (response.data.valid) {
        // Navigate to athlete wellness form with token
        router.push({
          pathname: '/athlete-wellness',
          params: { token: token.trim().toUpperCase() },
        });
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || t('token.invalidToken') || 'Token inválido ou expirado';
      setError(errorMessage);
    } finally {
      setIsValidating(false);
    }
  };

  const handleGoBack = () => {
    router.replace('/role-select');
  };

  return (
    <LinearGradient
      colors={[colors.dark.primary, colors.dark.secondary]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleGoBack}
            testID="back-button"
          >
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>

          <View style={styles.content}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="keypad-outline" size={64} color={colors.accent.primary} />
            </View>

            {/* Title */}
            <Text style={styles.title}>
              {t('token.enterTitle') || 'Insira o código do seu treinador'}
            </Text>
            <Text style={styles.subtitle}>
              {t('token.enterSubtitle') || 'Peça o código ao seu coach para acessar o questionário'}
            </Text>

            {/* Token Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={(text) => {
                  setToken(text.toUpperCase());
                  setError(null);
                }}
                placeholder="XXXXXX"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                textAlign="center"
                testID="token-input"
              />
            </View>

            {/* Error Message */}
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={18} color={colors.status.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Validate Button */}
            <TouchableOpacity
              style={[styles.validateButton, token.length < 4 && styles.validateButtonDisabled]}
              onPress={handleValidate}
              disabled={isValidating || token.length < 4}
              activeOpacity={0.8}
              testID="validate-button"
            >
              <LinearGradient
                colors={token.length >= 4 ? colors.gradients.primary : [colors.dark.tertiary, colors.dark.tertiary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.validateGradient}
              >
                {isValidating ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.validateText}>
                      {t('token.validate') || 'Validar'}
                    </Text>
                    <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Info */}
            <View style={styles.infoContainer}>
              <Ionicons name="information-circle-outline" size={20} color={colors.text.tertiary} />
              <Text style={styles.infoText}>
                {t('token.infoText') || 'O código é fornecido pelo seu treinador e tem validade limitada'}
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.dark.cardSolid,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.primary,
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.status.error,
    flex: 1,
  },
  validateButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  validateButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  validateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  validateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 32,
    paddingHorizontal: 16,
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: colors.text.tertiary,
    flex: 1,
    lineHeight: 18,
  },
});
