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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)/athletes');
    } catch (error: any) {
      Alert.alert('Erro', error.message);
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
        colors={[colors.dark.primary, colors.dark.secondary]}
        style={styles.background}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.iconGlow}>
              <LinearGradient
                colors={colors.gradients.cyan}
                style={styles.iconGradient}
              >
                <Ionicons name="football" size={48} color="#ffffff" />
              </LinearGradient>
            </View>
            <Text style={styles.title}>Football Training</Text>
            <Text style={styles.subtitle}>Sistema Avançado de Prescrição</Text>
            <View style={styles.spectralLine} />
          </View>

          <View style={styles.form}>
            <View style={[styles.inputContainer, styles.glowEffect]}>
              <Ionicons name="mail-outline" size={20} color={colors.spectral.cyan} style={styles.inputIcon} />
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
              <Ionicons name="lock-closed-outline" size={20} color={colors.spectral.cyan} style={styles.inputIcon} />
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

            <TouchableOpacity
              style={styles.button}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={colors.gradients.cyan}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Entrar</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.registerLink}
              onPress={() => router.push('/register')}
            >
              <Text style={styles.registerText}>
                Não tem uma conta? <Text style={styles.registerTextBold}>Registre-se</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="analytics" size={24} color={colors.spectral.green} />
              <Text style={styles.featureText}>Análise com IA</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="stats-chart" size={24} color={colors.spectral.teal} />
              <Text style={styles.featureText}>ACWR & Fadiga</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="people" size={24} color={colors.spectral.purple} />
              <Text style={styles.featureText}>Comparações</Text>
            </View>
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
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconGlow: {
    marginBottom: 20,
    shadowColor: colors.spectral.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.spectral.cyan,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 1,
  },
  spectralLine: {
    width: 60,
    height: 3,
    backgroundColor: colors.spectral.green,
    marginTop: 12,
    borderRadius: 2,
    shadowColor: colors.spectral.green,
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
    borderColor: 'rgba(0, 212, 255, 0.2)',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  glowEffect: {
    shadowColor: colors.spectral.cyan,
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
    shadowColor: colors.spectral.cyan,
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
  registerLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  registerTextBold: {
    color: colors.spectral.green,
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
