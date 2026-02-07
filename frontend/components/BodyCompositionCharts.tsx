import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated } from 'react-native';
import Svg, { Path, Circle, G, Text as SvgText, Rect, Ellipse, Defs, LinearGradient, RadialGradient, Stop, Filter, FeGaussianBlur, FeOffset, FeMerge, FeMergeNode } from 'react-native-svg';
import { colors } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

interface BodyCompositionChartsProps {
  data: {
    body_fat_percentage: number;
    lean_mass_kg: number;
    fat_mass_kg: number;
    bone_mass_kg: number;
    bmi: number;
    bmi_classification: string;
    weight: number;
    height: number;
    fat_distribution?: {
      upper_arm?: number;
      trunk_front?: number;
      trunk_back?: number;
      hip_waist?: number;
      lower_body?: number;
    };
  };
  history?: Array<{
    date: string;
    body_fat_percentage: number;
    lean_mass_kg: number;
    weight: number;
    bmi: number;
  }>;
}

const { width: screenWidth } = Dimensions.get('window');

export const BodyCompositionCharts: React.FC<BodyCompositionChartsProps> = ({ data, history }) => {
  const { t, locale } = useLanguage();
  
  const translations = {
    pt: {
      bodyComposition: 'Composição Corporal',
      fatDistribution: 'Distribuição de Gordura',
      metrics: 'Métricas',
      bodyFat: '% Gordura',
      leanMass: 'Massa Magra',
      fatMass: 'Massa Gorda',
      boneMass: 'Massa Óssea',
      bmi: 'IMC',
      evolution: 'Evolução',
      upperArm: 'Braços',
      trunkFront: 'Tronco Frontal',
      trunkBack: 'Tronco Dorsal',
      hipWaist: 'Quadril/Cintura',
      lowerBody: 'Membros Inf.',
      kg: 'kg',
      optimal: 'Ótimo',
      moderate: 'Moderado',
      high: 'Alto',
    },
    en: {
      bodyComposition: 'Body Composition',
      fatDistribution: 'Fat Distribution',
      metrics: 'Metrics',
      bodyFat: 'Body Fat %',
      leanMass: 'Lean Mass',
      fatMass: 'Fat Mass',
      boneMass: 'Bone Mass',
      bmi: 'BMI',
      evolution: 'Evolution',
      upperArm: 'Arms',
      trunkFront: 'Front Trunk',
      trunkBack: 'Back Trunk',
      hipWaist: 'Hip/Waist',
      lowerBody: 'Lower Body',
      kg: 'kg',
      optimal: 'Optimal',
      moderate: 'Moderate',
      high: 'High',
    }
  };
  
  const t2 = translations[locale === 'pt' ? 'pt' : 'en'];
  
  // Body 3D Model Component
  const BodyModel = () => {
    const distribution = data.fat_distribution || {};
    
    // Calculate intensity for each region (0-1)
    const getIntensity = (value: number = 0) => Math.min(value / 40, 1); // Max 40%
    
    const getColor = (value: number = 0) => {
      const intensity = getIntensity(value);
      if (intensity < 0.3) return '#10b981'; // Green - low
      if (intensity < 0.5) return '#f59e0b'; // Yellow - moderate
      return '#ef4444'; // Red - high
    };
    
    const getOpacity = (value: number = 0) => {
      return 0.4 + (getIntensity(value) * 0.5);
    };
    
    return (
      <View style={styles.bodyModelContainer}>
        <Svg width={180} height={280} viewBox="0 0 180 280">
          {/* Head */}
          <Circle cx="90" cy="28" r="22" fill={colors.dark.secondary} stroke={colors.accent.primary} strokeWidth="2" />
          
          {/* Neck */}
          <Rect x="82" y="48" width="16" height="15" fill={colors.dark.secondary} />
          
          {/* Shoulders/Upper Body - Trunk Front */}
          <Path
            d="M50 65 L130 65 L140 90 L40 90 Z"
            fill={getColor(distribution.trunk_front)}
            opacity={getOpacity(distribution.trunk_front)}
            stroke={colors.border.default}
            strokeWidth="1"
          />
          
          {/* Chest/Torso - Trunk Front */}
          <Path
            d="M40 90 L140 90 L135 155 L45 155 Z"
            fill={getColor(distribution.trunk_front)}
            opacity={getOpacity(distribution.trunk_front)}
            stroke={colors.border.default}
            strokeWidth="1"
          />
          
          {/* Left Arm */}
          <Path
            d="M40 70 L25 70 L15 140 L30 140 L40 90"
            fill={getColor(distribution.upper_arm)}
            opacity={getOpacity(distribution.upper_arm)}
            stroke={colors.border.default}
            strokeWidth="1"
          />
          
          {/* Right Arm */}
          <Path
            d="M140 70 L155 70 L165 140 L150 140 L140 90"
            fill={getColor(distribution.upper_arm)}
            opacity={getOpacity(distribution.upper_arm)}
            stroke={colors.border.default}
            strokeWidth="1"
          />
          
          {/* Waist/Hip Area */}
          <Path
            d="M45 155 L135 155 L130 185 L50 185 Z"
            fill={getColor(distribution.hip_waist)}
            opacity={getOpacity(distribution.hip_waist)}
            stroke={colors.border.default}
            strokeWidth="1"
          />
          
          {/* Left Thigh */}
          <Path
            d="M50 185 L80 185 L75 250 L45 250 Z"
            fill={getColor(distribution.lower_body)}
            opacity={getOpacity(distribution.lower_body)}
            stroke={colors.border.default}
            strokeWidth="1"
          />
          
          {/* Right Thigh */}
          <Path
            d="M100 185 L130 185 L135 250 L105 250 Z"
            fill={getColor(distribution.lower_body)}
            opacity={getOpacity(distribution.lower_body)}
            stroke={colors.border.default}
            strokeWidth="1"
          />
          
          {/* Left Calf */}
          <Path
            d="M45 250 L75 250 L70 275 L50 275 Z"
            fill={getColor(distribution.lower_body)}
            opacity={getOpacity(distribution.lower_body) * 0.8}
            stroke={colors.border.default}
            strokeWidth="1"
          />
          
          {/* Right Calf */}
          <Path
            d="M105 250 L135 250 L130 275 L110 275 Z"
            fill={getColor(distribution.lower_body)}
            opacity={getOpacity(distribution.lower_body) * 0.8}
            stroke={colors.border.default}
            strokeWidth="1"
          />
        </Svg>
        
        {/* Legend */}
        <View style={styles.bodyLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.legendText}>{t2.optimal}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.legendText}>{t2.moderate}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.legendText}>{t2.high}</Text>
          </View>
        </View>
      </View>
    );
  };
  
  // Composition Donut Chart
  const CompositionDonut = () => {
    const total = data.lean_mass_kg + data.fat_mass_kg;
    const leanPercent = (data.lean_mass_kg / total) * 100;
    const fatPercent = (data.fat_mass_kg / total) * 100;
    
    const radius = 60;
    const strokeWidth = 20;
    const circumference = 2 * Math.PI * radius;
    
    const leanOffset = 0;
    const fatOffset = (leanPercent / 100) * circumference;
    
    return (
      <View style={styles.donutContainer}>
        <Svg width={160} height={160} viewBox="0 0 160 160">
          {/* Background circle */}
          <Circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={colors.dark.secondary}
            strokeWidth={strokeWidth}
          />
          
          {/* Lean mass arc */}
          <Circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="#10b981"
            strokeWidth={strokeWidth}
            strokeDasharray={`${(leanPercent / 100) * circumference} ${circumference}`}
            strokeDashoffset={-leanOffset}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
          />
          
          {/* Fat mass arc */}
          <Circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={strokeWidth}
            strokeDasharray={`${(fatPercent / 100) * circumference} ${circumference}`}
            strokeDashoffset={-fatOffset}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
          />
          
          {/* Center text */}
          <SvgText
            x="80"
            y="75"
            textAnchor="middle"
            fill={colors.text.primary}
            fontSize="24"
            fontWeight="bold"
          >
            {data.body_fat_percentage.toFixed(1)}%
          </SvgText>
          <SvgText
            x="80"
            y="95"
            textAnchor="middle"
            fill={colors.text.secondary}
            fontSize="12"
          >
            {t2.bodyFat}
          </SvgText>
        </Svg>
        
        {/* Legend below donut */}
        <View style={styles.donutLegend}>
          <View style={styles.donutLegendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.donutLegendText}>{t2.leanMass}: {data.lean_mass_kg.toFixed(1)} {t2.kg}</Text>
          </View>
          <View style={styles.donutLegendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.donutLegendText}>{t2.fatMass}: {data.fat_mass_kg.toFixed(1)} {t2.kg}</Text>
          </View>
        </View>
      </View>
    );
  };
  
  // BMI Gauge
  const BMIGauge = () => {
    const bmiValue = data.bmi;
    // BMI scale: 15 to 40
    const minBMI = 15;
    const maxBMI = 40;
    const normalizedBMI = Math.max(minBMI, Math.min(maxBMI, bmiValue));
    const position = ((normalizedBMI - minBMI) / (maxBMI - minBMI)) * 100;
    
    const getBMIColor = () => {
      if (bmiValue < 18.5) return '#3b82f6'; // Underweight - blue
      if (bmiValue < 25) return '#10b981'; // Normal - green
      if (bmiValue < 30) return '#f59e0b'; // Overweight - yellow
      return '#ef4444'; // Obese - red
    };
    
    const getBMILabel = () => {
      if (bmiValue < 18.5) return locale === 'pt' ? 'Abaixo' : 'Under';
      if (bmiValue < 25) return locale === 'pt' ? 'Normal' : 'Normal';
      if (bmiValue < 30) return locale === 'pt' ? 'Sobrepeso' : 'Over';
      return locale === 'pt' ? 'Obeso' : 'Obese';
    };
    
    return (
      <View style={styles.bmiGaugeContainer}>
        <Text style={styles.metricTitle}>{t2.bmi}</Text>
        
        {/* BMI Scale Bar */}
        <View style={styles.bmiScale}>
          <View style={[styles.bmiSegment, { backgroundColor: '#3b82f6', flex: 18.5 - 15 }]} />
          <View style={[styles.bmiSegment, { backgroundColor: '#10b981', flex: 25 - 18.5 }]} />
          <View style={[styles.bmiSegment, { backgroundColor: '#f59e0b', flex: 30 - 25 }]} />
          <View style={[styles.bmiSegment, { backgroundColor: '#ef4444', flex: 40 - 30 }]} />
        </View>
        
        {/* Indicator */}
        <View style={[styles.bmiIndicator, { left: `${position}%` }]}>
          <View style={[styles.bmiIndicatorDot, { backgroundColor: getBMIColor() }]} />
        </View>
        
        {/* Value */}
        <View style={styles.bmiValueContainer}>
          <Text style={[styles.bmiValue, { color: getBMIColor() }]}>{bmiValue.toFixed(1)}</Text>
          <Text style={[styles.bmiLabel, { color: getBMIColor() }]}>{getBMILabel()}</Text>
        </View>
      </View>
    );
  };
  
  // History Chart
  const HistoryChart = () => {
    if (!history || history.length < 2) return null;
    
    const chartWidth = screenWidth - 80;
    const chartHeight = 120;
    const padding = { top: 10, right: 10, bottom: 20, left: 40 };
    
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;
    
    const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-10);
    
    const values = sortedHistory.map(h => h.body_fat_percentage);
    const minVal = Math.min(...values) - 2;
    const maxVal = Math.max(...values) + 2;
    
    const points = sortedHistory.map((h, i) => {
      const x = padding.left + (i / (sortedHistory.length - 1)) * innerWidth;
      const y = padding.top + innerHeight - ((h.body_fat_percentage - minVal) / (maxVal - minVal)) * innerHeight;
      return { x, y, value: h.body_fat_percentage, date: h.date };
    });
    
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    
    return (
      <View style={styles.historyContainer}>
        <Text style={styles.metricTitle}>{t2.evolution} - {t2.bodyFat}</Text>
        <Svg width={chartWidth} height={chartHeight}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <G key={i}>
              <Path
                d={`M ${padding.left} ${padding.top + innerHeight * ratio} L ${chartWidth - padding.right} ${padding.top + innerHeight * ratio}`}
                stroke={colors.border.default}
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <SvgText
                x={padding.left - 5}
                y={padding.top + innerHeight * ratio + 4}
                fill={colors.text.tertiary}
                fontSize="10"
                textAnchor="end"
              >
                {(maxVal - (maxVal - minVal) * ratio).toFixed(0)}%
              </SvgText>
            </G>
          ))}
          
          {/* Line */}
          <Path
            d={pathD}
            fill="none"
            stroke={colors.accent.primary}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Points */}
          {points.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="5"
              fill={colors.accent.primary}
              stroke={colors.dark.primary}
              strokeWidth="2"
            />
          ))}
        </Svg>
      </View>
    );
  };
  
  return (
    <View style={styles.container}>
      {/* Main Composition Section */}
      <View style={styles.mainSection}>
        <View style={styles.leftColumn}>
          <Text style={styles.sectionTitle}>{t2.fatDistribution}</Text>
          <BodyModel />
        </View>
        
        <View style={styles.rightColumn}>
          <Text style={styles.sectionTitle}>{t2.bodyComposition}</Text>
          <CompositionDonut />
        </View>
      </View>
      
      {/* BMI Section */}
      <View style={styles.metricsSection}>
        <BMIGauge />
      </View>
      
      {/* Metrics Cards */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{data.weight.toFixed(1)}</Text>
          <Text style={styles.metricLabel}>{locale === 'pt' ? 'Peso' : 'Weight'} ({t2.kg})</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{data.height.toFixed(0)}</Text>
          <Text style={styles.metricLabel}>{locale === 'pt' ? 'Altura' : 'Height'} (cm)</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, { color: '#10b981' }]}>{data.lean_mass_kg.toFixed(1)}</Text>
          <Text style={styles.metricLabel}>{t2.leanMass}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricValue, { color: '#f59e0b' }]}>{data.fat_mass_kg.toFixed(1)}</Text>
          <Text style={styles.metricLabel}>{t2.fatMass}</Text>
        </View>
      </View>
      
      {/* History Chart */}
      <HistoryChart />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
  },
  mainSection: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  leftColumn: {
    flex: 1,
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  rightColumn: {
    flex: 1,
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 12,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  bodyModelContainer: {
    alignItems: 'center',
  },
  bodyLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 10,
    color: colors.text.secondary,
  },
  donutContainer: {
    alignItems: 'center',
  },
  donutLegend: {
    marginTop: 12,
    gap: 6,
  },
  donutLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  donutLegendText: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  metricsSection: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  metricTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
  },
  bmiGaugeContainer: {
    position: 'relative',
  },
  bmiScale: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 8,
  },
  bmiSegment: {
    height: '100%',
  },
  bmiIndicator: {
    position: 'absolute',
    top: 35,
    transform: [{ translateX: -8 }],
  },
  bmiIndicatorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.dark.primary,
  },
  bmiValueContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  bmiValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  bmiLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.dark.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  historyContainer: {
    backgroundColor: colors.dark.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
});
