import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

const { width } = Dimensions.get('window');
const ROLE_SELECTED_KEY = 'role_selected';

export default function RoleSelect() {
  const router = useRouter();
  const { t } = useLanguage();

  const handleCoachSelect = async () => {
    // Save role selection
    await AsyncStorage.setItem(ROLE_SELECTED_KEY, 'coach');
    // Direct to existing login flow
    router.replace('/login');
  };

  const handleAthleteSelect = async () => {
    // Save role selection
    await AsyncStorage.setItem(ROLE_SELECTED_KEY, 'athlete');
    // Direct to token entry screen
    router.replace('/athlete-token');
  };

  return (
    <LinearGradient
      colors={[colors.dark.primary, colors.dark.secondary]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Logo/Icon */}
          <View style={styles.logoContainer}>
            <View style={styles.iconWrapper}>
              <Ionicons name="fitness" size={64} color={colors.accent.primary} />
            </View>
            <Text style={styles.appName}>Load Manager</Text>
            <Text style={styles.subtitle}>Performance & Recovery</Text>
          </View>

          {/* Question */}
          <View style={styles.questionContainer}>
            <Text style={styles.questionText}>
              {t('role.howAccess') || 'Como você deseja acessar?'}
            </Text>
          </View>

          {/* Role Selection Buttons */}
          <View style={styles.buttonsContainer}>
            {/* Coach Button */}
            <TouchableOpacity
              style={styles.roleButton}
              onPress={handleCoachSelect}
              activeOpacity={0.8}
              testID="coach-button"
            >
              <LinearGradient
                colors={colors.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.roleGradient}
              >
                <View style={styles.roleIconContainer}>
                  <Ionicons name="clipboard-outline" size={32} color="#ffffff" />
                </View>
                <View style={styles.roleTextContainer}>
                  <Text style={styles.roleTitle}>
                    {t('role.iAmCoach') || 'Sou Coach'}
                  </Text>
                  <Text style={styles.roleDescription}>
                    {t('role.coachDescription') || 'Gerenciar atletas e treinos'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#ffffff" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Athlete Button */}
            <TouchableOpacity
              style={styles.roleButton}
              onPress={handleAthleteSelect}
              activeOpacity={0.8}
              testID="athlete-button"
            >
              <View style={styles.athleteButton}>
                <View style={styles.roleIconContainer}>
                  <Ionicons name="person-outline" size={32} color={colors.accent.primary} />
                </View>
                <View style={styles.roleTextContainer}>
                  <Text style={[styles.roleTitle, { color: colors.text.primary }]}>
                    {t('role.iAmAthlete') || 'Sou Atleta'}
                  </Text>
                  <Text style={[styles.roleDescription, { color: colors.text.secondary }]}>
                    {t('role.athleteDescription') || 'Responder questionário de bem-estar'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={colors.accent.primary} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {t('role.athleteInfo') || 'Atletas precisam de um código do treinador'}
            </Text>
          </View>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text.secondary,
  },
  questionContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  buttonsContainer: {
    gap: 16,
  },
  roleButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  roleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  athleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    backgroundColor: colors.dark.cardSolid,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 16,
  },
  roleIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  roleTextContainer: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  roleDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  footer: {
    marginTop: 48,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
});
