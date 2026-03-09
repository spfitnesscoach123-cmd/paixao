"""
ACWR Calculator

Calculates Acute:Chronic Workload Ratio using EWMA values.
"""

from typing import Optional, Tuple
from .load_metrics import (
    ACWRZone,
    SpikeStatus,
    classify_acwr,
    classify_spike,
    ACWR_UNDERLOAD_THRESHOLD,
    ACWR_OPTIMAL_MAX,
    ACWR_WARNING_MAX,
)


class ACWRCalculator:
    """
    Calculates ACWR (Acute:Chronic Workload Ratio) using EWMA values.
    
    ACWR = EWMA_acute / EWMA_chronic
    
    The EWMA-based ACWR is more responsive to changes and provides
    smoother transitions than traditional rolling average methods.
    """
    
    def __init__(
        self,
        underload_threshold: float = ACWR_UNDERLOAD_THRESHOLD,
        optimal_max: float = ACWR_OPTIMAL_MAX,
        warning_max: float = ACWR_WARNING_MAX
    ):
        """
        Initialize ACWR calculator with risk zone thresholds.
        
        Args:
            underload_threshold: Below this = undertraining (default 0.8)
            optimal_max: Up to this = optimal zone (default 1.3)
            warning_max: Up to this = warning zone (default 1.5)
        """
        self.underload_threshold = underload_threshold
        self.optimal_max = optimal_max
        self.warning_max = warning_max
    
    def calculate(
        self,
        ewma_acute: float,
        ewma_chronic: float,
        min_chronic: float = 0.0
    ) -> Optional[float]:
        """
        Calculate ACWR from EWMA values.
        
        Args:
            ewma_acute: Acute EWMA (7-day equivalent)
            ewma_chronic: Chronic EWMA (28-day equivalent)
            min_chronic: Minimum chronic value to avoid division issues
            
        Returns:
            ACWR value, or None if chronic is too low
        """
        if ewma_chronic <= min_chronic:
            return None
        
        return round(ewma_acute / ewma_chronic, 2)
    
    def calculate_with_zone(
        self,
        ewma_acute: float,
        ewma_chronic: float,
        min_chronic: float = 0.0
    ) -> Tuple[Optional[float], ACWRZone]:
        """
        Calculate ACWR and classify into risk zone.
        
        Args:
            ewma_acute: Acute EWMA value
            ewma_chronic: Chronic EWMA value
            min_chronic: Minimum chronic value
            
        Returns:
            Tuple of (ACWR value, ACWRZone)
        """
        acwr = self.calculate(ewma_acute, ewma_chronic, min_chronic)
        zone = self.classify(acwr)
        return acwr, zone
    
    def classify(self, acwr: Optional[float]) -> ACWRZone:
        """
        Classify ACWR value into risk zone.
        
        Zones:
        - UNDERLOAD: < 0.8 (undertrained, losing fitness)
        - OPTIMAL: 0.8 - 1.3 (sweet spot)
        - WARNING: 1.3 - 1.5 (elevated risk)
        - SPIKE: > 1.5 (high injury risk)
        
        Args:
            acwr: ACWR value to classify
            
        Returns:
            ACWRZone enum value
        """
        return classify_acwr(acwr)
    
    def detect_spike(self, acwr: Optional[float]) -> Tuple[bool, SpikeStatus]:
        """
        Detect if ACWR indicates a workload spike.
        
        Spike levels:
        - NONE: <= 1.3
        - MODERATE: 1.3 - 1.5
        - HIGH: 1.5 - 2.0
        - CRITICAL: > 2.0
        
        Args:
            acwr: ACWR value
            
        Returns:
            Tuple of (has_spike, spike_status)
        """
        status = classify_spike(acwr)
        has_spike = status in [SpikeStatus.MODERATE, SpikeStatus.HIGH, SpikeStatus.CRITICAL]
        return has_spike, status
    
    def get_zone_label(self, zone: ACWRZone, locale: str = "en") -> str:
        """
        Get human-readable label for ACWR zone.
        
        Args:
            zone: ACWRZone value
            locale: Language code ("en" or "pt")
            
        Returns:
            Human-readable zone label
        """
        labels = {
            "en": {
                ACWRZone.UNDERLOAD: "Underload",
                ACWRZone.OPTIMAL: "Optimal",
                ACWRZone.WARNING: "Warning",
                ACWRZone.SPIKE: "High Risk",
                ACWRZone.UNKNOWN: "Insufficient Data",
            },
            "pt": {
                ACWRZone.UNDERLOAD: "Subcarga",
                ACWRZone.OPTIMAL: "Ótimo",
                ACWRZone.WARNING: "Atenção",
                ACWRZone.SPIKE: "Alto Risco",
                ACWRZone.UNKNOWN: "Dados Insuficientes",
            }
        }
        return labels.get(locale, labels["en"]).get(zone, "Unknown")
    
    def get_zone_color(self, zone: ACWRZone) -> str:
        """
        Get color code for ACWR zone.
        
        Args:
            zone: ACWRZone value
            
        Returns:
            Hex color code
        """
        colors = {
            ACWRZone.UNDERLOAD: "#f59e0b",  # Amber
            ACWRZone.OPTIMAL: "#10b981",     # Green
            ACWRZone.WARNING: "#f59e0b",     # Amber
            ACWRZone.SPIKE: "#ef4444",       # Red
            ACWRZone.UNKNOWN: "#6b7280",     # Gray
        }
        return colors.get(zone, "#6b7280")
    
    def get_recommendation(self, zone: ACWRZone, locale: str = "en") -> str:
        """
        Get training recommendation based on ACWR zone.
        
        Args:
            zone: ACWRZone value
            locale: Language code
            
        Returns:
            Recommendation text
        """
        recommendations = {
            "en": {
                ACWRZone.UNDERLOAD: "Training load below optimal. Consider gradually increasing intensity to maintain fitness.",
                ACWRZone.OPTIMAL: "Training load is in the sweet spot! Continue maintaining this balance.",
                ACWRZone.WARNING: "Training load elevated. Monitor fatigue and consider reducing volume.",
                ACWRZone.SPIKE: "⚠️ HIGH RISK: Training load spike detected! Immediate reduction recommended.",
                ACWRZone.UNKNOWN: "Insufficient training data. Continue logging sessions for accurate analysis.",
            },
            "pt": {
                ACWRZone.UNDERLOAD: "Carga de treino abaixo do ideal. Considere aumentar gradualmente a intensidade.",
                ACWRZone.OPTIMAL: "Carga de treino no ponto ideal! Continue mantendo este equilíbrio.",
                ACWRZone.WARNING: "Carga de treino elevada. Monitore a fadiga e considere reduzir o volume.",
                ACWRZone.SPIKE: "⚠️ ALTO RISCO: Pico de carga detectado! Redução imediata recomendada.",
                ACWRZone.UNKNOWN: "Dados de treino insuficientes. Continue registrando sessões para análise precisa.",
            }
        }
        return recommendations.get(locale, recommendations["en"]).get(zone, "")


# Singleton instance
acwr_calculator = ACWRCalculator()


def calculate_acwr(acute: float, chronic: float) -> Optional[float]:
    """Convenience function for ACWR calculation."""
    return acwr_calculator.calculate(acute, chronic)


def classify_acwr_zone(acwr: Optional[float]) -> ACWRZone:
    """Convenience function for ACWR classification."""
    return acwr_calculator.classify(acwr)
