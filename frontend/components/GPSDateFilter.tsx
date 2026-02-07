import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';
import { format, subDays, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { ptBR, enUS, es, fr } from 'date-fns/locale';

interface GPSDateFilterProps {
  onFilterChange: (startDate: string | null, endDate: string | null) => void;
  activeFilter: string;
}

export const GPSDateFilter: React.FC<GPSDateFilterProps> = ({ onFilterChange, activeFilter }) => {
  const { t, locale } = useLanguage();
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const getLocale = () => {
    switch (locale) {
      case 'pt': return ptBR;
      case 'es': return es;
      case 'fr': return fr;
      default: return enUS;
    }
  };

  const today = new Date();
  
  const filters = [
    { 
      key: 'all', 
      label: t('gps.filterAll') || 'Todos',
      icon: 'list',
      start: null, 
      end: null 
    },
    { 
      key: '7d', 
      label: t('gps.filter7days') || '7 dias',
      icon: 'calendar',
      start: format(subDays(today, 7), 'yyyy-MM-dd'), 
      end: format(today, 'yyyy-MM-dd') 
    },
    { 
      key: '30d', 
      label: t('gps.filter30days') || '30 dias',
      icon: 'calendar-outline',
      start: format(subDays(today, 30), 'yyyy-MM-dd'), 
      end: format(today, 'yyyy-MM-dd') 
    },
    { 
      key: 'month', 
      label: t('gps.filterMonth') || 'Mês atual',
      icon: 'today',
      start: format(startOfMonth(today), 'yyyy-MM-dd'), 
      end: format(endOfMonth(today), 'yyyy-MM-dd') 
    },
    { 
      key: 'custom', 
      label: t('gps.filterCustom') || 'Personalizado',
      icon: 'options',
      start: null, 
      end: null 
    },
  ];

  const handleFilterPress = (filter: typeof filters[0]) => {
    if (filter.key === 'custom') {
      setShowCustomModal(true);
    } else {
      onFilterChange(filter.start, filter.end);
    }
  };

  const handleCustomApply = () => {
    if (customStartDate && customEndDate) {
      onFilterChange(customStartDate, customEndDate);
      setShowCustomModal(false);
    }
  };

  const formatDateInput = (text: string, setter: (v: string) => void) => {
    // Auto-format as user types: YYYY-MM-DD
    const cleaned = text.replace(/[^0-9]/g, '');
    let formatted = '';
    
    if (cleaned.length > 0) {
      formatted = cleaned.substring(0, 4);
      if (cleaned.length > 4) {
        formatted += '-' + cleaned.substring(4, 6);
      }
      if (cleaned.length > 6) {
        formatted += '-' + cleaned.substring(6, 8);
      }
    }
    
    setter(formatted);
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterHeader}>
        <Ionicons name="filter" size={16} color={colors.text.secondary} />
        <Text style={styles.filterHeaderText}>{t('gps.filterByDate') || 'Filtrar por data'}</Text>
      </View>
      
      <View style={styles.filterButtons}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterButton,
              activeFilter === filter.key && styles.filterButtonActive
            ]}
            onPress={() => handleFilterPress(filter)}
          >
            <Ionicons 
              name={filter.icon as any} 
              size={14} 
              color={activeFilter === filter.key ? '#fff' : colors.accent.primary} 
            />
            <Text style={[
              styles.filterButtonText,
              activeFilter === filter.key && styles.filterButtonTextActive
            ]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom Date Range Modal */}
      <Modal
        visible={showCustomModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('gps.selectDateRange') || 'Selecionar período'}</Text>
              <TouchableOpacity onPress={() => setShowCustomModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.dateInputContainer}>
              <View style={styles.dateInputWrapper}>
                <Text style={styles.dateLabel}>{t('gps.startDate') || 'Data inicial'}</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.text.tertiary}
                  value={customStartDate}
                  onChangeText={(text) => formatDateInput(text, setCustomStartDate)}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>

              <View style={styles.dateArrow}>
                <Ionicons name="arrow-forward" size={20} color={colors.text.secondary} />
              </View>

              <View style={styles.dateInputWrapper}>
                <Text style={styles.dateLabel}>{t('gps.endDate') || 'Data final'}</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.text.tertiary}
                  value={customEndDate}
                  onChangeText={(text) => formatDateInput(text, setCustomEndDate)}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => setShowCustomModal(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel') || 'Cancelar'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.applyButton, (!customStartDate || !customEndDate) && styles.applyButtonDisabled]}
                onPress={handleCustomApply}
                disabled={!customStartDate || !customEndDate}
              >
                <Text style={styles.applyButtonText}>{t('common.confirm') || 'Aplicar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 12,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  filterHeaderText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  filterButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  filterButtonText: {
    color: colors.accent.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  dateInputWrapper: {
    flex: 1,
  },
  dateLabel: {
    color: colors.text.secondary,
    fontSize: 12,
    marginBottom: 6,
  },
  dateInput: {
    backgroundColor: colors.dark.secondary,
    borderRadius: 8,
    padding: 12,
    color: colors.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dateArrow: {
    paddingTop: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
