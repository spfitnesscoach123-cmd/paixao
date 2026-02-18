import React, { useState, useEffect } from 'react';
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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIOMETRIC_EMAIL_KEY = 'biometric_email';
const BIOMETRIC_PASSWORD_KEY = 'biometric_password';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const { login } = useAuth();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  
  const styles = createLoginStyles(colors);

  useEffect(() => {
    checkBiometricSupport();
  }, []);

  const checkBiometricSupport = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricSupported(compatible && enrolled);

      // Check if there are saved credentials
      const biometricEnabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
      const savedEmail = await AsyncStorage.getItem(BIOMETRIC_EMAIL_KEY);
      setHasSavedCredentials(biometricEnabled === 'true' && !!savedEmail);
    } catch (error) {
      console.log('Biometric check error:', error);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('auth.login'),
        fallbackLabel: t('auth.password'),
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLoading(true);
        const savedEmail = await AsyncStorage.getItem(BIOMETRIC_EMAIL_KEY);
        const savedPassword = await AsyncStorage.getItem(BIOMETRIC_PASSWORD_KEY);

        if (savedEmail && savedPassword) {
          try {
            await login(savedEmail, savedPassword);
            router.replace('/(tabs)/athletes');
          } catch (error: any) {
            Alert.alert(t('common.error'), t('auth.invalidCredentials'));
            // Clear invalid credentials
            await AsyncStorage.multiRemove([BIOMETRIC_EMAIL_KEY, BIOMETRIC_PASSWORD_KEY, BIOMETRIC_ENABLED_KEY]);
            setHasSavedCredentials(false);
          }
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.log('Biometric login error:', error);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      
      // Ask to save credentials for biometric login
      if (isBiometricSupported) {
        Alert.alert(
          t('auth.enableBiometrics'),
          t('auth.biometricsPrompt'),
          [
            { text: t('common.no'), style: 'cancel' },
            {
              text: t('common.yes'),
              onPress: async () => {
                await AsyncStorage.setItem(BIOMETRIC_EMAIL_KEY, email);
                await AsyncStorage.setItem(BIOMETRIC_PASSWORD_KEY, password);
                await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
              },
            },
          ]
        );
      }
      
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
        {/* CORREÇÃO 4: Botão Voltar para tela de seleção de role */}
        <SafeAreaView style={styles.backButtonContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              // Limpar role selecionado para voltar à tela de seleção
              AsyncStorage.removeItem('role_selected');
              router.replace('/role-select');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            <Text style={styles.backButtonText}>{t('common.back') || 'Voltar'}</Text>
          </TouchableOpacity>
        </SafeAreaView>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={styles.form}>
            <View style={[styles.inputContainer, styles.glowEffect]}>
              <Ionicons name="mail-outline" size={20} color={colors.accent.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.email')}
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
                placeholder={t('auth.password')}
                placeholderTextColor={colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() => router.push('/forgot-password')}
            >
              <Text style={styles.forgotPasswordText}>{t('auth.forgotPassword')}</Text>
            </TouchableOpacity>

            {/* Login Button - using TouchableOpacity for better web compatibility */}
            <TouchableOpacity
              style={styles.button}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
              testID="login-button"
              accessibilityRole="button"
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
                  <Text style={styles.buttonText}>{t('auth.login')}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Biometric Login Button */}
            {isBiometricSupported && hasSavedCredentials && (
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                <Ionicons 
                  name={Platform.OS === 'ios' ? 'scan' : 'finger-print'} 
                  size={28} 
                  color={colors.accent.primary} 
                />
                <Text style={styles.biometricButtonText}>
                  {Platform.OS === 'ios' ? t('auth.loginWithFaceID') : t('auth.loginWithBiometrics')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.registerLink}
              onPress={() => router.push('/register')}
            >
              <Text style={styles.registerText}>
                {t('auth.noAccount')} <Text style={styles.registerTextBold}>{t('auth.register')}</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="analytics" size={24} color={colors.accent.primary} />
              <Text style={styles.featureText}>{t('features.aiAnalysis')}</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="stats-chart" size={24} color={colors.accent.tertiary} />
              <Text style={styles.featureText}>{t('features.acwrFatigue')}</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="people" size={24} color={colors.accent.blue} />
              <Text style={styles.featureText}>{t('features.comparisons')}</Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const createLoginStyles = (colors: any) => StyleSheet.create({
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
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 10,
  },
  logo: {
    width: 180,
    height: 180,
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    marginTop: -8,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: colors.accent.light,
    fontWeight: '600',
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
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent.primary,
    height: 56,
    marginTop: 16,
    gap: 12,
  },
  biometricButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent.primary,
  },
  registerLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  registerTextBold: {
    color: colors.accent.light,
    fontWeight: '700',
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 48,
  },
  featureItem: {
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
  },
});
