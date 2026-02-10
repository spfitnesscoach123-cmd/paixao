"""
Readiness Assessment
====================

Assesses training readiness based on jump performance.

Combines fatigue status, trends, and baselines into
an actionable readiness score and recommendations.

Readiness Levels:
- OPTIMAL: Peak performance state, ready for high intensity
- GOOD: Normal state, can train as planned
- MODERATE: Some fatigue, consider modifications
- LOW: Significant fatigue, reduce training load
- POOR: Rest required, avoid intense training
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass
from enum import Enum


class ReadinessLevel(str, Enum):
    """Training readiness level."""
    OPTIMAL = "optimal"         # 🟢 Green - Peak state
    GOOD = "good"               # 🟢 Green - Normal
    MODERATE = "moderate"       # 🟡 Yellow - Caution
    LOW = "low"                 # 🟠 Orange - Reduce load
    POOR = "poor"               # 🔴 Red - Rest needed
    UNKNOWN = "unknown"         # ⚪ Gray - Insufficient data


@dataclass
class ReadinessAssessment:
    """
    Training readiness assessment for an athlete.
    
    Combines multiple indicators into a single actionable output.
    """
    athlete_id: str
    
    # Overall readiness
    readiness_level: ReadinessLevel = ReadinessLevel.UNKNOWN
    readiness_score: int = 0                    # 0-100 scale
    
    # Component scores
    fatigue_score: int = 0                      # 0-100 (higher = less fatigue)
    trend_score: int = 0                        # 0-100 (higher = improving)
    consistency_score: int = 0                  # 0-100 (higher = more consistent)
    
    # Key metrics summary
    current_vs_best_pct: Optional[float] = None
    current_vs_baseline_pct: Optional[float] = None
    
    # Status indicators
    fatigue_detected: bool = False
    trend_declining: bool = False
    
    # Actionable output
    status_emoji: str = "⚪"
    status_message: str = ""
    recommendation: str = ""
    training_load_modifier: float = 1.0         # Suggested load multiplier
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'athlete_id': self.athlete_id,
            'readiness_level': self.readiness_level.value,
            'readiness_score': self.readiness_score,
            'fatigue_score': self.fatigue_score,
            'trend_score': self.trend_score,
            'consistency_score': self.consistency_score,
            'current_vs_best_pct': self.current_vs_best_pct,
            'current_vs_baseline_pct': self.current_vs_baseline_pct,
            'fatigue_detected': self.fatigue_detected,
            'trend_declining': self.trend_declining,
            'status_emoji': self.status_emoji,
            'status_message': self.status_message,
            'recommendation': self.recommendation,
            'training_load_modifier': self.training_load_modifier,
        }


class ReadinessCalculator:
    """
    Calculator for training readiness.
    
    Integrates fatigue, trends, and baselines into readiness assessment.
    """
    
    # Score weights
    FATIGUE_WEIGHT = 0.50        # Fatigue is primary indicator
    TREND_WEIGHT = 0.30          # Trends matter
    CONSISTENCY_WEIGHT = 0.20    # Consistency is stability
    
    # Level thresholds
    OPTIMAL_THRESHOLD = 85
    GOOD_THRESHOLD = 70
    MODERATE_THRESHOLD = 55
    LOW_THRESHOLD = 40
    
    def calculate(
        self,
        baseline: Dict[str, Any],
        trends: Dict[str, Any],
        fatigue: Dict[str, Any],
        athlete_id: str
    ) -> ReadinessAssessment:
        """
        Calculate readiness assessment.
        
        Args:
            baseline: Baseline metrics dict
            trends: Trend analysis dict
            fatigue: Fatigue status dict
            athlete_id: Athlete identifier
            
        Returns:
            ReadinessAssessment with calculated readiness
        """
        assessment = ReadinessAssessment(athlete_id=athlete_id)
        
        # Calculate component scores
        assessment.fatigue_score = self._calc_fatigue_score(fatigue)
        assessment.trend_score = self._calc_trend_score(trends)
        assessment.consistency_score = self._calc_consistency_score(baseline)
        
        # Calculate overall score
        assessment.readiness_score = int(
            assessment.fatigue_score * self.FATIGUE_WEIGHT +
            assessment.trend_score * self.TREND_WEIGHT +
            assessment.consistency_score * self.CONSISTENCY_WEIGHT
        )
        
        # Set key metrics
        assessment.current_vs_best_pct = trends.get('delta_height_vs_best_pct')
        assessment.current_vs_baseline_pct = trends.get('delta_height_vs_14d_pct')
        assessment.fatigue_detected = fatigue.get('fatigue_detected', False)
        assessment.trend_declining = trends.get('height_trend') == 'declining'
        
        # Classify level
        assessment = self._classify_readiness(assessment)
        
        return assessment
    
    def _calc_fatigue_score(self, fatigue: Dict[str, Any]) -> int:
        """
        Calculate fatigue component score.
        
        Higher score = less fatigue = better readiness.
        """
        fatigue_level = fatigue.get('fatigue_level', 'unknown')
        
        level_scores = {
            'none': 100,
            'low': 80,
            'moderate': 60,
            'high': 35,
            'critical': 10,
            'unknown': 50
        }
        
        base_score = level_scores.get(fatigue_level, 50)
        
        # Adjust based on drop percentages
        cmj_drop = fatigue.get('cmj_drop_pct') or 0
        rsi_drop = fatigue.get('rsi_drop_pct') or 0
        
        # Each 1% drop reduces score by ~2 points
        drop_penalty = min(30, (cmj_drop + rsi_drop * 0.5))
        
        return max(0, min(100, int(base_score - drop_penalty)))
    
    def _calc_trend_score(self, trends: Dict[str, Any]) -> int:
        """
        Calculate trend component score.
        
        Higher score = improving trend = better readiness.
        """
        trend_direction = trends.get('height_trend', 'insufficient_data')
        
        direction_scores = {
            'improving': 90,
            'stable': 70,
            'declining': 40,
            'insufficient_data': 50
        }
        
        base_score = direction_scores.get(trend_direction, 50)
        
        # Adjust based on delta vs career
        delta_career = trends.get('delta_height_vs_career_pct')
        if delta_career is not None:
            # Above career average = bonus, below = penalty
            delta_adjustment = min(15, max(-20, delta_career))
            base_score = base_score + delta_adjustment
        
        return max(0, min(100, int(base_score)))
    
    def _calc_consistency_score(self, baseline: Dict[str, Any]) -> int:
        """
        Calculate consistency component score.
        
        Lower CV% = more consistent = better readiness indicator.
        """
        cv_height = baseline.get('cv_height_percent')
        
        if cv_height is None:
            return 50  # Unknown
        
        # CV% < 5% = excellent consistency (score ~90)
        # CV% 5-10% = good consistency (score ~70)
        # CV% 10-15% = moderate (score ~50)
        # CV% > 15% = variable (score ~30)
        
        if cv_height < 5:
            return 90
        elif cv_height < 10:
            return 70
        elif cv_height < 15:
            return 50
        else:
            return 30
    
    def _classify_readiness(self, assessment: ReadinessAssessment) -> ReadinessAssessment:
        """
        Classify readiness level and generate recommendations.
        """
        score = assessment.readiness_score
        
        if score >= self.OPTIMAL_THRESHOLD:
            assessment.readiness_level = ReadinessLevel.OPTIMAL
            assessment.status_emoji = "🟢"
            assessment.status_message = "Estado ÓTIMO - Pico de prontidão"
            assessment.recommendation = (
                "Atleta em excelente estado neuromuscular. "
                "Apto para treino de alta intensidade ou competição."
            )
            assessment.training_load_modifier = 1.1  # Can push slightly
        
        elif score >= self.GOOD_THRESHOLD:
            assessment.readiness_level = ReadinessLevel.GOOD
            assessment.status_emoji = "🟢"
            assessment.status_message = "Estado BOM - Prontidão normal"
            assessment.recommendation = (
                "Atleta em bom estado. "
                "Pode seguir programação de treino conforme planejado."
            )
            assessment.training_load_modifier = 1.0
        
        elif score >= self.MODERATE_THRESHOLD:
            assessment.readiness_level = ReadinessLevel.MODERATE
            assessment.status_emoji = "🟡"
            assessment.status_message = "Estado MODERADO - Atenção"
            assessment.recommendation = (
                "Sinais de fadiga detectados. "
                "Considerar redução de 10-20% na carga pliométrica. "
                "Monitorar próximas sessões."
            )
            assessment.training_load_modifier = 0.85
        
        elif score >= self.LOW_THRESHOLD:
            assessment.readiness_level = ReadinessLevel.LOW
            assessment.status_emoji = "🟠"
            assessment.status_message = "Estado BAIXO - Fadiga significativa"
            assessment.recommendation = (
                "Fadiga neuromuscular significativa. "
                "Reduzir carga pliométrica em 40-50%. "
                "Priorizar recuperação nas próximas 24-48h."
            )
            assessment.training_load_modifier = 0.6
        
        else:
            assessment.readiness_level = ReadinessLevel.POOR
            assessment.status_emoji = "🔴"
            assessment.status_message = "Estado CRÍTICO - Repouso necessário"
            assessment.recommendation = (
                "Fadiga neuromuscular CRÍTICA. "
                "Evitar treino pliométrico intenso. "
                "Repouso recomendado por 48-72h antes de reavaliar."
            )
            assessment.training_load_modifier = 0.3
        
        return assessment


def assess_readiness(
    baseline: Dict[str, Any],
    trends: Dict[str, Any],
    fatigue: Dict[str, Any],
    athlete_id: str
) -> ReadinessAssessment:
    """
    Convenience function to assess readiness.
    
    Args:
        baseline: Baseline metrics dict
        trends: Trend analysis dict
        fatigue: Fatigue status dict
        athlete_id: Athlete identifier
        
    Returns:
        ReadinessAssessment with calculated readiness
    """
    calculator = ReadinessCalculator()
    return calculator.calculate(baseline, trends, fatigue, athlete_id)
