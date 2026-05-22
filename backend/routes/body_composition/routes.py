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


router = APIRouter(tags=["Body Composition"])

# ============= PHYSICAL ASSESSMENT ROUTES =============

@router.post("/assessments", response_model=PhysicalAssessment)
async def create_assessment(
    assessment_data: PhysicalAssessmentCreate,
    current_user: dict = Depends(get_current_user)
):
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(assessment_data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    assessment = PhysicalAssessment(
        coach_id=current_user["_id"],
        **assessment_data.model_dump()
    )
    
    result = await db.assessments.insert_one(assessment.model_dump(by_alias=True, exclude=["id"]))
    assessment.id = str(result.inserted_id)
    return assessment

@router.get("/assessments/athlete/{athlete_id}", response_model=List[PhysicalAssessment])
async def get_athlete_assessments(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    assessments = await db.assessments.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(1000)
    
    for record in assessments:
        record["_id"] = str(record["_id"])
    return [PhysicalAssessment(**record) for record in assessments]

# ============= BODY COMPOSITION CALCULATIONS =============

def calculate_body_density_pollock_jackson_7(gender: str, age: int, skinfolds: dict) -> float:
    """
    Pollock & Jackson 7 Skinfold Protocol
    Males: chest, midaxillary, triceps, subscapular, abdominal, suprailiac, thigh
    Females: triceps, thigh, suprailiac, abdominal, chest, midaxillary, subscapular
    """
    sum_7 = (
        skinfolds.get('chest', 0) +
        skinfolds.get('midaxillary', 0) +
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('abdominal', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('thigh', 0)
    )
    
    if gender.lower() == 'male':
        # Jackson & Pollock (1978) equation for men
        density = 1.112 - (0.00043499 * sum_7) + (0.00000055 * sum_7**2) - (0.00028826 * age)
    else:
        # Jackson, Pollock & Ward (1980) equation for women
        density = 1.097 - (0.00046971 * sum_7) + (0.00000056 * sum_7**2) - (0.00012828 * age)
    
    return density

def calculate_body_density_pollock_jackson_9(gender: str, age: int, skinfolds: dict) -> float:
    """
    Pollock & Jackson 9 Skinfold Protocol (more comprehensive)
    All 9 sites: chest, midaxillary, triceps, subscapular, abdominal, suprailiac, thigh, biceps, calf
    """
    sum_9 = (
        skinfolds.get('chest', 0) +
        skinfolds.get('midaxillary', 0) +
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('abdominal', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('thigh', 0) +
        skinfolds.get('biceps', 0) +
        skinfolds.get('calf', 0)
    )
    
    if gender.lower() == 'male':
        # Extended equation for 9 sites - males
        density = 1.1125 - (0.0004 * sum_9) + (0.0000005 * sum_9**2) - (0.00029 * age)
    else:
        # Extended equation for 9 sites - females
        density = 1.099 - (0.00043 * sum_9) + (0.00000054 * sum_9**2) - (0.00013 * age)
    
    return density


def calculate_body_density_jackson_pollock_3(gender: str, age: int, skinfolds: dict) -> float:
    """Jackson & Pollock 3 Skinfold Protocol. Males: chest, abdominal, thigh. Females: triceps, suprailiac, thigh."""
    if gender.lower() == 'male':
        s = skinfolds.get('chest', 0) + skinfolds.get('abdominal', 0) + skinfolds.get('thigh', 0)
        return 1.10938 - 0.0008267 * s + 0.0000016 * s**2 - 0.0002574 * age
    else:
        s = skinfolds.get('triceps', 0) + skinfolds.get('suprailiac', 0) + skinfolds.get('thigh', 0)
        return 1.0994921 - 0.0009929 * s + 0.0000023 * s**2 - 0.0001392 * age

def calculate_body_density_durnin_womersley(gender: str, age: int, skinfolds: dict) -> float:
    """Durnin & Womersley 4 Skinfold Protocol (1974). Sites: biceps, triceps, subscapular, suprailiac."""
    import math
    s = skinfolds.get('biceps', 0) + skinfolds.get('triceps', 0) + skinfolds.get('subscapular', 0) + skinfolds.get('suprailiac', 0)
    log_s = math.log10(max(s, 1))
    if gender.lower() == 'male':
        if age < 20: return 1.1620 - 0.0630 * log_s
        elif age < 30: return 1.1631 - 0.0632 * log_s
        elif age < 40: return 1.1422 - 0.0544 * log_s
        elif age < 50: return 1.1620 - 0.0700 * log_s
        else: return 1.1715 - 0.0779 * log_s
    else:
        if age < 20: return 1.1549 - 0.0678 * log_s
        elif age < 30: return 1.1599 - 0.0717 * log_s
        elif age < 40: return 1.1423 - 0.0632 * log_s
        elif age < 50: return 1.1333 - 0.0612 * log_s
        else: return 1.1339 - 0.0645 * log_s


def calculate_body_density_guedes(gender: str, skinfolds: dict) -> float:
    """
    Guedes Protocol (1985) - Brazilian validated protocol
    Males: triceps, suprailiac, abdominal
    Females: triceps, suprailiac, thigh
    
    Uses log10 transformation for better accuracy
    Reference: Guedes, D.P. (1985). Estudo da gordura corporal através da mensuração dos valores de densidade corporal e da espessura de dobras cutâneas em universitários.
    """
    import math
    
    if gender.lower() == 'male':
        sum_3 = (
            skinfolds.get('triceps', 0) +
            skinfolds.get('suprailiac', 0) +
            skinfolds.get('abdominal', 0)
        )
        # Guedes male equation using log transformation
        # BD = 1.1714 - 0.0671 * log10(sum_3)
        if sum_3 > 0:
            density = 1.1714 - (0.0671 * math.log10(sum_3))
        else:
            density = 1.0
    else:
        sum_3 = (
            skinfolds.get('triceps', 0) +
            skinfolds.get('suprailiac', 0) +
            skinfolds.get('thigh', 0)
        )
        # Guedes female equation using log transformation
        # BD = 1.1665 - 0.0706 * log10(sum_3)
        if sum_3 > 0:
            density = 1.1665 - (0.0706 * math.log10(sum_3))
        else:
            density = 1.0
    
    return density

def calculate_body_fat_faulkner(skinfolds: dict) -> float:
    """
    Faulkner 4 Skinfold Protocol (1968)
    Used for athletes, especially swimmers
    Sites: triceps, subscapular, suprailiac, abdominal
    """
    sum_4 = (
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('abdominal', 0)
    )
    
    # Faulkner equation (direct %BF calculation)
    body_fat = (sum_4 * 0.153) + 5.783
    return body_fat

def siri_equation(density: float) -> float:
    """Convert body density to body fat percentage using Siri equation (1961)"""
    return (495 / density) - 450

def calculate_bmi(weight_kg: float, height_cm: float) -> tuple:
    """Calculate BMI and return classification"""
    height_m = height_cm / 100
    bmi = weight_kg / (height_m ** 2)
    
    if bmi < 18.5:
        classification = "underweight"
    elif bmi < 25:
        classification = "normal"
    elif bmi < 30:
        classification = "overweight"
    elif bmi < 35:
        classification = "obese_class_1"
    elif bmi < 40:
        classification = "obese_class_2"
    else:
        classification = "obese_class_3"
    
    return round(bmi, 2), classification

def estimate_bone_mass(weight_kg: float, height_cm: float, gender: str) -> float:
    """Estimate bone mass using Martin formula approximation"""
    # Simplified bone mass estimation (approx 15% of lean mass, which is ~12-15% of body weight for athletes)
    base_factor = 0.035 if gender.lower() == 'male' else 0.030
    bone_mass = weight_kg * base_factor * (height_cm / 170)
    return round(bone_mass, 2)

def calculate_fat_distribution(skinfolds: dict) -> dict:
    """
    Calculate fat distribution for 3D body visualization
    Returns normalized percentages for different body regions
    """
    total = sum(v for v in skinfolds.values() if v)
    if total == 0:
        return {}
    
    distribution = {}
    regions = {
        'upper_arm': ['triceps', 'biceps'],
        'trunk_front': ['chest', 'abdominal'],
        'trunk_back': ['subscapular', 'midaxillary'],
        'hip_waist': ['suprailiac'],
        'lower_body': ['thigh', 'calf']
    }
    
    for region, sites in regions.items():
        region_sum = sum(skinfolds.get(site, 0) for site in sites)
        distribution[region] = round((region_sum / total) * 100, 1) if total > 0 else 0
    
    return distribution

def get_bmi_classification_text(classification: str, lang: str = 'pt') -> str:
    """Get BMI classification text in specified language"""
    classifications = {
        'pt': {
            'underweight': 'Abaixo do peso',
            'normal': 'Peso normal',
            'overweight': 'Sobrepeso',
            'obese_class_1': 'Obesidade Grau I',
            'obese_class_2': 'Obesidade Grau II',
            'obese_class_3': 'Obesidade Grau III'
        },
        'en': {
            'underweight': 'Underweight',
            'normal': 'Normal weight',
            'overweight': 'Overweight',
            'obese_class_1': 'Obesity Class I',
            'obese_class_2': 'Obesity Class II',
            'obese_class_3': 'Obesity Class III'
        }
    }
    return classifications.get(lang, classifications['pt']).get(classification, classification)

# ============= BODY COMPOSITION ENDPOINTS =============

@router.get("/body-composition/protocols")
async def get_body_composition_protocols(lang: str = "pt"):
    """Get available body composition protocols with descriptions"""
    protocols = {
        "guedes": {
            "name": "Guedes (1985)",
            "name_en": "Guedes (1985)",
            "description_pt": "Protocolo validado para população brasileira. Usa 3 dobras cutâneas.",
            "description_en": "Protocol validated for Brazilian population. Uses 3 skinfolds.",
            "sites_male": ["triceps", "suprailiac", "abdominal"],
            "sites_female": ["triceps", "suprailiac", "thigh"],
            "sites_count": 3
        },
        "pollock_jackson_7": {
            "name": "Pollock & Jackson 7 Dobras",
            "name_en": "Pollock & Jackson 7 Skinfolds",
            "description_pt": "Protocolo de 7 dobras, altamente preciso para atletas.",
            "description_en": "7 skinfold protocol, highly accurate for athletes.",
            "sites": ["chest", "midaxillary", "triceps", "subscapular", "abdominal", "suprailiac", "thigh"],
            "sites_count": 7
        },
        "pollock_jackson_9": {
            "name": "Pollock & Jackson 9 Dobras",
            "name_en": "Pollock & Jackson 9 Skinfolds",
            "description_pt": "Protocolo mais completo com 9 dobras cutâneas.",
            "description_en": "Most comprehensive protocol with 9 skinfolds.",
            "sites": ["chest", "midaxillary", "triceps", "subscapular", "abdominal", "suprailiac", "thigh", "biceps", "calf"],
            "sites_count": 9
        },
        "faulkner_4": {
            "name": "Faulkner 4 Dobras",
            "name_en": "Faulkner 4 Skinfolds",
            "description_pt": "Protocolo simplificado para atletas, especialmente nadadores.",
            "description_en": "Simplified protocol for athletes, especially swimmers.",
            "sites": ["triceps", "subscapular", "suprailiac", "abdominal"],
            "sites_count": 4
        }
    }
    return protocols

@router.post("/body-composition", response_model=BodyComposition)
async def create_body_composition(
    data: BodyCompositionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new body composition assessment"""
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Collect skinfolds
    skinfolds = {
        'triceps': data.triceps or 0,
        'subscapular': data.subscapular or 0,
        'suprailiac': data.suprailiac or 0,
        'abdominal': data.abdominal or 0,
        'chest': data.chest or 0,
        'midaxillary': data.midaxillary or 0,
        'thigh': data.thigh or 0,
        'calf': data.calf or 0,
        'biceps': data.biceps or 0,
    }
    
    # Calculate based on protocol
    protocol = data.protocol.value
    body_density = None
    body_fat_percentage = None
    
    if protocol in ("guedes", "guedes_1985"):
        body_density = calculate_body_density_guedes(data.gender, skinfolds)
        body_fat_percentage = siri_equation(body_density)
    elif protocol in ("pollock_jackson_7", "jackson_pollock_7"):
        body_density = calculate_body_density_pollock_jackson_7(data.gender, data.age, skinfolds)
        body_fat_percentage = siri_equation(body_density)
    elif protocol == "jackson_pollock_3":
        body_density = calculate_body_density_jackson_pollock_3(data.gender, data.age, skinfolds)
        body_fat_percentage = siri_equation(body_density)
    elif protocol == "durnin_womersley":
        body_density = calculate_body_density_durnin_womersley(data.gender, data.age, skinfolds)
        body_fat_percentage = siri_equation(body_density)
    elif protocol == "pollock_jackson_9":
        body_density = calculate_body_density_pollock_jackson_9(data.gender, data.age, skinfolds)
        body_fat_percentage = siri_equation(body_density)
    elif protocol in ("faulkner_4", "faulkner"):
        body_fat_percentage = calculate_body_fat_faulkner(skinfolds)
        body_density = None  # Faulkner calculates %BF directly
    
    # Ensure body fat percentage is within reasonable range
    body_fat_percentage = max(3, min(60, body_fat_percentage))
    
    # Calculate other metrics
    fat_mass_kg = round(data.weight * (body_fat_percentage / 100), 2)
    lean_mass_kg = round(data.weight - fat_mass_kg, 2)
    bone_mass_kg = estimate_bone_mass(data.weight, data.height, data.gender)
    bmi, bmi_classification = calculate_bmi(data.weight, data.height)
    fat_distribution = calculate_fat_distribution(skinfolds)
    
    # Create body composition record
    body_comp = BodyComposition(
        athlete_id=data.athlete_id,
        coach_id=current_user["_id"],
        date=data.date,
        protocol=protocol,
        weight=data.weight,
        height=data.height,
        age=data.age,
        gender=data.gender,
        triceps=data.triceps,
        subscapular=data.subscapular,
        suprailiac=data.suprailiac,
        abdominal=data.abdominal,
        chest=data.chest,
        midaxillary=data.midaxillary,
        thigh=data.thigh,
        calf=data.calf,
        biceps=data.biceps,
        body_fat_percentage=round(body_fat_percentage, 2),
        lean_mass_kg=lean_mass_kg,
        fat_mass_kg=fat_mass_kg,
        bone_mass_kg=bone_mass_kg,
        bmi=bmi,
        bmi_classification=bmi_classification,
        body_density=round(body_density, 5) if body_density else None,
        fat_distribution=fat_distribution,
        notes=data.notes
    )
    
    result = await db.body_compositions.insert_one(body_comp.model_dump(by_alias=True, exclude=["id"]))
    body_comp.id = str(result.inserted_id)
    
    return body_comp

@router.get("/body-composition/athlete/{athlete_id}", response_model=List[BodyComposition])
async def get_athlete_body_compositions(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all body composition assessments for an athlete"""
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    records = await db.body_compositions.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(1000)
    
    result = []
    for record in records:
        record["_id"] = str(record["_id"])
        result.append(BodyComposition(**record))
    
    return result

@router.get("/body-composition/{composition_id}", response_model=BodyComposition)
async def get_body_composition(
    composition_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific body composition assessment"""
    record = await db.body_compositions.find_one({
        "_id": ObjectId(composition_id),
        "coach_id": current_user["_id"]
    })
    
    if not record:
        raise HTTPException(status_code=404, detail="Body composition not found")
    
    record["_id"] = str(record["_id"])
    return BodyComposition(**record)

@router.delete("/body-composition/{composition_id}")
async def delete_body_composition(
    composition_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a body composition assessment"""
    result = await db.body_compositions.delete_one({
        "_id": ObjectId(composition_id),
        "coach_id": current_user["_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Body composition not found")
    
    return {"message": "Body composition deleted successfully"}

@router.get("/analysis/body-composition/{athlete_id}")
async def get_body_composition_analysis(
    athlete_id: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Get AI-powered body composition analysis with insights"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get body composition history
    compositions = await db.body_compositions.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(20)
    
    if not compositions:
        raise HTTPException(status_code=400, detail="No body composition data available")
    
    latest = compositions[0]
    
    # Calculate trends if we have history
    trends = {}
    if len(compositions) >= 2:
        prev = compositions[1]
        trends = {
            "body_fat_change": round(latest.get("body_fat_percentage", 0) - prev.get("body_fat_percentage", 0), 2),
            "lean_mass_change": round(latest.get("lean_mass_kg", 0) - prev.get("lean_mass_kg", 0), 2),
            "weight_change": round(latest.get("weight", 0) - prev.get("weight", 0), 2),
            "bmi_change": round(latest.get("bmi", 0) - prev.get("bmi", 0), 2)
        }
    
    # Generate AI insights
    try:
        llm_client = LlmChat(api_key=os.environ.get("EMERGENT_LLM_KEY"))
        
        composition_summary = f"""
        Athlete: {athlete.get('name')}
        Position: {athlete.get('position', 'N/A')}
        
        Latest Body Composition ({latest.get('date')}):
        - Protocol: {latest.get('protocol')}
        - Weight: {latest.get('weight')} kg
        - Height: {latest.get('height')} cm
        - Body Fat: {latest.get('body_fat_percentage')}%
        - Lean Mass: {latest.get('lean_mass_kg')} kg
        - Fat Mass: {latest.get('fat_mass_kg')} kg
        - BMI: {latest.get('bmi')} ({get_bmi_classification_text(latest.get('bmi_classification', ''), lang)})
        
        Fat Distribution: {latest.get('fat_distribution', {})}
        
        {"Trends (vs previous): " + str(trends) if trends else "First assessment"}
        """
        
        prompt = f"""You are an expert sports scientist analyzing body composition data for an athlete.
        
        {composition_summary}
        
        Provide a comprehensive analysis in {"Portuguese" if lang == 'pt' else "English"} including:
        1. Summary of current body composition status
        2. Risk assessment for the athlete's sport position
        3. Areas requiring attention (highlight regions with high fat accumulation)
        4. Specific recommendations for body composition optimization
        5. Training and nutrition suggestions
        
        Be specific and actionable. Format your response clearly with sections."""
        
        response = await llm_client.send_message([UserMessage(content=prompt)])
        ai_analysis = response.content
    except Exception as e:
        logging.error(f"AI analysis error: {e}")
        ai_analysis = "AI analysis unavailable" if lang == 'en' else "Análise de IA indisponível"
    
    # Prepare response
    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name"),
        "latest_assessment": {
            "id": str(latest["_id"]),
            "date": latest.get("date"),
            "protocol": latest.get("protocol"),
            "weight": latest.get("weight"),
            "height": latest.get("height"),
            "body_fat_percentage": latest.get("body_fat_percentage"),
            "lean_mass_kg": latest.get("lean_mass_kg"),
            "fat_mass_kg": latest.get("fat_mass_kg"),
            "bone_mass_kg": latest.get("bone_mass_kg"),
            "bmi": latest.get("bmi"),
            "bmi_classification": latest.get("bmi_classification"),
            "bmi_classification_text": get_bmi_classification_text(latest.get("bmi_classification", ""), lang),
            "fat_distribution": latest.get("fat_distribution", {})
        },
        "trends": trends,
        "history": [
            {
                "date": c.get("date"),
                "body_fat_percentage": c.get("body_fat_percentage"),
                "lean_mass_kg": c.get("lean_mass_kg"),
                "weight": c.get("weight"),
                "bmi": c.get("bmi")
            } for c in compositions[:10]
        ],
        "ai_analysis": ai_analysis,
        "risk_zones": {
            "body_fat": "high" if latest.get("body_fat_percentage", 0) > 25 else "moderate" if latest.get("body_fat_percentage", 0) > 18 else "optimal",
            "bmi": "high" if latest.get("bmi", 0) > 30 else "moderate" if latest.get("bmi", 0) > 25 else "optimal"
        }
    }

