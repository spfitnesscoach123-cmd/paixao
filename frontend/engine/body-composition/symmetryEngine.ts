/**
 * symmetryEngine.ts — Motor de simetria corporal
 *
 * Calcula:
 * - Diferenca lateral (esquerda vs direita)
 * - Diferenca vertical (superior vs inferior)
 * - Gera insights automaticos
 */

import type { Measurements, SymmetryResult, SkinfoldSite } from '../../types/protocols';

// Sites do lado esquerdo/superior
const UPPER_SITES: SkinfoldSite[] = ['triceps', 'biceps', 'chest', 'subscapular', 'midaxillary'];
const LOWER_SITES: SkinfoldSite[] = ['abdominal', 'suprailiac', 'thigh', 'calf'];

// Sites com pares laterais (usamos o mesmo valor para ambos os lados na antropometria)
// Em protocolos de dobras cutaneas, medimos um so lado por convencao.
// A simetria aqui compara UPPER vs LOWER e TRUNK vs LIMBS.
const TRUNK_SITES: SkinfoldSite[] = ['subscapular', 'suprailiac', 'abdominal', 'chest', 'midaxillary'];
const LIMB_SITES: SkinfoldSite[] = ['triceps', 'biceps', 'thigh', 'calf'];

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function calculateSymmetry(measurements: Measurements): SymmetryResult {
  // Calcular medias por grupo
  const trunkValues = TRUNK_SITES.map((s) => measurements[s]).filter((v): v is number => v !== undefined && v > 0);
  const limbValues = LIMB_SITES.map((s) => measurements[s]).filter((v): v is number => v !== undefined && v > 0);
  const upperValues = UPPER_SITES.map((s) => measurements[s]).filter((v): v is number => v !== undefined && v > 0);
  const lowerValues = LOWER_SITES.map((s) => measurements[s]).filter((v): v is number => v !== undefined && v > 0);

  const trunkAvg = avg(trunkValues);
  const limbAvg = avg(limbValues);
  const upperAvg = avg(upperValues);
  const lowerAvg = avg(lowerValues);

  // Lateral: tronco vs membros (proxy para distribuicao lateral)
  let lateralDiff = 0;
  let lateralLabel = 'Equilibrado';
  if (trunkAvg > 0 && limbAvg > 0) {
    lateralDiff = Math.round(Math.abs(trunkAvg - limbAvg) / Math.max(trunkAvg, limbAvg) * 100);
    if (trunkAvg > limbAvg * 1.2) {
      lateralLabel = 'Concentracao no tronco';
    } else if (limbAvg > trunkAvg * 1.2) {
      lateralLabel = 'Concentracao nos membros';
    }
  }

  // Vertical: superior vs inferior
  let verticalDiff = 0;
  let verticalLabel = 'Equilibrado';
  if (upperAvg > 0 && lowerAvg > 0) {
    verticalDiff = Math.round(Math.abs(upperAvg - lowerAvg) / Math.max(upperAvg, lowerAvg) * 100);
    if (upperAvg > lowerAvg * 1.2) {
      verticalLabel = 'Concentracao superior';
    } else if (lowerAvg > upperAvg * 1.2) {
      verticalLabel = 'Concentracao inferior';
    }
  }

  // Insights
  const insights: string[] = [];
  const insightsPt: string[] = [];

  if (lateralDiff > 30) {
    insights.push('Significant asymmetry between trunk and limbs');
    insightsPt.push('Assimetria significativa entre tronco e membros');
  } else if (lateralDiff > 15) {
    insights.push('Moderate asymmetry between trunk and limbs');
    insightsPt.push('Assimetria moderada entre tronco e membros');
  } else {
    insights.push('Balanced distribution between trunk and limbs');
    insightsPt.push('Distribuicao equilibrada entre tronco e membros');
  }

  if (verticalDiff > 30) {
    insights.push(`Higher fat concentration in ${upperAvg > lowerAvg ? 'upper' : 'lower'} body`);
    insightsPt.push(`Maior concentracao de gordura na parte ${upperAvg > lowerAvg ? 'superior' : 'inferior'}`);
  } else {
    insights.push('Balanced vertical distribution');
    insightsPt.push('Distribuicao vertical equilibrada');
  }

  // Identify highest site
  const allEntries = Object.entries(measurements).filter(([, v]) => v !== undefined && v > 0) as [SkinfoldSite, number][];
  if (allEntries.length > 0) {
    const sorted = allEntries.sort((a, b) => b[1] - a[1]);
    const highest = sorted[0];
    const siteLabels: Record<string, string> = {
      triceps: 'triceps', biceps: 'biceps', subscapular: 'subescapular',
      suprailiac: 'suprailiaca', abdominal: 'abdominal', chest: 'peitoral',
      midaxillary: 'axilar media', thigh: 'coxa', calf: 'panturrilha',
    };
    insights.push(`Highest skinfold: ${highest[0]} (${highest[1]}mm)`);
    insightsPt.push(`Maior dobra: ${siteLabels[highest[0]] || highest[0]} (${highest[1]}mm)`);
  }

  return {
    lateralDiff,
    lateralLabel,
    verticalDiff,
    verticalLabel,
    insights,
    insightsPt,
  };
}
