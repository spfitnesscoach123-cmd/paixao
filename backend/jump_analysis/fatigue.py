"""
Fatigue Detection
=================

Detects neuromuscular fatigue from jump performance data.

Fatigue Detection Rules (Evidence-Based):
- CMJ height drop ≥ 5-7% from baseline
- RSI drop ≥ 10% from baseline  
- Sustained over ≥ 2 consecutive sessions

This module implements heuristics based on sports science literature
for identifying when an athlete needs recovery intervention.

References:
- Claudino et al. (2017) - CMJ monitoring in team sports
- Gathercole et al. (2015) - Neuromuscular fatigue markers
- Taylor et al. (2012) - Jump testing for monitoring fatigue
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum


class FatigueLevel(str, Enum):
    """Fatigue severity level."""
    NONE = "none"               # No fatigue detected
    LOW = "low"                 # Minor fatigue indicators
    MODERATE = "moderate"       # Clear fatigue signals
    HIGH = "high"               # Significant fatigue, intervention needed
    CRITICAL = "critical"       # Severe fatigue, rest required


@dataclass
class FatigueStatus:
    """
    Fatigue detection results for an athlete.
    
    Contains fatigue flags and supporting evidence.
    """
    athlete_id: str
    
    # Overall status
    fatigue_detected: bool = False
    fatigue_level: FatigueLevel = FatigueLevel.NONE
    
    # Primary indicators
    cmj_drop_pct: Optional[float] = None           # % drop from baseline
    rsi_drop_pct: Optional[float] = None           # % drop from baseline
    consecutive_sessions: int = 0                   # Sessions with fatigue signals
    
    # Threshold breaches
    cmj_threshold_breached: bool = False           # ≥5% drop
    rsi_threshold_breached: bool = False           # ≥10% drop
    
    # Context
    baseline_height_cm: Optional[float] = None
    current_height_cm: Optional[float] = None
    baseline_rsi: Optional[float] = None
    current_rsi: Optional[float] = None
    
    # Session history (for consecutive check)
    session_flags: List[Dict[str, Any]] = field(default_factory=list)
    
    # Recommendations
    recommendation: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'athlete_id': self.athlete_id,
            'fatigue_detected': self.fatigue_detected,
            'fatigue_level': self.fatigue_level.value,
            'cmj_drop_pct': self.cmj_drop_pct,
            'rsi_drop_pct': self.rsi_drop_pct,
            'consecutive_sessions': self.consecutive_sessions,
            'cmj_threshold_breached': self.cmj_threshold_breached,
            'rsi_threshold_breached': self.rsi_threshold_breached,
            'baseline_height_cm': self.baseline_height_cm,
            'current_height_cm': self.current_height_cm,
            'baseline_rsi': self.baseline_rsi,
            'current_rsi': self.current_rsi,
            'session_flags': self.session_flags,
            'recommendation': self.recommendation,
        }


class FatigueDetector:
    """
    Detector for neuromuscular fatigue.
    
    Uses evidence-based thresholds to identify fatigue states.
    """
    
    # Fatigue thresholds (based on literature)
    CMJ_DROP_THRESHOLD_PCT = 5.0      # 5-7% drop is significant
    CMJ_DROP_HIGH_PCT = 10.0          # 10%+ is high fatigue
    RSI_DROP_THRESHOLD_PCT = 10.0     # RSI is more sensitive
    RSI_DROP_HIGH_PCT = 15.0          # 15%+ RSI drop is critical
    
    # Consecutive sessions required
    MIN_CONSECUTIVE_SESSIONS = 2       # Need sustained drop, not one-off
    
    # Lookback window for session analysis
    SESSION_WINDOW_DAYS = 7
    
    def __init__(self, reference_date: datetime = None):
        """
        Initialize detector.
        
        Args:
            reference_date: Date to analyze from
        """
        self.reference_date = reference_date or datetime.utcnow()
    
    def detect(
        self,
        jumps: List[Dict[str, Any]],
        baseline: Dict[str, Any],
        athlete_id: str,
        jump_type: str = "CMJ"
    ) -> FatigueStatus:
        """
        Detect fatigue state for an athlete.
        
        Args:
            jumps: List of jump records
            baseline: Baseline metrics dict
            athlete_id: Athlete identifier
            jump_type: Type of jump to analyze
            
        Returns:
            FatigueStatus with detection results
        """
        status = FatigueStatus(athlete_id=athlete_id)
        
        # Get baseline values
        if jump_type.upper() in ['CMJ', 'SJ']:
            baseline_height = baseline.get('avg_14d_height_cm') or baseline.get('career_avg_height_cm')
        else:
            baseline_height = baseline.get('avg_14d_height_cm') or baseline.get('career_avg_height_cm')
        
        baseline_rsi = baseline.get('avg_14d_rsi') or baseline.get('career_avg_rsi')
        
        status.baseline_height_cm = baseline_height
        status.baseline_rsi = baseline_rsi
        
        if not baseline_height:
            status.recommendation = "Dados insuficientes para análise de fadiga"
            return status
        
        # Filter recent jumps by type
        cutoff = self.reference_date - timedelta(days=self.SESSION_WINDOW_DAYS)
        
        recent_jumps = []
        for jump in jumps:
            if jump.get('jump_type', '').upper() != jump_type.upper():
                continue
            
            jump_date = self._parse_date(jump.get('jump_date'))
            if jump_date and jump_date >= cutoff:
                recent_jumps.append({
                    'height': jump.get('jump_height_cm'),
                    'rsi': jump.get('reactive_strength_index'),
                    'date': jump_date
                })
        
        if not recent_jumps:
            status.recommendation = "Sem dados recentes para análise de fadiga"
            return status
        
        # Sort by date
        recent_jumps.sort(key=lambda x: x['date'])
        
        # Get current (most recent) values
        latest = recent_jumps[-1]
        status.current_height_cm = latest['height']
        status.current_rsi = latest['rsi']
        
        # Calculate drops from baseline
        if status.current_height_cm and baseline_height:
            status.cmj_drop_pct = round(
                ((baseline_height - status.current_height_cm) / baseline_height) * 100, 2
            )
            status.cmj_threshold_breached = status.cmj_drop_pct >= self.CMJ_DROP_THRESHOLD_PCT
        
        if status.current_rsi and baseline_rsi:
            status.rsi_drop_pct = round(
                ((baseline_rsi - status.current_rsi) / baseline_rsi) * 100, 2
            )
            status.rsi_threshold_breached = status.rsi_drop_pct >= self.RSI_DROP_THRESHOLD_PCT
        
        # Analyze consecutive sessions
        status.session_flags = self._analyze_sessions(recent_jumps, baseline_height, baseline_rsi)
        
        # Count consecutive sessions with fatigue flags
        consecutive = 0
        for session in reversed(status.session_flags):
            if session.get('fatigue_flag'):
                consecutive += 1
            else:
                break
        
        status.consecutive_sessions = consecutive
        
        # Determine fatigue level
        status = self._classify_fatigue(status)
        
        return status
    
    def _analyze_sessions(
        self,
        jumps: List[Dict],
        baseline_height: float,
        baseline_rsi: Optional[float]
    ) -> List[Dict[str, Any]]:
        """
        Analyze each session for fatigue flags.
        
        Groups jumps by date and checks each session.
        """
        # Group by date
        sessions = {}
        for jump in jumps:
            date_key = jump['date'].strftime('%Y-%m-%d')
            if date_key not in sessions:
                sessions[date_key] = []
            sessions[date_key].append(jump)
        
        # Analyze each session
        session_flags = []
        for date_key in sorted(sessions.keys()):
            session_jumps = sessions[date_key]
            
            # Get session averages
            heights = [j['height'] for j in session_jumps if j['height']]
            rsis = [j['rsi'] for j in session_jumps if j['rsi']]
            
            session_avg_height = sum(heights) / len(heights) if heights else None
            session_avg_rsi = sum(rsis) / len(rsis) if rsis else None
            
            # Check thresholds
            height_drop = None
            rsi_drop = None
            fatigue_flag = False
            
            if session_avg_height and baseline_height:
                height_drop = ((baseline_height - session_avg_height) / baseline_height) * 100
                if height_drop >= self.CMJ_DROP_THRESHOLD_PCT:
                    fatigue_flag = True
            
            if session_avg_rsi and baseline_rsi:
                rsi_drop = ((baseline_rsi - session_avg_rsi) / baseline_rsi) * 100
                if rsi_drop >= self.RSI_DROP_THRESHOLD_PCT:
                    fatigue_flag = True
            
            session_flags.append({
                'date': date_key,
                'avg_height_cm': round(session_avg_height, 2) if session_avg_height else None,
                'avg_rsi': round(session_avg_rsi, 2) if session_avg_rsi else None,
                'height_drop_pct': round(height_drop, 2) if height_drop else None,
                'rsi_drop_pct': round(rsi_drop, 2) if rsi_drop else None,
                'fatigue_flag': fatigue_flag,
                'jump_count': len(session_jumps)
            })
        
        return session_flags
    
    def _classify_fatigue(self, status: FatigueStatus) -> FatigueStatus:
        """
        Classify fatigue level and generate recommendations.
        
        Rules:
        - Need threshold breach AND consecutive sessions for detection
        - Level based on magnitude of drop and consistency
        """
        has_threshold_breach = status.cmj_threshold_breached or status.rsi_threshold_breached
        sustained = status.consecutive_sessions >= self.MIN_CONSECUTIVE_SESSIONS
        
        # Calculate severity scores
        cmj_severity = 0
        if status.cmj_drop_pct:
            if status.cmj_drop_pct >= self.CMJ_DROP_HIGH_PCT:
                cmj_severity = 3
            elif status.cmj_drop_pct >= self.CMJ_DROP_THRESHOLD_PCT:
                cmj_severity = 2
            elif status.cmj_drop_pct >= self.CMJ_DROP_THRESHOLD_PCT * 0.7:
                cmj_severity = 1
        
        rsi_severity = 0
        if status.rsi_drop_pct:
            if status.rsi_drop_pct >= self.RSI_DROP_HIGH_PCT:
                rsi_severity = 3
            elif status.rsi_drop_pct >= self.RSI_DROP_THRESHOLD_PCT:
                rsi_severity = 2
            elif status.rsi_drop_pct >= self.RSI_DROP_THRESHOLD_PCT * 0.7:
                rsi_severity = 1
        
        max_severity = max(cmj_severity, rsi_severity)
        
        # Classify
        if max_severity >= 3 and sustained:
            status.fatigue_detected = True
            status.fatigue_level = FatigueLevel.CRITICAL
            status.recommendation = (
                "Fadiga neuromuscular CRÍTICA detectada. "
                "Recomenda-se repouso completo de 48-72h e reavaliação antes de retomar treino intenso."
            )
        
        elif max_severity >= 2 and sustained:
            status.fatigue_detected = True
            status.fatigue_level = FatigueLevel.HIGH
            status.recommendation = (
                "Fadiga neuromuscular ALTA detectada. "
                "Reduzir volume de treino pliométrico em 50% nas próximas 24-48h."
            )
        
        elif max_severity >= 2 or (max_severity >= 1 and sustained):
            status.fatigue_detected = True
            status.fatigue_level = FatigueLevel.MODERATE
            status.recommendation = (
                "Fadiga neuromuscular MODERADA detectada. "
                "Monitorar próximas sessões. Considerar redução de carga se persistir."
            )
        
        elif max_severity >= 1:
            status.fatigue_detected = False
            status.fatigue_level = FatigueLevel.LOW
            status.recommendation = (
                "Sinais iniciais de fadiga detectados. "
                "Continuar monitoramento. Nenhuma intervenção necessária no momento."
            )
        
        else:
            status.fatigue_detected = False
            status.fatigue_level = FatigueLevel.NONE
            status.recommendation = (
                "Sem sinais de fadiga neuromuscular. "
                "Atleta apto para treino normal."
            )
        
        return status
    
    def _parse_date(self, date_value: Any) -> Optional[datetime]:
        """Parse date from various formats."""
        if date_value is None:
            return None
        
        if isinstance(date_value, datetime):
            return date_value
        
        if isinstance(date_value, str):
            try:
                if 'T' in date_value:
                    return datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                return datetime.strptime(date_value[:10], '%Y-%m-%d')
            except ValueError:
                return None
        
        return None


def detect_fatigue(
    jumps: List[Dict[str, Any]],
    baseline: Dict[str, Any],
    athlete_id: str,
    jump_type: str = "CMJ"
) -> FatigueStatus:
    """
    Convenience function to detect fatigue.
    
    Args:
        jumps: List of jump records
        baseline: Baseline metrics dict
        athlete_id: Athlete identifier
        jump_type: Type of jump to analyze
        
    Returns:
        FatigueStatus with detection results
    """
    detector = FatigueDetector()
    return detector.detect(jumps, baseline, athlete_id, jump_type)
