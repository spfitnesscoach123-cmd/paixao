/**
 * Subscription Page
 * 
 * DESATIVADO - Sistema de assinaturas removido para reconstrução
 * Página mantida vazia para futura implementação
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

export default function Subscription() {
  const router = useRouter();
  const { locale } = useLanguage();

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[colors.dark.primary, colors.dark.secondary]}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.backButton}
            data-testid="subscription-back-btn"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {locale === 'pt' ? 'Assinatura' : 'Subscription'}
          </Text>
          <View style={styles.placeholder} />
        </View>

        {/* Content - Empty for future implementation */}
        <View style={styles.content}>
          <Ionicons name="construct-outline" size={64} color={colors.text.secondary} />
          <Text style={styles.title}>
            {locale === 'pt' ? 'Em Construção' : 'Under Construction'}
          </Text>
          <Text style={styles.description}>
            {locale === 'pt' 
              ? 'O sistema de assinaturas está sendo reconstruído.\nTodas as funcionalidades estão liberadas temporariamente.'
              : 'The subscription system is being rebuilt.\nAll features are temporarily unlocked.'}
          </Text>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 24,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
