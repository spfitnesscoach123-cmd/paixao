import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { Athlete } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSession } from '../../contexts/SessionContext';
import { VBTCameraContent } from '../athlete/[id]/vbt-camera';
import PremiumGate from '../../components/PremiumGate';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function StationVBT() {
  const router = useRouter();
  const { colors } = useTheme();
  const { locale } = useLanguage();
  const session = useSession();
  const insets = useSafeAreaInsets();

  // Current athlete for Station Mode
  const [activeAthleteId, setActiveAthleteId] = useState<string | null>(null);
  const [activeAthleteName, setActiveAthleteName] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(true); // Start with picker open
  const pickerAnim = useRef(new Animated.Value(1)).current;

  // Fetch athletes
  const { data: athletes } = useQuery({
    queryKey: ['athletes'],
    queryFn: async () => {
      const response = await api.get<Athlete[]>('/athletes');
      return response.data;
    },
  });

  // Toggle picker with animation
  const togglePicker = useCallback(() => {
    const toValue = pickerOpen ? 0 : 1;
    Animated.timing(pickerAnim, {
      toValue,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setPickerOpen(!pickerOpen);
  }, [pickerOpen, pickerAnim]);

  // Select athlete — applies Phase 2 sequencing: check lock → reset → update
  const selectAthlete = useCallback((athlete: Athlete) => {
    const id = athlete.id || athlete._id;
    setActiveAthleteId(id);
    setActiveAthleteName(athlete.name);
    session.setActiveAthlete(id);
    // Close picker
    Animated.timing(pickerAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setPickerOpen(false);
  }, [session, pickerAnim]);

  // onSaveComplete callback — Station Mode: stay on screen, ready for next
  const handleSaveComplete = useCallback(() => {
    // After save, just open picker for next athlete
    // The VBTCameraContent's resetForNextAthlete is called internally via navigateBack→onSaveComplete
    // We just need to signal the user to pick next athlete
    Animated.timing(pickerAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setPickerOpen(true);
  }, [pickerAnim]);

  // Exit station mode
  const handleExit = useCallback(() => {
    session.setMode('hub');
    session.clearActiveAthlete();
    router.replace('/(tabs)/athletes' as any);
  }, [session, router]);

  const styles = createStyles(colors);

  const pickerHeight = pickerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_HEIGHT * 0.45],
  });

  const chevronRotation = pickerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={styles.container}>
      {/* Station Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={handleExit} style={styles.exitButton} data-testid="station-exit-btn">
          <Ionicons name="close" size={22} color={colors.text.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={togglePicker}
          style={styles.athleteSelector}
          data-testid="station-athlete-picker"
        >
          <View style={styles.stationBadge}>
            <Text style={styles.stationBadgeText}>STATION</Text>
          </View>
          <Text style={styles.athleteName} numberOfLines={1}>
            {activeAthleteName || (locale === 'pt' ? 'Selecionar Atleta' : 'Select Athlete')}
          </Text>
          <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
            <Ionicons name="chevron-down" size={20} color={colors.accent.primary} />
          </Animated.View>
        </TouchableOpacity>

        <View style={{ width: 36 }} />
      </View>

      {/* Athlete Picker Dropdown */}
      <Animated.View style={[styles.pickerContainer, { height: pickerHeight }]}>
        <FlatList
          data={athletes}
          keyExtractor={(item) => item.id || item._id || ''}
          renderItem={({ item }) => {
            const id = item.id || item._id;
            const isActive = id === activeAthleteId;
            return (
              <TouchableOpacity
                style={[styles.pickerItem, isActive && styles.pickerItemActive]}
                onPress={() => selectAthlete(item)}
                data-testid={`station-pick-${id}`}
              >
                {item.photo_base64 ? (
                  <Image source={{ uri: item.photo_base64 }} style={styles.pickerPhoto} />
                ) : (
                  <View style={styles.pickerPhotoPlaceholder}>
                    <Ionicons name="person" size={16} color={colors.accent.primary} />
                  </View>
                )}
                <View style={styles.pickerItemInfo}>
                  <Text style={[styles.pickerItemName, isActive && styles.pickerItemNameActive]}>
                    {item.name}
                  </Text>
                  <Text style={styles.pickerItemPosition}>{item.position}</Text>
                </View>
                {isActive && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent.primary} />
                )}
              </TouchableOpacity>
            );
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.pickerList}
        />
      </Animated.View>

      {/* VBT Camera Content — stays mounted, receives athleteId from state */}
      {activeAthleteId ? (
        <View style={styles.cameraContainer}>
          <PremiumGate featureName={locale === 'pt' ? 'VBT via Câmera' : 'VBT via Camera'}>
            <VBTCameraContent
              stationAthleteId={activeAthleteId}
              onSaveComplete={handleSaveComplete}
            />
          </PremiumGate>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="barbell-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyText}>
            {locale === 'pt'
              ? 'Selecione um atleta acima para iniciar'
              : 'Select an athlete above to start'}
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: colors.dark.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    zIndex: 10,
  },
  exitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  athleteSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(47, 182, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(47, 182, 255, 0.2)',
  },
  stationBadge: {
    backgroundColor: '#2FB6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stationBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  athleteName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    maxWidth: 180,
  },
  // Picker dropdown
  pickerContainer: {
    backgroundColor: colors.dark.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    overflow: 'hidden',
    zIndex: 5,
  },
  pickerList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerItemActive: {
    backgroundColor: 'rgba(47, 182, 255, 0.12)',
  },
  pickerPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  pickerPhotoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(47, 182, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  pickerItemNameActive: {
    color: colors.accent.primary,
  },
  pickerItemPosition: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 1,
  },
  // Camera container
  cameraContainer: {
    flex: 1,
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
