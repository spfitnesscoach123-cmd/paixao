import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useRevenueCat } from '../contexts/RevenueCatContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
import { detectSandboxEnvironment } from '../utils/sandboxDetection';

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { customerInfo, expirationDate, isPro } = useRevenueCat();
  const { colors } = useTheme();
  const router = useRouter();
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // SANDBOX DETECTION - Usa utilitário centralizado para detecção robusta
  const isSandbox = detectSandboxEnvironment(customerInfo, 'pro');

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    
    try {
      // Get subscription info from RevenueCat
      const hasActiveSubscription = isPro && customerInfo !== null;
      const expDate = expirationDate ? expirationDate.toISOString() : null;
      
      const response = await api.post('/account/request-deletion', {
        has_active_subscription: hasActiveSubscription,
        expiration_date: expDate,
      });
      
      setShowDeleteModal(false);
      
      if (response.data.status === 'DELETED') {
        Alert.alert(
          'Conta Excluída',
          'Sua conta foi excluída permanentemente.',
          [
            {
              text: 'OK',
              onPress: async () => {
                await logout();
                router.replace('/login');
              },
            },
          ]
        );
      } else if (response.data.status === 'PENDING') {
        Alert.alert(
          'Exclusão Agendada',
          response.data.message,
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Erro',
        error.response?.data?.detail || 'Não foi possível processar sua solicitação.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const isPending = user?.account_deletion_status === 'PENDING';

  return (
    <View style={[styles.container, { backgroundColor: colors.dark.primary }]}>
      {/* Header */}
      <LinearGradient
        colors={colors.gradients.primary}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          data-testid="account-back-btn"
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conta</Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Pending Deletion Warning - Oculto em Sandbox */}
        {isPending && user?.deletion_scheduled_for && !isSandbox && (
          <View style={[styles.warningCard, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
            <View style={styles.warningHeader}>
              <Ionicons name="warning" size={24} color="#ef4444" />
              <Text style={styles.warningTitle}>Exclusão Agendada</Text>
            </View>
            <Text style={styles.warningText}>
              Sua conta está agendada para exclusão em {formatDate(user.deletion_scheduled_for)}. Você continuará com acesso ao app até essa data.
            </Text>
          </View>
        )}

        {/* Delete Account Section */}
        <View style={[styles.section, { backgroundColor: colors.dark.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
            Excluir Conta
          </Text>
          
          <Text style={[styles.infoText, { color: colors.text.secondary }]}>
            A exclusão da conta é permanente e resultará na remoção de todos os seus dados. Se você possuir uma assinatura ativa ou período de teste gratuito, sua conta será excluída automaticamente ao final do período vigente.
          </Text>

          <TouchableOpacity
            style={[styles.deleteButton, isPending && styles.deleteButtonDisabled]}
            onPress={() => setShowDeleteModal(true)}
            disabled={isPending}
            data-testid="delete-account-btn"
          >
            <Ionicons name="trash-outline" size={20} color="#ffffff" />
            <Text style={styles.deleteButtonText}>Excluir Conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.dark.card }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="warning" size={32} color="#ef4444" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                Excluir Conta Permanentemente
              </Text>
            </View>

            <Text style={[styles.modalMessage, { color: colors.text.secondary }]}>
              Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita. Se você possuir uma assinatura ativa ou período de teste gratuito, sua conta será excluída automaticamente ao final do período vigente.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                data-testid="delete-modal-cancel-btn"
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmDeleteButton]}
                onPress={handleDeleteAccount}
                disabled={isDeleting}
                data-testid="delete-modal-confirm-btn"
              >
                {isDeleting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>
                    Excluir Conta Permanentemente
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  warningCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ef4444',
    marginLeft: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#ef4444',
    lineHeight: 20,
  },
  section: {
    borderRadius: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  deleteButtonDisabled: {
    backgroundColor: '#6b7280',
    opacity: 0.6,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    gap: 12,
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
  },
  cancelButtonText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmDeleteButton: {
    backgroundColor: '#ef4444',
  },
  confirmDeleteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
