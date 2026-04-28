import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface InfoTooltipProps {
  /** Conteúdo do tooltip — texto explicativo. */
  content: string;
  /** Título opcional do modal. */
  title?: string;
  /** Cor do ícone (i). Por padrão usa accent.primary. */
  iconColor?: string;
  /** Tamanho do ícone (i). Padrão 18. */
  iconSize?: number;
  /** test ID para automação. */
  testID?: string;
  /** Estilo extra do botão container. */
  style?: any;
}

/**
 * InfoTooltip — Ícone (i) que abre um popover/modal leve com o texto explicativo.
 * - Toque fora ou no botão fechar para dispensar.
 * - Mobile-first: respeita tema (light/dark).
 * - Não interfere em layout pai (botão inline).
 */
export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  title,
  iconColor,
  iconSize = 18,
  testID = 'info-tooltip',
  style,
}) => {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const open = () => setVisible(true);
  const close = () => setVisible(false);

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={title || 'Informação'}
        accessibilityHint="Toque para ver mais informações"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        onPress={open}
        style={[styles.iconBtn, style]}
        testID={testID}
        data-testid={testID}
      >
        <Ionicons
          name="information-circle"
          size={iconSize}
          color={iconColor || colors.accent.primary}
        />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable
          style={styles.backdrop}
          onPress={close}
          testID={`${testID}-backdrop`}
          data-testid={`${testID}-backdrop`}
        >
          <Pressable
            style={styles.card}
            onPress={(e) => e.stopPropagation()}
            testID={`${testID}-card`}
            data-testid={`${testID}-card`}
          >
            <View style={styles.headerRow}>
              <Ionicons
                name="information-circle"
                size={22}
                color={colors.accent.primary}
              />
              <Text style={styles.title} numberOfLines={2}>
                {title || 'Informação'}
              </Text>
              <TouchableOpacity
                onPress={close}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.closeBtn}
                testID={`${testID}-close`}
                data-testid={`${testID}-close`}
              >
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.body}>{content}</Text>
            </ScrollView>

            <TouchableOpacity
              onPress={close}
              style={styles.okBtn}
              testID={`${testID}-ok`}
              data-testid={`${testID}-ok`}
            >
              <Text style={styles.okBtnText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    iconBtn: {
      // Área de toque mínima para acessibilidade (44x44)
      minWidth: 32,
      minHeight: 32,
      paddingHorizontal: 4,
      paddingVertical: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '80%',
      flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: colors.dark.cardSolid || colors.dark.secondary,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border?.default || 'rgba(47,182,255,0.25)',
      paddingTop: 16,
      paddingHorizontal: 16,
      paddingBottom: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.35,
          shadowRadius: 24,
        },
        android: {
          elevation: 12,
        },
      }),
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      flexShrink: 0,
    },
    title: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.primary,
    },
    closeBtn: {
      padding: 4,
    },
    scrollArea: {
      flex: 1,
      flexShrink: 1,
    },
    scrollContent: {
      paddingBottom: 24,
    },
    body: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.text.secondary,
    },
    okBtn: {
      marginTop: 12,
      backgroundColor: colors.accent.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      flexShrink: 0,
    },
    okBtnText: {
      color: '#ffffff',
      fontWeight: '700',
      letterSpacing: 0.5,
      fontSize: 14,
    },
  });

export default InfoTooltip;
