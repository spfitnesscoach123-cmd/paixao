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
from models.analysis_translations import get_analysis_text

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None


router = APIRouter(tags=["Strength Analysis"])

# ============= STRENGTH ANALYSIS =============

class StrengthMetric(BaseModel):
    name: str
    value: float
    unit: str
    classification: str  # "excellent", "good", "average", "below_average", "poor"
    percentile: float  # Position compared to normative data
    variation_from_peak: Optional[float] = None  # % change from personal best
    variation_from_previous: Optional[float] = None  # % change from previous assessment
    previous_value: Optional[float] = None  # Value from previous assessment

class StrengthAnalysisResult(BaseModel):
    athlete_id: str
    assessment_date: str
    previous_assessment_date: Optional[str] = None
    metrics: List[StrengthMetric]
    fatigue_index: float
    fatigue_alert: bool
    peripheral_fatigue_detected: bool
    overall_strength_classification: str
    ai_insights: Optional[str] = None
    recommendations: List[str]
    historical_trend: Optional[Dict[str, Any]] = None
    comparison_with_previous: Optional[Dict[str, Any]] = None

# Normative data for football players (based on literature)
STRENGTH_NORMATIVES = {
    "mean_power": {"excellent": 2500, "good": 2200, "average": 1900, "below_average": 1600, "unit": "W"},
    "peak_power": {"excellent": 4000, "good": 3500, "average": 3000, "below_average": 2500, "unit": "W"},
    "mean_speed": {"excellent": 1.5, "good": 1.3, "average": 1.1, "below_average": 0.9, "unit": "m/s"},
    "peak_speed": {"excellent": 3.0, "good": 2.6, "average": 2.2, "below_average": 1.8, "unit": "m/s"},
    "rsi": {"excellent": 2.5, "good": 2.0, "average": 1.5, "below_average": 1.0, "unit": ""},
    "fatigue_index": {"low": 30, "moderate": 50, "high": 70, "critical": 85, "unit": "%"}
}


@router.get("/analysis/strength/{athlete_id}", response_model=StrengthAnalysisResult)
async def get_strength_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """Analyze strength assessment data with normative comparisons and fatigue detection"""
    
    t = lambda key: get_analysis_text(lang, key)
    
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get all strength assessments for this athlete (ordered by date and created_at)
    assessments = await db.assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "assessment_type": "strength"
    }).sort([("date", -1), ("created_at", -1)]).to_list(100)
    
    if not assessments:
        raise HTTPException(status_code=400, detail=t("ai_no_data"))
    
    latest = assessments[0]
    previous = assessments[1] if len(assessments) > 1 else None
    metrics_data = latest.get("metrics", {})
    previous_metrics = previous.get("metrics", {}) if previous else {}
    
    # Calculate historical peaks
    historical_peaks = {}
    for a in assessments:
        m = a.get("metrics", {})
        for key in ["mean_power", "peak_power", "mean_speed", "peak_speed", "rsi"]:
            if key in m and m[key] is not None:
                if key not in historical_peaks or m[key] > historical_peaks[key]:
                    historical_peaks[key] = m[key]
    
    # Analyze each metric
    analyzed_metrics = []
    normatives = STRENGTH_NORMATIVES
    
    def classify_metric(value, metric_name):
        if metric_name not in normatives:
            return "average", 50.0
        
        norm = normatives[metric_name]
        if value >= norm["excellent"]:
            return "excellent", 95.0
        elif value >= norm["good"]:
            return "good", 75.0
        elif value >= norm["average"]:
            return "average", 50.0
        elif value >= norm["below_average"]:
            return "below_average", 25.0
        else:
            return "poor", 10.0
    
    # Process each metric
    for metric_key, display_name in [
        ("mean_power", "Mean Power"),
        ("peak_power", "Peak Power"),
        ("mean_speed", "Mean Speed"),
        ("peak_speed", "Peak Speed"),
        ("rsi", "RSI")
    ]:
        value = metrics_data.get(metric_key)
        if value is not None:
            classification, percentile = classify_metric(value, metric_key)
            
            # Calculate variation from personal peak
            variation = None
            if metric_key in historical_peaks and historical_peaks[metric_key] > 0:
                variation = ((value - historical_peaks[metric_key]) / historical_peaks[metric_key]) * 100
            
            # Calculate variation from previous assessment
            variation_from_previous = None
            previous_value = previous_metrics.get(metric_key) if previous_metrics else None
            if previous_value is not None and previous_value > 0:
                variation_from_previous = ((value - previous_value) / previous_value) * 100
            
            analyzed_metrics.append(StrengthMetric(
                name=display_name,
                value=value,
                unit=normatives.get(metric_key, {}).get("unit", ""),
                classification=classification,
                percentile=percentile,
                variation_from_peak=round(variation, 1) if variation else None,
                variation_from_previous=round(variation_from_previous, 1) if variation_from_previous is not None else None,
                previous_value=previous_value
            ))
    
    # Detect peripheral fatigue
    # Peripheral fatigue = RSI decrease + Peak Power decrease
    rsi_current = metrics_data.get("rsi", 0)
    peak_power_current = metrics_data.get("peak_power", 0)
    rsi_peak = historical_peaks.get("rsi", rsi_current)
    peak_power_peak = historical_peaks.get("peak_power", peak_power_current)
    
    rsi_drop = (rsi_peak - rsi_current) / rsi_peak * 100 if rsi_peak > 0 else 0
    power_drop = (peak_power_peak - peak_power_current) / peak_power_peak * 100 if peak_power_peak > 0 else 0
    
    # Calculate fatigue index automatically based on power drop from historical peak
    # Formula: 
    # - power_drop > 30% => fatigue_index < 70% (low recovery)
    # - power_drop 15-30% => fatigue_index 70-85% (moderate recovery)
    # - power_drop < 15% => fatigue_index 85-100% (good recovery)
    # We invert the logic: higher fatigue_index = more recovered = lower fatigue
    # But the user wants to show "fatigue level" so we calculate actual fatigue percentage
    
    # Calculate fatigue based on power drop and RSI drop
    # If power drops > 30%, fatigue is HIGH (>70%)
    # If power drops 15-30%, fatigue is MODERATE (50-70%)
    # If power drops < 15%, fatigue is LOW (<50%)
    
    manual_fatigue = metrics_data.get("fatigue_index", None)
    if manual_fatigue is not None and manual_fatigue > 0:
        # Use manual input if provided
        fatigue_index = manual_fatigue
    else:
        # Calculate fatigue from power drop
        # power_drop > 30% => fatigue_index = 80-100% (very fatigued)
        # power_drop 20-30% => fatigue_index = 70-80% (high fatigue)
        # power_drop 10-20% => fatigue_index = 50-70% (moderate fatigue)
        # power_drop < 10% => fatigue_index = 0-50% (low fatigue/well recovered)
        
        if power_drop >= 30:
            # Very high fatigue - scales from 80-100% based on how much above 30%
            fatigue_index = min(100, 80 + (power_drop - 30) * 0.5)
        elif power_drop >= 20:
            # High fatigue - scales from 70-80%
            fatigue_index = 70 + (power_drop - 20)
        elif power_drop >= 10:
            # Moderate fatigue - scales from 50-70%
            fatigue_index = 50 + (power_drop - 10) * 2
        elif power_drop >= 5:
            # Low fatigue - scales from 30-50%
            fatigue_index = 30 + (power_drop - 5) * 4
        else:
            # Well recovered - scales from 0-30%
            fatigue_index = power_drop * 6
        
        # Also factor in RSI drop
        if rsi_drop > 20:
            fatigue_index = min(100, fatigue_index + 10)
        elif rsi_drop > 10:
            fatigue_index = min(100, fatigue_index + 5)
        
        fatigue_index = round(fatigue_index, 1)
    
    fatigue_alert = fatigue_index > 70
    peripheral_fatigue = (rsi_drop > 10 and power_drop > 10) or fatigue_index > 70
    
    # Overall classification
    avg_percentile = sum(m.percentile for m in analyzed_metrics) / len(analyzed_metrics) if analyzed_metrics else 50
    if avg_percentile >= 80:
        overall_class = "excellent"
    elif avg_percentile >= 60:
        overall_class = "good"
    elif avg_percentile >= 40:
        overall_class = "average"
    else:
        overall_class = "below_average"
    
    # Generate recommendations
    recommendations = []
    
    if peripheral_fatigue:
        if lang == "pt":
            recommendations.append("⚠️ FADIGA PERIFÉRICA DETECTADA: Redução significativa no RSI e Pico de Potência indica acúmulo de fadiga muscular.")
            recommendations.append("Recomenda-se período de recuperação ativa e redução do volume de treino.")
            recommendations.append("Risco aumentado de lesão se os esforços intensos persistirem.")
        else:
            recommendations.append("⚠️ PERIPHERAL FATIGUE DETECTED: Significant RSI and Peak Power reduction indicates accumulated muscle fatigue.")
            recommendations.append("Active recovery period and reduced training volume recommended.")
            recommendations.append("Increased injury risk if intense efforts persist.")
    
    if fatigue_alert:
        if lang == "pt":
            recommendations.append(f"Índice de Fadiga em {fatigue_index}% - acima do limiar de 70%. Monitorar recuperação.")
        else:
            recommendations.append(f"Fatigue Index at {fatigue_index}% - above 70% threshold. Monitor recovery.")
    
    if not recommendations:
        if lang == "pt":
            recommendations.append("Níveis de força dentro dos parâmetros normais. Manter rotina de treino.")
        else:
            recommendations.append("Strength levels within normal parameters. Maintain training routine.")
    
    # Generate AI insights
    ai_insights = None
    try:
        emergent_key = os.environ.get('EMERGENT_LLM_KEY')
        if emergent_key and len(analyzed_metrics) > 0:
            system_msg = "You are a sports science expert specializing in strength and conditioning for football players." if lang == "en" else "Você é um especialista em ciência do esporte, especializado em força e condicionamento para jogadores de futebol."
            
            metrics_summary = "\n".join([f"- {m.name}: {m.value}{m.unit} ({m.classification}, {m.percentile}th percentile)" for m in analyzed_metrics])
            
            prompt = f"""Analyze this football player's strength assessment:
{metrics_summary}
Fatigue Index: {fatigue_index}%
Peripheral Fatigue: {'Yes' if peripheral_fatigue else 'No'}
RSI Drop from Peak: {rsi_drop:.1f}%
Peak Power Drop from Peak: {power_drop:.1f}%

Provide a brief (2-3 sentences) professional insight about this athlete's strength profile and any concerns."""
            
            if lang == "pt":
                prompt = f"""Analise esta avaliação de força de um jogador de futebol:
{metrics_summary}
Índice de Fadiga: {fatigue_index}%
Fadiga Periférica: {'Sim' if peripheral_fatigue else 'Não'}
Queda do RSI do Pico: {rsi_drop:.1f}%
Queda do Pico de Potência do Pico: {power_drop:.1f}%

Forneça um insight profissional breve (2-3 frases) sobre o perfil de força deste atleta e quaisquer preocupações."""
            
            chat = LlmChat(
                api_key=emergent_key,
                session_id=f"strength_{athlete_id}_{datetime.utcnow().timestamp()}",
                system_message=system_msg
            ).with_model("openai", "gpt-4o")
            
            response = await chat.send_message(UserMessage(text=prompt))
            ai_insights = response
    except Exception as e:
        logger.error(f"AI strength analysis error: {str(e)}")
    
    # Build comparison with previous
    comparison_with_previous = None
    if previous:
        comparison_with_previous = {
            "date": previous.get("date"),
            "metrics": {}
        }
        for metric in analyzed_metrics:
            if metric.previous_value is not None:
                comparison_with_previous["metrics"][metric.name] = {
                    "current": metric.value,
                    "previous": metric.previous_value,
                    "change_percent": metric.variation_from_previous
                }
    
    return StrengthAnalysisResult(
        athlete_id=athlete_id,
        assessment_date=latest.get("date", ""),
        previous_assessment_date=previous.get("date") if previous else None,
        metrics=analyzed_metrics,
        fatigue_index=fatigue_index,
        fatigue_alert=fatigue_alert,
        peripheral_fatigue_detected=peripheral_fatigue,
        overall_strength_classification=overall_class,
        ai_insights=ai_insights,
        recommendations=recommendations,
        historical_trend={
            "rsi_peak": rsi_peak,
            "rsi_current": rsi_current,
            "rsi_drop_percent": round(rsi_drop, 1),
            "peak_power_peak": peak_power_peak,
            "peak_power_current": peak_power_current,
            "power_drop_percent": round(power_drop, 1)
        },
        comparison_with_previous=comparison_with_previous
    )


