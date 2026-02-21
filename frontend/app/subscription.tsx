/**
 * Subscription Page
 * Tela de Assinaturas - Plano Pro
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

interface FeatureSection {
  title: string;
  icon: string;
  features: string[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: "What You'll Access",
    icon: "rocket-outline",
    features: [
      "GPS-Based Automatic Load Management and Prescription",
      "Individualized daily and weekly periodization in seconds",
      "Based on the athlete's own history",
      "Validated scientific models applied automatically",
      "Precise control of external load and progression",
    ],
  },
  {
    title: "Complete GPS Performance Metrics",
    icon: "analytics-outline",
    features: [
      "Total Distance",
      "High Speed Running (HSR)",
      "High Intensity Distance (HID)",
      "Sprint Distance",
      "Number of sprints",
      "Accelerations and decelerations",
      "Longitudinal monitoring and trend analysis",
    ],
  },
  {
    title: "Integrated Video-Based Velocity Based Training (VBT) System",
    icon: "videocam-outline",
    features: [
      "Real-time velocity measurement using the camera",
      "Precise analysis of repetitions and execution",
      "Immediate feedback for load adjustment",
      "No additional hardware required",
    ],
  },
  {
    title: "Neuromuscular Assessment and Fatigue Monitoring",
    icon: "fitness-outline",
    features: [
      "Analysis of CMJ, DJ, and SL-CMJ",
      "Automatic calculation of RSI (Reactive Strength Index)",
      "Individualized fatigue index",
      "Identification of lower limb asymmetries",
      "Automatic insights for decision-making support",
    ],
  },
  {
    title: "Physical Assessment and Body Composition",
    icon: "body-outline",
    features: [
      "Structured record of physical assessments",
      "Longitudinal monitoring of evolution",
      "Centralization of all athlete data in a single environment",
    ],
  },
  {
    title: "Intelligent Wellness Collection System via Token",
    icon: "heart-outline",
    features: [
      "Direct integration between coach and athlete",
      "The coach sends a unique token",
      "The athlete accesses without login and without needing an account",
      "Fast and intuitive filling",
      "Data sent automatically to the coach's dashboard",
      "Instant database update",
    ],
  },
  {
    title: "Professional Dashboard and Applied Intelligence",
    icon: "bar-chart-outline",
    features: [
      "Clear and structured data visualization",
      "Automatic science-based insights",
      "Identification of patterns, risks, and opportunities",
      "Direct support for evidence-based decision making",
    ],
  },
];

export default function Subscription() {
  const router = useRouter();
  const { locale } = useLanguage();
  const [showTrialModal, setShowTrialModal] = useState(false);

  const handleStartTrial = () => {
    setShowTrialModal(true);
  };

  const handleConfirmTrial = () => {
    setShowTrialModal(false);
    // TODO: Implementar início do trial via RevenueCat
    Alert.alert(
      locale === 'pt' ? 'Em Breve' : 'Coming Soon',
      locale === 'pt' 
        ? 'O sistema de pagamentos está sendo implementado.'
        : 'The payment system is being implemented.'
    );
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      locale === 'pt' ? 'Cancelar Assinatura' : 'Cancel Subscription',
      locale === 'pt'
        ? 'Para cancelar sua assinatura, acesse as configurações da App Store no seu dispositivo.'
        : 'To cancel your subscription, access the App Store settings on your device.',
      [{ text: 'OK' }]
    );
  };

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

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Plan Header */}
          <View style={styles.planHeader}>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
            <Text style={styles.planTitle}>
              {locale === 'pt' ? 'Plano Pro' : 'Pro Plan'}
            </Text>
            <View style={styles.priceContainer}>
              <Text style={styles.priceValue}>$39.99</Text>
              <Text style={styles.pricePeriod}>
                /{locale === 'pt' ? 'mês' : 'month'}
              </Text>
            </View>
            <View style={styles.cancelPolicyContainer}>
              <Ionicons name="checkmark-circle" size={18} color={colors.status.success} />
              <Text style={styles.cancelPolicyText}>
                {locale === 'pt' ? 'Cancelamento a qualquer momento' : 'Cancel anytime'}
              </Text>
            </View>
            <Text style={styles.cancelPolicySubtext}>
              {locale === 'pt' 
                ? 'A assinatura permanece ativa até o final do período de 30 dias.'
                : 'Subscription remains active until the end of the 30-day period.'}
            </Text>
          </View>

          {/* Feature Sections */}
          {FEATURE_SECTIONS.map((section, index) => (
            <View key={index} style={styles.featureSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Ionicons 
                    name={section.icon as any} 
                    size={22} 
                    color={colors.accent.primary} 
                  />
                </View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <View style={styles.featureList}>
                {section.features.map((feature, featureIndex) => (
                  <View key={featureIndex} style={styles.featureItem}>
                    <Ionicons 
                      name="checkmark" 
                      size={16} 
                      color={colors.accent.primary} 
                      style={styles.featureCheck}
                    />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* CTA Buttons */}
          <View style={styles.ctaContainer}>
            <TouchableOpacity 
              style={styles.trialButton}
              onPress={handleStartTrial}
              data-testid="start-trial-btn"
            >
              <LinearGradient
                colors={[colors.accent.primary, colors.accent.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.trialButtonGradient}
              >
                <Ionicons name="play-circle" size={24} color="#FFFFFF" />
                <Text style={styles.trialButtonText}>
                  {locale === 'pt' ? 'Iniciar Período de Testes' : 'Start Free Trial'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={handleCancelSubscription}
              data-testid="cancel-subscription-btn"
            >
              <Text style={styles.cancelButtonText}>
                {locale === 'pt' ? 'Cancelar Assinatura' : 'Cancel Subscription'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer spacing */}
          <View style={styles.footer} />
        </ScrollView>

        {/* Trial Modal */}
        <Modal
          visible={showTrialModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowTrialModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Ionicons name="gift-outline" size={48} color={colors.accent.primary} />
                <Text style={styles.modalTitle}>
                  {locale === 'pt' ? 'Período de Testes Gratuito' : 'Free Trial Period'}
                </Text>
              </View>
              
              <View style={styles.modalBody}>
                <View style={styles.trialInfoItem}>
                  <Ionicons name="calendar-outline" size={24} color={colors.text.secondary} />
                  <Text style={styles.trialInfoText}>
                    {locale === 'pt' ? '7 dias gratuitos' : '7 days free'}
                  </Text>
                </View>
                <View style={styles.trialInfoItem}>
                  <Ionicons name="card-outline" size={24} color={colors.text.secondary} />
                  <Text style={styles.trialInfoText}>
                    {locale === 'pt' 
                      ? 'Após o período de testes, será cobrado automaticamente $39.99 USD/mês'
                      : 'After the trial period, $39.99 USD/month will be charged automatically'}
                  </Text>
                </View>
                <View style={styles.trialInfoItem}>
                  <Ionicons name="close-circle-outline" size={24} color={colors.text.secondary} />
                  <Text style={styles.trialInfoText}>
                    {locale === 'pt' 
                      ? 'Cancele a qualquer momento antes do término do período de testes para não ser cobrado'
                      : 'Cancel anytime before the trial ends to avoid being charged'}
                  </Text>
                </View>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={styles.modalCancelButton}
                  onPress={() => setShowTrialModal(false)}
                >
                  <Text style={styles.modalCancelButtonText}>
                    {locale === 'pt' ? 'Voltar' : 'Back'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.modalConfirmButton}
                  onPress={handleConfirmTrial}
                >
                  <LinearGradient
                    colors={[colors.accent.primary, colors.accent.secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalConfirmButtonGradient}
                  >
                    <Text style={styles.modalConfirmButtonText}>
                      {locale === 'pt' ? 'Iniciar Trial' : 'Start Trial'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  planHeader: {
    alignItems: 'center',
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  proBadge: {
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  proBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  planTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  priceValue: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.text.primary,
  },
  pricePeriod: {
    fontSize: 18,
    color: colors.text.secondary,
    marginLeft: 4,
  },
  cancelPolicyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelPolicyText: {
    fontSize: 16,
    color: colors.status.success,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelPolicySubtext: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  featureSection: {
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    flex: 1,
  },
  featureList: {
    paddingLeft: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  featureCheck: {
    marginRight: 10,
    marginTop: 2,
  },
  featureText: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
    lineHeight: 20,
  },
  ctaContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  trialButton: {
    marginBottom: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  trialButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  trialButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 10,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
  },
  cancelButtonText: {
    color: colors.text.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    height: 40,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.dark.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  modalBody: {
    marginBottom: 24,
  },
  trialInfoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingRight: 8,
  },
  trialInfoText: {
    fontSize: 15,
    color: colors.text.secondary,
    marginLeft: 14,
    flex: 1,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
  },
  modalCancelButtonText: {
    color: colors.text.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalConfirmButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
