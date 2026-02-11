import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale, languages } = useLanguage();
  const { colors, theme, toggleTheme, isDark } = useTheme();
  const router = useRouter();
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  
  const styles = createProfileStyles(colors);

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('auth.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleLanguageSelect = async (code: string) => {
    await setLocale(code);
    setShowLanguageModal(false);
  };

  const handleOpenEditProfile = () => {
    router.push('/edit-profile');
  };

  const currentLanguage = languages.find(l => l.code === locale);

  return (
    <View style={[styles.container, { backgroundColor: colors.dark.primary }]}>
      <LinearGradient
        colors={colors.gradients.primary}
        style={styles.header}
      >
        <View style={styles.avatarGlow}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={48} color="#ffffff" />
          </View>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </LinearGradient>

      <ScrollView style={[styles.content, { backgroundColor: colors.dark.primary }]}>
        <View style={[styles.section, { backgroundColor: colors.dark.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('settings.account')}</Text>
          
          <Pressable 
            style={({ pressed }) => [
              styles.menuItem, 
              { backgroundColor: colors.dark.card },
              pressed && { opacity: 0.7 }
            ]} 
            onPress={handleOpenEditProfile}
            testID="edit-profile-btn"
          >
            <View style={styles.menuItemContent}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(0, 212, 255, 0.2)' }]}>
                <Ionicons name="person-outline" size={22} color={colors.accent.primary} />
              </View>
              <Text style={[styles.menuItemText, { color: colors.text.primary }]}>{t('athletes.editProfile')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </Pressable>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.dark.card }]} onPress={() => setShowLanguageModal(true)}>
            <View style={styles.menuItemContent}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                <Ionicons name="language-outline" size={22} color={colors.accent.tertiary} />
              </View>
              <View>
                <Text style={[styles.menuItemText, { color: colors.text.primary }]}>{t('settings.language')}</Text>
                <Text style={[styles.menuItemSubtext, { color: colors.text.tertiary }]}>{currentLanguage?.flag} {currentLanguage?.nativeName}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: colors.dark.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('settings.subscriptionTools')}</Text>
          
          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.dark.card }]} onPress={() => router.push('/subscription')}>
            <View style={styles.menuItemContent}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                <Ionicons name="diamond-outline" size={22} color={colors.accent.primary} />
              </View>
              <Text style={[styles.menuItemText, { color: colors.text.primary }]}>{t('settings.manageSubscription')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.dark.card }]} onPress={() => router.push('/generate-wellness-link')}>
            <View style={styles.menuItemContent}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                <Ionicons name="link-outline" size={22} color={colors.status.success} />
              </View>
              <Text style={[styles.menuItemText, { color: colors.text.primary }]}>{t('wellness.generateLink')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: colors.dark.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('settings.legal')}</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/privacy-policy')}>
            <View style={styles.menuItemContent}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.accent.tertiary} />
              </View>
              <Text style={styles.menuItemText}>{t('auth.privacyPolicy')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/terms-of-use')}>
            <View style={styles.menuItemContent}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}>
                <Ionicons name="document-text-outline" size={22} color={colors.accent.blue} />
              </View>
              <Text style={styles.menuItemText}>{t('auth.termsOfUse')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
          
          <View style={styles.menuItem}>
            <View style={styles.menuItemContent}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(167, 139, 250, 0.2)' }]}>
                <Ionicons name="information-circle-outline" size={22} color={colors.accent.secondary} />
              </View>
              <View>
                <Text style={styles.menuItemText}>{t('settings.version')}</Text>
                <Text style={styles.menuItemSubtext}>1.0.0</Text>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            style={styles.logoutGradient}
          >
            <Ionicons name="log-out-outline" size={24} color="#ffffff" />
            <Text style={styles.logoutText}>{t('settings.logout')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.selectLanguage')}</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={languages}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageItem,
                    item.code === locale && styles.languageItemActive,
                  ]}
                  onPress={() => handleLanguageSelect(item.code)}
                >
                  <Text style={styles.languageFlag}>{item.flag}</Text>
                  <View style={styles.languageTextContainer}>
                    <Text style={styles.languageName}>{item.nativeName}</Text>
                    <Text style={styles.languageNameEn}>{item.name}</Text>
                  </View>
                  {item.code === locale && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.accent.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createProfileStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
  },
  header: {
    padding: 32,
    paddingTop: 60,
    alignItems: 'center',
  },
  avatarGlow: {
    shadowColor: colors.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent.primary,
    marginBottom: 12,
    marginLeft: 4,
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '600',
  },
  menuItemSubtext: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  logoutButton: {
    margin: 16,
    marginTop: 32,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.dark.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: colors.dark.card,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  languageItemActive: {
    borderColor: colors.accent.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  languageFlag: {
    fontSize: 28,
    marginRight: 16,
  },
  languageTextContainer: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  languageNameEn: {
    fontSize: 13,
    color: colors.text.secondary,
  },
});
