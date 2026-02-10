"""
Report Generator
================

Generates structured performance reports from analysis.

This is the output that feeds:
- WhatsApp/Telegram messages
- Email reports
- Dashboard widgets
- PDF exports

The report speaks the language of the coach.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum

from .baselines import BaselineCalculator, AthleteBaseline
from .trends import TrendCalculator, TrendAnalysis
from .fatigue import FatigueDetector, FatigueStatus
from .readiness import ReadinessCalculator, ReadinessAssessment, ReadinessLevel


class ReportStatus(str, Enum):
    """Overall report status."""
    OK = "ok"
    WARNING = "warning"
    ALERT = "alert"
    CRITICAL = "critical"


@dataclass
class JumpReport:
    """
    Complete performance report for an athlete.
    
    Contains all analysis results in a single structured output.
    """
    athlete_id: str
    athlete_name: Optional[str] = None
    generated_at: Optional[datetime] = None
    analysis_window_days: int = 14
    
    # Overall status
    status: ReportStatus = ReportStatus.OK
    
    # Readiness assessment (primary output)
    readiness: ReadinessLevel = ReadinessLevel.UNKNOWN
    readiness_score: int = 0
    
    # Key metrics (simplified)
    cmj_trend_pct: Optional[float] = None      # % change vs baseline
    rsi_trend_pct: Optional[float] = None
    fatigue_flag: bool = False
    
    # Detailed sections
    baseline_summary: Dict[str, Any] = field(default_factory=dict)
    trend_summary: Dict[str, Any] = field(default_factory=dict)
    fatigue_summary: Dict[str, Any] = field(default_factory=dict)
    readiness_summary: Dict[str, Any] = field(default_factory=dict)
    
    # Action-oriented outputs
    status_emoji: str = "⚪"
    headline: str = ""
    recommendation: str = ""
    training_load_modifier: float = 1.0
    
    # Data quality
    data_quality: str = "unknown"
    jumps_analyzed: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            'athlete_id': self.athlete_id,
            'athlete_name': self.athlete_name,
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
            'analysis_window_days': self.analysis_window_days,
            'status': self.status.value,
            'readiness': self.readiness.value,
            'readiness_score': self.readiness_score,
            'cmj_trend': self.cmj_trend_pct,
            'rsi_trend': self.rsi_trend_pct,
            'fatigue_flag': self.fatigue_flag,
            'status_emoji': self.status_emoji,
            'headline': self.headline,
            'recommendation': self.recommendation,
            'training_load_modifier': self.training_load_modifier,
            'data_quality': self.data_quality,
            'jumps_analyzed': self.jumps_analyzed,
            'baseline': self.baseline_summary,
            'trends': self.trend_summary,
            'fatigue': self.fatigue_summary,
            'readiness_detail': self.readiness_summary,
        }
    
    def to_simple_dict(self) -> Dict[str, Any]:
        """
        Return simplified dictionary for quick consumption.
        
        This is the format for WhatsApp, Telegram, etc.
        """
        return {
            'status': self.status.value,
            'readiness': self.readiness.value,
            'cmj_trend': self.cmj_trend_pct,
            'rsi_trend': self.rsi_trend_pct,
            'fatigue_flag': self.fatigue_flag,
            'recommendation': self.recommendation,
        }


class ReportGenerator:
    """
    Generator for structured performance reports.
    
    Orchestrates all analysis modules to produce a cohesive report.
    """
    
    def __init__(
        self,
        reference_date: datetime = None,
        window_days: int = 14
    ):
        """
        Initialize generator.
        
        Args:
            reference_date: Date to analyze from
            window_days: Analysis window in days
        """
        self.reference_date = reference_date or datetime.utcnow()
        self.window_days = window_days
    
    def generate(
        self,
        jumps: List[Dict[str, Any]],
        athlete_id: str,
        athlete_name: str = None,
        jump_type: str = "CMJ"
    ) -> JumpReport:
        """
        Generate a complete performance report.
        
        Args:
            jumps: List of all jump records for athlete
            athlete_id: Athlete identifier
            athlete_name: Athlete name (optional)
            jump_type: Type of jump to analyze
            
        Returns:
            JumpReport with all analysis results
        """
        report = JumpReport(
            athlete_id=athlete_id,
            athlete_name=athlete_name,
            generated_at=datetime.utcnow(),
            analysis_window_days=self.window_days
        )
        
        # Filter jumps by type
        typed_jumps = [
            j for j in jumps 
            if j.get('jump_type', '').upper() == jump_type.upper()
        ]
        
        report.jumps_analyzed = len(typed_jumps)
        
        # Check data quality
        if not typed_jumps:
            report.data_quality = "no_data"
            report.headline = "Sem dados de salto disponíveis"
            report.recommendation = "Registre sessões de salto para análise"
            return report
        
        elif report.jumps_analyzed < 3:
            report.data_quality = "insufficient"
            report.headline = "Dados insuficientes para análise completa"
            report.recommendation = "Mais 2-3 sessões de salto necessárias para análise confiável"
        
        elif report.jumps_analyzed < 10:
            report.data_quality = "limited"
        
        else:
            report.data_quality = "good"
        
        # Calculate baseline
        baseline_calc = BaselineCalculator(self.reference_date)
        baseline = baseline_calc.calculate(jumps, athlete_id, jump_type)
        report.baseline_summary = baseline.to_dict()
        
        # Calculate trends
        trend_calc = TrendCalculator(self.reference_date, self.window_days)
        trends = trend_calc.calculate(jumps, baseline.to_dict(), athlete_id, jump_type)
        report.trend_summary = trends.to_dict()
        report.cmj_trend_pct = trends.delta_height_vs_14d_pct
        report.rsi_trend_pct = trends.delta_rsi_vs_14d_pct
        
        # Detect fatigue
        fatigue_detector = FatigueDetector(self.reference_date)
        fatigue = fatigue_detector.detect(jumps, baseline.to_dict(), athlete_id, jump_type)
        report.fatigue_summary = fatigue.to_dict()
        report.fatigue_flag = fatigue.fatigue_detected
        
        # Assess readiness
        readiness_calc = ReadinessCalculator()
        readiness = readiness_calc.calculate(
            baseline.to_dict(),
            trends.to_dict(),
            fatigue.to_dict(),
            athlete_id
        )
        report.readiness_summary = readiness.to_dict()
        report.readiness = readiness.readiness_level
        report.readiness_score = readiness.readiness_score
        report.status_emoji = readiness.status_emoji
        report.recommendation = readiness.recommendation
        report.training_load_modifier = readiness.training_load_modifier
        
        # Set overall status
        report.status = self._determine_status(fatigue, readiness)
        
        # Generate headline
        report.headline = self._generate_headline(baseline, trends, fatigue, readiness)
        
        return report
    
    def _determine_status(
        self,
        fatigue: FatigueStatus,
        readiness: ReadinessAssessment
    ) -> ReportStatus:
        """Determine overall report status."""
        if readiness.readiness_level == ReadinessLevel.POOR:
            return ReportStatus.CRITICAL
        elif readiness.readiness_level == ReadinessLevel.LOW:
            return ReportStatus.ALERT
        elif fatigue.fatigue_detected or readiness.readiness_level == ReadinessLevel.MODERATE:
            return ReportStatus.WARNING
        else:
            return ReportStatus.OK
    
    def _generate_headline(
        self,
        baseline: AthleteBaseline,
        trends: TrendAnalysis,
        fatigue: FatigueStatus,
        readiness: ReadinessAssessment
    ) -> str:
        """Generate a coach-friendly headline."""
        if readiness.readiness_level == ReadinessLevel.OPTIMAL:
            return "Atleta em estado ótimo - pronto para alta intensidade"
        
        elif readiness.readiness_level == ReadinessLevel.GOOD:
            return "Prontidão normal - pode treinar conforme planejado"
        
        elif readiness.readiness_level == ReadinessLevel.MODERATE:
            if fatigue.fatigue_detected:
                return "Sinais de fadiga - considerar redução de carga"
            elif trends.height_trend.value == 'declining':
                return "Tendência de queda - monitorar próximas sessões"
            else:
                return "Prontidão moderada - atenção recomendada"
        
        elif readiness.readiness_level == ReadinessLevel.LOW:
            return "Fadiga significativa - reduzir carga de treino"
        
        elif readiness.readiness_level == ReadinessLevel.POOR:
            return "ALERTA: Fadiga crítica - repouso necessário"
        
        else:
            return "Avaliação pendente - mais dados necessários"


def generate_report(
    jumps: List[Dict[str, Any]],
    athlete_id: str,
    athlete_name: str = None,
    jump_type: str = "CMJ",
    window_days: int = 14
) -> Dict[str, Any]:
    """
    Convenience function to generate a complete report.
    
    Args:
        jumps: List of jump records
        athlete_id: Athlete identifier
        athlete_name: Athlete name
        jump_type: Type of jump to analyze
        window_days: Analysis window
        
    Returns:
        Report as dictionary
    """
    generator = ReportGenerator(window_days=window_days)
    report = generator.generate(jumps, athlete_id, athlete_name, jump_type)
    return report.to_dict()
