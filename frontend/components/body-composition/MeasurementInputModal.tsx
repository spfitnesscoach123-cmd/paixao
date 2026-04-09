/**
 * MeasurementInputModal.tsx — Modal para entrada de dobras cutaneas
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/theme';
import { SKINFOLD_LABELS, type SkinfoldSite } from '../../types/protocols';

interface Props {
  visible: boolean;
  site: SkinfoldSite | null;
  currentValue?: number;
  locale: string;
  onSave: (site: SkinfoldSite, value: number) => void;
  onClose: () => void;
}

export function MeasurementInputModal({ visible, site, currentValue, locale, onSave, onClose }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && site) {
      setValue(currentValue ? String(currentValue) : '');
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible, site, currentValue]);

  if (!site) return null;

  const label = locale === 'pt' ? SKINFOLD_LABELS[site].pt : SKINFOLD_LABELS[site].en;

  const handleSave = () => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0 || num > 100) return;
    onSave(site, Math.round(num * 10) / 10);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="locate" size={20} color={colors.accent.primary} />
            <Text style={styles.title}>{label}</Text>
            <TouchableOpacity onPress={onClose} data-testid="measurement-modal-close">
              <Ionicons name="close" size={22} color={colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            {locale === 'pt' ? 'Insira a dobra cutanea em milimetros' : 'Enter skinfold thickness in millimeters'}
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor={colors.text.tertiary}
              maxLength={5}
              data-testid="measurement-input"
            />
            <Text style={styles.unit}>mm</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (!value || parseFloat(value) <= 0) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!value || parseFloat(value) <= 0}
            data-testid="measurement-save-btn"
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>
              {locale === 'pt' ? 'Confirmar' : 'Confirm'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  card: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: colors.dark.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    marginLeft: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: colors.input.background,
    borderWidth: 1,
    borderColor: colors.input.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  unit: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
