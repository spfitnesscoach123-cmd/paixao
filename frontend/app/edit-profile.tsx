import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

export default function EditProfileScreen() {
  const { user, updateProfile } = useAuth();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  
  const [name, setName] = useState(user?.name || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    setIsUpdating(true);
    try {
      await updateProfile(name.trim());
      Alert.alert(t('common.success'), t('settings.profileUpdated'), [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('common.tryAgain'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.dark.primary }]}>
      <LinearGradient
        colors={colors.gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('athletes.editProfile')}</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.avatarSection, { backgroundColor: colors.dark.card }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent.primary }]}>
            <Ionicons name="person" size={48} color="#ffffff" />
          </View>
          <Text style={[styles.email, { color: colors.text.secondary }]}>{user?.email}</Text>
        </View>

        <View style={[styles.formSection, { backgroundColor: colors.dark.card }]}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>{t('auth.fullName')}</Text>
          <TextInput
            style={[styles.input, { 
              backgroundColor: colors.dark.primary, 
              color: colors.text.primary,
              borderColor: colors.border.default
            }]}
            value={name}
            onChangeText={setName}
            placeholder={t('auth.fullName')}
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="words"
          />

          <Text style={[styles.label, { color: colors.text.secondary, marginTop: 20 }]}>{t('auth.email')}</Text>
          <View style={[styles.disabledInput, { 
            backgroundColor: colors.dark.primary,
            borderColor: colors.border.default
          }]}>
            <Text style={[styles.disabledText, { color: colors.text.tertiary }]}>{user?.email}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.text.tertiary }]}>{t('settings.emailCannotBeChanged')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, isUpdating && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isUpdating}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveButtonGradient}
          >
            {isUpdating ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={22} color="#ffffff" />
                <Text style={styles.saveButtonText}>{t('common.save')}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    padding: 30,
    borderRadius: 16,
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  email: {
    fontSize: 16,
  },
  formSection: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  disabledInput: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    opacity: 0.7,
  },
  disabledText: {
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 6,
  },
  saveButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 10,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
