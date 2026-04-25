import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const C = {
  bg: '#0a0e17', card: '#111827', cardAlt: '#1a2236', border: '#1e293b',
  text: '#e2e8f0', textSec: '#94a3b8', textTer: '#475569',
  accent: '#2FB6FF', accentSec: '#7BD4FF', green: '#10b981', greenBg: 'rgba(16,185,129,0.12)',
  red: '#ef4444', redBg: 'rgba(239,68,68,0.12)', yellow: '#f59e0b', yellowBg: 'rgba(245,158,11,0.12)',
  blue: '#2FB6FF', blueBg: 'rgba(47, 182, 255,0.12)',
};

type Step = 'upload' | 'review' | 'mapping' | 'importing' | 'done';
type FieldGroup = 'required' | 'recommended' | 'optional';

interface FieldInfo {
  field_key: string; label_pt: string; label_en: string; type: string;
  mapped_to: string | null; confidence: number; note?: string;
  suggestions: { csv_column: string; confidence: number; warning?: string }[];
}

interface Analysis {
  file_info: { filename: string; delimiter: string; encoding: string; header_row: number; total_rows: number; total_columns: number };
  detected_provider: string; confidence_pct: number;
  columns: string[]; column_types: Record<string, string>;
  auto_mapping: Record<string, { csv_column: string | null; confidence: number; suggestions: any[] }>;
  field_groups: Record<FieldGroup, FieldInfo[]>;
  unmapped_columns: string[]; sample_rows: Record<string, string>[];
  metadata: Record<string, string>; warnings: any[];
  existing_athletes: { id: string; name: string }[];
}

interface ImportResult {
  success: boolean; records_imported: number; athletes_created: string[];
  imported_by_athlete: Record<string, number>; errors: string[];
}

export default function UploadCSV() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('upload');
  const [fileContent, setFileContent] = useState<Uint8Array | null>(null);
  const [fileUri, setFileUri] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [searchField, setSearchField] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'] });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setFileName(asset.name || 'upload.csv');
      setError('');
      setAnalyzing(true);

      const formData = new FormData();

      if (Platform.OS === 'web') {
        // Web: use Blob approach
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        setFileContent(bytes);
        const fileBlob = new Blob([bytes], { type: 'text/csv' });
        formData.append('file', fileBlob, asset.name || 'upload.csv');
      } else {
        // Native (iOS/Android): use URI-based FormData
        setFileUri(asset.uri);
        formData.append('file', {
          uri: asset.uri,
          name: asset.name || 'upload.csv',
          type: asset.mimeType || 'text/csv',
        } as any);
      }

      const { data: resp } = await api.post('/csv/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAnalysis(resp);
      // Init mapping from auto-mapping
      const initMap: Record<string, string | null> = {};
      for (const [key, val] of Object.entries(resp.auto_mapping)) {
        initMap[key] = (val as any).csv_column;
      }
      setMapping(initMap);
      setStep('review');

      // Load templates
      try {
        const { data: tpls } = await api.get('/csv/mapping-templates');
        setTemplates(tpls);
      } catch { /* ignore */ }
    } catch (e: any) {
      setError(e.message || 'Erro ao analisar arquivo');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  // session_date is NOT required for enabling the import (backend has fallback to today).
  // Only athlete_name and total_distance are gating.
  const REQUIRED_GATING_FIELDS = ['athlete_name', 'total_distance'];

  const requiredMapped = useMemo(() => {
    if (!analysis) return false;
    return REQUIRED_GATING_FIELDS.every(k => !!mapping[k]);
  }, [analysis, mapping]);

  // Detect whether session_date is missing from the mapping — used to show a heads-up
  // before firing the import. Backend will fall back to today's date.
  const sessionDateMissing = useMemo(() => {
    if (!analysis) return false;
    return !mapping['session_date'];
  }, [analysis, mapping]);

  const handleImport = useCallback(async () => {
    if (!analysis) return;
    if (Platform.OS === 'web' && !fileContent) return;
    if (Platform.OS !== 'web' && !fileUri) return;
    setImporting(true);
    setStep('importing');
    setError('');
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const blob = new Blob([fileContent!], { type: 'text/csv' });
        formData.append('file', blob, fileName);
      } else {
        formData.append('file', {
          uri: fileUri,
          name: fileName,
          type: 'text/csv',
        } as any);
      }
      formData.append('mapping_json', JSON.stringify(mapping));
      formData.append('create_missing', 'true');

      const { data: resp } = await api.post('/csv/import-mapped', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(resp);
      setStep('done');
      qc.invalidateQueries({ queryKey: ['athletes'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['team-dashboard'] });
    } catch (e: any) {
      setError(e.message || 'Erro na importação');
      setStep('review');
    } finally {
      setImporting(false);
    }
  }, [fileContent, fileUri, analysis, mapping, fileName, qc]);

  // Public entrypoint used by the Import buttons. If session_date is not mapped,
  // show a heads-up confirmation; backend will fall back to today's date.
  const confirmAndImport = useCallback(() => {
    if (!sessionDateMissing) {
      handleImport();
      return;
    }
    const title = 'Sem data no CSV';
    const msg = 'Os dados serao importados com a data de hoje.';
    if (Platform.OS === 'web') {
      // RN Alert.alert on web only renders the title; window.confirm is reliable cross-browser.
      // eslint-disable-next-line no-alert
      const ok = typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`);
      if (ok) handleImport();
      return;
    }
    Alert.alert(
      title,
      msg,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => handleImport() },
      ],
      { cancelable: true },
    );
  }, [sessionDateMissing, handleImport]);

  const saveTemplate = useCallback(async () => {
    if (!templateName.trim()) return;
    try {
      await api.post('/csv/mapping-templates', {
        name: templateName.trim(),
        provider: analysis?.detected_provider || 'unknown',
        mapping,
      });
      const { data: tpls } = await api.get('/csv/mapping-templates');
      setTemplates(tpls);
      setShowSaveTemplate(false);
      setTemplateName('');
    } catch { /* ignore */ }
  }, [templateName, mapping, analysis]);

  const applyTemplate = useCallback((tpl: any) => {
    setMapping({ ...mapping, ...tpl.mapping });
  }, [mapping]);

  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);

  // Column dropdown for a field
  const renderDropdown = (fieldKey: string, fieldInfo: FieldInfo) => {
    const isOpen = searchField === fieldKey;
    const currentCol = mapping[fieldKey];
    const suggestions = fieldInfo.suggestions || [];
    const allCols = analysis?.columns || [];
    const filterText = searchText.toLowerCase();

    const filteredSuggestions = suggestions.filter(s =>
      !filterText || s.csv_column.toLowerCase().includes(filterText)
    );
    const filteredAll = allCols.filter(c =>
      !filterText || c.toLowerCase().includes(filterText)
    );

    // Sample values for selected column
    const sampleVals = currentCol && currentCol !== '__metadata_date__' && analysis
      ? analysis.sample_rows.slice(0, 3).map(r => r[currentCol] || '—')
      : currentCol === '__metadata_date__' && analysis?.metadata?.date
        ? [analysis.metadata.date]
        : [];

    return (
      <View style={s.fieldRow} key={fieldKey}>
        <View style={s.fieldHeader}>
          <Text style={s.fieldLabel}>{fieldInfo.label_pt}</Text>
          {fieldInfo.type === 'numeric' && <Text style={s.fieldType}>numérico</Text>}
          {fieldInfo.type === 'date' && <Text style={s.fieldType}>data</Text>}
        </View>
        <TouchableOpacity
          style={[s.dropdown, currentCol ? s.dropdownMapped : s.dropdownEmpty]}
          onPress={() => { setSearchField(isOpen ? null : fieldKey); setSearchText(''); }}
          data-testid={`mapping-dropdown-${fieldKey}`}
        >
          <Text style={[s.dropdownText, !currentCol && s.dropdownPlaceholder]} numberOfLines={1}>
            {currentCol === '__metadata_date__' ? `📅 Metadata: ${analysis?.metadata?.date || ''}` : currentCol || 'Não mapeado'}
          </Text>
          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textSec} />
        </TouchableOpacity>

        {sampleVals.length > 0 && !isOpen && (
          <Text style={s.sampleText}>Exemplo: {sampleVals.join(', ')}</Text>
        )}

        {isOpen && (
          <View style={s.dropdownList}>
            <TextInput
              style={s.searchInput}
              placeholder="Buscar coluna..."
              placeholderTextColor={C.textTer}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
              data-testid={`mapping-search-${fieldKey}`}
            />
            <TouchableOpacity style={s.dropdownItem} onPress={() => { setMapping({ ...mapping, [fieldKey]: null }); setSearchField(null); }}>
              <Text style={[s.dropdownItemText, { color: C.red }]}>✕ Não mapeado</Text>
            </TouchableOpacity>

            {filteredSuggestions.length > 0 && (
              <>
                <Text style={s.dropdownSection}>Sugestões</Text>
                {filteredSuggestions.map(sg => (
                  <TouchableOpacity key={sg.csv_column} style={[s.dropdownItem, mapping[fieldKey] === sg.csv_column && s.dropdownItemActive]}
                    onPress={() => { setMapping({ ...mapping, [fieldKey]: sg.csv_column }); setSearchField(null); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.dropdownItemText} numberOfLines={1}>{sg.csv_column}</Text>
                      {sg.warning && <Text style={s.warningSmall}>{sg.warning}</Text>}
                    </View>
                    <Text style={s.confBadge}>{Math.round(sg.confidence * 100)}%</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={s.dropdownSection}>Todas as colunas</Text>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {filteredAll.map(col => (
                <TouchableOpacity key={col} style={[s.dropdownItem, mapping[fieldKey] === col && s.dropdownItemActive]}
                  onPress={() => { setMapping({ ...mapping, [fieldKey]: col }); setSearchField(null); }}>
                  <Text style={s.dropdownItemText} numberOfLines={1}>{col}</Text>
                  <Text style={[s.typeBadge, { backgroundColor: analysis?.column_types[col] === 'numeric' ? C.blueBg : C.yellowBg }]}>
                    {analysis?.column_types[col] || '?'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const renderFieldGroup = (title: string, fields: FieldInfo[], icon: string, color: string) => (
    <View style={s.groupCard} key={title}>
      <View style={[s.groupHeader, { borderLeftColor: color }]}>
        <Ionicons name={icon as any} size={18} color={color} />
        <Text style={[s.groupTitle, { color }]}>{title}</Text>
        <Text style={s.groupCount}>
          {fields.filter(f => mapping[f.field_key]).length}/{fields.length}
        </Text>
      </View>
      {fields.map(f => renderDropdown(f.field_key, f))}
    </View>
  );

  // ──── STEP: UPLOAD ────
  if (step === 'upload') {
    return (
      <View style={s.container}>
        <LinearGradient colors={[C.bg, '#0f1623']} style={s.gradient}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Importar CSV</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={s.scroll}>
            <View style={s.heroCard}>
              <Ionicons name="cloud-upload-outline" size={48} color={C.accent} />
              <Text style={s.heroTitle}>Importação Inteligente</Text>
              <Text style={s.heroSub}>
                Suporte a múltiplos formatos CSV: Catapult, STATSports, Polar e outros.
                O sistema detecta automaticamente a estrutura e sugere mapeamentos.
              </Text>
            </View>

            <TouchableOpacity style={s.pickBtn} onPress={pickFile} disabled={analyzing} data-testid="pick-csv-file">
              {analyzing ? (
                <ActivityIndicator color={C.accent} size="large" />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={32} color={C.accent} />
                  <Text style={s.pickText}>Selecionar Arquivo CSV</Text>
                  <Text style={s.pickSub}>CSV, TXT — qualquer formato de GPS</Text>
                </>
              )}
            </TouchableOpacity>

            {analyzing && (
              <View style={s.analyzeCard}>
                <ActivityIndicator color={C.green} />
                <Text style={s.analyzeText}>Analisando estrutura do arquivo...</Text>
              </View>
            )}

            {error ? <Text style={s.errorText}>{error}</Text> : null}
          </ScrollView>
        </LinearGradient>
      </View>
    );
  }

  // ──── STEP: REVIEW ────
  if (step === 'review' && analysis) {
    const fi = analysis.file_info;
    return (
      <View style={s.container}>
        <LinearGradient colors={[C.bg, '#0f1623']} style={s.gradient}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setStep('upload')} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Revisão do Arquivo</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={s.scroll}>
            {/* File Summary */}
            <View style={s.summaryCard}>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Arquivo</Text>
                <Text style={s.summaryVal} numberOfLines={1}>{fi.filename}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Delimitador</Text>
                <Text style={s.summaryVal}>{fi.delimiter === ',' ? 'Vírgula' : fi.delimiter === ';' ? 'Ponto-e-vírgula' : 'Tab'}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Linhas / Colunas</Text>
                <Text style={s.summaryVal}>{fi.total_rows} / {fi.total_columns}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Provedor Detectado</Text>
                <Text style={s.summaryVal}>{analysis.detected_provider || 'Desconhecido'}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Compatibilidade</Text>
                <View style={[s.confPill, { backgroundColor: analysis.confidence_pct >= 80 ? C.greenBg : analysis.confidence_pct >= 50 ? C.yellowBg : C.redBg }]}>
                  <Text style={[s.confPillText, { color: analysis.confidence_pct >= 80 ? C.green : analysis.confidence_pct >= 50 ? C.yellow : C.red }]}>
                    {analysis.confidence_pct}%
                  </Text>
                </View>
              </View>
            </View>

            {/* Data Preview */}
            {analysis.sample_rows.length > 0 && (
              <View style={s.previewCard}>
                <Text style={s.sectionTitle}>Prévia dos Dados (primeiras {analysis.sample_rows.length} linhas)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    <View style={s.previewHeaderRow}>
                      {analysis.columns.slice(0, 6).map(col => (
                        <Text key={col} style={s.previewHeaderCell} numberOfLines={1}>{col}</Text>
                      ))}
                    </View>
                    {analysis.sample_rows.slice(0, 3).map((row, i) => (
                      <View key={i} style={s.previewRow}>
                        {analysis.columns.slice(0, 6).map(col => (
                          <Text key={col} style={s.previewCell} numberOfLines={1}>{row[col] || '—'}</Text>
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Mapped Fields Summary */}
            <View style={s.mappingSummary}>
              <Text style={s.sectionTitle}>Mapeamento Detectado</Text>
              <Text style={s.mappingCount}>{mappedCount} de {Object.keys(analysis.auto_mapping).length} campos mapeados</Text>
              {analysis.field_groups.required.map(f => (
                <View key={f.field_key} style={s.mapRow}>
                  <Ionicons name={mapping[f.field_key] ? 'checkmark-circle' : 'alert-circle'} size={18}
                    color={mapping[f.field_key] ? C.green : C.red} />
                  <Text style={s.mapField}>{f.label_pt}</Text>
                  <Text style={[s.mapCol, !mapping[f.field_key] && { color: C.red }]} numberOfLines={1}>
                    {mapping[f.field_key] === '__metadata_date__' ? `Metadata` : mapping[f.field_key] || 'Não mapeado'}
                  </Text>
                </View>
              ))}
              {analysis.field_groups.recommended.filter(f => mapping[f.field_key]).map(f => (
                <View key={f.field_key} style={s.mapRow}>
                  <Ionicons name="checkmark-circle" size={18} color={C.green} />
                  <Text style={s.mapField}>{f.label_pt}</Text>
                  <Text style={s.mapCol} numberOfLines={1}>{mapping[f.field_key]}</Text>
                </View>
              ))}
            </View>

            {/* Warnings */}
            {analysis.warnings.length > 0 && (
              <View style={[s.warningCard]}>
                {analysis.warnings.map((w, i) => (
                  <View key={i} style={s.warningRow}>
                    <Ionicons name="warning" size={16} color={C.yellow} />
                    <Text style={s.warningText}>{w.message_pt}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Templates */}
            {templates.length > 0 && (
              <View style={s.templateCard}>
                <Text style={s.sectionTitle}>Templates Salvos</Text>
                {templates.map(t => (
                  <TouchableOpacity key={t.id} style={s.templateRow} onPress={() => applyTemplate(t)}>
                    <Ionicons name="document-outline" size={18} color={C.accent} />
                    <Text style={s.templateName}>{t.name}</Text>
                    <Text style={s.templateApply}>Aplicar</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Unmapped columns */}
            {analysis.unmapped_columns.length > 0 && (
              <View style={s.unmappedCard}>
                <Text style={s.sectionTitleSmall}>Colunas ignoradas ({analysis.unmapped_columns.length})</Text>
                <Text style={s.unmappedList}>{analysis.unmapped_columns.join(', ')}</Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={s.actions}>
              <TouchableOpacity style={s.mappingBtn} onPress={() => setStep('mapping')} data-testid="adjust-mapping-btn">
                <Ionicons name="options" size={20} color={C.accent} />
                <Text style={s.mappingBtnText}>Ajustar Mapeamento</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.importBtn, !requiredMapped && s.importBtnDisabled]}
                onPress={confirmAndImport}
                disabled={!requiredMapped || importing}
                data-testid="confirm-import-btn"
              >
                <LinearGradient
                  colors={requiredMapped ? [C.green, '#059669'] : [C.textTer, C.textTer]}
                  style={s.importGrad}
                >
                  <Ionicons name="cloud-upload" size={20} color="#fff" />
                  <Text style={s.importBtnText}>Confirmar Importação</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}
          </ScrollView>
        </LinearGradient>
      </View>
    );
  }

  // ──── STEP: MAPPING ────
  if (step === 'mapping' && analysis) {
    return (
      <View style={s.container}>
        <LinearGradient colors={[C.bg, '#0f1623']} style={s.gradient}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => { setStep('review'); setSearchField(null); }} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Mapeamento de Campos</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {renderFieldGroup('Campos Obrigatórios', analysis.field_groups.required, 'alert-circle', C.red)}
            {renderFieldGroup('Métricas Recomendadas', analysis.field_groups.recommended, 'star', C.yellow)}
            {renderFieldGroup('Campos Opcionais', analysis.field_groups.optional, 'ellipsis-horizontal-circle', C.textSec)}

            {/* Save Template */}
            <View style={s.templateSaveCard}>
              {!showSaveTemplate ? (
                <TouchableOpacity style={s.saveTemplateBtn} onPress={() => setShowSaveTemplate(true)} data-testid="save-template-btn">
                  <Ionicons name="bookmark-outline" size={18} color={C.accent} />
                  <Text style={s.saveTemplateBtnText}>Salvar como Template</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.saveTemplateForm}>
                  <TextInput
                    style={s.templateInput}
                    placeholder="Nome do template..."
                    placeholderTextColor={C.textTer}
                    value={templateName}
                    onChangeText={setTemplateName}
                  />
                  <TouchableOpacity style={s.templateSaveAction} onPress={saveTemplate}>
                    <Text style={s.templateSaveText}>Salvar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={s.actions}>
              <TouchableOpacity style={s.mappingBtn} onPress={() => { setStep('review'); setSearchField(null); }}>
                <Ionicons name="arrow-back" size={20} color={C.accent} />
                <Text style={s.mappingBtnText}>Voltar à Revisão</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.importBtn, !requiredMapped && s.importBtnDisabled]}
                onPress={confirmAndImport}
                disabled={!requiredMapped || importing}
                data-testid="confirm-import-mapping-btn"
              >
                <LinearGradient
                  colors={requiredMapped ? [C.green, '#059669'] : [C.textTer, C.textTer]}
                  style={s.importGrad}
                >
                  <Ionicons name="cloud-upload" size={20} color="#fff" />
                  <Text style={s.importBtnText}>Confirmar Importação</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      </View>
    );
  }

  // ──── STEP: IMPORTING ────
  if (step === 'importing') {
    return (
      <View style={s.container}>
        <LinearGradient colors={[C.bg, '#0f1623']} style={s.gradient}>
          <View style={[s.center, { flex: 1 }]}>
            <ActivityIndicator size="large" color={C.green} />
            <Text style={s.importingText}>Importando dados...</Text>
            <Text style={s.importingSub}>Criando atletas e registros GPS</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // ──── STEP: DONE ────
  if (step === 'done' && result) {
    return (
      <View style={s.container}>
        <LinearGradient colors={[C.bg, '#0f1623']} style={s.gradient}>
          <View style={s.header}>
            <View style={{ width: 40 }} />
            <Text style={s.headerTitle}>Importação Concluída</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={[s.scroll, { alignItems: 'center' }]}>
            <View style={s.doneIcon}>
              <Ionicons name="checkmark-circle" size={72} color={C.green} />
            </View>
            <Text style={s.doneTitle}>{result.records_imported} registros importados</Text>

            {result.athletes_created.length > 0 && (
              <View style={s.doneCard}>
                <Text style={s.doneCardTitle}>Atletas criados automaticamente</Text>
                {result.athletes_created.map(name => (
                  <View key={name} style={s.doneRow}>
                    <Ionicons name="person-add" size={16} color={C.green} />
                    <Text style={s.doneRowText}>{name}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.doneCard}>
              <Text style={s.doneCardTitle}>Detalhamento por Atleta</Text>
              {Object.entries(result.imported_by_athlete).map(([name, count]) => (
                <View key={name} style={s.doneRow}>
                  <Text style={s.doneRowText}>{name}</Text>
                  <Text style={s.doneRowCount}>{count} sessões</Text>
                </View>
              ))}
            </View>

            {result.errors.length > 0 && (
              <View style={[s.doneCard, { borderColor: C.red }]}>
                <Text style={[s.doneCardTitle, { color: C.red }]}>Erros</Text>
                {result.errors.map((e, i) => <Text key={i} style={s.errorSmall}>{e}</Text>)}
              </View>
            )}

            <TouchableOpacity style={s.doneBtn} onPress={() => router.back()} data-testid="done-back-btn">
              <LinearGradient colors={[C.accent, C.accentSec]} style={s.importGrad}>
                <Text style={s.importBtnText}>Voltar ao Dashboard</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </LinearGradient>
      </View>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 48, paddingBottom: 12, paddingHorizontal: 16 },
  backBtn: { padding: 8, width: 40 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center', flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  center: { justifyContent: 'center', alignItems: 'center' },
  // Upload step
  heroCard: { alignItems: 'center', padding: 24, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  heroTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  heroSub: { fontSize: 13, color: C.textSec, textAlign: 'center', lineHeight: 19 },
  pickBtn: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.card, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: C.border, gap: 8 },
  pickText: { fontSize: 16, fontWeight: '600', color: C.accent },
  pickSub: { fontSize: 12, color: C.textTer },
  analyzeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.card, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: C.border },
  analyzeText: { fontSize: 14, color: C.green },
  errorText: { color: C.red, fontSize: 13, textAlign: 'center', marginTop: 12 },
  // Review step
  summaryCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  summaryLabel: { fontSize: 13, color: C.textSec, flex: 1 },
  summaryVal: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1, textAlign: 'right' },
  confPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  confPillText: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 10 },
  sectionTitleSmall: { fontSize: 13, fontWeight: '600', color: C.textSec, marginBottom: 6 },
  // Preview
  previewCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  previewHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 6, marginBottom: 4 },
  previewHeaderCell: { width: 120, fontSize: 11, fontWeight: '700', color: C.accent, marginRight: 8 },
  previewRow: { flexDirection: 'row', paddingVertical: 4 },
  previewCell: { width: 120, fontSize: 11, color: C.textSec, marginRight: 8 },
  // Mapping summary
  mappingSummary: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  mappingCount: { fontSize: 12, color: C.textSec, marginBottom: 10 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  mapField: { fontSize: 13, color: C.text, flex: 1 },
  mapCol: { fontSize: 12, color: C.green, flex: 1, textAlign: 'right' },
  // Warnings
  warningCard: { backgroundColor: C.yellowBg, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  warningText: { fontSize: 12, color: C.yellow, flex: 1 },
  warningSmall: { fontSize: 10, color: C.yellow, marginTop: 2 },
  // Unmapped
  unmappedCard: { backgroundColor: C.cardAlt, borderRadius: 12, padding: 12, marginBottom: 16 },
  unmappedList: { fontSize: 11, color: C.textTer, lineHeight: 16 },
  // Templates
  templateCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  templateName: { fontSize: 13, color: C.text, flex: 1 },
  templateApply: { fontSize: 12, fontWeight: '600', color: C.accent },
  templateSaveCard: { marginBottom: 16 },
  saveTemplateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  saveTemplateBtnText: { fontSize: 13, color: C.accent, fontWeight: '600' },
  saveTemplateForm: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  templateInput: { flex: 1, backgroundColor: C.card, borderRadius: 10, padding: 12, color: C.text, fontSize: 13, borderWidth: 1, borderColor: C.border },
  templateSaveAction: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  templateSaveText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  // Actions
  actions: { gap: 12, marginTop: 8 },
  mappingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.accent },
  mappingBtnText: { fontSize: 14, fontWeight: '600', color: C.accent },
  importBtn: { borderRadius: 14, overflow: 'hidden' },
  importBtnDisabled: { opacity: 0.4 },
  importGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  importBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Mapping step - dropdowns
  groupCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border, borderLeftWidth: 3, paddingLeft: 10 },
  groupTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  groupCount: { fontSize: 12, color: C.textTer },
  fieldRow: { marginBottom: 14 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.text },
  fieldType: { fontSize: 10, color: C.textTer, backgroundColor: C.cardAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 8, borderWidth: 1 },
  dropdownMapped: { borderColor: C.green, backgroundColor: 'rgba(16,185,129,0.06)' },
  dropdownEmpty: { borderColor: C.border, backgroundColor: C.cardAlt },
  dropdownText: { fontSize: 12, color: C.text, flex: 1 },
  dropdownPlaceholder: { color: C.textTer },
  sampleText: { fontSize: 10, color: C.textTer, marginTop: 3, marginLeft: 2 },
  dropdownList: { backgroundColor: C.cardAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginTop: 4, padding: 6, maxHeight: 360 },
  searchInput: { backgroundColor: C.card, borderRadius: 8, padding: 8, color: C.text, fontSize: 12, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  dropdownSection: { fontSize: 10, fontWeight: '700', color: C.textTer, textTransform: 'uppercase', marginTop: 6, marginBottom: 4, marginLeft: 4 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: 6, marginBottom: 2 },
  dropdownItemActive: { backgroundColor: 'rgba(16,185,129,0.12)' },
  dropdownItemText: { fontSize: 12, color: C.text, flex: 1 },
  confBadge: { fontSize: 10, fontWeight: '700', color: C.green, backgroundColor: C.greenBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeBadge: { fontSize: 9, fontWeight: '600', color: C.textSec, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  // Importing step
  importingText: { fontSize: 16, fontWeight: '600', color: C.text, marginTop: 16 },
  importingSub: { fontSize: 13, color: C.textSec, marginTop: 4 },
  // Done step
  doneIcon: { marginTop: 24, marginBottom: 12 },
  doneTitle: { fontSize: 20, fontWeight: '700', color: C.green, marginBottom: 20 },
  doneCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, width: '100%', marginBottom: 14 },
  doneCardTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 10 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  doneRowText: { fontSize: 13, color: C.text, flex: 1 },
  doneRowCount: { fontSize: 12, color: C.green, fontWeight: '600' },
  errorSmall: { fontSize: 11, color: C.red, marginBottom: 2 },
  doneBtn: { borderRadius: 14, overflow: 'hidden', width: '100%', marginTop: 10 },
});
