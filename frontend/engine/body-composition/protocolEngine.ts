/**
 * protocolEngine.ts — Motor de protocolos cientificos
 *
 * 5 protocolos implementados com formulas reais:
 *   1. Jackson & Pollock 3 dobras
 *   2. Jackson & Pollock 7 dobras
 *   3. Durnin & Womersley 4 dobras
 *   4. Faulkner 4 dobras
 *   5. Guedes (1985) 3 dobras
 *
 * Pura logica, sem dependencia de React.
 */

import type {
  Protocol,
  ProtocolResult,
  Measurements,
  Gender,
  SkinfoldSite,
} from '../../types/protocols';

// ============================================================
// PROTOCOLOS
// ============================================================

export const PROTOCOLS: Protocol[] = [
  {
    id: 'jackson_pollock_3',
    name: 'Jackson & Pollock 3',
    namePt: 'Jackson & Pollock 3 Dobras',
    description: '3-site skinfold protocol',
    descriptionPt: 'Protocolo de 3 dobras cutaneas',
    genderSpecific: true,
    sites: [],
    sitesMale: ['chest', 'abdominal', 'thigh'],
    sitesFemale: ['triceps', 'suprailiac', 'thigh'],
  },
  {
    id: 'jackson_pollock_7',
    name: 'Jackson & Pollock 7',
    namePt: 'Jackson & Pollock 7 Dobras',
    description: '7-site skinfold protocol',
    descriptionPt: 'Protocolo de 7 dobras cutaneas',
    genderSpecific: false,
    sites: ['chest', 'abdominal', 'thigh', 'triceps', 'subscapular', 'suprailiac', 'midaxillary'],
  },
  {
    id: 'durnin_womersley',
    name: 'Durnin & Womersley',
    namePt: 'Durnin & Womersley 4 Dobras',
    description: '4-site protocol (biceps, triceps, subscapular, suprailiac)',
    descriptionPt: 'Protocolo de 4 dobras (biceps, triceps, subescapular, suprailiaca)',
    genderSpecific: false,
    sites: ['biceps', 'triceps', 'subscapular', 'suprailiac'],
  },
  {
    id: 'faulkner',
    name: 'Faulkner',
    namePt: 'Faulkner 4 Dobras',
    description: '4-site protocol for athletes',
    descriptionPt: 'Protocolo de 4 dobras para atletas',
    genderSpecific: false,
    sites: ['triceps', 'subscapular', 'suprailiac', 'abdominal'],
  },
  {
    id: 'guedes_1985',
    name: 'Guedes (1985)',
    namePt: 'Guedes 3 Dobras (1985)',
    description: '3-site Brazilian protocol',
    descriptionPt: 'Protocolo brasileiro de 3 dobras',
    genderSpecific: true,
    sites: [],
    sitesMale: ['triceps', 'suprailiac', 'abdominal'],
    sitesFemale: ['triceps', 'suprailiac', 'thigh'],
  },
];

// ============================================================
// HELPERS
// ============================================================

export function getProtocolSites(protocol: Protocol, gender: Gender): SkinfoldSite[] {
  if (protocol.genderSpecific) {
    return gender === 'male'
      ? (protocol.sitesMale ?? protocol.sites)
      : (protocol.sitesFemale ?? protocol.sites);
  }
  return protocol.sites;
}

export function getProtocolById(id: string): Protocol | undefined {
  return PROTOCOLS.find((p) => p.id === id);
}

export function validateMeasurements(
  protocol: Protocol,
  gender: Gender,
  measurements: Measurements
): { valid: boolean; missing: SkinfoldSite[] } {
  const required = getProtocolSites(protocol, gender);
  const missing = required.filter((s) => {
    const val = measurements[s];
    return val === undefined || val <= 0;
  });
  return { valid: missing.length === 0, missing };
}

// ============================================================
// FORMULAS
// ============================================================

function siriEquation(density: number): number {
  return (495 / density) - 450;
}

// --- Jackson & Pollock 3 (Male) ---
function jp3Male(m: Measurements, age: number): { density: number; bodyFat: number } {
  const sum = (m.chest ?? 0) + (m.abdominal ?? 0) + (m.thigh ?? 0);
  const density = 1.10938
    - 0.0008267 * sum
    + 0.0000016 * (sum * sum)
    - 0.0002574 * age;
  return { density, bodyFat: siriEquation(density) };
}

// --- Jackson & Pollock 3 (Female) ---
function jp3Female(m: Measurements, age: number): { density: number; bodyFat: number } {
  const sum = (m.triceps ?? 0) + (m.suprailiac ?? 0) + (m.thigh ?? 0);
  const density = 1.0994921
    - 0.0009929 * sum
    + 0.0000023 * (sum * sum)
    - 0.0001392 * age;
  return { density, bodyFat: siriEquation(density) };
}

// --- Jackson & Pollock 7 ---
function jp7(m: Measurements, age: number, gender: Gender): { density: number; bodyFat: number } {
  const sum = (m.chest ?? 0) + (m.abdominal ?? 0) + (m.thigh ?? 0)
    + (m.triceps ?? 0) + (m.subscapular ?? 0) + (m.suprailiac ?? 0)
    + (m.midaxillary ?? 0);

  let density: number;
  if (gender === 'male') {
    density = 1.112
      - 0.00043499 * sum
      + 0.00000055 * (sum * sum)
      - 0.00028826 * age;
  } else {
    density = 1.097
      - 0.00046971 * sum
      + 0.00000056 * (sum * sum)
      - 0.00012828 * age;
  }
  return { density, bodyFat: siriEquation(density) };
}

// --- Durnin & Womersley ---
function durninWomersley(m: Measurements, age: number, gender: Gender): { density: number; bodyFat: number } {
  const sum = (m.biceps ?? 0) + (m.triceps ?? 0) + (m.subscapular ?? 0) + (m.suprailiac ?? 0);
  const logSum = Math.log10(sum);

  let density: number;
  if (gender === 'male') {
    if (age < 20) density = 1.1620 - 0.0630 * logSum;
    else if (age < 30) density = 1.1631 - 0.0632 * logSum;
    else if (age < 40) density = 1.1422 - 0.0544 * logSum;
    else if (age < 50) density = 1.1620 - 0.0700 * logSum;
    else density = 1.1715 - 0.0779 * logSum;
  } else {
    if (age < 20) density = 1.1549 - 0.0678 * logSum;
    else if (age < 30) density = 1.1599 - 0.0717 * logSum;
    else if (age < 40) density = 1.1423 - 0.0632 * logSum;
    else if (age < 50) density = 1.1333 - 0.0612 * logSum;
    else density = 1.1339 - 0.0645 * logSum;
  }
  return { density, bodyFat: siriEquation(density) };
}

// --- Faulkner ---
function faulkner(m: Measurements): { density: number; bodyFat: number } {
  const sum = (m.triceps ?? 0) + (m.subscapular ?? 0) + (m.suprailiac ?? 0) + (m.abdominal ?? 0);
  const bodyFat = sum * 0.153 + 5.783;
  // Faulkner nao calcula densidade diretamente
  const density = 495 / (bodyFat + 450);
  return { density, bodyFat };
}

// --- Guedes (1985) Male ---
function guedesMale(m: Measurements): { density: number; bodyFat: number } {
  const density = 1.17136
    - 0.06706 * Math.log10(m.triceps ?? 1)
    - 0.07861 * Math.log10(m.suprailiac ?? 1)
    - 0.01334 * Math.log10(m.abdominal ?? 1);
  return { density, bodyFat: siriEquation(density) };
}

// --- Guedes (1985) Female ---
function guedesFemale(m: Measurements): { density: number; bodyFat: number } {
  const density = 1.16650
    - 0.07063 * Math.log10(m.triceps ?? 1)
    - 0.04581 * Math.log10(m.suprailiac ?? 1)
    - 0.01131 * Math.log10(m.thigh ?? 1);
  return { density, bodyFat: siriEquation(density) };
}

// ============================================================
// CALCULO PRINCIPAL
// ============================================================

export function calculateProtocol(
  protocolId: string,
  measurements: Measurements,
  gender: Gender,
  age: number
): ProtocolResult | null {
  const protocol = getProtocolById(protocolId);
  if (!protocol) return null;

  const sites = getProtocolSites(protocol, gender);
  const sum = sites.reduce((s, site) => s + (measurements[site] ?? 0), 0);

  let result: { density: number; bodyFat: number };

  switch (protocolId) {
    case 'jackson_pollock_3':
      result = gender === 'male' ? jp3Male(measurements, age) : jp3Female(measurements, age);
      break;
    case 'jackson_pollock_7':
      result = jp7(measurements, age, gender);
      break;
    case 'durnin_womersley':
      result = durninWomersley(measurements, age, gender);
      break;
    case 'faulkner':
      result = faulkner(measurements);
      break;
    case 'guedes_1985':
      result = gender === 'male' ? guedesMale(measurements) : guedesFemale(measurements);
      break;
    default:
      return null;
  }

  // Clamp body fat to sane range
  const bodyFat = Math.max(2, Math.min(60, result.bodyFat));

  return {
    protocolId,
    protocolName: protocol.namePt,
    bodyFatPercent: Math.round(bodyFat * 10) / 10,
    density: Math.round(result.density * 10000) / 10000,
    sumOfFolds: Math.round(sum * 10) / 10,
  };
}
