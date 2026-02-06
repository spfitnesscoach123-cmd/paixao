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
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwordsDoNotMatch'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordMinLength'));
      return;
    }

    if (!acceptedTerms) {
      Alert.alert(t('common.error'), t('auth.mustAcceptTerms'));
      return;
    }

    setIsLoading(true);
    try {
      await register(email, password, name);
      router.replace('/(tabs)/athletes');
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
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
                <Ionicons name="person-add" size={40} color="#ffffff" />
              </LinearGradient>
            </View>
            <Text style={styles.title}>Criar Conta</Text>
            <Text style={styles.subtitle}>Junte-se à plataforma</Text>
            <View style={styles.spectralLine} />
          </View>

          <View style={styles.form}>
            <View style={[styles.inputContainer, styles.glowEffect]}>
              <Ionicons name="person-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nome completo"
                placeholderTextColor={colors.text.tertiary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.inputContainer, styles.glowEffect]}>
              <Ionicons name="mail-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.text.tertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={[styles.inputContainer, styles.glowEffect]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Senha"
                placeholderTextColor={colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={[styles.inputContainer, styles.glowEffect]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirmar senha"
                placeholderTextColor={colors.text.tertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {/* Terms and Privacy Checkbox */}
            <View style={styles.termsContainer}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setAcceptedTerms(!acceptedTerms)}
              >
                <Ionicons
                  name={acceptedTerms ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={acceptedTerms ? colors.accent.primary : colors.text.tertiary}
                />
              </TouchableOpacity>
              <View style={styles.termsTextContainer}>
                <Text style={styles.termsText}>
                  Li e aceito os{' '}
                  <Text style={styles.termsLink} onPress={() => router.push('/terms-of-use')}>
                    Termos de Uso
                  </Text>
                  {' '}e a{' '}
                  <Text style={styles.termsLink} onPress={() => router.push('/privacy-policy')}>
                    Política de Privacidade
                  </Text>
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, !acceptedTerms && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={isLoading || !acceptedTerms}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={acceptedTerms ? colors.gradients.primary : [colors.text.disabled, colors.text.disabled]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Criar Conta</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => router.back()}
            >
              <Text style={styles.loginText}>
                Já tem uma conta? <Text style={styles.loginTextBold}>Entrar</Text>
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
    color: colors.accent.light,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  loginLink: {
    marginTop: 24,
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
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    padding: 4,
    marginRight: 12,
  },
  termsTextContainer: {
    flex: 1,
  },
  termsText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  termsLink: {
    color: colors.accent.primary,
    fontWeight: '600',
  },
  buttonDisabled: {
    shadowOpacity: 0,
  },
});
