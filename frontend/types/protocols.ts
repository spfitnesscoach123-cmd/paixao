/**
 * protocols.ts — Tipos centrais do sistema de protocolos
 */

export type Gender = 'male' | 'female';

export type SkinfoldSite =
  | 'triceps'
  | 'biceps'
  | 'subscapular'
  | 'suprailiac'
  | 'abdominal'
  | 'chest'
  | 'midaxillary'
  | 'thigh'
  | 'calf';

export const SKINFOLD_LABELS: Record<SkinfoldSite, { pt: string; en: string }> = {
  triceps: { pt: 'Triceps', en: 'Triceps' },
  biceps: { pt: 'Biceps', en: 'Biceps' },
  subscapular: { pt: 'Subescapular', en: 'Subscapular' },
  suprailiac: { pt: 'Suprailiaca', en: 'Suprailiac' },
  abdominal: { pt: 'Abdominal', en: 'Abdominal' },
  chest: { pt: 'Peitoral', en: 'Chest' },
  midaxillary: { pt: 'Axilar Media', en: 'Midaxillary' },
  thigh: { pt: 'Coxa', en: 'Thigh' },
  calf: { pt: 'Panturrilha', en: 'Calf' },
};

// Mapeamento: site anatomico -> mesh(es) do avatar 3D
export const SITE_TO_MESH: Record<SkinfoldSite, string[]> = {
  triceps: ['LeftArm', 'RightArm'],
  biceps: ['LeftArm', 'RightArm'],
  subscapular: ['Torso'],
  suprailiac: ['Torso'],
  abdominal: ['Torso'],
  chest: ['Torso'],
  midaxillary: ['Torso'],
  thigh: ['LeftLeg', 'RightLeg'],
  calf: ['LeftLeg', 'RightLeg'],
};

// Mapeamento: mesh do avatar -> site anatomico (tap to select)
export const MESH_TO_SITES: Record<string, SkinfoldSite[]> = {
  Head: [],
  Torso: ['subscapular', 'suprailiac', 'abdominal', 'chest', 'midaxillary'],
  LeftArm: ['triceps', 'biceps'],
  RightArm: ['triceps', 'biceps'],
  LeftLeg: ['thigh', 'calf'],
  RightLeg: ['thigh', 'calf'],
};

export interface Protocol {
  id: string;
  name: string;
  namePt: string;
  description: string;
  descriptionPt: string;
  sites: SkinfoldSite[];
  genderSpecific: boolean;
  sitesMale?: SkinfoldSite[];
  sitesFemale?: SkinfoldSite[];
}

export type Measurements = Partial<Record<SkinfoldSite, number>>;

export interface ProtocolResult {
  protocolId: string;
  protocolName: string;
  bodyFatPercent: number;
  density: number;
  sumOfFolds: number;
}

export interface CompositionResult {
  bodyFatPercent: number;
  fatMass: number;
  leanMass: number;
  waterEstimate: number;
  boneEstimate: number;
  imc: number;
  classification: string;
  classificationPt: string;
}

export interface SymmetryResult {
  lateralDiff: number;        // % diferenca esquerda vs direita
  lateralLabel: string;
  verticalDiff: number;       // % diferenca superior vs inferior
  verticalLabel: string;
  insights: string[];
  insightsPt: string[];
}

export interface FullReport {
  protocol: ProtocolResult;
  composition: CompositionResult;
  symmetry: SymmetryResult;
  measurements: Measurements;
  athleteWeight: number;
  athleteHeight: number;
  gender: Gender;
  age: number;
  timestamp: number;
}
