/**
 * RSImod Classification (CMJ-specific)
 * 
 * Based on: McMahon et al. (2018), Comfort et al. (2015), McGuigan (2017)
 * 
 * RSImod = Jump Height (m) / Time to Takeoff (s)
 * Typical range: 0.10 - 1.20+
 * 
 * IMPORTANT: These values differ from classic RSI (drop jump) and must NOT
 * be compared directly. Classic RSI uses contact_time and typically ranges 1.0-3.0+.
 */

export interface RSImodClassification {
  key: string;
  labelPt: string;
  labelEn: string;
  color: string;
  min: number;
  max: number;
}

const RSIMOD_RANGES: RSImodClassification[] = [
  { key: 'excellent',  labelPt: 'Excelente',   labelEn: 'Excellent',  color: '#15803d', min: 1.00, max: Infinity },
  { key: 'very_good',  labelPt: 'Muito Bom',   labelEn: 'Very Good',  color: '#22c55e', min: 0.80, max: 1.00 },
  { key: 'good',       labelPt: 'Bom',         labelEn: 'Good',       color: '#84cc16', min: 0.60, max: 0.80 },
  { key: 'moderate',   labelPt: 'Moderado',    labelEn: 'Moderate',   color: '#eab308', min: 0.40, max: 0.60 },
  { key: 'low',        labelPt: 'Baixo',       labelEn: 'Low',        color: '#f97316', min: 0.25, max: 0.40 },
  { key: 'very_low',   labelPt: 'Muito Baixo', labelEn: 'Very Low',   color: '#ef4444', min: -Infinity, max: 0.25 },
];

/**
 * Classify RSImod value using CMJ-specific reference ranges.
 * Ranges are non-overlapping: [min, max)
 */
export function classifyRSImod(value: number): RSImodClassification {
  if (value >= 1.00) return RSIMOD_RANGES[0]; // excellent
  if (value >= 0.80) return RSIMOD_RANGES[1]; // very_good
  if (value >= 0.60) return RSIMOD_RANGES[2]; // good
  if (value >= 0.40) return RSIMOD_RANGES[3]; // moderate
  if (value >= 0.25) return RSIMOD_RANGES[4]; // low
  return RSIMOD_RANGES[5]; // very_low
}

/**
 * Get the color for an RSImod value
 */
export function getRSImodColor(value: number): string {
  return classifyRSImod(value).color;
}

/**
 * Get the label for an RSImod value
 */
export function getRSImodLabel(value: number, locale: string): string {
  const cls = classifyRSImod(value);
  return locale === 'pt' ? cls.labelPt : cls.labelEn;
}

/**
 * Get all classification ranges for display (tooltip/detail view)
 */
export function getRSImodRanges(): RSImodClassification[] {
  return RSIMOD_RANGES;
}

/**
 * Tooltip content for RSImod classification (simple)
 */
export function getRSImodTooltipContent(locale: string): string[] {
  if (locale === 'pt') {
    return [
      'Classificacao pratica (RSImod):',
      '< 0.25 - Muito Baixo',
      '0.25 - 0.40 - Baixo',
      '0.40 - 0.60 - Moderado',
      '0.60 - 0.80 - Bom',
      '0.80 - 1.00 - Muito Bom',
      '> 1.00 - Excelente',
    ];
  }
  return [
    'Practical classification (RSImod):',
    '< 0.25 - Very Low',
    '0.25 - 0.40 - Low',
    '0.40 - 0.60 - Moderate',
    '0.60 - 0.80 - Good',
    '0.80 - 1.00 - Very Good',
    '> 1.00 - Excellent',
  ];
}

/**
 * Detailed scientific content for RSImod
 */
export function getRSImodDetailContent(locale: string): {
  title: string;
  sections: Array<{ heading: string; body: string }>;
} {
  if (locale === 'pt') {
    return {
      title: 'RSImod - Indice de Forca Reativa Modificado',
      sections: [
        {
          heading: 'O que e o RSImod?',
          body: 'O RSImod (Reactive Strength Index Modified) mede a capacidade de produzir forca rapidamente durante um salto com contramovimento (CMJ). Diferente do RSI classico (usado em Drop Jump com tempo de contato), o RSImod utiliza o tempo ate a decolagem (time-to-takeoff) como denominador.\n\nFormula: RSImod = Altura do Salto (m) / Tempo ate Decolagem (s)',
        },
        {
          heading: 'Interpretacao pratica',
          body: 'RSImod alto: O atleta produz forca rapidamente e de forma eficiente, gerando boa altura de salto em pouco tempo de preparacao.\n\nRSImod baixo: O atleta demora mais para produzir forca ou gera pouca altura relativa ao tempo de preparacao. Pode indicar necessidade de treino de potencia ou deficit na taxa de desenvolvimento de forca (RFD).',
        },
        {
          heading: 'Tabela de classificacao',
          body: '< 0.25 - Muito Baixo (vermelho)\n0.25 a 0.40 - Baixo (laranja)\n0.40 a 0.60 - Moderado (amarelo)\n0.60 a 0.80 - Bom (verde claro)\n0.80 a 1.00 - Muito Bom (verde)\n> 1.00 - Excelente (verde escuro)\n\nValores baseados em literatura aplicada a populacoes atleticas.',
        },
        {
          heading: 'Referencias cientificas',
          body: 'McMahon, J.J., Suchomel, T.J., Lake, J.P., & Comfort, P. (2018). Understanding the key phases of the countermovement jump force-time curve.\n\nComfort, P., McMahon, J.J., & Lake, J.P. (2015). Reactive Strength Index: A brief review of methods, reliability, and factors affecting the RSI.\n\nMcGuigan, M. (2017). Monitoring Training and Performance in Athletes.',
        },
        {
          heading: 'Observacao importante',
          body: 'Os valores de RSImod diferem do RSI classico (drop jump) e nao devem ser comparados diretamente. O RSI classico tipicamente varia de 1.0 a 3.0+, enquanto o RSImod varia de 0.1 a 1.2+.',
        },
      ],
    };
  }

  return {
    title: 'RSImod - Modified Reactive Strength Index',
    sections: [
      {
        heading: 'What is RSImod?',
        body: 'RSImod (Reactive Strength Index Modified) measures the ability to produce force quickly during a countermovement jump (CMJ). Unlike classic RSI (used in Drop Jump with contact time), RSImod uses time-to-takeoff as the denominator.\n\nFormula: RSImod = Jump Height (m) / Time to Takeoff (s)',
      },
      {
        heading: 'Practical interpretation',
        body: 'High RSImod: The athlete produces force quickly and efficiently, generating good jump height in a short preparation time.\n\nLow RSImod: The athlete takes longer to produce force or generates little height relative to preparation time. May indicate a need for power training or a deficit in rate of force development (RFD).',
      },
      {
        heading: 'Classification table',
        body: '< 0.25 - Very Low (red)\n0.25 to 0.40 - Low (orange)\n0.40 to 0.60 - Moderate (yellow)\n0.60 to 0.80 - Good (light green)\n0.80 to 1.00 - Very Good (green)\n> 1.00 - Excellent (dark green)\n\nValues based on applied literature for athletic populations.',
      },
      {
        heading: 'Scientific references',
        body: 'McMahon, J.J., Suchomel, T.J., Lake, J.P., & Comfort, P. (2018). Understanding the key phases of the countermovement jump force-time curve.\n\nComfort, P., McMahon, J.J., & Lake, J.P. (2015). Reactive Strength Index: A brief review of methods, reliability, and factors affecting the RSI.\n\nMcGuigan, M. (2017). Monitoring Training and Performance in Athletes.',
      },
      {
        heading: 'Important note',
        body: 'RSImod values differ from classic RSI (drop jump) and should not be compared directly. Classic RSI typically ranges from 1.0 to 3.0+, while RSImod ranges from 0.1 to 1.2+.',
      },
    ],
  };
}
