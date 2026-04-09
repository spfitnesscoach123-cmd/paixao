/**
 * bodyComposition.ts — Engine de composicao corporal
 *
 * Calcula: massa gorda, massa magra, agua, massa ossea, IMC
 * Classifica: atleta, normal, sobrepeso, etc.
 */

import type { CompositionResult, Gender } from '../../types/protocols';

// ============================================================
// CLASSIFICACAO DE GORDURA CORPORAL
// ============================================================

interface FatRange {
  label: string;
  labelPt: string;
  maleMax: number;
  femaleMax: number;
}

const FAT_RANGES: FatRange[] = [
  { label: 'Essential Fat', labelPt: 'Gordura Essencial', maleMax: 5, femaleMax: 13 },
  { label: 'Athletic', labelPt: 'Atletico', maleMax: 13, femaleMax: 20 },
  { label: 'Fitness', labelPt: 'Fitness', maleMax: 17, femaleMax: 24 },
  { label: 'Average', labelPt: 'Normal', maleMax: 24, femaleMax: 31 },
  { label: 'Overweight', labelPt: 'Acima do Peso', maleMax: 100, femaleMax: 100 },
];

function classifyBodyFat(bodyFat: number, gender: Gender): { label: string; labelPt: string } {
  for (const range of FAT_RANGES) {
    const max = gender === 'male' ? range.maleMax : range.femaleMax;
    if (bodyFat <= max) {
      return { label: range.label, labelPt: range.labelPt };
    }
  }
  return { label: 'Obese', labelPt: 'Obeso' };
}

// ============================================================
// CALCULO PRINCIPAL
// ============================================================

export function calculateComposition(
  bodyFatPercent: number,
  weightKg: number,
  heightCm: number,
  gender: Gender
): CompositionResult {
  const fatMass = weightKg * (bodyFatPercent / 100);
  const leanMass = weightKg - fatMass;

  // Agua corporal estimada (~73% da massa magra)
  const waterEstimate = leanMass * 0.73;

  // Massa ossea estimada (~15% da massa magra)
  const boneEstimate = leanMass * 0.15;

  // IMC
  const heightM = heightCm / 100;
  const imc = weightKg / (heightM * heightM);

  const classification = classifyBodyFat(bodyFatPercent, gender);

  return {
    bodyFatPercent: Math.round(bodyFatPercent * 10) / 10,
    fatMass: Math.round(fatMass * 10) / 10,
    leanMass: Math.round(leanMass * 10) / 10,
    waterEstimate: Math.round(waterEstimate * 10) / 10,
    boneEstimate: Math.round(boneEstimate * 10) / 10,
    imc: Math.round(imc * 10) / 10,
    classification: classification.label,
    classificationPt: classification.labelPt,
  };
}
