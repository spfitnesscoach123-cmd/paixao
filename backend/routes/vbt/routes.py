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


router = APIRouter(tags=["VBT"])

# ============= VBT (VELOCITY BASED TRAINING) INTEGRATION =============

class VBTProvider(str, Enum):
    PUSH_BAND = "push_band"
    BEAST = "beast"
    VITRUVE = "vitruve"
    MANUAL = "manual"
    CAMERA = "camera"

class VBTDataCreate(BaseModel):
    athlete_id: str
    date: str
    provider: VBTProvider
    exercise: str
    sets: List[dict]  # [{reps: int, mean_velocity: float, peak_velocity: float, load_kg: float, power_watts: float, rom_cm: float}]
    notes: Optional[str] = None

@router.get("/vbt/providers")
async def get_vbt_providers():
    """Get supported VBT providers with Bluetooth connectivity"""
    return {
        "providers": [
            {
                "id": "push_band",
                "name": "PUSH Band 2.0",
                "description_pt": "Sensor vestível Bluetooth para VBT",
                "description_en": "Bluetooth wearable sensor for VBT",
                "metrics": ["mean_velocity", "peak_velocity", "power"],
                "connection": "bluetooth",
                "icon": "fitness",
                "color": "#FF6B35",
                "website": "https://www.trainwithpush.com"
            },
            {
                "id": "vitruve",
                "name": "Vitruve",
                "description_pt": "Encoder VBT compacto com Bluetooth",
                "description_en": "Compact VBT encoder with Bluetooth",
                "metrics": ["mean_velocity", "peak_velocity", "power", "rom"],
                "connection": "bluetooth",
                "icon": "speedometer",
                "color": "#00D4AA",
                "website": "https://vitruve.fit"
            },
            {
                "id": "beast",
                "name": "Beast Sensor",
                "description_pt": "Sensor IMU Bluetooth para VBT",
                "description_en": "Bluetooth IMU sensor for VBT",
                "metrics": ["mean_velocity", "peak_velocity", "power"],
                "connection": "bluetooth",
                "icon": "flash",
                "color": "#FFD700"
            },
            {
                "id": "manual",
                "name": "Manual Entry",
                "description_pt": "Entrada manual de dados VBT",
                "description_en": "Manual VBT data entry",
                "metrics": ["mean_velocity", "peak_velocity", "power", "rom"],
                "import_format": "form"
            },
            {
                "id": "camera",
                "name": "Camera Tracking",
                "description_pt": "Rastreamento de velocidade via câmera em tempo real",
                "description_en": "Real-time velocity tracking via camera",
                "metrics": ["mean_velocity", "peak_velocity", "power", "velocity_drop"],
                "import_format": "camera",
                "icon": "videocam",
                "color": "#10b981"
            }
        ],
        "exercises": [
            "Back Squat", "Front Squat", "Bench Press", "Deadlift", 
            "Power Clean", "Hang Clean", "Snatch", "Push Press",
            "Overhead Press", "Hip Thrust", "Romanian Deadlift",
            "Jump Squat", "Trap Bar Deadlift"
        ]
    }

@router.post("/vbt/data")
async def create_vbt_data(
    data: VBTDataCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create VBT (Velocity Based Training) data entry"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(data.athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Calculate summary metrics
    all_velocities = [s.get("mean_velocity", 0) for s in data.sets if s.get("mean_velocity")]
    all_powers = [s.get("power_watts", 0) for s in data.sets if s.get("power_watts")]
    all_loads = [s.get("load_kg", 0) for s in data.sets if s.get("load_kg")]
    
    vbt_record = {
        "athlete_id": data.athlete_id,
        "coach_id": current_user["_id"],
        "date": data.date,
        "provider": data.provider.value,
        "exercise": data.exercise,
        "sets": data.sets,
        "summary": {
            "total_sets": len(data.sets),
            "total_reps": sum(s.get("reps", 0) for s in data.sets),
            "avg_velocity": sum(all_velocities) / len(all_velocities) if all_velocities else 0,
            "max_velocity": max(all_velocities) if all_velocities else 0,
            "avg_power": sum(all_powers) / len(all_powers) if all_powers else 0,
            "max_power": max(all_powers) if all_powers else 0,
            "max_load": max(all_loads) if all_loads else 0
        },
        "notes": data.notes,
        "created_at": datetime.utcnow()
    }
    
    result = await db.vbt_data.insert_one(vbt_record)
    vbt_record["_id"] = str(result.inserted_id)
    
    return vbt_record

@router.get("/vbt/athlete/{athlete_id}")
async def get_athlete_vbt_data(
    athlete_id: str,
    exercise: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get VBT data for an athlete"""
    # Verify athlete
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
    
    if exercise:
        query["exercise"] = exercise
    
    records = await db.vbt_data.find(query).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(100)
    
    for record in records:
        record["_id"] = str(record["_id"])
    
    return records

@router.post("/vbt/import/csv")
async def import_vbt_csv(
    athlete_id: str,
    provider: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Import VBT data from CSV file (PUSH Band, Vitruve, Beast formats)"""
    import csv
    
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(decoded.splitlines())
    
    # Group by exercise and date
    exercises_data = {}
    
    for row in reader:
        date = row.get("date", row.get("Date", ""))
        exercise = row.get("exercise", row.get("Exercise", row.get("Movement", "")))
        
        key = f"{date}_{exercise}"
        if key not in exercises_data:
            exercises_data[key] = {
                "date": date,
                "exercise": exercise,
                "sets": []
            }
        
        set_data = {
            "reps": int(row.get("reps", row.get("Reps", 1)) or 1),
            "mean_velocity": float(row.get("mean_velocity", row.get("Mean Velocity", row.get("Avg Velocity", 0))) or 0),
            "peak_velocity": float(row.get("peak_velocity", row.get("Peak Velocity", row.get("Max Velocity", 0))) or 0),
            "load_kg": float(row.get("load_kg", row.get("Load", row.get("Weight", 0))) or 0),
            "power_watts": float(row.get("power_watts", row.get("Power", row.get("Avg Power", 0))) or 0),
            "rom_cm": float(row.get("rom_cm", row.get("ROM", row.get("Range of Motion", 0))) or 0)
        }
        exercises_data[key]["sets"].append(set_data)
    
    # Store each exercise session
    imported_count = 0
    for key, exercise_data in exercises_data.items():
        all_velocities = [s["mean_velocity"] for s in exercise_data["sets"] if s["mean_velocity"]]
        all_powers = [s["power_watts"] for s in exercise_data["sets"] if s["power_watts"]]
        all_loads = [s["load_kg"] for s in exercise_data["sets"] if s["load_kg"]]
        
        vbt_record = {
            "athlete_id": athlete_id,
            "coach_id": current_user["_id"],
            "date": exercise_data["date"],
            "provider": provider,
            "exercise": exercise_data["exercise"],
            "sets": exercise_data["sets"],
            "summary": {
                "total_sets": len(exercise_data["sets"]),
                "total_reps": sum(s["reps"] for s in exercise_data["sets"]),
                "avg_velocity": sum(all_velocities) / len(all_velocities) if all_velocities else 0,
                "max_velocity": max(all_velocities) if all_velocities else 0,
                "avg_power": sum(all_powers) / len(all_powers) if all_powers else 0,
                "max_power": max(all_powers) if all_powers else 0,
                "max_load": max(all_loads) if all_loads else 0
            },
            "source": "csv_import",
            "created_at": datetime.utcnow()
        }
        
        await db.vbt_data.insert_one(vbt_record)
        imported_count += 1
    
    return {
        "success": True,
        "exercises_imported": imported_count,
        "provider": provider,
        "athlete_id": athlete_id
    }

@router.get("/vbt/analysis/{athlete_id}")
async def get_vbt_analysis(
    athlete_id: str,
    exercise: str,
    lang: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Get VBT analysis with velocity-load profiling and fatigue detection"""
    # Verify athlete
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Get VBT data for this exercise
    records = await db.vbt_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"],
        "exercise": exercise
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(50)
    
    if not records:
        raise HTTPException(status_code=400, detail="No VBT data available for this exercise")
    
    # Calculate Load-Velocity Profile (LVP)
    load_velocity_points = []
    for record in records:
        for set_data in record.get("sets", []):
            if set_data.get("load_kg") and set_data.get("mean_velocity"):
                load_velocity_points.append({
                    "load": set_data["load_kg"],
                    "velocity": set_data["mean_velocity"],
                    "date": record["date"]
                })
    
    # Calculate estimated 1RM based on load-velocity relationship
    # Using Bazuelo-Ruiz et al. formula: 1RM velocity ≈ 0.17 m/s for most exercises
    mvt_velocity = 0.17  # Minimum Velocity Threshold
    
    if len(load_velocity_points) >= 2:
        # Simple linear regression for load-velocity
        loads = [p["load"] for p in load_velocity_points]
        velocities = [p["velocity"] for p in load_velocity_points]
        
        n = len(loads)
        sum_x = sum(loads)
        sum_y = sum(velocities)
        sum_xy = sum(l * v for l, v in zip(loads, velocities))
        sum_x2 = sum(l ** 2 for l in loads)
        
        if (n * sum_x2 - sum_x ** 2) != 0:
            slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x ** 2)
            intercept = (sum_y - slope * sum_x) / n
            
            # Estimated 1RM where velocity = MVT
            if slope != 0:
                estimated_1rm = (mvt_velocity - intercept) / slope
            else:
                estimated_1rm = None
        else:
            slope = 0
            intercept = 0
            estimated_1rm = None
    else:
        slope = 0
        intercept = 0
        estimated_1rm = None
    
    # Calculate OPTIMAL LOAD (where power is maximized)
    # Power = Load × Velocity
    # Using the linear regression: velocity = intercept + slope × load
    # Power = load × (intercept + slope × load) = intercept×load + slope×load²
    # To maximize: dP/dLoad = intercept + 2×slope×load = 0
    # optimal_load = -intercept / (2 × slope)
    optimal_load = None
    optimal_velocity = None
    optimal_power = None
    
    if slope and slope < 0 and intercept:  # slope should be negative for valid profile
        optimal_load = -intercept / (2 * slope)
        if optimal_load > 0:
            optimal_velocity = intercept + slope * optimal_load
            optimal_power = optimal_load * optimal_velocity
            optimal_load = round(optimal_load, 1)
            optimal_velocity = round(optimal_velocity, 3)
            optimal_power = round(optimal_power, 0)
        else:
            optimal_load = None
    
    # Track optimal load evolution over time
    optimal_load_history = []
    if len(records) >= 2:
        for record in records[:10]:
            record_loads = []
            record_velocities = []
            for set_data in record.get("sets", []):
                if set_data.get("load_kg") and set_data.get("mean_velocity"):
                    record_loads.append(set_data["load_kg"])
                    record_velocities.append(set_data["mean_velocity"])
            
            if len(record_loads) >= 2:
                # Calculate slope and intercept for this session
                n = len(record_loads)
                sum_x = sum(record_loads)
                sum_y = sum(record_velocities)
                sum_xy = sum(l * v for l, v in zip(record_loads, record_velocities))
                sum_x2 = sum(l ** 2 for l in record_loads)
                
                denom = n * sum_x2 - sum_x ** 2
                if denom != 0:
                    rec_slope = (n * sum_xy - sum_x * sum_y) / denom
                    rec_intercept = (sum_y - rec_slope * sum_x) / n
                    
                    if rec_slope < 0 and rec_intercept > 0:
                        rec_optimal_load = -rec_intercept / (2 * rec_slope)
                        if rec_optimal_load > 0:
                            rec_optimal_velocity = rec_intercept + rec_slope * rec_optimal_load
                            rec_optimal_power = rec_optimal_load * rec_optimal_velocity
                            optimal_load_history.append({
                                "date": record["date"],
                                "optimal_load": round(rec_optimal_load, 1),
                                "optimal_velocity": round(rec_optimal_velocity, 3),
                                "optimal_power": round(rec_optimal_power, 0)
                            })
    
    # Velocity loss analysis (fatigue indicator)
    latest_record = records[0]
    velocity_loss_data = []
    if len(latest_record.get("sets", [])) >= 2:
        first_set_velocity = latest_record["sets"][0].get("mean_velocity", 0)
        for i, set_data in enumerate(latest_record["sets"]):
            velocity = set_data.get("mean_velocity", 0)
            if first_set_velocity > 0:
                loss_percent = ((first_set_velocity - velocity) / first_set_velocity) * 100
                velocity_loss_data.append({
                    "set": i + 1,
                    "velocity": velocity,
                    "loss_percent": round(loss_percent, 1)
                })
    
    # Calculate trend
    trend = "stable"
    if len(records) >= 3:
        recent_avg = sum(r["summary"]["avg_velocity"] for r in records[:3]) / 3
        older_avg = sum(r["summary"]["avg_velocity"] for r in records[-3:]) / 3
        if recent_avg > older_avg * 1.05:
            trend = "improving"
        elif recent_avg < older_avg * 0.95:
            trend = "declining"
    
    return {
        "athlete_id": athlete_id,
        "athlete_name": athlete.get("name"),
        "exercise": exercise,
        "latest_session": {
            "date": latest_record["date"],
            "sets": len(latest_record.get("sets", [])),
            "avg_velocity": latest_record["summary"]["avg_velocity"],
            "max_velocity": latest_record["summary"]["max_velocity"],
            "max_power": latest_record["summary"]["max_power"],
            "max_load": latest_record["summary"]["max_load"]
        },
        "load_velocity_profile": {
            "slope": round(slope, 4) if slope else None,
            "intercept": round(intercept, 2) if intercept else None,
            "estimated_1rm": round(estimated_1rm, 1) if estimated_1rm else None,
            "mvt_velocity": mvt_velocity,
            "data_points": len(load_velocity_points),
            "optimal_load": optimal_load,
            "optimal_velocity": optimal_velocity,
            "optimal_power": optimal_power
        },
        "optimal_load_evolution": optimal_load_history,
        "velocity_loss_analysis": velocity_loss_data,
        "trend": trend,
        "history": [
            {
                "date": r["date"],
                "avg_velocity": r["summary"]["avg_velocity"],
                "max_velocity": r["summary"]["max_velocity"],
                "max_load": r["summary"]["max_load"]
            } for r in records[:10]
        ],
        "recommendations": {
            "pt": get_vbt_recommendations_pt(velocity_loss_data, trend, estimated_1rm),
            "en": get_vbt_recommendations_en(velocity_loss_data, trend, estimated_1rm)
        }.get(lang, get_vbt_recommendations_en(velocity_loss_data, trend, estimated_1rm))
    }

def get_vbt_recommendations_pt(velocity_loss, trend, estimated_1rm):
    recs = []
    if velocity_loss and len(velocity_loss) > 1:
        max_loss = max(vl["loss_percent"] for vl in velocity_loss)
        if max_loss > 20:
            recs.append("⚠️ Perda de velocidade alta (>20%) indica fadiga significativa. Considere reduzir volume.")
        elif max_loss < 10:
            recs.append("✅ Baixa perda de velocidade. Pode aumentar intensidade ou volume.")
    
    if trend == "improving":
        recs.append("📈 Tendência de melhora na velocidade. Continue progredindo gradualmente.")
    elif trend == "declining":
        recs.append("📉 Tendência de queda. Considere período de recuperação ou deload.")
    
    if estimated_1rm:
        recs.append(f"💪 1RM estimado: {estimated_1rm:.1f} kg baseado no perfil carga-velocidade.")
    
    return recs

def get_vbt_recommendations_en(velocity_loss, trend, estimated_1rm):
    recs = []
    if velocity_loss and len(velocity_loss) > 1:
        max_loss = max(vl["loss_percent"] for vl in velocity_loss)
        if max_loss > 20:
            recs.append("⚠️ High velocity loss (>20%) indicates significant fatigue. Consider reducing volume.")
        elif max_loss < 10:
            recs.append("✅ Low velocity loss. Can increase intensity or volume.")
    
    if trend == "improving":
        recs.append("📈 Improving velocity trend. Continue progressing gradually.")
    elif trend == "declining":
        recs.append("📉 Declining trend. Consider recovery period or deload.")
    
    if estimated_1rm:
        recs.append(f"💪 Estimated 1RM: {estimated_1rm:.1f} kg based on load-velocity profile.")
    
    return recs

