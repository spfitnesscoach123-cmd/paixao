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

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None


router = APIRouter(tags=["Jump Assessment"])

# ============= JUMP ASSESSMENT MODELS (CMJ, SL-CMJ) =============

import math

class JumpProtocol(str, Enum):
    CMJ = "cmj"  # Counter Movement Jump
    SL_CMJ_RIGHT = "sl_cmj_right"  # Single Leg CMJ - Right
    SL_CMJ_LEFT = "sl_cmj_left"  # Single Leg CMJ - Left

class JumpAssessmentCreate(BaseModel):
    athlete_id: str
    date: str
    protocol: JumpProtocol
    flight_time_ms: float  # Tempo de Voo em milissegundos
    contact_time_ms: float = 0  # Mantido para compatibilidade (sempre 0 para CMJ/SL-CMJ)
    jump_height_cm: Optional[float] = None  # Altura do salto (pode ser calculada)
    time_to_takeoff_ms: Optional[float] = None  # Tempo de decolagem (eccentric+concentric)
    notes: Optional[str] = None

class JumpAssessment(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    athlete_id: str
    coach_id: str
    date: str
    protocol: str
    flight_time_ms: float
    contact_time_ms: float
    jump_height_cm: float
    box_height_cm: Optional[float] = None
    time_to_takeoff_ms: Optional[float] = None  # Tempo de decolagem (CMJ/SL-CMJ)
    # Calculated metrics
    rsi: float  # Reactive Strength Index
    rsi_modified: Optional[float] = None  # RSI modificado
    peak_power_w: float  # Pico de Potência (Sayers Equation)
    peak_velocity_ms: float  # Pico de Velocidade
    relative_power_wkg: float  # Potência Relativa (W/kg)
    # Classification
    rsi_classification: str
    fatigue_status: str
    fatigue_percentage: float
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}

# RSI Reference Values (based on sports science literature)
# RSImod Classification (CMJ-specific)
# Based on: McMahon et al. (2018), Comfort et al. (2015), McGuigan (2017)
# NOTE: These are RSImod thresholds (CMJ), NOT classic RSI (drop jump).
# Classic RSI uses contact_time and ranges 1.0-3.0+.
# RSImod uses time-to-takeoff and ranges 0.1-1.2+.
RSI_REFERENCES = {
    "excellent": {"min": 1.00, "label_pt": "Excelente", "label_en": "Excellent"},
    "very_good": {"min": 0.80, "label_pt": "Muito Bom", "label_en": "Very Good"},
    "good": {"min": 0.60, "label_pt": "Bom", "label_en": "Good"},
    "moderate": {"min": 0.40, "label_pt": "Moderado", "label_en": "Moderate"},
    "low": {"min": 0.25, "label_pt": "Baixo", "label_en": "Low"},
    "very_low": {"min": 0, "label_pt": "Muito Baixo", "label_en": "Very Low"}
}

# Fatigue Index based on RSI variation (CNS Fatigue Detection)
FATIGUE_RSI_THRESHOLDS = {
    "green": {"min": -5, "max": 100, "status_pt": "Treino Normal", "status_en": "Normal Training", "color": "#10b981"},
    "yellow": {"min": -12, "max": -5.01, "status_pt": "Monitorar Volume/Carga de Sprints", "status_en": "Monitor Volume/Sprint Load", "color": "#f59e0b"},
    "red": {"min": -100, "max": -12.01, "status_pt": "Alto Risco de Lesão - Reduzir Carga", "status_en": "High Injury Risk - Reduce Load", "color": "#ef4444"}
}

def calculate_jump_height_from_flight_time(flight_time_ms: float) -> float:
    """
    Calculate jump height from flight time using kinematic equation
    h = (g * t²) / 8
    where t is flight time in seconds and g = 9.81 m/s²
    """
    flight_time_s = flight_time_ms / 1000
    g = 9.81
    height_m = (g * (flight_time_s ** 2)) / 8
    return round(height_m * 100, 2)  # Convert to cm

def calculate_rsi(jump_height_cm: float, time_to_takeoff_ms: float) -> float:
    """
    Calculate RSImod (Reactive Strength Index Modified)
    RSImod = Jump Height (m) / Time to Takeoff (s)
    
    Unica formula de RSI no sistema.
    """
    if time_to_takeoff_ms <= 0:
        return 0
    jump_height_m = jump_height_cm / 100
    time_to_takeoff_s = time_to_takeoff_ms / 1000
    rsi = jump_height_m / time_to_takeoff_s
    return round(rsi, 2)

def calculate_rsi_modified(flight_time_ms: float, time_to_takeoff_ms: float) -> float:
    """
    DEPRECATED: Mantido para compatibilidade.
    Usa mesma formula RSImod = jumpHeight / time_to_takeoff.
    """
    if time_to_takeoff_ms <= 0 or flight_time_ms <= 0:
        return 0
    jump_height_cm = calculate_jump_height_from_flight_time(flight_time_ms)
    return calculate_rsi(jump_height_cm, time_to_takeoff_ms)

def calculate_peak_power_sayers(jump_height_cm: float, body_mass_kg: float) -> float:
    """
    Calculate Peak Power using Sayers Equation (1999)
    PP (Watts) = 60.7 × jump height (cm) + 45.3 × body mass (kg) - 2055
    
    Reference: Sayers SP, Harackiewicz DV, Harman EA, Frykman PN, Rosenstein MT.
    Cross-validation of three jump power equations.
    Med Sci Sports Exerc. 1999;31(4):572-577.
    """
    peak_power = (60.7 * jump_height_cm) + (45.3 * body_mass_kg) - 2055
    return round(max(0, peak_power), 1)

def calculate_peak_velocity(jump_height_cm: float) -> float:
    """
    Calculate Peak Velocity using kinematic equation
    v = √(2 × g × h)
    """
    g = 9.81
    height_m = jump_height_cm / 100
    velocity = math.sqrt(2 * g * height_m)
    return round(velocity, 2)

def classify_rsi(rsi: float) -> str:
    """Classify RSImod based on CMJ-specific reference values (McMahon et al., 2018)"""
    for classification, values in RSI_REFERENCES.items():
        if rsi >= values["min"]:
            return classification
    return "very_low"

def get_fatigue_status(rsi_variation_percent: float) -> dict:
    """Get fatigue status based on RSI variation from baseline"""
    for status, thresholds in FATIGUE_RSI_THRESHOLDS.items():
        if thresholds["min"] <= rsi_variation_percent <= thresholds["max"]:
            return {
                "status": status,
                "status_pt": thresholds["status_pt"],
                "status_en": thresholds["status_en"],
                "color": thresholds["color"]
            }
    return {
        "status": "green",
        "status_pt": FATIGUE_RSI_THRESHOLDS["green"]["status_pt"],
        "status_en": FATIGUE_RSI_THRESHOLDS["green"]["status_en"],
        "color": FATIGUE_RSI_THRESHOLDS["green"]["color"]
    }

def calculate_z_score(current_value: float, historical_values: List[float]) -> float:
    """
    Calculate Z-Score comparing current value with historical mean
    Z = (X - μ) / σ
    """
    if len(historical_values) < 2:
        return 0
    mean = sum(historical_values) / len(historical_values)
    variance = sum((x - mean) ** 2 for x in historical_values) / len(historical_values)
    std_dev = math.sqrt(variance)
    if std_dev == 0:
        return 0
    z_score = (current_value - mean) / std_dev
    return round(z_score, 2)

def calculate_limb_asymmetry(right_value: float, left_value: float) -> dict:
    """
    Calculate limb asymmetry percentage
    Asymmetry > 10% is considered a Red Flag
    """
    if right_value == 0 and left_value == 0:
        return {"asymmetry_percent": 0, "dominant_leg": "equal", "red_flag": False}
    
    max_val = max(right_value, left_value)
    min_val = min(right_value, left_value)
    
    asymmetry = ((max_val - min_val) / max_val) * 100 if max_val > 0 else 0
    dominant = "right" if right_value > left_value else "left" if left_value > right_value else "equal"
    
    return {
        "asymmetry_percent": round(asymmetry, 1),
        "dominant_leg": dominant,
        "red_flag": asymmetry > 10
    }

# ============= JUMP ASSESSMENT ENDPOINTS =============

@router.get("/jump/protocols")
async def get_jump_protocols(lang: str = "pt"):
    """Get available jump assessment protocols"""
    protocols = {
        "cmj": {
            "id": "cmj",
            "name": "CMJ" if lang == "en" else "CMJ",
            "full_name": "Counter Movement Jump" if lang == "en" else "Counter Movement Jump",
            "description": "Standard bilateral countermovement jump test" if lang == "en" else "Teste de salto bilateral com contra-movimento padrão",
            "required_fields": ["flight_time_ms", "contact_time_ms"],
            "optional_fields": ["jump_height_cm"],
            "icon": "trending-up"
        },
        "sl_cmj_right": {
            "id": "sl_cmj_right",
            "name": "SL-CMJ (D)" if lang == "pt" else "SL-CMJ (R)",
            "full_name": "Single Leg CMJ - Right" if lang == "en" else "Single Leg CMJ - Direita",
            "description": "Single leg jump test for right leg" if lang == "en" else "Teste de salto unilateral para perna direita",
            "required_fields": ["flight_time_ms", "contact_time_ms"],
            "optional_fields": ["jump_height_cm"],
            "icon": "fitness"
        },
        "sl_cmj_left": {
            "id": "sl_cmj_left",
            "name": "SL-CMJ (E)" if lang == "pt" else "SL-CMJ (L)",
            "full_name": "Single Leg CMJ - Left" if lang == "en" else "Single Leg CMJ - Esquerda",
            "description": "Single leg jump test for left leg" if lang == "en" else "Teste de salto unilateral para perna esquerda",
            "required_fields": ["flight_time_ms", "contact_time_ms"],
            "optional_fields": ["jump_height_cm"],
            "icon": "fitness"
        },
    }
    return protocols

@router.post("/jump/assessment")
async def create_jump_assessment(
    data: JumpAssessmentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new jump assessment with automatic calculations"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get athlete weight for power calculations
    body_mass_kg = athlete.get("weight") or 70  # Default 70kg if not set or None
    
    # Calculate jump height if not provided
    jump_height_cm = data.jump_height_cm
    if not jump_height_cm or jump_height_cm <= 0:
        jump_height_cm = calculate_jump_height_from_flight_time(data.flight_time_ms)
    
    # Calculate RSImod = jumpHeight(m) / timeToTakeoff(s) — formula unica
    ttt = data.time_to_takeoff_ms or 0
    if ttt > 0:
        rsi = round((jump_height_cm / 100) / (ttt / 1000), 2)
        rsi_modified = rsi
    else:
        rsi = 0.0
        rsi_modified = 0.0
    
    # Calculate Peak Power (Sayers Equation)
    peak_power = calculate_peak_power_sayers(jump_height_cm, body_mass_kg)
    
    # Calculate Peak Velocity
    peak_velocity = calculate_peak_velocity(jump_height_cm)
    
    # Calculate Relative Power
    relative_power = round(peak_power / body_mass_kg, 2) if body_mass_kg > 0 else 0
    
    # Classify RSI
    rsi_classification = classify_rsi(rsi)
    
    # Get historical RSI for fatigue calculation
    historical_assessments = await db.jump_assessments.find({
        "athlete_id": data.athlete_id,
        "coach_id": current_user["_id"],
        "protocol": data.protocol.value
    }).sort("date", -1).to_list(30)
    
    # Calculate fatigue based on RSI variation from baseline (average of last 5)
    fatigue_percentage = 0
    fatigue_status = "green"
    
    if historical_assessments:
        historical_rsi = [a.get("rsi", 0) for a in historical_assessments[:5] if a.get("rsi", 0) > 0]
        if historical_rsi:
            baseline_rsi = sum(historical_rsi) / len(historical_rsi)
            if baseline_rsi > 0:
                fatigue_percentage = ((rsi - baseline_rsi) / baseline_rsi) * 100
    
    fatigue_info = get_fatigue_status(fatigue_percentage)
    fatigue_status = fatigue_info["status"]
    
    # Create assessment record
    assessment = JumpAssessment(
        athlete_id=data.athlete_id,
        coach_id=current_user["_id"],
        date=data.date,
        protocol=data.protocol.value,
        flight_time_ms=data.flight_time_ms,
        contact_time_ms=data.contact_time_ms,
        jump_height_cm=jump_height_cm,
        time_to_takeoff_ms=data.time_to_takeoff_ms,
        rsi=rsi,
        rsi_modified=rsi_modified,
        peak_power_w=peak_power,
        peak_velocity_ms=peak_velocity,
        relative_power_wkg=relative_power,
        rsi_classification=rsi_classification,
        fatigue_status=fatigue_status,
        fatigue_percentage=round(fatigue_percentage, 1),
        notes=data.notes
    )
    
    result = await db.jump_assessments.insert_one(assessment.model_dump(by_alias=True, exclude=["id"]))
    assessment.id = str(result.inserted_id)
    
    return {
        "assessment": assessment.model_dump(by_alias=True),
        "calculations": {
            "jump_height_cm": jump_height_cm,
            "rsi": rsi,
            "rsi_modified": rsi_modified,
            "peak_power_w": peak_power,
            "peak_velocity_ms": peak_velocity,
            "relative_power_wkg": relative_power,
            "rsi_classification": rsi_classification,
            "fatigue_status": fatigue_status,
            "fatigue_percentage": round(fatigue_percentage, 1)
        }
    }

@router.get("/jump/assessments/{athlete_id}")
async def get_jump_assessments(
    athlete_id: str,
    protocol: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all jump assessments for an athlete"""
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    query = {
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }
    if protocol:
        query["protocol"] = protocol
    
    assessments = await db.jump_assessments.find(query).sort("date", -1).to_list(100)
    
    for a in assessments:
        a["_id"] = str(a["_id"])
        # Re-classify RSImod using current CMJ-specific thresholds
        # (fixes legacy assessments stored with old drop-jump thresholds)
        if a.get("rsi") is not None:
            a["rsi_classification"] = classify_rsi(a["rsi"])
    
    return assessments

@router.get("/jump/analysis/{athlete_id}")
async def get_jump_analysis(
    athlete_id: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """
    Complete jump analysis with RSI, fatigue index, asymmetry, power/velocity insights, and Z-score
    """
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    body_mass_kg = athlete.get("weight", 70)
    
    # Get all jump assessments
    all_assessments = await db.jump_assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(100)
    
    if not all_assessments:
        raise HTTPException(
            status_code=400, 
            detail="No jump assessment data available" if lang == "en" else "Nenhuma avaliação de salto disponível"
        )
    
    # Separate by protocol
    cmj_assessments = [a for a in all_assessments if a.get("protocol") == "cmj"]
    sl_right_assessments = [a for a in all_assessments if a.get("protocol") == "sl_cmj_right"]
    sl_left_assessments = [a for a in all_assessments if a.get("protocol") == "sl_cmj_left"]
    
    # Get latest assessment for each protocol
    latest_cmj = cmj_assessments[0] if cmj_assessments else None
    latest_sl_right = sl_right_assessments[0] if sl_right_assessments else None
    latest_sl_left = sl_left_assessments[0] if sl_left_assessments else None
    
    # Build analysis response
    analysis = {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name"),
        "body_mass_kg": body_mass_kg,
        "analysis_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "protocols": {},
        "asymmetry": None,
        "fatigue_analysis": None,
        "power_velocity_insights": None,
        "z_score": None,
        "ai_feedback": None,
        "recommendations": []
    }
    
    # Process CMJ data
    if latest_cmj:
        historical_rsi = [a.get("rsi", 0) for a in cmj_assessments if a.get("rsi", 0) > 0]
        historical_heights = [a.get("jump_height_cm", 0) for a in cmj_assessments if a.get("jump_height_cm", 0) > 0]
        
        baseline_rsi = sum(historical_rsi[:5]) / len(historical_rsi[:5]) if len(historical_rsi) >= 5 else (historical_rsi[0] if historical_rsi else latest_cmj.get("rsi", 0))
        current_rsi = latest_cmj.get("rsi", 0)
        rsi_variation = ((current_rsi - baseline_rsi) / baseline_rsi * 100) if baseline_rsi > 0 else 0
        
        fatigue_info = get_fatigue_status(rsi_variation)
        
        # Calculate Z-Score for jump height
        z_score_height = calculate_z_score(latest_cmj.get("jump_height_cm", 0), historical_heights)
        
        analysis["protocols"]["cmj"] = {
            "latest": {
                "date": latest_cmj.get("date"),
                "jump_height_cm": latest_cmj.get("jump_height_cm"),
                "flight_time_ms": latest_cmj.get("flight_time_ms"),
                "contact_time_ms": latest_cmj.get("contact_time_ms"),
                "time_to_takeoff_ms": latest_cmj.get("time_to_takeoff_ms"),
                "rsi": latest_cmj.get("rsi"),
                "rsi_modified": latest_cmj.get("rsi_modified"),
                "rsi_classification": classify_rsi(latest_cmj.get("rsi", 0)),
                "peak_power_w": latest_cmj.get("peak_power_w"),
                "peak_velocity_ms": latest_cmj.get("peak_velocity_ms"),
                "relative_power_wkg": latest_cmj.get("relative_power_wkg")
            },
            "baseline_rsi": round(baseline_rsi, 2),
            "rsi_variation_percent": round(rsi_variation, 1),
            "fatigue_status": fatigue_info,
            "z_score_height": z_score_height,
            "history": [
                {
                    "date": a.get("date"),
                    "rsi": a.get("rsi"),
                    "jump_height_cm": a.get("jump_height_cm"),
                    "peak_power_w": a.get("peak_power_w")
                } for a in cmj_assessments[:10]
            ]
        }
        
        # Set main fatigue analysis from CMJ
        analysis["fatigue_analysis"] = {
            "status": fatigue_info["status"],
            "status_label": fatigue_info["status_pt"] if lang == "pt" else fatigue_info["status_en"],
            "color": fatigue_info["color"],
            "rsi_variation_percent": round(rsi_variation, 1),
            "baseline_rsi": round(baseline_rsi, 2),
            "current_rsi": round(current_rsi, 2),
            "interpretation": get_fatigue_interpretation(rsi_variation, lang)
        }
        
        analysis["z_score"] = {
            "jump_height": z_score_height,
            "interpretation": get_z_score_interpretation(z_score_height, lang)
        }
    
    # Process SL-CMJ data for Asymmetry
    if latest_sl_right and latest_sl_left:
        right_rsi = latest_sl_right.get("rsi", 0)
        left_rsi = latest_sl_left.get("rsi", 0)
        right_height = latest_sl_right.get("jump_height_cm", 0)
        left_height = latest_sl_left.get("jump_height_cm", 0)
        
        asymmetry_rsi = calculate_limb_asymmetry(right_rsi, left_rsi)
        asymmetry_height = calculate_limb_asymmetry(right_height, left_height)
        
        analysis["protocols"]["sl_cmj"] = {
            "right": {
                "date": latest_sl_right.get("date"),
                "jump_height_cm": right_height,
                "rsi": right_rsi,
                "rsi_modified": latest_sl_right.get("rsi_modified"),
                "time_to_takeoff_ms": latest_sl_right.get("time_to_takeoff_ms"),
                "peak_power_w": latest_sl_right.get("peak_power_w")
            },
            "left": {
                "date": latest_sl_left.get("date"),
                "jump_height_cm": left_height,
                "rsi": left_rsi,
                "rsi_modified": latest_sl_left.get("rsi_modified"),
                "time_to_takeoff_ms": latest_sl_left.get("time_to_takeoff_ms"),
                "peak_power_w": latest_sl_left.get("peak_power_w")
            }
        }
        
        analysis["asymmetry"] = {
            "rsi": asymmetry_rsi,
            "jump_height": asymmetry_height,
            "red_flag": asymmetry_rsi["red_flag"] or asymmetry_height["red_flag"],
            "interpretation": get_asymmetry_interpretation(asymmetry_rsi, lang)
        }
    
    # Power-Velocity Insights (using CMJ data)
    primary_assessment = latest_cmj
    if primary_assessment:
        peak_power = primary_assessment.get("peak_power_w", 0)
        peak_velocity = primary_assessment.get("peak_velocity_ms", 0)
        relative_power = primary_assessment.get("relative_power_wkg", 0)
        
        # Compare with team/population averages (simplified)
        # These would ideally come from actual team data
        avg_power = 3000  # Watts
        avg_velocity = 2.8  # m/s
        
        power_vs_avg = ((peak_power - avg_power) / avg_power * 100) if avg_power > 0 else 0
        velocity_vs_avg = ((peak_velocity - avg_velocity) / avg_velocity * 100) if avg_velocity > 0 else 0
        
        analysis["power_velocity_insights"] = {
            "peak_power_w": peak_power,
            "peak_velocity_ms": peak_velocity,
            "relative_power_wkg": relative_power,
            "power_vs_average_percent": round(power_vs_avg, 1),
            "velocity_vs_average_percent": round(velocity_vs_avg, 1),
            "profile": get_power_velocity_profile(power_vs_avg, velocity_vs_avg, lang)
        }
    
    # Generate AI-powered feedback
    try:
        ai_feedback = await generate_jump_ai_feedback(analysis, athlete, lang)
        analysis["ai_feedback"] = ai_feedback
    except Exception as e:
        logging.error(f"AI feedback generation error: {e}")
        analysis["ai_feedback"] = None
    
    # Generate recommendations
    analysis["recommendations"] = generate_jump_recommendations(analysis, lang)
    
    return analysis

def get_fatigue_interpretation(rsi_variation: float, lang: str) -> str:
    """Get interpretation text for fatigue based on RSI variation"""
    if rsi_variation >= -5:
        return "Sistema nervoso central recuperado. Treino normal permitido." if lang == "pt" else "Central nervous system recovered. Normal training permitted."
    elif rsi_variation >= -12:
        return "Possível fadiga do SNC detectada. Monitorar volume de sprints e exercícios de alta velocidade." if lang == "pt" else "Possible CNS fatigue detected. Monitor sprint volume and high-speed exercises."
    else:
        return "⚠️ Fadiga significativa do SNC. Alto risco de lesão. Reduzir carga ou individualizar treino." if lang == "pt" else "⚠️ Significant CNS fatigue. High injury risk. Reduce load or individualize training."

def get_z_score_interpretation(z_score: float, lang: str) -> str:
    """Get interpretation text for Z-Score"""
    if z_score >= 1.5:
        return "Performance significativamente acima da média histórica!" if lang == "pt" else "Performance significantly above historical average!"
    elif z_score >= 0.5:
        return "Performance acima da média histórica." if lang == "pt" else "Performance above historical average."
    elif z_score >= -0.5:
        return "Performance dentro da média histórica." if lang == "pt" else "Performance within historical average."
    elif z_score >= -1.5:
        return "Performance abaixo da média histórica. Monitorar recuperação." if lang == "pt" else "Performance below historical average. Monitor recovery."
    else:
        return "⚠️ Performance significativamente abaixo da média. Investigar causas." if lang == "pt" else "⚠️ Performance significantly below average. Investigate causes."

def get_asymmetry_interpretation(asymmetry: dict, lang: str) -> str:
    """Get interpretation text for limb asymmetry"""
    if not asymmetry["red_flag"]:
        return "Simetria entre membros dentro dos limites aceitáveis." if lang == "pt" else "Limb symmetry within acceptable limits."
    else:
        dominant = "direita" if asymmetry["dominant_leg"] == "right" else "esquerda"
        dominant_en = asymmetry["dominant_leg"]
        if lang == "pt":
            return f"🚩 RED FLAG: Assimetria de {asymmetry['asymmetry_percent']:.1f}% detectada. Perna {dominant} dominante. Risco aumentado de lesão. Recomenda-se trabalho de correção."
        else:
            return f"🚩 RED FLAG: {asymmetry['asymmetry_percent']:.1f}% asymmetry detected. {dominant_en.capitalize()} leg dominant. Increased injury risk. Corrective work recommended."

def get_power_velocity_profile(power_vs_avg: float, velocity_vs_avg: float, lang: str) -> dict:
    """Determine training profile based on power-velocity relationship"""
    if power_vs_avg < -10 and velocity_vs_avg >= 0:
        # High velocity, low power -> needs max strength training
        return {
            "type": "velocity_dominant",
            "label": "Dominante em Velocidade" if lang == "pt" else "Velocity Dominant",
            "recommendation": "Priorizar treino de Força Máxima (cargas >85% 1RM)" if lang == "pt" else "Prioritize Maximum Strength training (loads >85% 1RM)",
            "color": "#3b82f6"
        }
    elif power_vs_avg >= 0 and velocity_vs_avg < -10:
        # High power, low velocity -> needs power/velocity training
        return {
            "type": "power_dominant",
            "label": "Dominante em Potência" if lang == "pt" else "Power Dominant",
            "recommendation": "Priorizar treino de Potência/Velocidade (Pliométricos, Sprints)" if lang == "pt" else "Prioritize Power/Velocity training (Plyometrics, Sprints)",
            "color": "#f59e0b"
        }
    elif power_vs_avg >= 0 and velocity_vs_avg >= 0:
        # Both high -> balanced/elite
        return {
            "type": "balanced",
            "label": "Perfil Equilibrado" if lang == "pt" else "Balanced Profile",
            "recommendation": "Manter equilíbrio entre força, potência e velocidade" if lang == "pt" else "Maintain balance between strength, power and velocity",
            "color": "#10b981"
        }
    else:
        # Both low -> general improvement needed
        return {
            "type": "development",
            "label": "Em Desenvolvimento" if lang == "pt" else "In Development",
            "recommendation": "Programa completo de força e condicionamento recomendado" if lang == "pt" else "Complete strength and conditioning program recommended",
            "color": "#6366f1"
        }

async def generate_jump_ai_feedback(analysis: dict, athlete: dict, lang: str) -> str:
    """Generate AI-powered scientific feedback based on jump analysis"""
    try:
        system_message = """You are an expert sports scientist specializing in neuromuscular assessment and jump testing.
        You provide concise, scientific analysis based on sports science literature.
        Use proper terminology and be direct with recommendations."""
        
        llm_client = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            system_message=system_message,
            session_id=f"jump_analysis_{analysis['athlete_id']}_{datetime.utcnow().strftime('%Y%m%d')}"
        )
        llm_client = llm_client.with_model("openai", "gpt-4o")
        
        # Build context for AI
        context = f"""
        Analyze the following jump test data and provide scientific feedback in {"Portuguese" if lang == "pt" else "English"}.
        
        Athlete: {athlete.get('name')}
        Position: {athlete.get('position', 'N/A')}
        Body Mass: {analysis.get('body_mass_kg', 70)} kg
        
        CMJ Data: {analysis.get('protocols', {}).get('cmj', {}).get('latest', 'No data')}
        RSI Classification: {analysis.get('protocols', {}).get('cmj', {}).get('latest', {}).get('rsi_classification', 'N/A')}
        RSI Baseline: {analysis.get('protocols', {}).get('cmj', {}).get('baseline_rsi', 'N/A')}
        RSI Variation: {analysis.get('protocols', {}).get('cmj', {}).get('rsi_variation_percent', 'N/A')}%
        
        Fatigue Status: {analysis.get('fatigue_analysis', {}).get('status_label', 'N/A')}
        
        Asymmetry: {analysis.get('asymmetry', 'Not assessed')}
        
        Power-Velocity Profile: {analysis.get('power_velocity_insights', {}).get('profile', {}).get('label', 'N/A')}
        Peak Power: {analysis.get('power_velocity_insights', {}).get('peak_power_w', 'N/A')} W
        Relative Power: {analysis.get('power_velocity_insights', {}).get('relative_power_wkg', 'N/A')} W/kg
        
        Z-Score (Jump Height): {analysis.get('z_score', {}).get('jump_height', 'N/A')}
        
        Based on this data and current sports science literature:
        1. Provide a brief assessment of the athlete's neuromuscular status
        2. If RSI is low (<1.5), explain why explosive exercises, COD, plyometrics with concentric emphasis, sprints should be limited
        3. If fatigue is detected (yellow or red), provide specific recovery recommendations
        4. If asymmetry is detected, explain the injury risk implications
        5. Based on the power-velocity profile, suggest specific training focus
        
        Be concise but scientific. Use proper terminology. Keep response under 300 words.
        """
        
        response = await llm_client.send_message(UserMessage(text=context))
        return response
        
    except Exception as e:
        logging.error(f"AI feedback generation error: {e}")
        return None

def generate_jump_recommendations(analysis: dict, lang: str) -> List[str]:
    """Generate actionable recommendations based on jump analysis"""
    recommendations = []
    
    # RSI-based recommendations
    cmj_data = analysis.get("protocols", {}).get("cmj", {})
    if cmj_data:
        latest = cmj_data.get("latest", {})
        rsi = latest.get("rsi", 0)
        rsi_class = classify_rsi(rsi)
        
        if rsi < 0.40:
            if lang == "pt":
                recommendations.append("RSImod muito baixo (<0.40). Focar em desenvolvimento de forca base e potencia. Limitar exercicios explosivos de alta intensidade.")
            else:
                recommendations.append("Very low RSImod (<0.40). Focus on base strength and power development. Limit high-intensity explosive exercises.")
        elif rsi < 0.60:
            if lang == "pt":
                recommendations.append("RSImod moderado. Continuar desenvolvendo capacidade de producao rapida de forca com pliometricos progressivos.")
            else:
                recommendations.append("Moderate RSImod. Continue developing rapid force production capacity with progressive plyometrics.")
    
    # Fatigue-based recommendations
    fatigue = analysis.get("fatigue_analysis", {})
    if fatigue:
        status = fatigue.get("status", "green")
        if status == "red":
            if lang == "pt":
                recommendations.append("🔴 ALERTA: Fadiga do SNC detectada (variação >13%). Reduzir carga de treino imediatamente. Priorizar sono e recuperação. Considerar treino individualizado.")
            else:
                recommendations.append("🔴 ALERT: CNS fatigue detected (>13% variation). Reduce training load immediately. Prioritize sleep and recovery. Consider individualized training.")
        elif status == "yellow":
            if lang == "pt":
                recommendations.append("🟡 MONITORAR: Sinais de fadiga. Reduzir volume de sprints e exercícios de alta velocidade nos próximos dias.")
            else:
                recommendations.append("🟡 MONITOR: Fatigue signs detected. Reduce sprint volume and high-speed exercises in coming days.")
    
    # Asymmetry-based recommendations
    asymmetry = analysis.get("asymmetry", {})
    if asymmetry and asymmetry.get("red_flag"):
        dominant = asymmetry.get("rsi", {}).get("dominant_leg", "")
        percent = asymmetry.get("rsi", {}).get("asymmetry_percent", 0)
        if lang == "pt":
            recommendations.append(f"🚩 Assimetria significativa ({percent:.1f}%) detectada. Incluir exercícios unilaterais corretivos focando no membro não-dominante.")
        else:
            recommendations.append(f"🚩 Significant asymmetry ({percent:.1f}%) detected. Include corrective unilateral exercises focusing on non-dominant limb.")
    
    # Power-velocity profile recommendations
    pv_profile = analysis.get("power_velocity_insights", {}).get("profile", {})
    if pv_profile:
        rec = pv_profile.get("recommendation", "")
        if rec:
            recommendations.append(f"💪 {rec}")
    
    # Z-score recommendations
    z_score = analysis.get("z_score", {})
    if z_score and z_score.get("jump_height", 0) < -1.5:
        if lang == "pt":
            recommendations.append("📉 Performance significativamente abaixo da média histórica. Investigar: qualidade do sono, estresse, nutrição, sobrecarga de treino.")
        else:
            recommendations.append("📉 Performance significantly below historical average. Investigate: sleep quality, stress, nutrition, training overload.")
    
    if not recommendations:
        if lang == "pt":
            recommendations.append("✅ Atleta em boas condições. Continuar com protocolo de treino atual.")
        else:
            recommendations.append("✅ Athlete in good condition. Continue with current training protocol.")
    
    return recommendations

@router.get("/jump/protocol-analysis/{athlete_id}")
async def get_jump_protocol_analysis(
    athlete_id: str,
    protocol: str = "cmj",
    date: Optional[str] = None,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """
    Protocol-specific jump analysis with scientific Fatigue Index.
    Each protocol is analyzed independently — no cross-protocol mixing.
    """
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    body_mass_kg = athlete.get("weight") or 70

    # Fetch all assessments for this protocol only
    all_assessments = await db.jump_assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "protocol": protocol
    }).sort("date", -1).to_list(200)

    # Available dates (unique, sorted desc)
    available_dates = sorted(
        list({a.get("date") for a in all_assessments if a.get("date")}),
        reverse=True
    )

    if not all_assessments:
        return {
            "athlete_id": athlete_id,
            "athlete_name": athlete.get("name"),
            "body_mass_kg": body_mass_kg,
            "protocol": protocol,
            "available_dates": [],
            "selected_date": None,
            "metrics": None,
            "fatigue_index": None,
            "history": [],
            "power_velocity_insights": None,
            "z_score": None,
            "recommendations": [],
            "has_data": False
        }

    # Select assessment by date or default to latest
    selected = None
    if date:
        selected = next((a for a in all_assessments if a.get("date") == date), None)
    if not selected:
        selected = all_assessments[0]

    selected_date = selected.get("date")

    # Determine metric label — RSImod e o padrao unico
    metric_label = "RSImod"

    current_metric_value = selected.get("rsi", 0)

    # Build metrics object
    metrics = {
        "jump_height_cm": selected.get("jump_height_cm"),
        "flight_time_ms": selected.get("flight_time_ms"),
        "contact_time_ms": selected.get("contact_time_ms"),
        "time_to_takeoff_ms": selected.get("time_to_takeoff_ms"),
        "rsi": selected.get("rsi"),
        "rsi_modified": selected.get("rsi_modified"),
        "rsi_classification": classify_rsi(selected.get("rsi", 0)),
        "peak_power_w": selected.get("peak_power_w"),
        "peak_velocity_ms": selected.get("peak_velocity_ms"),
        "relative_power_wkg": selected.get("relative_power_wkg"),
    }

    # === SCIENTIFIC FATIGUE INDEX ===
    # Baseline = average of top 3 best metric values in last 90 days
    from datetime import timedelta
    cutoff_date_str = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
    recent_assessments = [
        a for a in all_assessments
        if a.get("date", "") >= cutoff_date_str and a.get("rsi", 0) > 0
    ]
    
    metric_values = [a.get("rsi", 0) for a in recent_assessments if a.get("rsi", 0) > 0]
    
    fatigue_index = None
    if metric_values:
        # Top 3 best values (or all if < 3)
        sorted_values = sorted(metric_values, reverse=True)
        top_n = sorted_values[:3] if len(sorted_values) >= 3 else sorted_values
        baseline = sum(top_n) / len(top_n)
        
        if baseline > 0:
            fi_value = ((baseline - current_metric_value) / baseline) * 100
            fi_value = round(fi_value, 1)
            
            # Classification per spec
            if fi_value < 0:
                fi_class = "above_baseline"
                fi_label = "Performance Acima do Baseline" if lang == "pt" else "Performance Above Baseline"
                fi_color = "#22c55e"
            elif fi_value <= 5:
                fi_class = "normal"
                fi_label = "Variação Normal" if lang == "pt" else "Normal Variation"
                fi_color = "#86efac"
            elif fi_value <= 10:
                fi_class = "mild"
                fi_label = "Fadiga Leve" if lang == "pt" else "Mild Fatigue"
                fi_color = "#fbbf24"
            elif fi_value <= 15:
                fi_class = "moderate"
                fi_label = "Fadiga Moderada" if lang == "pt" else "Moderate Fatigue"
                fi_color = "#f97316"
            elif fi_value <= 20:
                fi_class = "high"
                fi_label = "Fadiga Alta" if lang == "pt" else "High Fatigue"
                fi_color = "#f87171"
            else:
                fi_class = "severe"
                fi_label = "Fadiga Severa" if lang == "pt" else "Severe Fatigue"
                fi_color = "#ef4444"
            
            fatigue_index = {
                "value": fi_value,
                "baseline": round(baseline, 2),
                "current": round(current_metric_value, 2),
                "metric_label": metric_label,
                "classification": fi_class,
                "label": fi_label,
                "color": fi_color,
            }

    # History for evolution chart
    history = [
        {
            "date": a.get("date"),
            "rsi": a.get("rsi"),
            "jump_height_cm": a.get("jump_height_cm"),
            "peak_power_w": a.get("peak_power_w"),
        }
        for a in all_assessments[:20]
    ]

    # Z-Score
    historical_heights = [a.get("jump_height_cm", 0) for a in all_assessments if a.get("jump_height_cm", 0) > 0]
    z_score_val = calculate_z_score(selected.get("jump_height_cm", 0), historical_heights)
    z_score = {
        "jump_height": z_score_val,
        "interpretation": get_z_score_interpretation(z_score_val, lang)
    } if len(historical_heights) >= 2 else None

    # Power-Velocity Insights
    peak_power = selected.get("peak_power_w", 0)
    peak_velocity = selected.get("peak_velocity_ms", 0)
    relative_power = selected.get("relative_power_wkg", 0)
    avg_power = 3000
    avg_velocity = 2.8
    power_vs_avg = ((peak_power - avg_power) / avg_power * 100) if avg_power > 0 else 0
    velocity_vs_avg = ((peak_velocity - avg_velocity) / avg_velocity * 100) if avg_velocity > 0 else 0

    power_velocity_insights = {
        "peak_power_w": peak_power,
        "peak_velocity_ms": peak_velocity,
        "relative_power_wkg": relative_power,
        "power_vs_average_percent": round(power_vs_avg, 1),
        "velocity_vs_average_percent": round(velocity_vs_avg, 1),
        "profile": get_power_velocity_profile(power_vs_avg, velocity_vs_avg, lang)
    } if peak_power > 0 else None

    # SL-CMJ Asymmetry: fetch contralateral leg for comparison
    asymmetry = None
    if protocol in ("sl_cmj_left", "sl_cmj_right"):
        contra_protocol = "sl_cmj_right" if protocol == "sl_cmj_left" else "sl_cmj_left"
        contra_assessment = await db.jump_assessments.find_one(
            {"athlete_id": athlete_id, "coach_id": current_user["_id"], "protocol": contra_protocol, "date": selected_date},
            {"_id": 0}
        )
        if not contra_assessment:
            # Try latest from contralateral
            contra_assessment = await db.jump_assessments.find_one(
                {"athlete_id": athlete_id, "coach_id": current_user["_id"], "protocol": contra_protocol},
                {"_id": 0},
                sort=[("date", -1)]
            )
        if contra_assessment:
            current_rsi = current_metric_value
            contra_rsi = contra_assessment.get("rsi", 0)
            current_height = selected.get("jump_height_cm", 0)
            contra_height = contra_assessment.get("jump_height_cm", 0)
            
            max_rsi = max(current_rsi, contra_rsi) if max(current_rsi, contra_rsi) > 0 else 1
            max_height = max(current_height, contra_height) if max(current_height, contra_height) > 0 else 1
            
            rsi_asym = abs(current_rsi - contra_rsi) / max_rsi * 100
            height_asym = abs(current_height - contra_height) / max_height * 100
            
            left_rsi = current_rsi if "left" in protocol else contra_rsi
            right_rsi = contra_rsi if "left" in protocol else current_rsi
            left_height = current_height if "left" in protocol else contra_height
            right_height = contra_height if "left" in protocol else current_height
            
            asymmetry = {
                "rsi_asymmetry_percent": round(rsi_asym, 1),
                "height_asymmetry_percent": round(height_asym, 1),
                "left_rsi": round(left_rsi, 2),
                "right_rsi": round(right_rsi, 2),
                "left_height": round(left_height, 1),
                "right_height": round(right_height, 1),
                "dominant_leg": "right" if right_rsi > left_rsi else "left",
                "red_flag": rsi_asym > 10,
                "contra_date": contra_assessment.get("date"),
            }

    # Recommendations - alias data under "cmj" key so generate_jump_recommendations works
    rec_analysis = {
        "protocols": {"cmj": {"latest": metrics}},
        "fatigue_analysis": {
            "status": "red" if fatigue_index and fatigue_index["classification"] in ("severe", "high") else
                     "yellow" if fatigue_index and fatigue_index["classification"] in ("moderate", "mild") else "green",
            "status_label": fatigue_index["label"] if fatigue_index else "",
        } if fatigue_index else None,
        "power_velocity_insights": power_velocity_insights,
        "z_score": z_score,
    }
    recommendations = generate_jump_recommendations(rec_analysis, lang)

    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name"),
        "body_mass_kg": body_mass_kg,
        "protocol": protocol,
        "available_dates": available_dates,
        "selected_date": selected_date,
        "selected_assessment_id": str(selected.get("_id", "")) if selected.get("_id") else None,
        "metrics": metrics,
        "fatigue_index": fatigue_index,
        "history": history,
        "power_velocity_insights": power_velocity_insights,
        "z_score": z_score,
        "asymmetry": asymmetry,
        "recommendations": recommendations,
        "has_data": True
    }


@router.delete("/jump/assessment/{assessment_id}")
async def delete_jump_assessment(
    assessment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a jump assessment"""
    result = await db.jump_assessments.delete_one({
        "_id": ObjectId(assessment_id),
        "coach_id": current_user["_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    return {"message": "Assessment deleted successfully"}

