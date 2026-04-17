from pydantic import BaseModel, Field, EmailStr
from enum import Enum
from fastapi import APIRouter, HTTPException, Depends, status, File, UploadFile, Form, Header, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import HTMLResponse, JSONResponse
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
import os
import logging
import statistics
import math
import uuid
import asyncio
import json
import csv
import bcrypt
import jwt
import httpx

from config import (
    db, load_engine, client,
    SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES,
    ACWR_METRIC_TO_ENGINE_FIELD, ANALYSIS_METRIC_TO_ENGINE,
    EMERGENT_AVAILABLE, logger, MAX_DEVICES_PER_USER,
    REVENUECAT_WEBHOOK_SECRET, REVENUECAT_SECRET_KEY
)
from dependencies import get_current_user, security, hash_password, verify_password, create_access_token, PyObjectId
from models.shared import *
from utils.load_calculations import classify_acwr_risk
from models.analysis_translations import get_analysis_text, ANALYSIS_TRANSLATIONS

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None


router = APIRouter(tags=["Load Analysis"])

# ============= AI ANALYSIS ROUTES =============

# Try to import emergentintegrations, fallback if not available (Railway deploy)
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    EMERGENT_AVAILABLE = True
except ImportError:
    EMERGENT_AVAILABLE = False
    LlmChat = None
    UserMessage = None

import statistics

class ACWRAnalysis(BaseModel):
    acute_load: float
    chronic_load: float
    acwr_ratio: float
    risk_level: str  # "low", "optimal", "moderate", "high"
    recommendation: str

class FatigueAnalysis(BaseModel):
    fatigue_level: str  # "low", "moderate", "high", "critical"
    fatigue_score: float
    contributing_factors: List[str]
    recommendation: str

class AIInsights(BaseModel):
    summary: str
    strengths: List[str]
    concerns: List[str]
    recommendations: List[str]
    training_zones: Dict[str, Any]

class ComprehensiveAnalysis(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    acwr: Optional[ACWRAnalysis] = None
    fatigue: Optional[FatigueAnalysis] = None
    ai_insights: Optional[AIInsights] = None

def calculate_training_load(gps_data: GPSData) -> float:
    """Calculate training load from GPS data using a weighted formula"""
    # Weighted formula considering multiple factors
    load = (
        gps_data.total_distance * 0.001 +  # Distance component
        gps_data.high_intensity_distance * 0.003 +  # High intensity weight
        gps_data.sprint_distance * 0.005 +  # Sprint weight
        gps_data.number_of_sprints * 2 +  # Sprint count
        gps_data.number_of_accelerations * 1 +  # Accelerations
        gps_data.number_of_decelerations * 1  # Decelerations
    )
    return round(load, 2)

# ============= ANALYSIS TRANSLATIONS - EARLY DEFINITION =============
# This section defines translations used by analysis functions

ANALYSIS_TRANSLATIONS = {
    "en": {
        "acwr_low": "Training load below optimal. Consider gradually increasing intensity to maintain fitness.",
        "acwr_optimal": "Optimal training load! Continue maintaining this balance between training and recovery.",
        "acwr_moderate": "Moderately high training load. Monitor fatigue signs and consider reducing volume in coming days.",
        "acwr_high": "⚠️ ATTENTION: Training load very high! High injury risk. Immediate load reduction recommended.",
        "acwr_detail_high": "⚠️ ATTENTION: One or more parameters are in high risk zone. Immediate training load reduction recommended.",
        "acwr_detail_moderate": "Some parameters are elevated. Monitor fatigue and consider adjusting training volume.",
        "acwr_detail_optimal": "Balanced training load! Continue maintaining this pattern.",
        "acwr_detail_low": "Low training load. Consider progressively increasing intensity.",
        "fatigue_low": "Low fatigue level. Athlete is well recovered and ready for intense training.",
        "fatigue_moderate": "Moderate fatigue. Athlete can train normally, but monitor for overload signs.",
        "fatigue_high": "High fatigue detected. Reduce volume/intensity and prioritize active recovery.",
        "fatigue_critical": "⚠️ CRITICAL FATIGUE! Complete rest or light regenerative training recommended. Overtraining risk.",
        "poor_sleep": "Poor sleep quality affecting recovery",
        "insufficient_sleep": "Insufficient sleep hours",
        "high_muscle_soreness": "Elevated muscle soreness",
        "high_fatigue_perception": "High fatigue perception",
        "elevated_stress": "Elevated stress level",
        "low_mood": "Low mood",
        "compromised_readiness": "Compromised readiness",
        "sleep_hours_tip": "Try to sleep at least 7-8 hours per night",
        "sleep_quality_tip": "Consider improving your sleep hygiene",
        "fatigue_tip": "High fatigue level - consider extra rest",
        "muscle_soreness_tip": "High muscle soreness - consider active recovery",
        "stress_tip": "High stress level - practice relaxation techniques",
        "all_good": "Great! You are in good condition!",
        "ai_default_rec": "Maintain current monitoring routine",
        "ai_no_data": "Insufficient data for analysis",
        "metric_total_distance": "Total Distance",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acc/Dec",
    },
    "pt": {
        "acwr_low": "Carga de treino abaixo do ideal. Considere aumentar gradualmente a intensidade.",
        "acwr_optimal": "Carga de treino ótima! Continue mantendo este equilíbrio entre treino e recuperação.",
        "acwr_moderate": "Carga de treino moderadamente elevada. Monitore sinais de fadiga e considere reduzir volume.",
        "acwr_high": "⚠️ ATENÇÃO: Carga de treino muito elevada! Alto risco de lesão. Recomenda-se redução imediata.",
        "acwr_detail_high": "⚠️ ATENÇÃO: Um ou mais parâmetros estão em zona de alto risco. Recomenda-se redução imediata.",
        "acwr_detail_moderate": "Alguns parâmetros estão elevados. Monitore a fadiga e considere ajustar o volume.",
        "acwr_detail_optimal": "Carga de treino equilibrada! Continue mantendo este padrão.",
        "acwr_detail_low": "Carga de treino baixa. Considere aumentar progressivamente a intensidade.",
        "fatigue_low": "Baixo nível de fadiga. Atleta está bem recuperado e pronto para treinos intensos.",
        "fatigue_moderate": "Fadiga moderada. Atleta pode treinar normalmente, mas monitore sinais de sobrecarga.",
        "fatigue_high": "Alta fadiga detectada. Reduza volume/intensidade e priorize recuperação ativa.",
        "fatigue_critical": "⚠️ FADIGA CRÍTICA! Recomenda-se descanso completo ou treino regenerativo leve. Risco de overtraining.",
        "poor_sleep": "Qualidade do sono ruim afetando recuperação",
        "insufficient_sleep": "Horas de sono insuficientes",
        "high_muscle_soreness": "Dor muscular elevada",
        "high_fatigue_perception": "Alta percepção de fadiga",
        "elevated_stress": "Nível de estresse elevado",
        "low_mood": "Humor baixo",
        "compromised_readiness": "Prontidão comprometida",
        "sleep_hours_tip": "Tente dormir pelo menos 7-8 horas por noite",
        "sleep_quality_tip": "Considere melhorar sua higiene do sono",
        "fatigue_tip": "Nível de fadiga elevado - considere descanso extra",
        "muscle_soreness_tip": "Dor muscular alta - considere recuperação ativa",
        "stress_tip": "Nível de estresse alto - pratique técnicas de relaxamento",
        "all_good": "Ótimo! Você está em boas condições!",
        "ai_default_rec": "Manter rotina atual de monitoramento",
        "ai_no_data": "Dados insuficientes para análise",
        "metric_total_distance": "Distância Total",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acel/Desac",
    },
    "es": {
        "acwr_low": "Carga de entrenamiento por debajo del óptimo. Considere aumentar gradualmente la intensidad.",
        "acwr_optimal": "¡Carga de entrenamiento óptima! Continúe manteniendo este equilibrio.",
        "acwr_moderate": "Carga de entrenamiento moderadamente alta. Monitoree signos de fatiga.",
        "acwr_high": "⚠️ ATENCIÓN: ¡Carga muy alta! Alto riesgo de lesión. Se recomienda reducción inmediata.",
        "acwr_detail_high": "⚠️ ATENCIÓN: Uno o más parámetros en zona de alto riesgo.",
        "acwr_detail_moderate": "Algunos parámetros elevados. Monitoree la fatiga.",
        "acwr_detail_optimal": "¡Carga equilibrada! Continúe así.",
        "acwr_detail_low": "Carga baja. Considere aumentar progresivamente.",
        "fatigue_low": "Bajo nivel de fatiga. Atleta bien recuperado.",
        "fatigue_moderate": "Fatiga moderada. Puede entrenar normalmente.",
        "fatigue_high": "Alta fatiga. Reduzca volumen y priorice recuperación.",
        "fatigue_critical": "⚠️ ¡FATIGA CRÍTICA! Se recomienda descanso completo.",
        "poor_sleep": "Calidad de sueño deficiente",
        "insufficient_sleep": "Horas de sueño insuficientes",
        "high_muscle_soreness": "Dolor muscular elevado",
        "high_fatigue_perception": "Alta percepción de fatiga",
        "elevated_stress": "Nivel de estrés elevado",
        "low_mood": "Estado de ánimo bajo",
        "compromised_readiness": "Preparación comprometida",
        "sleep_hours_tip": "Intente dormir al menos 7-8 horas",
        "sleep_quality_tip": "Mejore su higiene del sueño",
        "fatigue_tip": "Fatiga alta - considere descanso extra",
        "muscle_soreness_tip": "Dolor muscular alto - recuperación activa",
        "stress_tip": "Estrés alto - practique relajación",
        "all_good": "¡Excelente! Está en buenas condiciones.",
        "ai_default_rec": "Mantener rutina actual de monitoreo",
        "ai_no_data": "Datos insuficientes para análisis",
        "metric_total_distance": "Distancia Total",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acel/Desac",
    },
    "fr": {
        "acwr_low": "Charge d'entraînement en dessous de l'optimal. Augmentez progressivement l'intensité.",
        "acwr_optimal": "Charge d'entraînement optimale ! Continuez à maintenir cet équilibre.",
        "acwr_moderate": "Charge modérément élevée. Surveillez les signes de fatigue.",
        "acwr_high": "⚠️ ATTENTION: Charge très élevée ! Risque de blessure. Réduction immédiate recommandée.",
        "acwr_detail_high": "⚠️ ATTENTION: Un ou plusieurs paramètres en zone à haut risque.",
        "acwr_detail_moderate": "Certains paramètres sont élevés. Surveillez la fatigue.",
        "acwr_detail_optimal": "Charge équilibrée ! Continuez ainsi.",
        "acwr_detail_low": "Charge faible. Augmentez progressivement.",
        "fatigue_low": "Faible niveau de fatigue. Athlète bien récupéré.",
        "fatigue_moderate": "Fatigue modérée. Peut s'entraîner normalement.",
        "fatigue_high": "Fatigue élevée. Réduisez le volume.",
        "fatigue_critical": "⚠️ FATIGUE CRITIQUE ! Repos complet recommandé.",
        "poor_sleep": "Mauvaise qualité de sommeil",
        "insufficient_sleep": "Heures de sommeil insuffisantes",
        "high_muscle_soreness": "Douleur musculaire élevée",
        "high_fatigue_perception": "Perception élevée de fatigue",
        "elevated_stress": "Niveau de stress élevé",
        "low_mood": "Humeur basse",
        "compromised_readiness": "Préparation compromise",
        "sleep_hours_tip": "Dormez au moins 7-8 heures",
        "sleep_quality_tip": "Améliorez votre hygiène de sommeil",
        "fatigue_tip": "Fatigue élevée - repos supplémentaire",
        "muscle_soreness_tip": "Douleur musculaire - récupération active",
        "stress_tip": "Stress élevé - relaxation",
        "all_good": "Excellent ! Vous êtes en bonne condition.",
        "ai_default_rec": "Maintenir la routine de surveillance",
        "ai_no_data": "Données insuffisantes pour l'analyse",
        "metric_total_distance": "Distance Totale",
        "metric_hsr": "HSR (20-25 km/h)",
        "metric_hid": "HID (15-20 km/h)",
        "metric_sprint": "Sprint (+25 km/h)",
        "metric_acc_dec": "Acc/Déc",
    },
}

def get_analysis_text(lang: str, key: str) -> str:
    """Get translated analysis text"""
    translations = ANALYSIS_TRANSLATIONS.get(lang, ANALYSIS_TRANSLATIONS["en"])
    return translations.get(key, ANALYSIS_TRANSLATIONS["en"].get(key, key))

@router.get("/analysis/acwr/{athlete_id}")
async def get_acwr_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    # ACWR STANDARDIZATION: ACWR MUST always come from load_engine (EWMA)
    t = lambda key: get_analysis_text(lang, key)
    
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Read latest metrics from load_engine
    latest = await db.athlete_load_metrics.find_one(
        {"athlete_id": athlete_id},
        sort=[("date", -1)],
        projection={"_id": 0}
    )
    
    if not latest or not latest.get("distance"):
        raise HTTPException(status_code=400, detail=t("ai_no_data"))
    
    dist = latest["distance"]
    acwr_ratio = round(dist.get("acwr") or 0, 2)
    acute_load = round(dist.get("ewma_acute") or 0, 2)
    chronic_load = round(dist.get("ewma_chronic") or 0, 2)
    risk_level = classify_acwr_risk(acwr_ratio)
    
    rec_map = {"low": "acwr_low", "optimal": "acwr_optimal", "moderate": "acwr_moderate", "high": "acwr_high"}
    recommendation = t(rec_map.get(risk_level, "acwr_optimal"))
    
    return ACWRAnalysis(
        acute_load=acute_load,
        chronic_load=chronic_load,
        acwr_ratio=acwr_ratio,
        risk_level=risk_level,
        recommendation=recommendation
    )

# ============= ACWR DETAILED ANALYSIS =============

class ACWRDetailedMetric(BaseModel):
    name: str
    acute_load: float
    chronic_load: float
    acwr_ratio: float
    risk_level: str
    unit: str

class ACWRDetailedAnalysis(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    metrics: List[ACWRDetailedMetric]
    overall_risk: str
    recommendation: str

def calculate_metric_acwr(acute_values: List[float], chronic_values: List[float]) -> tuple:
    """Calculate ACWR for a specific metric"""
    if not acute_values or not chronic_values:
        return 0, 0, 0, "unknown"
    
    acute_load = sum(acute_values)
    chronic_load = sum(chronic_values) / 4 if chronic_values else 0
    
    if chronic_load > 0:
        acwr_ratio = round(acute_load / chronic_load, 2)
    else:
        acwr_ratio = 0
    
    # Determine risk level
    if acwr_ratio < 0.8:
        risk_level = "low"
    elif 0.8 <= acwr_ratio <= 1.3:
        risk_level = "optimal"
    elif 1.3 < acwr_ratio <= 1.5:
        risk_level = "moderate"
    else:
        risk_level = "high"
    
    return round(acute_load, 2), round(chronic_load, 2), acwr_ratio, risk_level



# ============= CORREÇÃO 5-9: ACWR COM ROLLING WINDOW REAL =============
# Inclui dias sem treino como valor ZERO para simular recuperação real

def calculate_rolling_average(
    gps_data_by_date: dict,
    metric_key: str,
    window_size: int,
    end_date: datetime
) -> float:
    """
    Calcula média móvel REAL incluindo dias sem treino como ZERO.
    """
    total = 0.0
    for i in range(window_size):
        date = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        day_data = gps_data_by_date.get(date, {})
        value = day_data.get(metric_key, 0) or 0
        total += value
    
    return total / window_size if window_size > 0 else 0


def calculate_rolling_acwr(
    gps_data_by_date: dict,
    metric_key: str,
    current_date: datetime = None
) -> tuple:
    """
    Calcula ACWR com rolling window real - inclui dias sem treino como ZERO.
    Returns: (acute_load, chronic_load, acwr_ratio, risk_level)
    """
    if current_date is None:
        current_date = datetime.utcnow()
    
    acute_load = calculate_rolling_average(gps_data_by_date, metric_key, 7, current_date)
    chronic_load = calculate_rolling_average(gps_data_by_date, metric_key, 28, current_date)
    
    if chronic_load > 0:
        acwr_ratio = round(acute_load / chronic_load, 2)
    else:
        acwr_ratio = 0
    
    if acwr_ratio < 0.8:
        risk_level = "low"
    elif 0.8 <= acwr_ratio <= 1.3:
        risk_level = "optimal"
    elif 1.3 < acwr_ratio <= 1.5:
        risk_level = "moderate"
    else:
        risk_level = "high"
    
    return round(acute_load, 2), round(chronic_load, 2), acwr_ratio, risk_level


class ACWRMetricDetail(BaseModel):
    metric_id: str
    metric_name: str
    acute_load: float
    chronic_load: float
    acwr_ratio: float
    risk_level: str
    unit: str


class ACWRRollingResponse(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    metrics: List[ACWRMetricDetail]
    overall_risk: str
    recommendation: str


@router.get("/analysis/acwr-rolling/{athlete_id}", response_model=ACWRRollingResponse)
async def get_acwr_rolling_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """ACWR STANDARDIZATION: All ACWR from load_engine (EWMA)."""
    t = lambda key: get_analysis_text(lang, key)
    
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Read latest metrics from load_engine
    latest = await db.athlete_load_metrics.find_one(
        {"athlete_id": athlete_id},
        sort=[("date", -1)],
        projection={"_id": 0}
    )
    
    if not latest or not latest.get("distance"):
        raise HTTPException(status_code=400, detail=t("ai_no_data"))
    
    metric_configs = [
        ("total_distance", "distance", t("metric_total_distance"), "m"),
        ("hid_z3", "high_intensity_distance", t("metric_hid"), "m"),
        ("hsr_z4", "hsr", t("metric_hsr"), "m"),
        ("sprint_z5", "sprint_distance", t("metric_sprint"), "m"),
        ("sprints_count", "number_of_sprints", "Sprints", ""),
        ("acc_dec_total", "acc_dec_load", t("metric_acc_dec"), ""),
    ]
    
    metrics = []
    risk_levels = []
    for metric_id, engine_field, name, unit in metric_configs:
        field_data = latest.get(engine_field, {})
        if isinstance(field_data, dict):
            acwr_val = round(field_data.get("acwr") or 0, 2)
            acute = round(field_data.get("ewma_acute") or 0, 2)
            chronic = round(field_data.get("ewma_chronic") or 0, 2)
        else:
            acwr_val, acute, chronic = 0, 0, 0
        risk = classify_acwr_risk(acwr_val)
        metrics.append(ACWRMetricDetail(
            metric_id=metric_id, metric_name=name,
            acute_load=acute, chronic_load=chronic,
            acwr_ratio=acwr_val, risk_level=risk, unit=unit
        ))
        risk_levels.append(risk)
    
    if "high" in risk_levels:
        overall_risk = "high"
        recommendation = t("acwr_detail_high")
    elif "moderate" in risk_levels:
        overall_risk = "moderate"
        recommendation = t("acwr_detail_moderate")
    elif all(r == "low" for r in risk_levels):
        overall_risk = "low"
        recommendation = t("acwr_detail_low")
    else:
        overall_risk = "optimal"
        recommendation = t("acwr_detail_optimal")
    
    return ACWRRollingResponse(
        athlete_id=athlete_id,
        athlete_name=athlete.get("name", "Unknown"),
        analysis_date=datetime.utcnow().strftime("%Y-%m-%d"),
        metrics=metrics,
        overall_risk=overall_risk,
        recommendation=recommendation
    )


# CORREÇÃO 7: ACWR médio da equipe
class TeamACWRMetric(BaseModel):
    metric_id: str
    metric_name: str
    avg_acwr: float
    risk_level: str


class TeamACWRResponse(BaseModel):
    team_size: int
    analysis_date: str
    metrics: List[TeamACWRMetric]
    overall_risk: str


@router.get("/analysis/team-acwr", response_model=TeamACWRResponse)
async def get_team_acwr_analysis(
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """ACWR STANDARDIZATION: Team ACWR from load_engine (EWMA)."""
    t = lambda key: get_analysis_text(lang, key)
    
    athletes = await db.athletes.find({"coach_id": current_user["_id"]}).to_list(1000)
    if not athletes:
        raise HTTPException(status_code=404, detail="No athletes found")
    
    # Read latest metrics for all athletes from load_engine
    athlete_ids = [str(a["_id"]) for a in athletes]
    all_metrics = await db.athlete_load_metrics.aggregate([
        {"$match": {"athlete_id": {"$in": athlete_ids}}},
        {"$sort": {"date": -1}},
        {"$group": {"_id": "$athlete_id", "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$project": {"_id": 0}}
    ]).to_list(1000)
    
    metric_configs = [
        ("total_distance", "distance"),
        ("hid_z3", "high_intensity_distance"),
        ("hsr_z4", "hsr"),
        ("sprint_z5", "sprint_distance"),
        ("sprints_count", "number_of_sprints"),
        ("acc_dec_total", "acc_dec_load"),
    ]
    
    metric_acwrs = {mc[0]: [] for mc in metric_configs}
    
    for m in all_metrics:
        for metric_id, engine_field in metric_configs:
            field_data = m.get(engine_field, {})
            if isinstance(field_data, dict) and field_data.get("acwr") is not None:
                metric_acwrs[metric_id].append(round(field_data["acwr"], 2))
    
    metric_names = {
        "total_distance": t("metric_total_distance"), "hid_z3": t("metric_hid"),
        "hsr_z4": t("metric_hsr"), "sprint_z5": t("metric_sprint"),
        "sprints_count": "Sprints", "acc_dec_total": t("metric_acc_dec")
    }
    
    metrics = []
    risk_levels = []
    for metric_id, _ in metric_configs:
        values = metric_acwrs[metric_id]
        avg_acwr = round(sum(values) / len(values), 2) if values else 0
        risk = classify_acwr_risk(avg_acwr)
        risk_levels.append(risk)
        metrics.append(TeamACWRMetric(
            metric_id=metric_id, metric_name=metric_names.get(metric_id, metric_id),
            avg_acwr=avg_acwr, risk_level=risk
        ))
    
    if "high" in risk_levels: overall_risk = "high"
    elif "moderate" in risk_levels: overall_risk = "moderate"
    elif all(r == "low" for r in risk_levels): overall_risk = "low"
    else: overall_risk = "optimal"
    
    return TeamACWRResponse(team_size=len(athletes), analysis_date=datetime.utcnow().strftime("%Y-%m-%d"), metrics=metrics, overall_risk=overall_risk)


@router.get("/analysis/acwr-detailed/{athlete_id}", response_model=ACWRDetailedAnalysis)
async def get_acwr_detailed_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """ACWR STANDARDIZATION: All ACWR from load_engine (EWMA).
    Metrics: Total Distance, HSR, HID, Sprint, Acc/Dec
    """
    t = lambda key: get_analysis_text(lang, key)
    
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Read latest metrics from load_engine
    latest = await db.athlete_load_metrics.find_one(
        {"athlete_id": athlete_id},
        sort=[("date", -1)],
        projection={"_id": 0}
    )
    
    if not latest or not latest.get("distance"):
        raise HTTPException(status_code=400, detail=t("ai_no_data"))
    
    # Build metrics from load_engine fields
    metric_configs = [
        ("distance", t("metric_total_distance"), "m"),
        ("hsr", t("metric_hsr"), "m"),
        ("high_intensity_distance", t("metric_hid"), "m"),
        ("sprint_distance", t("metric_sprint"), "m"),
        ("acc_dec_load", t("metric_acc_dec"), "count"),
    ]
    
    metrics = []
    risk_levels = []
    for engine_field, name, unit in metric_configs:
        field_data = latest.get(engine_field, {})
        if isinstance(field_data, dict):
            acwr_val = round(field_data.get("acwr") or 0, 2)
            acute = round(field_data.get("ewma_acute") or 0, 2)
            chronic = round(field_data.get("ewma_chronic") or 0, 2)
        else:
            acwr_val, acute, chronic = 0, 0, 0
        risk = classify_acwr_risk(acwr_val)
        metrics.append(ACWRDetailedMetric(
            name=name, acute_load=acute, chronic_load=chronic,
            acwr_ratio=acwr_val, risk_level=risk, unit=unit
        ))
        risk_levels.append(risk)
    
    if "high" in risk_levels:
        overall_risk = "high"
        recommendation = t("acwr_detail_high")
    elif risk_levels.count("moderate") >= 2:
        overall_risk = "moderate"
        recommendation = t("acwr_detail_moderate")
    elif "optimal" in risk_levels and risk_levels.count("optimal") >= 3:
        overall_risk = "optimal"
        recommendation = t("acwr_detail_optimal")
    else:
        overall_risk = "low"
        recommendation = t("acwr_detail_low")
    
    return ACWRDetailedAnalysis(
        athlete_id=athlete_id,
        athlete_name=athlete["name"],
        analysis_date=datetime.utcnow().strftime("%Y-%m-%d"),
        metrics=metrics,
        overall_risk=overall_risk,
        recommendation=recommendation
    )

# ============= ACWR HISTORY FOR CHARTS =============

class ACWRHistoryPoint(BaseModel):
    date: str
    acwr: float
    acute: float
    chronic: float
    risk_level: str

class ACWRHistoryResponse(BaseModel):
    athlete_id: str
    athlete_name: str
    metric: str
    history: List[ACWRHistoryPoint]

@router.get("/analysis/acwr-history/{athlete_id}")
async def get_acwr_history(
    athlete_id: str,
    metric: str = "total_distance",
    days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """ACWR STANDARDIZATION: ACWR history from load_engine (EWMA).
    Reads historical athlete_load_metrics documents.
    Metrics: total_distance, hsr, hid, sprint, acc_dec
    """
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Map frontend metric key to load_engine field
    engine_field = ANALYSIS_METRIC_TO_ENGINE.get(metric, "distance")
    
    # Read historical metrics from load_engine
    today = datetime.utcnow()
    start_date = (today - timedelta(days=days)).strftime("%Y-%m-%d")
    
    docs = await db.athlete_load_metrics.find(
        {"athlete_id": athlete_id, "date": {"$gte": start_date}},
        projection={"_id": 0, "date": 1, engine_field: 1}
    ).sort("date", 1).to_list(1000)
    
    history = []
    for doc in docs:
        field_data = doc.get(engine_field, {})
        if not isinstance(field_data, dict):
            continue
        acwr_val = field_data.get("acwr")
        if acwr_val is None:
            continue
        history.append(ACWRHistoryPoint(
            date=doc.get("date", ""),
            acwr=round(acwr_val, 2),
            acute=round(field_data.get("ewma_acute") or 0, 0),
            chronic=round(field_data.get("ewma_chronic") or 0, 0),
            risk_level=classify_acwr_risk(acwr_val)
        ))
    
    return ACWRHistoryResponse(
        athlete_id=athlete_id,
        athlete_name=athlete["name"],
        metric=metric,
        history=history
    )


# ============= ROLLING LOAD ENGINE ENDPOINTS (EWMA-BASED ACWR) =============

class EWMAMetricResponse(BaseModel):
    """Response for a single EWMA-calculated metric"""
    load: float
    ewma_acute: float
    ewma_chronic: float
    acwr: Optional[float]
    acwr_zone: str

class AthleteLoadMetricsResponse(BaseModel):
    """Complete load metrics for an athlete"""
    athlete_id: str
    date: str
    
    distance: EWMAMetricResponse
    hsr: EWMAMetricResponse
    sprint_distance: EWMAMetricResponse
    acc_dec_load: EWMAMetricResponse
    
    monotony: float
    strain: float
    weekly_load: float
    
    has_spike: bool
    spike_metrics: List[str]
    spike_status: str

class RecalculateResponse(BaseModel):
    """Response for recalculation request"""
    success: bool
    athlete_id: str
    dates_processed: int
    message: str


@router.get("/load-metrics/{athlete_id}", response_model=AthleteLoadMetricsResponse)
async def get_athlete_load_metrics(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get EWMA-based load metrics for an athlete.
    
    Returns pre-calculated metrics including:
    - EWMA Acute/Chronic loads
    - ACWR (EWMA-based)
    - Monotony
    - Strain
    - Spike detection
    
    These metrics are calculated incrementally when GPS data is added,
    making this endpoint extremely fast.
    """
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get latest metrics from load engine
    metrics = await load_engine.get_latest_metrics(athlete_id)
    
    if not metrics:
        raise HTTPException(
            status_code=404,
            detail="No load metrics available. Add training data first."
        )
    
    def metric_to_response(m) -> EWMAMetricResponse:
        if isinstance(m, dict):
            return EWMAMetricResponse(
                load=m.get("load", 0),
                ewma_acute=m.get("ewma_acute", 0),
                ewma_chronic=m.get("ewma_chronic", 0),
                acwr=m.get("acwr"),
                acwr_zone=m.get("acwr_zone", "unknown")
            )
        return EWMAMetricResponse(
            load=m.load,
            ewma_acute=m.ewma_acute,
            ewma_chronic=m.ewma_chronic,
            acwr=m.acwr,
            acwr_zone=m.acwr_zone
        )
    
    return AthleteLoadMetricsResponse(
        athlete_id=athlete_id,
        date=metrics.date,
        distance=metric_to_response(metrics.distance),
        hsr=metric_to_response(metrics.hsr),
        sprint_distance=metric_to_response(metrics.sprint_distance),
        acc_dec_load=metric_to_response(metrics.acc_dec_load),
        monotony=metrics.monotony,
        strain=metrics.strain,
        weekly_load=metrics.weekly_load,
        has_spike=metrics.has_spike,
        spike_metrics=metrics.spike_metrics,
        spike_status=metrics.spike_status
    )


@router.post("/load-metrics/{athlete_id}/recalculate", response_model=RecalculateResponse)
async def recalculate_athlete_metrics(
    athlete_id: str,
    from_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Recalculate load metrics for an athlete.
    
    Use this when:
    - Historical training data has been modified
    - Metrics appear incorrect
    - Migrating existing data to the new EWMA system
    
    Parameters:
    - from_date: Start recalculation from this date (YYYY-MM-DD). 
                 Defaults to 60 days ago.
    """
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Default to 60 days ago if not specified
    if not from_date:
        from_date = (datetime.utcnow() - timedelta(days=60)).strftime("%Y-%m-%d")
    
    coach_id = str(current_user["_id"])
    
    # Recalculate metrics
    results = await load_engine.recalculate_from_date(
        athlete_id=athlete_id,
        coach_id=coach_id,
        start_date=from_date
    )
    
    success_count = sum(1 for r in results if r.success)
    
    return RecalculateResponse(
        success=success_count > 0,
        athlete_id=athlete_id,
        dates_processed=len(results),
        message=f"Recalculated {success_count} of {len(results)} dates"
    )


@router.post("/load-metrics/recalculate-all")
async def recalculate_all_load_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Force full recalculation of athlete_load_metrics for ALL athletes.
    This rebuilds all EWMA, ACWR, monotony, strain values using corrected
    GPS dedup logic. Should be called after fixing aggregate_gps_for_date.
    """
    user_id = current_user["_id"]
    athletes = await db.athletes.find({"coach_id": user_id}).to_list(200)

    if not athletes:
        return {"success": False, "message": "No athletes found", "athletes_processed": 0}

    results = []
    for athlete in athletes:
        athlete_id = str(athlete["_id"])
        coach_id = str(user_id)

        # Delete existing metrics for this athlete
        await db.athlete_load_metrics.delete_many({"athlete_id": athlete_id})

        # Find earliest GPS date
        earliest = await db.gps_data.find_one(
            {"athlete_id": athlete_id, "coach_id": coach_id},
            sort=[("date", 1)],
            projection={"date": 1, "_id": 0}
        )

        if earliest and earliest.get("date"):
            try:
                recalc_results = await load_engine.recalculate_from_date(
                    athlete_id=athlete_id,
                    coach_id=coach_id,
                    start_date=earliest["date"]
                )
                success_count = sum(1 for r in recalc_results if r.success)
                results.append({
                    "athlete_id": athlete_id,
                    "name": athlete.get("name"),
                    "dates_processed": len(recalc_results),
                    "success_count": success_count
                })
            except Exception as e:
                results.append({
                    "athlete_id": athlete_id,
                    "name": athlete.get("name"),
                    "error": str(e)
                })
        else:
            results.append({
                "athlete_id": athlete_id,
                "name": athlete.get("name"),
                "dates_processed": 0,
                "message": "No GPS data"
            })

    return {
        "success": True,
        "athletes_processed": len(results),
        "details": results
    }


@router.get("/load-metrics/team/latest")
async def get_team_load_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Get latest load metrics for all athletes in a team.
    
    Returns pre-calculated EWMA-based ACWR and other metrics
    for each athlete, optimized for the Team Dashboard.
    """
    coach_id = str(current_user["_id"])
    
    # Get all latest metrics
    team_metrics = await load_engine.get_team_metrics(coach_id)
    
    # Get athlete names
    athletes = await db.athletes.find({"coach_id": current_user["_id"]}).to_list(100)
    athlete_names = {str(a["_id"]): a.get("name", "Unknown") for a in athletes}
    
    # Format response
    result = []
    for m in team_metrics:
        athlete_id = m.get("athlete_id")
        
        # Extract ACWR values for each metric
        distance = m.get("distance", {})
        hsr = m.get("hsr", {})
        sprint = m.get("sprint_distance", {})
        acc_dec = m.get("acc_dec_load", {})
        
        result.append({
            "athlete_id": athlete_id,
            "athlete_name": athlete_names.get(athlete_id, "Unknown"),
            "date": m.get("date"),
            "distance_acwr": distance.get("acwr") if isinstance(distance, dict) else None,
            "distance_zone": distance.get("acwr_zone", "unknown") if isinstance(distance, dict) else "unknown",
            "hsr_acwr": hsr.get("acwr") if isinstance(hsr, dict) else None,
            "sprint_acwr": sprint.get("acwr") if isinstance(sprint, dict) else None,
            "acc_dec_acwr": acc_dec.get("acwr") if isinstance(acc_dec, dict) else None,
            "monotony": m.get("monotony", 0),
            "strain": m.get("strain", 0),
            "has_spike": m.get("has_spike", False),
            "spike_status": m.get("spike_status", "none"),
        })
    
    return {
        "success": True,
        "count": len(result),
        "metrics": result
    }


@router.get("/analysis/fatigue/{athlete_id}")
async def get_fatigue_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    t = lambda key: get_analysis_text(lang, key)
    
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get recent wellness data (last 7 days)
    today = datetime.utcnow()
    date_7_days_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    
    wellness_records = await db.wellness.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "date": {"$gte": date_7_days_ago}
    }).sort("date", -1).to_list(7)
    
    if not wellness_records:
        raise HTTPException(
            status_code=400,
            detail=t("ai_no_data")
        )
    
    # Get recent GPS data for workload context
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "date": {"$gte": date_7_days_ago}
    }).to_list(7)
    
    # Calculate average wellness metrics
    avg_fatigue = statistics.mean([w["fatigue"] for w in wellness_records])
    avg_sleep_quality = statistics.mean([w["sleep_quality"] for w in wellness_records])
    avg_sleep_hours = statistics.mean([w["sleep_hours"] for w in wellness_records])
    avg_muscle_soreness = statistics.mean([w["muscle_soreness"] for w in wellness_records])
    avg_stress = statistics.mean([w["stress"] for w in wellness_records])
    avg_readiness = statistics.mean([w["readiness_score"] for w in wellness_records])
    
    # Calculate fatigue score (0-100, higher is more fatigued)
    fatigue_score = (
        avg_fatigue * 8 +  # Fatigue is primary indicator
        (10 - avg_sleep_quality) * 5 +  # Poor sleep increases fatigue
        avg_muscle_soreness * 6 +  # Soreness indicates fatigue
        avg_stress * 4 +  # Stress contributes to fatigue
        (10 - min(avg_sleep_hours / 8 * 10, 10)) * 3  # Insufficient sleep
    ) / 2.6  # Normalize to 0-100
    
    fatigue_score = round(fatigue_score, 1)
    
    # Determine fatigue level
    if fatigue_score < 30:
        fatigue_level = "low"
        recommendation = t("fatigue_low")
    elif fatigue_score < 50:
        fatigue_level = "moderate"
        recommendation = t("fatigue_moderate")
    elif fatigue_score < 70:
        fatigue_level = "high"
        recommendation = t("fatigue_high")
    else:
        fatigue_level = "critical"
        recommendation = t("fatigue_critical")
    
    # Identify contributing factors (using translations)
    contributing_factors = []
    if avg_fatigue >= 7:
        contributing_factors.append(t("high_fatigue_perception"))
    if avg_sleep_quality <= 5:
        contributing_factors.append(t("poor_sleep"))
    if avg_sleep_hours < 7:
        contributing_factors.append(t("insufficient_sleep"))
    if avg_muscle_soreness >= 7:
        contributing_factors.append(t("high_muscle_soreness"))
    if avg_stress >= 7:
        contributing_factors.append(t("elevated_stress"))
    if avg_readiness < 6:
        contributing_factors.append(t("compromised_readiness"))
    
    if not contributing_factors:
        contributing_factors.append(t("all_good"))
    
    return FatigueAnalysis(
        fatigue_level=fatigue_level,
        fatigue_score=fatigue_score,
        contributing_factors=contributing_factors,
        recommendation=recommendation
    )

@router.get("/analysis/ai-insights/{athlete_id}")
async def get_ai_insights(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    t = lambda key: get_analysis_text(lang, key)
    
    # Language-specific prompts
    lang_prompts = {
        "en": {
            "system": "You are a sports science and football training expert. Analyze the provided data and provide professional, practical and actionable insights. Respond in clear and objective English.",
            "analysis_prompt": """Based on this data, provide a complete professional analysis including:

1. EXECUTIVE SUMMARY (2-3 lines about the athlete's current state)

2. STRENGTHS (2-3 positive aspects identified in the data)

3. AREAS OF CONCERN (2-3 areas that require monitoring or adjustment)

4. SPECIFIC RECOMMENDATIONS (3-4 concrete actions to optimize training)

5. RECOMMENDED TRAINING ZONES:
   - Recovery Zone: distance and characteristics
   - Aerobic Zone: distance and characteristics
   - Anaerobic Zone: distance and characteristics
   - Maximum Zone: distance and characteristics

Format your response in a structured and professional manner.""",
            "data_labels": {
                "analysis": "Athlete Analysis",
                "position": "Position",
                "gps_data": "GPS DATA (last 30 records)",
                "total_sessions": "Total sessions",
                "avg_distance": "Average distance",
                "avg_hi_distance": "Average high intensity distance",
                "avg_sprints": "Average sprints per session",
                "avg_max_speed": "Average max speed",
                "wellness": "WELLNESS (last 30 records)",
                "total_questionnaires": "Total questionnaires",
                "avg_wellness": "Average wellness score",
                "avg_readiness": "Average readiness score",
                "avg_fatigue": "Average fatigue",
                "avg_sleep_quality": "Average sleep quality",
                "avg_sleep_hours": "Average sleep hours",
                "assessments": "PHYSICAL ASSESSMENTS",
                "total_assessments": "Total assessments"
            },
            "defaults": {
                "summary": "Athlete data analysis completed successfully.",
                "strength": "Consistent training data",
                "concern": "Continue monitoring regularly",
                "recommendation": "Maintain current monitoring routine"
            },
            "zones": {
                "recovery": "Zone 1: <60% v.max (Recovery, light jogging)",
                "aerobic": "Zone 2: 60-75% v.max (Aerobic base, steady state)",
                "anaerobic": "Zone 3: 75-90% v.max (Tempo runs, threshold)",
                "maximum": "Zone 4: >90% v.max (Sprints, max speed)"
            }
        },
        "pt": {
            "system": "Você é um especialista em ciência do esporte e treinamento de futebol. Analise os dados fornecidos e forneça insights profissionais, práticos e acionáveis. Responda em português brasileiro de forma clara e objetiva.",
            "analysis_prompt": """Com base nesses dados, forneça uma análise profissional completa incluindo:

1. RESUMO EXECUTIVO (2-3 linhas sobre o estado atual do atleta)

2. PONTOS FORTES (2-3 aspectos positivos identificados nos dados)

3. PONTOS DE ATENÇÃO (2-3 áreas que requerem monitoramento ou ajuste)

4. RECOMENDAÇÕES ESPECÍFICAS (3-4 ações concretas para otimizar o treinamento)

5. ZONAS DE TREINAMENTO RECOMENDADAS:
   - Zona de Recuperação: distância e características
   - Zona Aeróbica: distância e características
   - Zona Anaeróbica: distância e características
   - Zona Máxima: distância e características

Formate sua resposta de forma estruturada e profissional.""",
            "data_labels": {
                "analysis": "Análise do Atleta",
                "position": "Posição",
                "gps_data": "DADOS GPS (últimos 30 registros)",
                "total_sessions": "Total de sessões",
                "avg_distance": "Distância média",
                "avg_hi_distance": "Distância alta intensidade média",
                "avg_sprints": "Sprints médios por sessão",
                "avg_max_speed": "Velocidade máxima média",
                "wellness": "WELLNESS (últimos 30 registros)",
                "total_questionnaires": "Total de questionários",
                "avg_wellness": "Wellness score médio",
                "avg_readiness": "Readiness score médio",
                "avg_fatigue": "Fadiga média",
                "avg_sleep_quality": "Qualidade sono média",
                "avg_sleep_hours": "Horas de sono média",
                "assessments": "AVALIAÇÕES FÍSICAS",
                "total_assessments": "Total de avaliações"
            },
            "defaults": {
                "summary": "Análise dos dados do atleta concluída com sucesso.",
                "strength": "Dados consistentes de treinamento",
                "concern": "Continue monitorando regularmente",
                "recommendation": "Manter rotina atual de monitoramento"
            },
            "zones": {
                "recovery": "Zona 1: <60% v.max (Recuperação, trote leve)",
                "aerobic": "Zona 2: 60-75% v.max (Base aeróbica, ritmo estável)",
                "anaerobic": "Zona 3: 75-90% v.max (Corridas de tempo, limiar)",
                "maximum": "Zona 4: >90% v.max (Sprints, velocidade máxima)"
            }
        }
    }
    
    # Default to English if language not supported
    lp = lang_prompts.get(lang, lang_prompts["en"])
    labels = lp["data_labels"]
    
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get all data for comprehensive analysis
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).limit(30).to_list(30)
    
    wellness_records = await db.wellness.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).limit(30).to_list(30)
    
    assessments = await db.assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).limit(5).to_list(5)
    
    if not gps_records and not wellness_records:
        raise HTTPException(
            status_code=400,
            detail=t("ai_no_data")
        )
    
    # Prepare data summary for AI using translated labels
    avg_gps_distance = statistics.mean([g['total_distance'] for g in gps_records]) if gps_records else 0
    avg_hi_distance = statistics.mean([g['high_intensity_distance'] for g in gps_records]) if gps_records else 0
    avg_sprints = statistics.mean([g['number_of_sprints'] for g in gps_records]) if gps_records else 0
    max_speeds = [g.get('max_speed', 0) for g in gps_records if g.get('max_speed')]
    avg_max_speed = statistics.mean(max_speeds) if max_speeds else 0
    
    avg_wellness = statistics.mean([w['wellness_score'] for w in wellness_records]) if wellness_records else 0
    avg_readiness = statistics.mean([w['readiness_score'] for w in wellness_records]) if wellness_records else 0
    avg_fatigue = statistics.mean([w['fatigue'] for w in wellness_records]) if wellness_records else 0
    avg_sleep_quality = statistics.mean([w['sleep_quality'] for w in wellness_records]) if wellness_records else 0
    avg_sleep_hours = statistics.mean([w['sleep_hours'] for w in wellness_records]) if wellness_records else 0
    
    data_summary = f"""
{labels['analysis']}: {athlete['name']}
{labels['position']}: {athlete['position']}

{labels['gps_data']}:
- {labels['total_sessions']}: {len(gps_records)}
- {labels['avg_distance']}: {avg_gps_distance:.0f}m
- {labels['avg_hi_distance']}: {avg_hi_distance:.0f}m
- {labels['avg_sprints']}: {avg_sprints:.1f}
- {labels['avg_max_speed']}: {avg_max_speed:.1f} km/h

{labels['wellness']}:
- {labels['total_questionnaires']}: {len(wellness_records)}
- {labels['avg_wellness']}: {avg_wellness:.1f}/10
- {labels['avg_readiness']}: {avg_readiness:.1f}/10
- {labels['avg_fatigue']}: {avg_fatigue:.1f}/10
- {labels['avg_sleep_quality']}: {avg_sleep_quality:.1f}/10
- {labels['avg_sleep_hours']}: {avg_sleep_hours:.1f}h

{labels['assessments']}:
- {labels['total_assessments']}: {len(assessments)}
"""
    
    if assessments:
        for assessment in assessments[:2]:  # Last 2 assessments
            data_summary += f"- {assessment['assessment_type']}: {assessment['date']}\n"
    
    # Use Emergent LLM for insights
    try:
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"analysis_{athlete_id}_{datetime.utcnow().timestamp()}",
            system_message=lp["system"]
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(
            text=f"{data_summary}\n\n{lp['analysis_prompt']}"
        )
        
        response = await chat.send_message(user_message)
        
        # Parse AI response (basic parsing, can be improved)
        lines = response.split('\n')
        
        summary = ""
        strengths = []
        concerns = []
        recommendations = []
        training_zones = {}
        
        current_section = None
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Detect sections based on common keywords in multiple languages
            line_upper = line.upper()
            if "RESUMO" in line_upper or "SUMMARY" in line_upper or "EXECUTIVO" in line_upper:
                current_section = "summary"
            elif "FORTE" in line_upper or "STRENGTH" in line_upper or "POSITIVO" in line_upper:
                current_section = "strengths"
            elif "ATENÇÃO" in line_upper or "CONCERN" in line_upper or "ATTENTION" in line_upper or "PREOCUP" in line_upper:
                current_section = "concerns"
            elif "RECOMENDA" in line_upper or "RECOMMENDATION" in line_upper:
                current_section = "recommendations"
            elif "ZONA" in line_upper or "ZONE" in line_upper:
                current_section = "zones"
            elif line.startswith('-') or line.startswith('•') or (len(line) > 0 and line[0].isdigit()):
                content = line.lstrip('-•0123456789. ')
                if current_section == "strengths":
                    strengths.append(content)
                elif current_section == "concerns":
                    concerns.append(content)
                elif current_section == "recommendations":
                    recommendations.append(content)
            elif current_section == "summary" and len(line) > 20:
                summary += line + " "
        
        # Default zones using translated values
        training_zones = lp["zones"]
        
        defaults = lp["defaults"]
        return AIInsights(
            summary=summary.strip() if summary else defaults["summary"],
            strengths=strengths if strengths else [defaults["strength"]],
            concerns=concerns if concerns else [defaults["concern"]],
            recommendations=recommendations if recommendations else [defaults["recommendation"]],
            training_zones=training_zones
        )
        
    except Exception as e:
        logger.error(f"AI Analysis error: {str(e)}")
        # Fallback to rule-based insights using translated text
        defaults = lp["defaults"]
        zones = lp["zones"]
        
        return AIInsights(
            summary=defaults["summary"],
            strengths=[defaults["strength"]],
            concerns=[defaults["concern"]],
            recommendations=[defaults["recommendation"]],
            training_zones=zones
        )

@router.get("/analysis/comprehensive/{athlete_id}")
async def get_comprehensive_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """Get all analyses in one endpoint"""
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    result = ComprehensiveAnalysis(
        athlete_id=athlete_id,
        athlete_name=athlete["name"],
        analysis_date=datetime.utcnow().strftime("%Y-%m-%d")
    )
    
    # Try to get each analysis (non-blocking)
    try:
        acwr = await get_acwr_analysis(athlete_id, lang, current_user)
        result.acwr = acwr
    except:
        pass
    
    try:
        fatigue = await get_fatigue_analysis(athlete_id, lang, current_user)
        result.fatigue = fatigue
    except:
        pass
    
    try:
        insights = await get_ai_insights(athlete_id, lang, current_user)
        result.ai_insights = insights
    except:
        pass
    
    return result

