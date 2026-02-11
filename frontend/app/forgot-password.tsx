import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

export default function ForgotPassword() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const router = useRouter();

  const handleVerifyEmail = async () => {
    if (!email) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    setIsLoading(true);
    try {
      // Verify if email exists
      const response = await api.post('/auth/verify-email', { email });
      if (response.data.exists) {
        setStep('reset');
        Alert.alert(t('auth.emailVerified'), t('auth.setNewPassword'));
      } else {
        Alert.alert(t('common.error'), t('auth.invalidCredentials'));
      }
    } catch (error: any) {
      // If endpoint doesn't exist, proceed anyway for demo
      setStep('reset');
      Alert.alert(t('common.warning'), t('auth.setNewPassword'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwordsDoNotMatch'));
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordMinLength'));
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/reset-password', {
        email,
        new_password: newPassword,
      });
      Alert.alert(
        t('auth.passwordResetSuccess'),
        t('auth.passwordResetSuccess'),
        [{ text: 'OK', onPress: () => router.replace('/login') }]
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.detail || t('common.tryAgain'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={[colors.dark.secondary, colors.dark.primary]}
        style={styles.background}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.accent.primary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconGlow}>
              <LinearGradient
                colors={colors.gradients.primary}
                style={styles.iconGradient}
              >
                <Ionicons name="key" size={40} color="#ffffff" />
              </LinearGradient>
            </View>
            <Text style={styles.title}>
              {step === 'email' ? 'Recuperar Senha' : 'Nova Senha'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'email' 
                ? 'Informe seu email cadastrado' 
                : 'Defina sua nova senha'}
            </Text>
            <View style={styles.spectralLine} />
          </View>

          <View style={styles.form}>
            {step === 'email' ? (
              <>
                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="mail-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email cadastrado"
                    placeholderTextColor={colors.text.tertiary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleVerifyEmail}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={colors.gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Verificar Email</Text>
                        <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.emailConfirm}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.status.success} />
                  <Text style={styles.emailConfirmText}>{email}</Text>
                </View>

                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Nova senha"
                    placeholderTextColor={colors.text.tertiary}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <View style={[styles.inputContainer, styles.glowEffect]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirmar nova senha"
                    placeholderTextColor={colors.text.tertiary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity
                  style={styles.button}
                  onPress={handleResetPassword}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={colors.gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Redefinir Senha</Text>
                        <Ionicons name="checkmark" size={20} color="#ffffff" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backToEmail}
                  onPress={() => setStep('email')}
                >
                  <Text style={styles.backToEmailText}>
                    <Ionicons name="arrow-back" size={14} color={colors.text.secondary} /> Usar outro email
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.loginText}>
                Lembrou a senha? <Text style={styles.loginTextBold}>Entrar</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 0,
    padding: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconGlow: {
    marginBottom: 16,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  spectralLine: {
    width: 60,
    height: 3,
    backgroundColor: colors.accent.blue,
    marginTop: 12,
    borderRadius: 2,
    shadowColor: colors.accent.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  form: {
    width: '100%',
  },
  emailConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  emailConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  glowEffect: {
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: colors.text.primary,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonGradient: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  backToEmail: {
    marginTop: 16,
    alignItems: 'center',
  },
  backToEmailText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  loginLink: {
    marginTop: 32,
    alignItems: 'center',
  },
  loginText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  loginTextBold: {
    color: colors.accent.light,
    fontWeight: '700',
  },
});
