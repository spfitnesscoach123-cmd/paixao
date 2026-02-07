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
  
  // Body 3D Model Component with Enhanced Visual Effects
  const BodyModel = () => {
    const [viewAngle, setViewAngle] = useState<'front' | 'side'>('front');
    const distribution = data.fat_distribution || {};
    
    // Calculate intensity for each region (0-1)
    const getIntensity = (value: number = 0) => Math.min(value / 40, 1); // Max 40%
    
    const getColor = (value: number = 0) => {
      const intensity = getIntensity(value);
      if (intensity < 0.3) return '#10b981'; // Green - low
      if (intensity < 0.5) return '#f59e0b'; // Yellow - moderate
      return '#ef4444'; // Red - high
    };
    
    const getColorLight = (value: number = 0) => {
      const intensity = getIntensity(value);
      if (intensity < 0.3) return '#34d399'; // Light green
      if (intensity < 0.5) return '#fbbf24'; // Light yellow
      return '#f87171'; // Light red
    };
    
    const getColorDark = (value: number = 0) => {
      const intensity = getIntensity(value);
      if (intensity < 0.3) return '#059669'; // Dark green
      if (intensity < 0.5) return '#d97706'; // Dark yellow
      return '#dc2626'; // Dark red
    };
    
    const getOpacity = (value: number = 0) => {
      return 0.6 + (getIntensity(value) * 0.35);
    };
    
    // Region percentage values
    const regionValues = {
      upperArm: distribution.upper_arm || 0,
      trunkFront: distribution.trunk_front || 0,
      hipWaist: distribution.hip_waist || 0,
      lowerBody: distribution.lower_body || 0,
    };
    
    return (
      <View style={styles.bodyModelContainer}>
        {/* View Toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewButton, viewAngle === 'front' && styles.viewButtonActive]}
            onPress={() => setViewAngle('front')}
          >
            <Text style={[styles.viewButtonText, viewAngle === 'front' && styles.viewButtonTextActive]}>
              {locale === 'pt' ? 'Frontal' : 'Front'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewButton, viewAngle === 'side' && styles.viewButtonActive]}
            onPress={() => setViewAngle('side')}
          >
            <Text style={[styles.viewButtonText, viewAngle === 'side' && styles.viewButtonTextActive]}>
              {locale === 'pt' ? 'Lateral' : 'Side'}
            </Text>
          </TouchableOpacity>
        </View>

        {viewAngle === 'front' ? (
          <Svg width={200} height={300} viewBox="0 0 200 300">
            <Defs>
              {/* Skin gradient */}
              <LinearGradient id="skinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#2d3748" stopOpacity="1" />
                <Stop offset="100%" stopColor="#1a202c" stopOpacity="1" />
              </LinearGradient>
              
              {/* Fat region gradients */}
              <RadialGradient id="armsFat" cx="50%" cy="30%" r="70%">
                <Stop offset="0%" stopColor={getColorLight(regionValues.upperArm)} stopOpacity={getOpacity(regionValues.upperArm)} />
                <Stop offset="100%" stopColor={getColorDark(regionValues.upperArm)} stopOpacity={getOpacity(regionValues.upperArm) - 0.2} />
              </RadialGradient>
              <RadialGradient id="torsoFat" cx="50%" cy="40%" r="70%">
                <Stop offset="0%" stopColor={getColorLight(regionValues.trunkFront)} stopOpacity={getOpacity(regionValues.trunkFront)} />
                <Stop offset="100%" stopColor={getColorDark(regionValues.trunkFront)} stopOpacity={getOpacity(regionValues.trunkFront) - 0.2} />
              </RadialGradient>
              <RadialGradient id="hipFat" cx="50%" cy="40%" r="70%">
                <Stop offset="0%" stopColor={getColorLight(regionValues.hipWaist)} stopOpacity={getOpacity(regionValues.hipWaist)} />
                <Stop offset="100%" stopColor={getColorDark(regionValues.hipWaist)} stopOpacity={getOpacity(regionValues.hipWaist) - 0.2} />
              </RadialGradient>
              <RadialGradient id="legsFat" cx="50%" cy="30%" r="70%">
                <Stop offset="0%" stopColor={getColorLight(regionValues.lowerBody)} stopOpacity={getOpacity(regionValues.lowerBody)} />
                <Stop offset="100%" stopColor={getColorDark(regionValues.lowerBody)} stopOpacity={getOpacity(regionValues.lowerBody) - 0.2} />
              </RadialGradient>
              
              {/* Highlight gradient for 3D effect */}
              <LinearGradient id="bodyHighlight" x1="30%" y1="0%" x2="70%" y2="100%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                <Stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
              </LinearGradient>
            </Defs>
            
            {/* Body outline/silhouette */}
            <G>
              {/* Head with 3D effect */}
              <Ellipse cx="100" cy="32" rx="24" ry="26" fill="url(#skinGradient)" />
              <Ellipse cx="100" cy="32" rx="24" ry="26" fill="url(#bodyHighlight)" />
              <Circle cx="93" cy="28" r="2" fill="#374151" opacity="0.5" />
              <Circle cx="107" cy="28" r="2" fill="#374151" opacity="0.5" />
              
              {/* Neck */}
              <Rect x="90" y="55" width="20" height="18" rx="4" fill="url(#skinGradient)" />
              
              {/* Shoulders and upper torso */}
              <Path
                d="M48 75 Q65 70 100 70 Q135 70 152 75 L160 95 Q145 100 100 100 Q55 100 40 95 Z"
                fill="url(#torsoFat)"
              />
              <Path
                d="M48 75 Q65 70 100 70 Q135 70 152 75 L160 95 Q145 100 100 100 Q55 100 40 95 Z"
                fill="url(#bodyHighlight)"
              />
              
              {/* Main torso */}
              <Path
                d="M40 95 L160 95 Q165 140 155 175 Q145 190 100 190 Q55 190 45 175 Q35 140 40 95 Z"
                fill="url(#torsoFat)"
              />
              <Path
                d="M40 95 L160 95 Q165 140 155 175 Q145 190 100 190 Q55 190 45 175 Q35 140 40 95 Z"
                fill="url(#bodyHighlight)"
              />
              
              {/* Left arm */}
              <Path
                d="M48 75 L28 80 Q15 95 12 130 Q10 155 15 160 L25 160 Q35 155 40 120 L40 95"
                fill="url(#armsFat)"
              />
              <Path
                d="M48 75 L28 80 Q15 95 12 130 Q10 155 15 160 L25 160 Q35 155 40 120 L40 95"
                fill="url(#bodyHighlight)"
              />
              
              {/* Right arm */}
              <Path
                d="M152 75 L172 80 Q185 95 188 130 Q190 155 185 160 L175 160 Q165 155 160 120 L160 95"
                fill="url(#armsFat)"
              />
              <Path
                d="M152 75 L172 80 Q185 95 188 130 Q190 155 185 160 L175 160 Q165 155 160 120 L160 95"
                fill="url(#bodyHighlight)"
              />
              
              {/* Hip/Waist area */}
              <Path
                d="M45 175 Q35 195 55 215 L85 215 L85 190 Q55 190 45 175"
                fill="url(#hipFat)"
              />
              <Path
                d="M155 175 Q165 195 145 215 L115 215 L115 190 Q145 190 155 175"
                fill="url(#hipFat)"
              />
              
              {/* Left thigh */}
              <Path
                d="M55 215 L85 215 L85 270 Q75 280 65 280 Q50 280 50 270 Q45 240 55 215"
                fill="url(#legsFat)"
              />
              <Path
                d="M55 215 L85 215 L85 270 Q75 280 65 280 Q50 280 50 270 Q45 240 55 215"
                fill="url(#bodyHighlight)"
              />
              
              {/* Right thigh */}
              <Path
                d="M145 215 L115 215 L115 270 Q125 280 135 280 Q150 280 150 270 Q155 240 145 215"
                fill="url(#legsFat)"
              />
              <Path
                d="M145 215 L115 215 L115 270 Q125 280 135 280 Q150 280 150 270 Q155 240 145 215"
                fill="url(#bodyHighlight)"
              />
              
              {/* Body outline for definition */}
              <Path
                d="M48 75 Q65 70 100 70 Q135 70 152 75 L172 80 Q185 95 188 130 Q190 155 185 160 L175 160 Q165 155 160 120 L160 95 Q165 140 155 175 Q165 195 145 215 L115 215 L115 270 Q125 280 135 280 Q150 280 150 270 L150 280 Q140 290 100 290 Q60 290 50 280 L50 270 Q50 280 65 280 Q75 280 85 270 L85 215 L55 215 Q35 195 45 175 Q35 140 40 95 L40 120 Q35 155 25 160 L15 160 Q10 155 12 130 Q15 95 28 80 L48 75 Z"
                fill="none"
                stroke={colors.accent.primary}
                strokeWidth="1.5"
                opacity="0.6"
              />
            </G>
            
            {/* Fat percentage labels */}
            <G>
              <SvgText x="15" y="140" fontSize="9" fill={getColor(regionValues.upperArm)} fontWeight="bold">
                {regionValues.upperArm.toFixed(0)}%
              </SvgText>
              <SvgText x="100" y="145" fontSize="10" fill={getColor(regionValues.trunkFront)} fontWeight="bold" textAnchor="middle">
                {regionValues.trunkFront.toFixed(0)}%
              </SvgText>
              <SvgText x="100" y="205" fontSize="9" fill={getColor(regionValues.hipWaist)} fontWeight="bold" textAnchor="middle">
                {regionValues.hipWaist.toFixed(0)}%
              </SvgText>
              <SvgText x="100" y="260" fontSize="9" fill={getColor(regionValues.lowerBody)} fontWeight="bold" textAnchor="middle">
                {regionValues.lowerBody.toFixed(0)}%
              </SvgText>
            </G>
          </Svg>
        ) : (
          /* Side View */
          <Svg width={200} height={300} viewBox="0 0 200 300">
            <Defs>
              <LinearGradient id="skinGradientSide" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#2d3748" stopOpacity="1" />
                <Stop offset="100%" stopColor="#1a202c" stopOpacity="1" />
              </LinearGradient>
              <RadialGradient id="backFat" cx="30%" cy="40%" r="70%">
                <Stop offset="0%" stopColor={getColorLight(regionValues.trunkFront)} stopOpacity={getOpacity(regionValues.trunkFront)} />
                <Stop offset="100%" stopColor={getColorDark(regionValues.trunkFront)} stopOpacity={getOpacity(regionValues.trunkFront) - 0.2} />
              </RadialGradient>
            </Defs>
            
            {/* Side view body */}
            <G>
              {/* Head */}
              <Ellipse cx="100" cy="32" rx="20" ry="26" fill="url(#skinGradientSide)" />
              
              {/* Neck */}
              <Rect x="92" y="55" width="16" height="18" rx="3" fill="url(#skinGradientSide)" />
              
              {/* Back profile with fat distribution visualization */}
              <Path
                d="M80 75 Q70 80 65 100 Q55 120 55 160 Q55 190 65 210 L65 270 Q65 280 75 285 L85 285 Q90 280 90 270 L90 210 Q100 190 100 160 Q100 120 95 100 Q92 80 80 75"
                fill="url(#backFat)"
              />
              
              {/* Front profile */}
              <Path
                d="M120 75 Q130 80 135 100 Q145 120 145 160 Q145 190 135 210 L135 270 Q135 280 125 285 L115 285 Q110 280 110 270 L110 210 Q100 190 100 160 Q100 120 105 100 Q108 80 120 75"
                fill="url(#backFat)"
              />
              
              {/* Arm (side view) */}
              <Path
                d="M130 80 Q145 85 150 110 Q155 145 150 160 L145 160 Q140 145 140 110 Q140 90 130 80"
                fill="url(#skinGradientSide)"
              />
              
              {/* Body outline */}
              <Path
                d="M80 75 Q70 80 65 100 Q55 120 55 160 Q55 190 65 210 L65 270 Q65 280 75 285 L125 285 Q135 280 135 270 L135 210 Q145 190 145 160 Q145 120 135 100 Q130 80 120 75"
                fill="none"
                stroke={colors.accent.primary}
                strokeWidth="1.5"
                opacity="0.6"
              />
              
              {/* Belly protrusion indicator based on fat % */}
              {regionValues.trunkFront > 15 && (
                <Path
                  d={`M135 130 Q${145 + regionValues.trunkFront * 0.5} 150 135 170`}
                  fill="none"
                  stroke={getColor(regionValues.trunkFront)}
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              )}
            </G>
            
            {/* Labels for side view */}
            <G>
              <SvgText x="100" y="145" fontSize="10" fill={getColor(regionValues.trunkFront)} fontWeight="bold" textAnchor="middle">
                {regionValues.trunkFront.toFixed(0)}%
              </SvgText>
              <SvgText x="75" y="250" fontSize="9" fill={getColor(regionValues.lowerBody)} fontWeight="bold" textAnchor="middle">
                {regionValues.lowerBody.toFixed(0)}%
              </SvgText>
            </G>
          </Svg>
        )}
        
        {/* Legend */}
        <View style={styles.bodyLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.legendText}>{t2.optimal} (&lt;12%)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={styles.legendText}>{t2.moderate} (12-20%)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.legendText}>{t2.high} (&gt;20%)</Text>
          </View>
        </View>
        
        {/* Region Details */}
        <View style={styles.regionDetails}>
          <View style={styles.regionRow}>
            <Text style={styles.regionLabel}>{t2.upperArm}</Text>
            <View style={[styles.regionBar, { backgroundColor: colors.dark.secondary }]}>
              <View style={[styles.regionBarFill, { width: `${Math.min(regionValues.upperArm * 2, 100)}%`, backgroundColor: getColor(regionValues.upperArm) }]} />
            </View>
            <Text style={[styles.regionValue, { color: getColor(regionValues.upperArm) }]}>{regionValues.upperArm.toFixed(1)}%</Text>
          </View>
          <View style={styles.regionRow}>
            <Text style={styles.regionLabel}>{t2.trunkFront}</Text>
            <View style={[styles.regionBar, { backgroundColor: colors.dark.secondary }]}>
              <View style={[styles.regionBarFill, { width: `${Math.min(regionValues.trunkFront * 2, 100)}%`, backgroundColor: getColor(regionValues.trunkFront) }]} />
            </View>
            <Text style={[styles.regionValue, { color: getColor(regionValues.trunkFront) }]}>{regionValues.trunkFront.toFixed(1)}%</Text>
          </View>
          <View style={styles.regionRow}>
            <Text style={styles.regionLabel}>{t2.hipWaist}</Text>
            <View style={[styles.regionBar, { backgroundColor: colors.dark.secondary }]}>
              <View style={[styles.regionBarFill, { width: `${Math.min(regionValues.hipWaist * 2, 100)}%`, backgroundColor: getColor(regionValues.hipWaist) }]} />
            </View>
            <Text style={[styles.regionValue, { color: getColor(regionValues.hipWaist) }]}>{regionValues.hipWaist.toFixed(1)}%</Text>
          </View>
          <View style={styles.regionRow}>
            <Text style={styles.regionLabel}>{t2.lowerBody}</Text>
            <View style={[styles.regionBar, { backgroundColor: colors.dark.secondary }]}>
              <View style={[styles.regionBarFill, { width: `${Math.min(regionValues.lowerBody * 2, 100)}%`, backgroundColor: getColor(regionValues.lowerBody) }]} />
            </View>
            <Text style={[styles.regionValue, { color: getColor(regionValues.lowerBody) }]}>{regionValues.lowerBody.toFixed(1)}%</Text>
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
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.dark.secondary,
    borderRadius: 8,
    padding: 2,
    marginBottom: 12,
  },
  viewButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  viewButtonActive: {
    backgroundColor: colors.accent.primary,
  },
  viewButtonText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  viewButtonTextActive: {
    color: '#ffffff',
  },
  regionDetails: {
    width: '100%',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  regionLabel: {
    width: 80,
    fontSize: 10,
    color: colors.text.secondary,
  },
  regionBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  regionBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  regionValue: {
    width: 40,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
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
