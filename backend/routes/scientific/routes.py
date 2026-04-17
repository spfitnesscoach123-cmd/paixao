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


router = APIRouter(tags=["Scientific Analysis"])

# ============= SCIENTIFIC ANALYSIS - COMPLETE INSIGHTS =============

class ScientificInsightsResponse(BaseModel):
    athlete_id: str
    athlete_name: str
    analysis_date: str
    
    # GPS Metrics
    gps_summary: Optional[Dict[str, Any]] = None
    
    # ACWR Analysis
    acwr_analysis: Optional[Dict[str, Any]] = None
    
    # Wellness Metrics
    wellness_summary: Optional[Dict[str, Any]] = None
    
    # Jump Assessment (CMJ, RSI, Fatigue)
    jump_analysis: Optional[Dict[str, Any]] = None
    
    # VBT Analysis (Load-Velocity Profile)
    vbt_analysis: Optional[Dict[str, Any]] = None
    
    # Body Composition
    body_composition: Optional[Dict[str, Any]] = None
    
    # AI Scientific Insights
    scientific_insights: Optional[str] = None
    
    # Risk Assessment
    overall_risk_level: str = "unknown"
    injury_risk_factors: List[str] = []
    
    # Recommendations
    training_recommendations: List[str] = []
    recovery_recommendations: List[str] = []


@router.get("/analysis/scientific/{athlete_id}")
async def get_scientific_analysis(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """
    Complete scientific analysis consolidating GPS, ACWR, Wellness, Jump Assessment, 
    VBT (Load-Velocity Profile), Body Composition with AI-powered insights based on 
    sports science literature.
    """
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    response = ScientificInsightsResponse(
        athlete_id=athlete_id,
        athlete_name=athlete["name"],
        analysis_date=datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    )
    
    injury_risk_factors = []
    
    # 1. GPS Data Summary (últimos 30 dias)
    # Only count SESSION periods to avoid counting sub-periods as separate activities
    try:
        gps_data_raw = await db.gps_data.find({
            "athlete_id": athlete_id
        }).sort("date", -1).to_list(500)
        
        # Filter: only include records where period is "SESSION" or there's no multi-period structure
        _SESSION_KW = {"session", "total", "full", "complete", "summary", "sessão"}
        
        def _is_session_record(record):
            pname = (record.get("period_name") or "").lower()
            session_id = record.get("session_id")
            if not pname or not session_id:
                return True  # Legacy records without period_name count as sessions
            return any(kw in pname for kw in _SESSION_KW)
        
        gps_data = [g for g in gps_data_raw if _is_session_record(g)][:30]
        
        if gps_data:
            total_distance = sum(g.get("total_distance", 0) for g in gps_data)
            avg_distance = total_distance / len(gps_data) if gps_data else 0
            avg_hi_distance = sum(g.get("high_intensity_distance", 0) for g in gps_data) / len(gps_data)
            avg_sprints = sum(g.get("sprint_count", 0) for g in gps_data) / len(gps_data)
            max_speed = max((g.get("max_speed", 0) for g in gps_data), default=0)
            avg_max_speed = sum(g.get("max_speed", 0) for g in gps_data) / len(gps_data)
            
            response.gps_summary = {
                "sessions_count": len(gps_data),
                "total_distance_m": round(total_distance, 0),
                "avg_distance_m": round(avg_distance, 0),
                "avg_high_intensity_m": round(avg_hi_distance, 0),
                "avg_sprints": round(avg_sprints, 1),
                "max_speed_kmh": round(max_speed, 1),
                "avg_max_speed_kmh": round(avg_max_speed, 1),
                "last_session_date": gps_data[0].get("date", "") if gps_data else None,
                "latest_session": {
                    "distance": gps_data[0].get("total_distance", 0),
                    "high_intensity": gps_data[0].get("high_intensity_distance", 0),
                    "sprints": gps_data[0].get("sprint_count", 0),
                    "max_speed": gps_data[0].get("max_speed", 0)
                } if gps_data else None
            }
    except Exception as e:
        print(f"GPS Error: {e}")
    
    # 2. ACWR Analysis
    try:
        acwr_result = await get_acwr_detailed_analysis(athlete_id, lang, current_user)
        response.acwr_analysis = {
            "overall_risk": acwr_result.overall_risk,
            "recommendation": acwr_result.recommendation,
            "metrics": [
                {
                    "name": m.name,
                    "acwr_ratio": m.acwr_ratio,
                    "acute_load": m.acute_load,
                    "chronic_load": m.chronic_load,
                    "risk_level": m.risk_level
                } for m in acwr_result.metrics
            ]
        }
        if acwr_result.overall_risk in ["high", "moderate"]:
            injury_risk_factors.append(f"ACWR em nível {acwr_result.overall_risk}" if lang == "pt" else f"ACWR at {acwr_result.overall_risk} level")
    except:
        pass
    
    # 3. Wellness Summary
    try:
        wellness_data = await db.wellness_questionnaires.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(14).to_list(14)
        
        if wellness_data:
            avg_wellness = sum(w.get("wellness_score", 0) for w in wellness_data) / len(wellness_data)
            avg_readiness = sum(w.get("readiness_score", 0) for w in wellness_data) / len(wellness_data)
            avg_sleep = sum(w.get("sleep_hours", 0) for w in wellness_data) / len(wellness_data)
            avg_fatigue = sum(w.get("fatigue", 0) for w in wellness_data) / len(wellness_data)
            avg_stress = sum(w.get("stress", 0) for w in wellness_data) / len(wellness_data)
            avg_soreness = sum(w.get("muscle_soreness", 0) for w in wellness_data) / len(wellness_data)
            
            latest = wellness_data[0]
            response.wellness_summary = {
                "records_count": len(wellness_data),
                "avg_wellness_score": round(avg_wellness, 1),
                "avg_readiness_score": round(avg_readiness, 1),
                "avg_sleep_hours": round(avg_sleep, 1),
                "avg_fatigue": round(avg_fatigue, 1),
                "avg_stress": round(avg_stress, 1),
                "avg_soreness": round(avg_soreness, 1),
                "latest": {
                    "date": latest.get("date", ""),
                    "wellness_score": latest.get("wellness_score", 0),
                    "readiness_score": latest.get("readiness_score", 0),
                    "sleep_hours": latest.get("sleep_hours", 0),
                    "sleep_quality": latest.get("sleep_quality", 0),
                    "fatigue": latest.get("fatigue", 0),
                    "stress": latest.get("stress", 0),
                    "muscle_soreness": latest.get("muscle_soreness", 0),
                    "mood": latest.get("mood", 0)
                }
            }
            
            if avg_fatigue >= 7:
                injury_risk_factors.append("Fadiga percebida elevada (RPE ≥ 7)" if lang == "pt" else "High perceived fatigue (RPE ≥ 7)")
            if avg_sleep < 7:
                injury_risk_factors.append("Déficit de sono crônico (<7h)" if lang == "pt" else "Chronic sleep deficit (<7h)")
            if avg_soreness >= 7:
                injury_risk_factors.append("Dor muscular elevada persistente" if lang == "pt" else "Persistent high muscle soreness")
    except Exception as e:
        print(f"Wellness Error: {e}")
    
    # 4. Jump Assessment (CMJ, RSI, Fatigue Index)
    try:
        jump_data = await db.jump_assessments.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(10).to_list(10)
        
        if jump_data:
            latest = jump_data[0]
            
            # Calculate Z-Score against athlete's history
            rsi_values = [j.get("rsi", 0) for j in jump_data]
            avg_rsi = sum(rsi_values) / len(rsi_values) if rsi_values else 0
            std_rsi = (sum((x - avg_rsi) ** 2 for x in rsi_values) / len(rsi_values)) ** 0.5 if len(rsi_values) > 1 else 0
            z_score = (latest.get("rsi", 0) - avg_rsi) / std_rsi if std_rsi > 0 else 0
            
            # Fatigue detection based on RSI variation
            if len(jump_data) >= 2:
                baseline_rsi = sum(rsi_values[1:min(5, len(rsi_values))]) / min(4, len(rsi_values) - 1)
                rsi_variation = ((latest.get("rsi", 0) - baseline_rsi) / baseline_rsi * 100) if baseline_rsi > 0 else 0
            else:
                rsi_variation = 0
            
            response.jump_analysis = {
                "assessments_count": len(jump_data),
                "latest": {
                    "date": latest.get("date", ""),
                    "protocol": latest.get("protocol", ""),
                    "jump_height_cm": latest.get("jump_height_cm", 0),
                    "flight_time_ms": latest.get("flight_time_ms", 0),
                    "contact_time_ms": latest.get("contact_time_ms", 0),
                    "rsi": round(latest.get("rsi", 0), 2),
                    "rsi_classification": classify_rsi(round(latest.get("rsi", 0), 2)),
                    "peak_power_w": round(latest.get("peak_power_w", 0), 0),
                    "peak_velocity_ms": round(latest.get("peak_velocity_ms", 0), 2),
                    "relative_power_wkg": round(latest.get("relative_power_wkg", 0), 1),
                    "fatigue_status": latest.get("fatigue_status", ""),
                    "fatigue_percentage": round(latest.get("fatigue_percentage", 0), 1)
                },
                "historical": {
                    "avg_rsi": round(avg_rsi, 2),
                    "std_rsi": round(std_rsi, 2),
                    "z_score": round(z_score, 2),
                    "rsi_variation_percent": round(rsi_variation, 1),
                    "trend": "declining" if rsi_variation < -5 else "stable" if rsi_variation < 5 else "improving"
                },
                "fatigue_alert": latest.get("fatigue_status", "") in ["yellow", "red"],
                "history": [
                    {
                        "date": j.get("date", ""),
                        "rsi": round(j.get("rsi", 0), 2),
                        "jump_height_cm": j.get("jump_height_cm", 0),
                        "protocol": j.get("protocol", "")
                    } for j in jump_data[:7]
                ]
            }
            
            if latest.get("fatigue_status", "") == "red":
                injury_risk_factors.append("RSI indica fadiga neuromuscular severa (>12% abaixo do baseline)" if lang == "pt" else "RSI indicates severe neuromuscular fatigue (>12% below baseline)")
            elif latest.get("fatigue_status", "") == "yellow":
                injury_risk_factors.append("RSI indica fadiga moderada (5-12% abaixo do baseline)" if lang == "pt" else "RSI indicates moderate fatigue (5-12% below baseline)")
    except Exception as e:
        print(f"Jump Error: {e}")
    
    # 5. VBT Analysis (Load-Velocity Profile)
    try:
        vbt_data = await db.vbt_data.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(20).to_list(20)
        
        if vbt_data:
            # Group by exercise and get latest for primary exercise
            exercises = {}
            for v in vbt_data:
                ex = v.get("exercise", "Back Squat")
                if ex not in exercises:
                    exercises[ex] = []
                exercises[ex].append(v)
            
            primary_exercise = max(exercises.keys(), key=lambda x: len(exercises[x]))
            primary_data = exercises[primary_exercise]
            
            # Calculate load-velocity profile
            all_sets = []
            for session in primary_data:
                for s in session.get("sets", []):
                    if s.get("load_kg", 0) > 0 and s.get("mean_velocity", 0) > 0:
                        all_sets.append({
                            "load": s.get("load_kg"),
                            "velocity": s.get("mean_velocity")
                        })
            
            # Linear regression for load-velocity
            slope, intercept, estimated_1rm, optimal_load = None, None, None, None
            if len(all_sets) >= 2:
                loads = [s["load"] for s in all_sets]
                velocities = [s["velocity"] for s in all_sets]
                n = len(loads)
                sum_x = sum(loads)
                sum_y = sum(velocities)
                sum_xy = sum(l * v for l, v in zip(loads, velocities))
                sum_x2 = sum(l * l for l in loads)
                
                denom = n * sum_x2 - sum_x * sum_x
                if denom != 0:
                    slope = (n * sum_xy - sum_x * sum_y) / denom
                    intercept = (sum_y - slope * sum_x) / n
                    
                    # MVT (Minimum Velocity Threshold) typically 0.3 m/s for squat
                    mvt = 0.3
                    if slope != 0:
                        estimated_1rm = (mvt - intercept) / slope
                        # Optimal load for power (typically around 50-60% 1RM)
                        optimal_load = estimated_1rm * 0.55
            
            # Latest session velocity loss
            latest_session = primary_data[0]
            sets = latest_session.get("sets", [])
            velocity_loss = []
            if len(sets) >= 2:
                first_velocity = sets[0].get("mean_velocity", 0)
                for i, s in enumerate(sets):
                    loss = ((first_velocity - s.get("mean_velocity", 0)) / first_velocity * 100) if first_velocity > 0 else 0
                    velocity_loss.append({
                        "set": i + 1,
                        "velocity": s.get("mean_velocity", 0),
                        "loss_percent": round(loss, 1)
                    })
            
            response.vbt_analysis = {
                "sessions_count": len(vbt_data),
                "primary_exercise": primary_exercise,
                "load_velocity_profile": {
                    "slope": round(slope, 4) if slope else None,
                    "intercept": round(intercept, 2) if intercept else None,
                    "estimated_1rm_kg": round(estimated_1rm, 1) if estimated_1rm else None,
                    "optimal_load_kg": round(optimal_load, 1) if optimal_load else None,
                    "mvt": 0.3,
                    "data_points": len(all_sets)
                },
                "latest_session": {
                    "date": latest_session.get("date", ""),
                    "exercise": latest_session.get("exercise", ""),
                    "sets_count": len(sets),
                    "avg_velocity": round(sum(s.get("mean_velocity", 0) for s in sets) / len(sets), 2) if sets else 0,
                    "max_velocity": round(max((s.get("peak_velocity", 0) for s in sets), default=0), 2),
                    "max_load": max((s.get("load_kg", 0) for s in sets), default=0),
                    "max_power": max((s.get("power_watts", 0) for s in sets), default=0)
                },
                "velocity_loss_analysis": velocity_loss,
                "fatigue_detected": any(v["loss_percent"] >= 20 for v in velocity_loss) if velocity_loss else False
            }
            
            if response.vbt_analysis.get("fatigue_detected"):
                injury_risk_factors.append("Perda de velocidade ≥20% detectada na última sessão VBT (fadiga periférica)" if lang == "pt" else "Velocity loss ≥20% detected in last VBT session (peripheral fatigue)")
    except Exception as e:
        print(f"VBT Error: {e}")
    
    # 6. Body Composition
    try:
        body_comp = await db.body_compositions.find({
            "athlete_id": athlete_id
        }).sort("date", -1).limit(5).to_list(5)
        
        if body_comp:
            latest = body_comp[0]
            # Get body_fat_percentage - calculate from fat_mass_kg and weight if not present
            body_fat_pct = latest.get("body_fat_percentage", None)
            if body_fat_pct is None:
                weight = latest.get("weight", 0)
                fat_mass = latest.get("fat_mass_kg", 0)
                if weight > 0:
                    body_fat_pct = round((fat_mass / weight) * 100, 1)
                else:
                    body_fat_pct = 0
            
            response.body_composition = {
                "records_count": len(body_comp),
                "latest": {
                    "date": latest.get("date", ""),
                    "protocol": latest.get("protocol", ""),
                    "body_fat_percent": body_fat_pct,
                    "lean_mass_kg": latest.get("lean_mass_kg", 0),
                    "fat_mass_kg": latest.get("fat_mass_kg", 0),
                    "weight_kg": latest.get("weight", 0),
                    "classification": latest.get("classification", "")
                },
                "trend": None
            }
            
            if len(body_comp) >= 2:
                prev = body_comp[1]
                # Calculate prev body fat percent if not present
                prev_fat_pct = prev.get("body_fat_percentage", None)
                if prev_fat_pct is None:
                    prev_weight = prev.get("weight", 0)
                    prev_fat_mass = prev.get("fat_mass_kg", 0)
                    if prev_weight > 0:
                        prev_fat_pct = round((prev_fat_mass / prev_weight) * 100, 1)
                    else:
                        prev_fat_pct = 0
                
                fat_change = body_fat_pct - prev_fat_pct
                lean_change = latest.get("lean_mass_kg", 0) - prev.get("lean_mass_kg", 0)
                response.body_composition["trend"] = {
                    "fat_percent_change": round(fat_change, 1),
                    "lean_mass_change_kg": round(lean_change, 1),
                    "direction": "improving" if fat_change < 0 and lean_change >= 0 else "declining" if fat_change > 0 else "stable"
                }
    except Exception as e:
        print(f"Body Comp Error: {e}")
    
    # 7. Determine Overall Risk Level
    response.injury_risk_factors = injury_risk_factors
    if len(injury_risk_factors) >= 3:
        response.overall_risk_level = "high"
    elif len(injury_risk_factors) >= 1:
        response.overall_risk_level = "moderate"
    else:
        response.overall_risk_level = "low"
    
    # 8. Generate AI Scientific Insights
    try:
        insights_text = await generate_scientific_ai_insights(response, athlete, lang)
        response.scientific_insights = insights_text
    except Exception as e:
        print(f"AI Insights Error: {e}")
        response.scientific_insights = None
    
    return response


async def generate_scientific_ai_insights(data: ScientificInsightsResponse, athlete: dict, lang: str) -> str:
    """
    Generate AI-powered scientific insights based on comprehensive athlete data.
    Uses sports science terminology and evidence-based recommendations.
    """
    # Check if emergentintegrations is available
    if not EMERGENT_AVAILABLE:
        return None
    
    try:
        from emergentintegrations.llm.chat import LlmChat
    except ImportError:
        return None
    
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        return None
    
    # Build comprehensive data context
    context_parts = []
    
    # Athlete info
    athlete_info = f"Atleta: {athlete['name']}, Posição: {athlete.get('position', 'N/A')}"
    if athlete.get('weight'):
        athlete_info += f", Peso: {athlete['weight']}kg"
    if athlete.get('height'):
        athlete_info += f", Altura: {athlete['height']}cm"
    context_parts.append(athlete_info)
    
    # GPS Data
    if data.gps_summary:
        gps = data.gps_summary
        context_parts.append(f"""
DADOS GPS (últimas {gps['sessions_count']} sessões):
- Distância média: {gps['avg_distance_m']}m
- Distância alta intensidade média: {gps['avg_high_intensity_m']}m
- Sprints médios: {gps['avg_sprints']}
- Velocidade máxima: {gps['max_speed_kmh']} km/h
- Última sessão: {gps.get('latest_session', {})}
""")
    
    # ACWR
    if data.acwr_analysis:
        acwr = data.acwr_analysis
        context_parts.append(f"""
ANÁLISE ACWR (Acute:Chronic Workload Ratio):
- Risco geral: {acwr['overall_risk']}
- Métricas: {acwr['metrics']}
""")
    
    # Wellness
    if data.wellness_summary:
        w = data.wellness_summary
        context_parts.append(f"""
WELLNESS (últimos {w['records_count']} registros):
- Wellness Score médio: {w['avg_wellness_score']}/10
- Readiness médio: {w['avg_readiness_score']}/10
- Sono médio: {w['avg_sleep_hours']}h
- Fadiga média: {w['avg_fatigue']}/10
- Dor muscular média: {w['avg_soreness']}/10
- Último registro: {w.get('latest', {})}
""")
    
    # Jump Assessment
    if data.jump_analysis:
        j = data.jump_analysis
        latest = j.get('latest', {})
        hist = j.get('historical', {})
        context_parts.append(f"""
AVALIACAO DE SALTO (CMJ/SL-CMJ):
- RSI atual: {latest.get('rsi', 0)} ({latest.get('rsi_classification', '')})
- Altura do salto: {latest.get('jump_height_cm', 0)} cm
- Pico de potência: {latest.get('peak_power_w', 0)} W
- Potência relativa: {latest.get('relative_power_wkg', 0)} W/kg
- Status de fadiga: {latest.get('fatigue_status', '')}
- Z-Score RSI: {hist.get('z_score', 0)} (variação: {hist.get('rsi_variation_percent', 0)}%)
- Tendência: {hist.get('trend', '')}
""")
    
    # VBT
    if data.vbt_analysis:
        v = data.vbt_analysis
        lvp = v.get('load_velocity_profile', {})
        context_parts.append(f"""
PERFIL CARGA-VELOCIDADE (VBT):
- Exercício principal: {v['primary_exercise']}
- 1RM estimado: {lvp.get('estimated_1rm_kg', 'N/A')} kg
- Carga ótima (potência máx): {lvp.get('optimal_load_kg', 'N/A')} kg
- Slope: {lvp.get('slope', 'N/A')}
- Intercept: {lvp.get('intercept', 'N/A')}
- Perda de velocidade: {v.get('velocity_loss_analysis', [])}
- Fadiga periférica detectada: {v.get('fatigue_detected', False)}
""")
    
    # Body Composition
    if data.body_composition:
        bc = data.body_composition
        latest = bc.get('latest', {})
        context_parts.append(f"""
COMPOSIÇÃO CORPORAL:
- Gordura corporal: {latest.get('body_fat_percent', 0)}%
- Massa magra: {latest.get('lean_mass_kg', 0)} kg
- Massa gorda: {latest.get('fat_mass_kg', 0)} kg
- Classificação: {latest.get('classification', '')}
- Tendência: {bc.get('trend', {})}
""")
    
    # Risk factors
    if data.injury_risk_factors:
        context_parts.append(f"""
FATORES DE RISCO IDENTIFICADOS:
{chr(10).join('- ' + f for f in data.injury_risk_factors)}
Nível de risco geral: {data.overall_risk_level}
""")
    
    full_context = "\n".join(context_parts)
    
    # Determine language
    if lang == "pt":
        system_prompt = """Você é um cientista do esporte especializado em fisiologia do exercício, biomecânica e 
periodização do treinamento. Analise os dados fornecidos usando terminologia científica específica e forneça 
insights baseados em evidências da literatura científica atual.

IMPORTANTE: Use termos científicos específicos como:
- Fadiga neuromuscular central vs periférica
- Capacidade contrátil muscular
- Potencialização pós-ativação (PAP)
- Supercompensação e adaptação
- Índice de Força Reativa (RSI)
- Perfil força-velocidade
- Déficit bilateral
- Assimetria funcional
- Monotonia e strain da carga
- Readiness neuromuscular

Cite referências científicas quando apropriado (ex: "Segundo Gabbett (2016)...")."""

        user_prompt = f"""Com base nos seguintes dados científicos do atleta, forneça uma análise técnica completa:

{full_context}

Forneça sua análise no seguinte formato estruturado:

## SÍNTESE FISIOLÓGICA
Breve avaliação do estado neuromuscular e metabólico atual do atleta (3-4 linhas).

## ANÁLISE DE CARGA DE TREINAMENTO
Interpretação do ACWR e métricas de carga com base na literatura de monitoramento de carga.

## ESTADO NEUROMUSCULAR
Análise do RSI, perfil carga-velocidade e indicadores de fadiga central/periférica.

## ESTADO DE RECUPERAÇÃO
Avaliação baseada nos dados de wellness, sono e fatores psicométricos.

## COMPOSIÇÃO CORPORAL E POTÊNCIA
Relação entre composição corporal e métricas de potência/força.

## FATORES DE RISCO E PREVENÇÃO
Análise dos fatores de risco identificados com recomendações baseadas em evidências.

## RECOMENDAÇÕES DE TREINAMENTO
Prescrições específicas baseadas nos dados para otimização da performance e redução de risco de lesão.

## RECOMENDAÇÕES DE RECUPERAÇÃO
Estratégias de recuperação baseadas no perfil atual do atleta.

Seja específico, use terminologia científica e fundamente em evidências quando possível."""

    else:
        system_prompt = """You are a sports scientist specialized in exercise physiology, biomechanics and 
training periodization. Analyze the provided data using specific scientific terminology and provide 
evidence-based insights from current scientific literature.

IMPORTANT: Use specific scientific terms such as:
- Central vs peripheral neuromuscular fatigue
- Muscle contractile capacity
- Post-activation potentiation (PAP)
- Supercompensation and adaptation
- Reactive Strength Index (RSI)
- Force-velocity profile
- Bilateral deficit
- Functional asymmetry
- Load monotony and strain
- Neuromuscular readiness

Cite scientific references when appropriate (e.g., "According to Gabbett (2016)...")."""

        user_prompt = f"""Based on the following scientific data from the athlete, provide a complete technical analysis:

{full_context}

Provide your analysis in the following structured format:

## PHYSIOLOGICAL SYNTHESIS
Brief assessment of the athlete's current neuromuscular and metabolic state (3-4 lines).

## TRAINING LOAD ANALYSIS
Interpretation of ACWR and load metrics based on load monitoring literature.

## NEUROMUSCULAR STATE
Analysis of RSI, load-velocity profile and central/peripheral fatigue indicators.

## RECOVERY STATE
Assessment based on wellness data, sleep and psychometric factors.

## BODY COMPOSITION AND POWER
Relationship between body composition and power/strength metrics.

## RISK FACTORS AND PREVENTION
Analysis of identified risk factors with evidence-based recommendations.

## TRAINING RECOMMENDATIONS
Specific prescriptions based on data for performance optimization and injury risk reduction.

## RECOVERY RECOMMENDATIONS
Recovery strategies based on the athlete's current profile.

Be specific, use scientific terminology and base on evidence when possible."""
    
    try:
        chat = LlmChat(
            api_key=llm_key,
            model="gpt-4o",
            system_message=system_prompt
        )
        response = chat.send_message(user_prompt)
        return response
    except Exception as e:
        print(f"LLM Error: {e}")
        return None


@router.get("/report/scientific/{athlete_id}")
async def get_scientific_report_pdf(
    athlete_id: str,
    lang: str = "en",
    current_user: dict = Depends(get_current_user)
):
    """
    Generate a printable scientific report in HTML format with all charts.
    The browser can print this page to PDF.
    """
    # Get all scientific analysis data
    analysis = await get_scientific_analysis(athlete_id, lang, current_user)
    
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get additional data for charts
    # GPS historical data
    gps_history = await db.gps_data.find({
        "athlete_id": athlete_id
    }).sort("date", -1).limit(10).to_list(10)
    gps_history.reverse()
    
    # Wellness historical data
    wellness_history = await db.wellness_questionnaires.find({
        "athlete_id": athlete_id
    }).sort("date", -1).limit(14).to_list(14)
    wellness_history.reverse()
    
    # Jump history for RSI evolution
    jump_history = await db.jump_assessments.find({
        "athlete_id": athlete_id
    }).sort("date", -1).limit(10).to_list(10)
    jump_history.reverse()
    
    # VBT data for load-velocity chart
    vbt_data = await db.vbt_data.find({
        "athlete_id": athlete_id
    }).sort("date", -1).limit(20).to_list(20)
    
    is_pt = lang == "pt"
    
    def risk_color(level):
        return {
            "low": "#10b981",
            "moderate": "#f59e0b", 
            "high": "#ef4444"
        }.get(level, "#6b7280")
    
    def risk_label(level):
        if is_pt:
            return {"low": "Baixo", "moderate": "Moderado", "high": "Alto"}.get(level, "Desconhecido")
        return level.title() if level else "Unknown"
    
    # Calculate IMC - safely handle None values
    weight = athlete.get('weight') or 0
    height_cm = athlete.get('height') or 0
    imc = (weight / ((height_cm/100) ** 2)) if height_cm > 0 and weight > 0 else 0
    imc_class = ""
    if imc > 0:
        if imc < 18.5:
            imc_class = "Abaixo do peso" if is_pt else "Underweight"
        elif imc < 25:
            imc_class = "Normal" if is_pt else "Normal"
        elif imc < 30:
            imc_class = "Sobrepeso" if is_pt else "Overweight"
        else:
            imc_class = "Obesidade" if is_pt else "Obese"
    
    html_content = f"""
<!DOCTYPE html>
<html lang="{lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{'Relatório Científico' if is_pt else 'Scientific Report'} - {athlete['name']}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            padding: 20px;
            line-height: 1.5;
        }}
        .container {{ max-width: 900px; margin: 0 auto; }}
        .header {{ 
            text-align: center; 
            padding: 30px 0;
            border-bottom: 2px solid #334155;
            margin-bottom: 30px;
        }}
        .header h1 {{ font-size: 24px; color: #f8fafc; margin-bottom: 8px; }}
        .header p {{ color: #94a3b8; font-size: 14px; }}
        .section {{ 
            background: #1e293b;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid #334155;
            page-break-inside: avoid;
        }}
        .section-title {{ 
            font-size: 16px;
            font-weight: 600;
            color: #f8fafc;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .section-title span {{ font-size: 20px; }}
        .risk-badge {{
            display: inline-block;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 600;
            color: white;
        }}
        .grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }}
        .grid-3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }}
        .grid-4 {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }}
        .stat-card {{
            background: rgba(255,255,255,0.05);
            padding: 12px;
            border-radius: 8px;
            text-align: center;
        }}
        .stat-value {{ font-size: 20px; font-weight: bold; color: #f8fafc; }}
        .stat-label {{ font-size: 11px; color: #94a3b8; margin-top: 4px; }}
        .chart-container {{
            margin: 16px 0;
            text-align: center;
        }}
        .chart-title {{
            font-size: 13px;
            font-weight: 600;
            color: #94a3b8;
            margin-bottom: 8px;
            text-align: left;
        }}
        .alert {{
            background: rgba(239, 68, 68, 0.1);
            border-left: 4px solid #ef4444;
            padding: 12px;
            margin: 12px 0;
            border-radius: 0 8px 8px 0;
        }}
        .alert p {{ color: #fca5a5; font-size: 13px; }}
        .alert.warning {{
            background: rgba(245, 158, 11, 0.1);
            border-left-color: #f59e0b;
        }}
        .alert.warning p {{ color: #fcd34d; }}
        .insights {{
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1));
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
            page-break-inside: avoid;
        }}
        .insights-title {{ font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #f8fafc; }}
        .insights-text {{ 
            white-space: pre-wrap;
            font-size: 12px;
            line-height: 1.7;
            color: #cbd5e1;
        }}
        .legend {{
            display: flex;
            justify-content: center;
            gap: 16px;
            margin-top: 8px;
            flex-wrap: wrap;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: #94a3b8;
        }}
        .legend-dot {{
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }}
        .print-btn {{
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #8b5cf6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 100;
        }}
        .print-btn:hover {{ background: #7c3aed; }}
        .factor-item {{ 
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
            font-size: 13px;
            color: #94a3b8;
        }}
        .factor-item::before {{ content: '⚠️'; }}
        .two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
        @media print {{
            body {{ background: white; color: #1e293b; padding: 10px; font-size: 11px; }}
            .section {{ border: 1px solid #e2e8f0; background: #f8fafc; padding: 15px; margin-bottom: 15px; }}
            .print-btn {{ display: none; }}
            .stat-card {{ background: #f1f5f9; }}
            .stat-value, .section-title {{ color: #1e293b; }}
            .stat-label {{ color: #64748b; }}
            .insights {{ background: #f8fafc; border: 1px solid #e2e8f0; }}
            .insights-text {{ color: #475569; }}
            .chart-title {{ color: #475569; }}
            .legend-item {{ color: #64748b; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{'📊 Relatório Científico Completo' if is_pt else '📊 Complete Scientific Report'}</h1>
            <p><strong>{athlete['name']}</strong> • {analysis.analysis_date}</p>
            <p>{'Posição' if is_pt else 'Position'}: {athlete.get('position', 'N/A')} | {'Peso' if is_pt else 'Weight'}: {weight} kg | {'Altura' if is_pt else 'Height'}: {height_cm} cm | IMC: {imc:.1f} ({imc_class})</p>
        </div>
        
        <!-- Risk Level -->
        <div class="section">
            <div class="section-title"><span>🎯</span> {'Nível de Risco de Lesão' if is_pt else 'Injury Risk Level'}</div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
                <div class="risk-badge" style="background: {risk_color(analysis.overall_risk_level)}">
                    {risk_label(analysis.overall_risk_level)}
                </div>
            </div>
            {''.join(f'<div class="factor-item">{f}</div>' for f in analysis.injury_risk_factors) if analysis.injury_risk_factors else f'<p style="color: #10b981;">{"✅ Nenhum fator de risco identificado" if is_pt else "✅ No risk factors identified"}</p>'}
        </div>
"""

    # ============= GPS SECTION WITH CHARTS =============
    if analysis.gps_summary and gps_history:
        gps = analysis.gps_summary
        
        # Generate GPS charts SVG
        chart_width = 380
        chart_height = 120
        padding = 40
        
        # Prepare data for charts
        distances = [g.get('total_distance', 0) for g in gps_history]
        hi_distances = [g.get('high_intensity_distance', 0) for g in gps_history]
        sprint_distances = [g.get('sprint_distance', 0) for g in gps_history]
        sprints = [g.get('sprint_count', 0) for g in gps_history]
        dates = [g.get('date', '')[:5] for g in gps_history]
        
        def make_line_chart(values, color, title, unit, width=chart_width, height=chart_height):
            if not values or all(v == 0 for v in values):
                return ""
            max_val = max(values) * 1.1 if max(values) > 0 else 1
            min_val = 0
            inner_w = width - padding * 2
            inner_h = height - 40
            
            points = []
            for i, v in enumerate(values):
                x = padding + (i / max(len(values)-1, 1)) * inner_w
                y = height - 20 - ((v - min_val) / (max_val - min_val)) * inner_h if max_val > min_val else height - 20
                points.append(f"{x},{y}")
            
            polyline = " ".join(points)
            
            # Grid lines
            grid_lines = ""
            for i in range(4):
                y = height - 20 - (i / 3) * inner_h
                val = min_val + (i / 3) * (max_val - min_val)
                grid_lines += f'<line x1="{padding}" y1="{y}" x2="{width-padding}" y2="{y}" stroke="#334155" stroke-dasharray="4"/>'
                grid_lines += f'<text x="{padding-5}" y="{y+4}" text-anchor="end" fill="#64748b" font-size="9">{val:.0f}</text>'
            
            # Date labels
            date_labels = ""
            for i, d in enumerate(dates):
                if i == 0 or i == len(dates) - 1:
                    x = padding + (i / max(len(dates)-1, 1)) * inner_w
                    date_labels += f'<text x="{x}" y="{height-5}" text-anchor="middle" fill="#64748b" font-size="8">{d}</text>'
            
            # Points
            point_circles = ""
            for i, v in enumerate(values):
                x = padding + (i / max(len(values)-1, 1)) * inner_w
                y = height - 20 - ((v - min_val) / (max_val - min_val)) * inner_h if max_val > min_val else height - 20
                point_circles += f'<circle cx="{x}" cy="{y}" r="4" fill="{color}"/>'
            
            return f'''
            <div class="chart-container">
                <div class="chart-title">{title} ({unit})</div>
                <svg width="{width}" height="{height}" viewBox="0 0 {width} {height}">
                    {grid_lines}
                    <polyline points="{polyline}" fill="none" stroke="{color}" stroke-width="2"/>
                    {point_circles}
                    {date_labels}
                </svg>
            </div>
            '''
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>📍</span> {'Dados GPS' if is_pt else 'GPS Data'} ({gps['sessions_count']} {'sessões' if is_pt else 'sessions'})</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value">{gps['avg_distance_m'] / 1000:.1f}</div>
                    <div class="stat-label">{'Dist. Média (km)' if is_pt else 'Avg Dist (km)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{gps['avg_high_intensity_m']:.0f}</div>
                    <div class="stat-label">{'Alta Int. (m)' if is_pt else 'High Int (m)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{gps['avg_sprints']:.1f}</div>
                    <div class="stat-label">{'Sprints/Sessão' if is_pt else 'Sprints/Sess'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{gps['max_speed_kmh']:.1f}</div>
                    <div class="stat-label">{'Vel. Máx (km/h)' if is_pt else 'Max Speed'}</div>
                </div>
            </div>
            <div class="two-col">
                {make_line_chart(distances, '#3b82f6', 'Distância Total' if is_pt else 'Total Distance', 'm')}
                {make_line_chart(hi_distances, '#f59e0b', 'Alta Intensidade' if is_pt else 'High Intensity', 'm')}
            </div>
            <div class="two-col">
                {make_line_chart(sprint_distances, '#ef4444', 'Distância Sprints' if is_pt else 'Sprint Distance', 'm')}
                {make_line_chart(sprints, '#8b5cf6', 'Número de Sprints' if is_pt else 'Number of Sprints', '')}
            </div>
        </div>
"""

    # ============= WELLNESS SECTION WITH CHART =============
    if analysis.wellness_summary and wellness_history:
        w = analysis.wellness_summary
        
        # Wellness evolution chart
        wellness_scores = [wh.get('wellness_score', 0) for wh in wellness_history]
        readiness_scores = [wh.get('readiness_score', 0) for wh in wellness_history]
        wellness_dates = [wh.get('date', '')[:5] for wh in wellness_history]
        
        chart_width = 760
        chart_height = 140
        padding = 50
        
        def make_dual_line_chart(values1, values2, color1, color2, label1, label2):
            if not values1:
                return ""
            max_val = 10
            min_val = 0
            inner_w = chart_width - padding * 2
            inner_h = chart_height - 40
            
            def get_points(values):
                pts = []
                for i, v in enumerate(values):
                    x = padding + (i / max(len(values)-1, 1)) * inner_w
                    y = chart_height - 20 - ((v - min_val) / (max_val - min_val)) * inner_h
                    pts.append(f"{x},{y}")
                return " ".join(pts)
            
            # Grid
            grid = ""
            for i in range(5):
                y = chart_height - 20 - (i / 4) * inner_h
                val = min_val + (i / 4) * (max_val - min_val)
                grid += f'<line x1="{padding}" y1="{y}" x2="{chart_width-padding}" y2="{y}" stroke="#334155" stroke-dasharray="4"/>'
                grid += f'<text x="{padding-5}" y="{y+4}" text-anchor="end" fill="#64748b" font-size="9">{int(val)}</text>'
            
            return f'''
            <div class="chart-container">
                <div class="chart-title">{'Evolução Wellness & Prontidão' if is_pt else 'Wellness & Readiness Evolution'}</div>
                <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}">
                    {grid}
                    <polyline points="{get_points(values1)}" fill="none" stroke="{color1}" stroke-width="2"/>
                    <polyline points="{get_points(values2)}" fill="none" stroke="{color2}" stroke-width="2"/>
                </svg>
                <div class="legend">
                    <div class="legend-item"><div class="legend-dot" style="background:{color1}"></div>{label1}</div>
                    <div class="legend-item"><div class="legend-dot" style="background:{color2}"></div>{label2}</div>
                </div>
            </div>
            '''
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>💚</span> Wellness & {'Prontidão' if is_pt else 'Readiness'}</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value">{w['avg_wellness_score']:.1f}</div>
                    <div class="stat-label">Wellness Médio</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{w['avg_readiness_score']:.1f}</div>
                    <div class="stat-label">{'Prontidão Média' if is_pt else 'Avg Readiness'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{w['avg_sleep_hours']:.1f}h</div>
                    <div class="stat-label">{'Sono Médio' if is_pt else 'Avg Sleep'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{w['avg_fatigue']:.1f}</div>
                    <div class="stat-label">{'Fadiga Média' if is_pt else 'Avg Fatigue'}</div>
                </div>
            </div>
            {make_dual_line_chart(wellness_scores, readiness_scores, '#10b981', '#3b82f6', 'Wellness', 'Prontidão' if is_pt else 'Readiness')}
        </div>
"""

    # ============= JUMP ASSESSMENT SECTION WITH CHARTS =============
    if analysis.jump_analysis and jump_history:
        j = analysis.jump_analysis
        latest = j.get('latest', {})
        hist = j.get('historical', {})
        
        # RSI evolution chart
        rsi_values = [jh.get('rsi', 0) for jh in jump_history]
        jump_dates = [jh.get('date', '')[:5] for jh in jump_history]
        
        chart_width = 380
        chart_height = 120
        
        def make_rsi_chart():
            if not rsi_values or all(v == 0 for v in rsi_values):
                return ""
            max_val = max(rsi_values) * 1.2 if max(rsi_values) > 0 else 2
            min_val = min(rsi_values) * 0.8 if min(rsi_values) > 0 else 0
            inner_w = chart_width - 80
            inner_h = chart_height - 40
            
            points = []
            circles = ""
            for i, v in enumerate(rsi_values):
                x = 50 + (i / max(len(rsi_values)-1, 1)) * inner_w
                y = chart_height - 20 - ((v - min_val) / (max_val - min_val)) * inner_h if max_val > min_val else chart_height - 20
                points.append(f"{x},{y}")
                circles += f'<circle cx="{x}" cy="{y}" r="4" fill="#10b981"/>'
            
            # Baseline line
            avg_rsi = sum(rsi_values) / len(rsi_values)
            baseline_y = chart_height - 20 - ((avg_rsi - min_val) / (max_val - min_val)) * inner_h if max_val > min_val else chart_height / 2
            
            return f'''
            <div class="chart-container">
                <div class="chart-title">{'Evolução RSI' if is_pt else 'RSI Evolution'}</div>
                <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}">
                    <line x1="50" y1="{baseline_y}" x2="{chart_width-30}" y2="{baseline_y}" stroke="#f59e0b" stroke-dasharray="6 3"/>
                    <text x="{chart_width-25}" y="{baseline_y-5}" fill="#f59e0b" font-size="9">Baseline</text>
                    <polyline points="{' '.join(points)}" fill="none" stroke="#10b981" stroke-width="2"/>
                    {circles}
                    <text x="45" y="{chart_height - 20 - inner_h + 4}" text-anchor="end" fill="#64748b" font-size="9">{max_val:.2f}</text>
                    <text x="45" y="{chart_height - 16}" text-anchor="end" fill="#64748b" font-size="9">{min_val:.2f}</text>
                </svg>
            </div>
            '''
        
        # Z-Score gauge
        z_score = hist.get('z_score', 0)
        z_color = "#ef4444" if z_score < -1.5 else "#f59e0b" if z_score < -0.5 else "#10b981" if z_score < 0.5 else "#3b82f6"
        
        # Fatigue index visualization
        fatigue_pct = abs(hist.get('rsi_variation_percent', 0))
        fatigue_status = latest.get('fatigue_status', 'green')
        fatigue_color = "#ef4444" if fatigue_status == 'red' else "#f59e0b" if fatigue_status == 'yellow' else "#10b981"
        
        # Check for asymmetry
        asymmetry_alert = ""
        if latest.get('protocol', '').startswith('SL-CMJ'):
            # Would need additional data - for now just show if available in analysis
            pass
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>🦘</span> {'Avaliação de Salto' if is_pt else 'Jump Assessment'} - {latest.get('protocol', 'CMJ')}</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value" style="color: {fatigue_color}">{latest.get('rsi', 0):.2f}</div>
                    <div class="stat-label">RSI</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{latest.get('jump_height_cm', 0):.1f}</div>
                    <div class="stat-label">{'Altura (cm)' if is_pt else 'Height (cm)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{latest.get('peak_power_w', 0):.0f}</div>
                    <div class="stat-label">{'Potência (W)' if is_pt else 'Power (W)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{latest.get('relative_power_wkg', 0):.1f}</div>
                    <div class="stat-label">W/kg</div>
                </div>
            </div>
            <div class="grid-3">
                <div class="stat-card">
                    <div class="stat-value" style="color: {z_color}">{z_score:.2f}</div>
                    <div class="stat-label">Z-Score</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: {fatigue_color}">{fatigue_pct:.1f}%</div>
                    <div class="stat-label">{'Índice de Fadiga' if is_pt else 'Fatigue Index'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{latest.get('peak_velocity_ms', 0):.2f}</div>
                    <div class="stat-label">{'Vel. Pico (m/s)' if is_pt else 'Peak Vel (m/s)'}</div>
                </div>
            </div>
            {make_rsi_chart()}
            {f'<div class="alert"><p>⚠️ {"RSI indica fadiga neuromuscular" if is_pt else "RSI indicates neuromuscular fatigue"} ({hist.get("rsi_variation_percent", 0):.1f}% {"abaixo do baseline" if is_pt else "below baseline"})</p></div>' if j.get('fatigue_alert') else ''}
        </div>
"""

    # ============= VBT SECTION WITH LOAD-VELOCITY CHART =============
    if analysis.vbt_analysis and vbt_data:
        v = analysis.vbt_analysis
        lvp = v.get('load_velocity_profile', {})
        
        # Collect all data points for load-velocity chart
        all_points = []
        for session in vbt_data:
            for s in session.get('sets', []):
                if s.get('load_kg', 0) > 0 and s.get('mean_velocity', 0) > 0:
                    all_points.append({'load': s['load_kg'], 'velocity': s['mean_velocity']})
        
        # Load-Velocity Chart
        lv_chart = ""
        if lvp.get('slope') and lvp.get('intercept') and all_points:
            chart_width = 380
            chart_height = 160
            max_load = lvp.get('estimated_1rm_kg', 150) * 1.1
            max_vel = 1.5
            slope = lvp['slope']
            intercept = lvp['intercept']
            
            # Points
            points_svg = ""
            for p in all_points:
                x = 50 + (p['load'] / max_load) * (chart_width - 80)
                y = chart_height - 30 - (p['velocity'] / max_vel) * (chart_height - 50)
                points_svg += f'<circle cx="{x}" cy="{y}" r="4" fill="#8b5cf6" opacity="0.6"/>'
            
            # Regression line
            x1 = 50
            y1 = chart_height - 30 - (intercept / max_vel) * (chart_height - 50)
            x2 = 50 + (max_load / max_load) * (chart_width - 80)
            y2_vel = intercept + slope * max_load
            y2 = chart_height - 30 - (y2_vel / max_vel) * (chart_height - 50)
            
            # MVT line
            mvt = 0.3
            mvt_y = chart_height - 30 - (mvt / max_vel) * (chart_height - 50)
            
            # 1RM point
            est_1rm = lvp.get('estimated_1rm_kg', 0)
            rm_x = 50 + (est_1rm / max_load) * (chart_width - 80) if est_1rm else 0
            
            # Optimal load point
            opt_load = lvp.get('optimal_load_kg', 0)
            opt_vel = intercept + slope * opt_load if opt_load else 0
            opt_x = 50 + (opt_load / max_load) * (chart_width - 80) if opt_load else 0
            opt_y = chart_height - 30 - (opt_vel / max_vel) * (chart_height - 50) if opt_vel > 0 else 0
            
            lv_chart = f'''
            <div class="chart-container">
                <div class="chart-title">{'Perfil Carga-Velocidade' if is_pt else 'Load-Velocity Profile'}</div>
                <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}">
                    <!-- Grid -->
                    <line x1="50" y1="{chart_height - 30}" x2="{chart_width - 30}" y2="{chart_height - 30}" stroke="#334155"/>
                    <line x1="50" y1="20" x2="50" y2="{chart_height - 30}" stroke="#334155"/>
                    
                    <!-- MVT Line -->
                    <line x1="50" y1="{mvt_y}" x2="{chart_width - 30}" y2="{mvt_y}" stroke="#ef4444" stroke-dasharray="6 3"/>
                    <text x="{chart_width - 25}" y="{mvt_y - 5}" fill="#ef4444" font-size="9">MVT</text>
                    
                    <!-- Data points -->
                    {points_svg}
                    
                    <!-- Regression line -->
                    <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#8b5cf6" stroke-width="2"/>
                    
                    <!-- 1RM point -->
                    {f'<circle cx="{rm_x}" cy="{mvt_y}" r="6" fill="#10b981"/><text x="{rm_x}" y="{mvt_y + 15}" text-anchor="middle" fill="#10b981" font-size="9" font-weight="bold">1RM</text>' if est_1rm else ''}
                    
                    <!-- Optimal load point -->
                    {f'<circle cx="{opt_x}" cy="{opt_y}" r="6" fill="#f59e0b"/>' if opt_load else ''}
                    
                    <!-- Axis labels -->
                    <text x="{chart_width / 2}" y="{chart_height - 5}" text-anchor="middle" fill="#64748b" font-size="9">{'Carga (kg)' if is_pt else 'Load (kg)'}</text>
                    <text x="15" y="{chart_height / 2}" text-anchor="middle" fill="#64748b" font-size="9" transform="rotate(-90, 15, {chart_height / 2})">m/s</text>
                </svg>
                <div class="legend">
                    <div class="legend-item"><div class="legend-dot" style="background:#10b981"></div>1RM: {est_1rm:.0f}kg</div>
                    <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>{'Carga Ótima' if is_pt else 'Optimal'}: {opt_load:.0f}kg</div>
                </div>
            </div>
            '''
        
        # Velocity Loss Chart
        vl_data = v.get('velocity_loss_analysis', [])
        vl_chart = ""
        if vl_data:
            chart_width = 380
            chart_height = 120
            max_loss = max(30, max(d['loss_percent'] for d in vl_data) * 1.2)
            bar_width = min(35, (chart_width - 80) / len(vl_data) - 8)
            
            bars = ""
            for i, d in enumerate(vl_data):
                x = 50 + i * (bar_width + 8)
                bar_h = (d['loss_percent'] / max_loss) * (chart_height - 50)
                y = chart_height - 30 - bar_h
                color = "#ef4444" if d['loss_percent'] >= 20 else "#f59e0b" if d['loss_percent'] >= 10 else "#10b981"
                bars += f'''
                    <rect x="{x}" y="{y}" width="{bar_width}" height="{bar_h}" fill="{color}" rx="4"/>
                    <text x="{x + bar_width/2}" y="{y - 5}" text-anchor="middle" fill="{color}" font-size="9" font-weight="bold">{d['loss_percent']:.0f}%</text>
                    <text x="{x + bar_width/2}" y="{chart_height - 15}" text-anchor="middle" fill="#64748b" font-size="9">S{d['set']}</text>
                '''
            
            # Fatigue zone line
            fatigue_y = chart_height - 30 - (20 / max_loss) * (chart_height - 50)
            
            vl_chart = f'''
            <div class="chart-container">
                <div class="chart-title">{'Perda de Velocidade por Série' if is_pt else 'Velocity Loss by Set'}</div>
                <svg width="{chart_width}" height="{chart_height}" viewBox="0 0 {chart_width} {chart_height}">
                    <line x1="50" y1="{fatigue_y}" x2="{chart_width - 30}" y2="{fatigue_y}" stroke="#ef4444" stroke-dasharray="4"/>
                    <text x="{chart_width - 25}" y="{fatigue_y - 5}" fill="#ef4444" font-size="8">{"Zona Fadiga" if is_pt else "Fatigue"}</text>
                    {bars}
                </svg>
            </div>
            '''
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>⚡</span> VBT - {'Perfil Força-Velocidade' if is_pt else 'Force-Velocity Profile'}</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value">{lvp.get('estimated_1rm_kg', 0):.0f}</div>
                    <div class="stat-label">1RM Est. (kg)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{lvp.get('optimal_load_kg', 0):.0f}</div>
                    <div class="stat-label">{'Carga Ótima (kg)' if is_pt else 'Optimal (kg)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{abs(lvp.get('slope', 0)) * 1000:.2f}</div>
                    <div class="stat-label">Slope (mm/s/kg)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{lvp.get('intercept', 0):.2f}</div>
                    <div class="stat-label">V0 (m/s)</div>
                </div>
            </div>
            <div class="two-col">
                {lv_chart}
                {vl_chart}
            </div>
            {f'<div class="alert"><p>⚠️ {"Perda de velocidade ≥20% detectada - Indica fadiga periférica" if is_pt else "Velocity loss ≥20% detected - Indicates peripheral fatigue"}</p></div>' if v.get("fatigue_detected") else ""}
        </div>
"""

    # ============= BODY COMPOSITION SECTION =============
    if analysis.body_composition:
        bc = analysis.body_composition
        latest = bc.get('latest', {})
        
        body_fat = latest.get('body_fat_percent', 0)
        lean_mass = latest.get('lean_mass_kg', 0)
        fat_mass = latest.get('fat_mass_kg', 0)
        
        # Donut chart for body composition
        donut_chart = ""
        if lean_mass > 0 or fat_mass > 0:
            total = lean_mass + fat_mass
            lean_pct = (lean_mass / total) * 100 if total > 0 else 0
            
            # SVG donut
            size = 120
            stroke_width = 14
            radius = (size - stroke_width) / 2
            circumference = 2 * 3.14159 * radius
            fat_offset = circumference * (1 - body_fat / 100)
            
            donut_chart = f'''
            <div style="display: flex; align-items: center; gap: 20px; justify-content: center; margin: 16px 0;">
                <svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">
                    <circle cx="{size/2}" cy="{size/2}" r="{radius}" stroke="#10b981" stroke-width="{stroke_width}" fill="none"/>
                    <circle cx="{size/2}" cy="{size/2}" r="{radius}" stroke="#f59e0b" stroke-width="{stroke_width}" fill="none"
                            stroke-dasharray="{circumference}" stroke-dashoffset="{fat_offset}" stroke-linecap="round"
                            transform="rotate(-90 {size/2} {size/2})"/>
                    <text x="{size/2}" y="{size/2 - 8}" text-anchor="middle" fill="#f8fafc" font-size="18" font-weight="bold">{body_fat:.1f}%</text>
                    <text x="{size/2}" y="{size/2 + 10}" text-anchor="middle" fill="#94a3b8" font-size="10">{"Gordura" if is_pt else "Body Fat"}</text>
                </svg>
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981;"></div>
                        <span style="color: #f8fafc; font-weight: bold;">{lean_mass:.1f} kg</span>
                        <span style="color: #94a3b8; font-size: 12px;">{"Massa Magra" if is_pt else "Lean Mass"}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b;"></div>
                        <span style="color: #f8fafc; font-weight: bold;">{fat_mass:.1f} kg</span>
                        <span style="color: #94a3b8; font-size: 12px;">{"Massa Gorda" if is_pt else "Fat Mass"}</span>
                    </div>
                </div>
            </div>
            '''
        
        trend = bc.get('trend', {})
        trend_html = ""
        if trend:
            fat_change = trend.get('fat_percent_change', 0)
            lean_change = trend.get('lean_mass_change_kg', 0)
            trend_color = "#10b981" if fat_change <= 0 and lean_change >= 0 else "#ef4444"
            trend_icon = "📈" if trend.get('direction') == 'improving' else "📉" if trend.get('direction') == 'declining' else "➡️"
            trend_html = f'''
            <div class="alert {'warning' if trend.get('direction') != 'improving' else ''}" style="background: rgba(16, 185, 129, 0.1); border-left-color: {trend_color};">
                <p style="color: {trend_color};">{trend_icon} {"Tendência" if is_pt else "Trend"}: {'+' if fat_change > 0 else ''}{fat_change:.1f}% {"gordura" if is_pt else "fat"}, {'+' if lean_change > 0 else ''}{lean_change:.1f}kg {"massa magra" if is_pt else "lean"}</p>
            </div>
            '''
        
        html_content += f"""
        <div class="section">
            <div class="section-title"><span>🏋️</span> {'Composição Corporal' if is_pt else 'Body Composition'}</div>
            <div class="grid-4">
                <div class="stat-card">
                    <div class="stat-value">{body_fat:.1f}%</div>
                    <div class="stat-label">{'Gordura' if is_pt else 'Body Fat'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{lean_mass:.1f}</div>
                    <div class="stat-label">{'Massa Magra (kg)' if is_pt else 'Lean (kg)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{fat_mass:.1f}</div>
                    <div class="stat-label">{'Massa Gorda (kg)' if is_pt else 'Fat (kg)'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">{imc:.1f}</div>
                    <div class="stat-label">IMC</div>
                </div>
            </div>
            {donut_chart}
            {trend_html}
        </div>
"""

    # AI Insights Section
    if analysis.scientific_insights:
        html_content += f"""
        <div class="insights">
            <div class="insights-title">🧠 {'Insights Científicos (IA)' if is_pt else 'Scientific Insights (AI)'}</div>
            <div class="insights-text">{analysis.scientific_insights}</div>
        </div>
"""

    html_content += """
        <button class="print-btn" onclick="window.print()">
            🖨️ Imprimir PDF
        </button>
    </div>
</body>
</html>
"""

    return HTMLResponse(content=html_content, status_code=200)

