import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, G, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface QTRGaugeProps {
  score: number; // 0-100
  size?: number;
}

export const QTRGauge: React.FC<QTRGaugeProps> = ({ score, size = 200 }) => {
  const { t } = useLanguage();
  const { colors } = useTheme();
  
  // Clamp score between 0 and 100
  const clampedScore = Math.max(0, Math.min(100, score));
  
  // Get classification and color based on score
  const getClassification = () => {
    if (clampedScore <= 30) return { label: t('wellness.qtrBad') || 'Ruim', color: '#ef4444' };
    if (clampedScore <= 60) return { label: t('wellness.qtrRegular') || 'Regular', color: '#f59e0b' };
    if (clampedScore <= 85) return { label: t('wellness.qtrGood') || 'Bom', color: '#10b981' };
    return { label: t('wellness.qtrExcellent') || 'Excelente', color: '#22c55e' };
  };

  const classification = getClassification();
  
  // Gauge dimensions
  const strokeWidth = 15;
  const radius = (size - strokeWidth) / 2;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Arc calculations (180 degree arc - bottom half hidden)
  const startAngle = 135; // Start from bottom-left
  const endAngle = 405;   // End at bottom-right (270 degree sweep)
  const sweepAngle = 270;
  
  // Convert angle to radians
  const toRadians = (angle: number) => (angle - 90) * Math.PI / 180;
  
  // Calculate arc path
  const polarToCartesian = (angle: number) => {
    const rad = toRadians(angle);
    return {
      x: centerX + radius * Math.cos(rad),
      y: centerY + radius * Math.sin(rad),
    };
  };
  
  // Background arc path
  const bgStart = polarToCartesian(startAngle);
  const bgEnd = polarToCartesian(endAngle);
  
  // Progress arc path (based on score)
  const progressAngle = startAngle + (sweepAngle * clampedScore / 100);
  const progressEnd = polarToCartesian(progressAngle);
  
  // Create arc path
  const describeArc = (start: number, end: number) => {
    const startPoint = polarToCartesian(start);
    const endPoint = polarToCartesian(end);
    const largeArcFlag = (end - start) > 180 ? 1 : 0;
    
    return [
      'M', startPoint.x, startPoint.y,
      'A', radius, radius, 0, largeArcFlag, 1, endPoint.x, endPoint.y
    ].join(' ');
  };

  // Needle calculations
  const needleAngle = startAngle + (sweepAngle * clampedScore / 100);
  const needleLength = radius - 20;
  const needleEnd = {
    x: centerX + needleLength * Math.cos(toRadians(needleAngle)),
    y: centerY + needleLength * Math.sin(toRadians(needleAngle)),
  };

  // Color gradient stops based on zones
  const getGradientColor = () => {
    if (clampedScore <= 30) return '#ef4444';
    if (clampedScore <= 60) return '#f59e0b';
    if (clampedScore <= 85) return '#10b981';
    return '#22c55e';
  };

  return (
    <View style={[styles.container, { width: size, height: size * 0.7 }]}>
      <Svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
        <Defs>
          <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#ef4444" />
            <Stop offset="33%" stopColor="#f59e0b" />
            <Stop offset="66%" stopColor="#10b981" />
            <Stop offset="100%" stopColor="#22c55e" />
          </LinearGradient>
        </Defs>
        
        <G transform={`translate(0, -${size * 0.15})`}>
          {/* Background Arc */}
          <Path
            d={describeArc(startAngle, endAngle)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          
          {/* Zone indicators */}
          <Path
            d={describeArc(startAngle, startAngle + sweepAngle * 0.30)}
            fill="none"
            stroke="rgba(239, 68, 68, 0.3)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <Path
            d={describeArc(startAngle + sweepAngle * 0.30, startAngle + sweepAngle * 0.60)}
            fill="none"
            stroke="rgba(245, 158, 11, 0.3)"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
          <Path
            d={describeArc(startAngle + sweepAngle * 0.60, startAngle + sweepAngle * 0.85)}
            fill="none"
            stroke="rgba(16, 185, 129, 0.3)"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
          <Path
            d={describeArc(startAngle + sweepAngle * 0.85, endAngle)}
            fill="none"
            stroke="rgba(34, 197, 94, 0.3)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          
          {/* Progress Arc */}
          {clampedScore > 0 && (
            <Path
              d={describeArc(startAngle, progressAngle)}
              fill="none"
              stroke={getGradientColor()}
              strokeWidth={strokeWidth + 2}
              strokeLinecap="round"
            />
          )}
          
          {/* Needle */}
          <G>
            <Circle cx={centerX} cy={centerY} r={8} fill={classification.color} />
            <Path
              d={`M ${centerX} ${centerY} L ${needleEnd.x} ${needleEnd.y}`}
              stroke={classification.color}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <Circle cx={needleEnd.x} cy={needleEnd.y} r={4} fill={classification.color} />
          </G>
          
          {/* Zone Labels */}
          <SvgText
            x={size * 0.12}
            y={centerY + radius * 0.5}
            fill="#ef4444"
            fontSize="10"
            fontWeight="500"
            textAnchor="middle"
          >
            0
          </SvgText>
          <SvgText
            x={size * 0.88}
            y={centerY + radius * 0.5}
            fill="#22c55e"
            fontSize="10"
            fontWeight="500"
            textAnchor="middle"
          >
            100
          </SvgText>
        </G>
      </Svg>
      
      {/* Score Display */}
      <View style={styles.scoreContainer}>
        <Text style={[styles.scoreValue, { color: classification.color }]}>
          {Math.round(clampedScore)}
        </Text>
        <Text style={[styles.scoreLabel, { color: classification.color }]}>
          {classification.label}
        </Text>
      </View>
      
      {/* QTR Label */}
      <Text style={styles.qtrLabel}>QTR</Text>
      <Text style={styles.qtrSubLabel}>{t('wellness.qtrTitle') || 'Qualidade Total de Recuperação'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  scoreContainer: {
    position: 'absolute',
    bottom: 30,
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  qtrLabel: {
    position: 'absolute',
    top: 10,
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  qtrSubLabel: {
    position: 'absolute',
    bottom: 5,
    color: colors.text.tertiary,
    fontSize: 10,
    textAlign: 'center',
  },
});
