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
from utils.gps_session_resolver import resolve_session_records

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None


router = APIRouter(tags=["Periodization"])

# ============= PERIODIZATION MODELS =============

class DayClassification(str, Enum):
    MD = "MD"      # Match Day
    MD_1 = "MD-1"  # Match Day minus 1
    MD_2 = "MD-2"  # Match Day minus 2
    MD_3 = "MD-3"  # Match Day minus 3
    MD_4 = "MD-4"  # Match Day minus 4
    MD_5 = "MD-5"  # Match Day minus 5
    DO = "D.O"     # Day Off

class GPSMetricType(str, Enum):
    TOTAL_DISTANCE = "total_distance"
    HID_Z3 = "hid_z3"           # 15-20 km/h
    HSR_Z4 = "hsr_z4"           # 20-25 km/h
    SPRINT_Z5 = "sprint_z5"     # >25 km/h
    SPRINTS_COUNT = "sprints_count"
    ACC_DEC_TOTAL = "acc_dec_total"  # ACC + DECC sum

# Peak values for each athlete (updated when new higher value from GAME)
class AthletePeakValues(BaseModel):
    athlete_id: str
    coach_id: str
    total_distance: float = 0
    hid_z3: float = 0           # High Intensity Distance 15-20 km/h
    hsr_z4: float = 0           # High Speed Running 20-25 km/h
    sprint_z5: float = 0        # Sprint >25 km/h
    sprints_count: int = 0
    acc_dec_total: int = 0      # Accelerations + Decelerations
    last_updated: Optional[datetime] = None
    update_history: List[Dict] = []  # Track updates for notifications

class WeeklyPrescription(BaseModel):
    total_distance_multiplier: float = 1.0
    hid_z3_multiplier: float = 1.0
    hsr_z4_multiplier: float = 1.0
    sprint_z5_multiplier: float = 1.0
    sprints_count_multiplier: float = 1.0
    acc_dec_total_multiplier: float = 1.0

class DailyPrescription(BaseModel):
    day_classification: str  # MD, MD-1, etc.
    date: str
    total_distance_percent: float = 0
    hid_z3_percent: float = 0
    hsr_z4_percent: float = 0
    sprint_z5_percent: float = 0
    sprints_count_percent: float = 0
    acc_dec_total_percent: float = 0

class AthleteOverride(BaseModel):
    athlete_id: str
    metric: str  # which metric to override
    value: float  # overridden value (percentage or multiplier)
    reason: Optional[str] = None  # e.g., "wellness concern", "RSI low"

class PeriodizationWeekCreate(BaseModel):
    name: str  # e.g., "Semana 1 - Pré-temporada"
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    days: List[DailyPrescription]
    weekly_prescription: WeeklyPrescription
    athlete_overrides: List[AthleteOverride] = []

class PeriodizationWeek(BaseModel):
    id: Optional[str] = None
    coach_id: str
    name: str
    start_date: str
    end_date: str
    days: List[DailyPrescription]
    weekly_prescription: WeeklyPrescription
    athlete_overrides: List[AthleteOverride] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class PeakValueNotification(BaseModel):
    id: Optional[str] = None
    coach_id: str
    athlete_id: str
    athlete_name: str
    metric: str
    old_value: float
    new_value: float
    session_date: str
    created_at: Optional[datetime] = None
    read: bool = False


# ============= PERIODIZATION HELPER FUNCTIONS =============

def extract_gps_metrics_from_session(gps_records: List[dict]) -> dict:
    """
    Extract and calculate GPS metrics from a session's records.

    Source-of-truth resolution is delegated to the central GPS session resolver
    (utils/gps_session_resolver.py) — strict priority P1 record_type=session_total
    → P2 explicit record_type → P3 has_session_total → P4 legacy keywords →
    P5 sum all. The summation/output shape below is preserved bit-for-bit.
    """
    if not gps_records:
        return {
            "total_distance": 0, "hid_z3": 0, "hsr_z4": 0,
            "sprint_z5": 0, "sprints_count": 0, "acc_dec_total": 0,
        }

    source = resolve_session_records(gps_records)

    metrics = {
        "total_distance": 0, "hid_z3": 0, "hsr_z4": 0,
        "sprint_z5": 0, "sprints_count": 0, "acc_dec_total": 0,
    }

    for record in source:
        metrics["total_distance"] += record.get("total_distance", 0)
        metrics["hid_z3"] += record.get("high_intensity_distance", 0)
        metrics["hsr_z4"] += record.get("high_speed_running", 0)
        metrics["sprint_z5"] += record.get("sprint_distance", 0)
        metrics["sprints_count"] += record.get("number_of_sprints", 0)
        metrics["acc_dec_total"] += (
            record.get("number_of_accelerations", 0) +
            record.get("number_of_decelerations", 0)
        )

    return metrics


async def update_athlete_peak_values(
    athlete_id: str, 
    coach_id: str, 
    session_metrics: dict,
    session_date: str,
    athlete_name: str = ""
):
    """Update peak values if new metrics from GAME are higher"""
    # Get current peak values
    peak_doc = await db.athlete_peak_values.find_one({
        "athlete_id": athlete_id,
        "coach_id": coach_id
    })
    
    if not peak_doc:
        # Create new peak values document
        peak_doc = {
            "athlete_id": athlete_id,
            "coach_id": coach_id,
            "total_distance": 0,
            "hid_z3": 0,
            "hsr_z4": 0,
            "sprint_z5": 0,
            "sprints_count": 0,
            "acc_dec_total": 0,
            "last_updated": None,
            "update_history": []
        }
    
    updates = {}
    notifications = []
    
    metric_names = {
        "total_distance": "Distância Total",
        "hid_z3": "HID Z3 (15-20 km/h)",
        "hsr_z4": "HSR Z4 (20-25 km/h)",
        "sprint_z5": "Sprint Z5 (>25 km/h)",
        "sprints_count": "Sprints",
        "acc_dec_total": "ACC + DECC"
    }
    
    for metric, new_value in session_metrics.items():
        current_value = peak_doc.get(metric, 0)
        if new_value > current_value:
            updates[metric] = new_value
            # Create notification
            notifications.append({
                "coach_id": coach_id,
                "athlete_id": athlete_id,
                "athlete_name": athlete_name,
                "metric": metric_names.get(metric, metric),
                "old_value": current_value,
                "new_value": new_value,
                "session_date": session_date,
                "created_at": datetime.utcnow(),
                "read": False
            })
    
    if updates:
        updates["last_updated"] = datetime.utcnow()
        
        # Add to update history
        history_entry = {
            "date": session_date,
            "updated_at": datetime.utcnow().isoformat(),
            "metrics_updated": list(updates.keys())
        }
        
        await db.athlete_peak_values.update_one(
            {"athlete_id": athlete_id, "coach_id": coach_id},
            {
                "$set": updates,
                "$push": {"update_history": history_entry}
            },
            upsert=True
        )
        
        # Insert notifications
        if notifications:
            await db.peak_value_notifications.insert_many(notifications)
    
    return len(updates) > 0


@router.post("/periodization/recalculate-peaks")
async def recalculate_all_peak_values(current_user: dict = Depends(get_current_user)):
    """Recalculate peak values for all athletes based on existing GAME sessions.
    This fixes missing peak values when GPS data was imported but peaks weren't calculated.
    IMPORTANT: This will RESET all peak values first and then recalculate from scratch.
    
    The calculation uses only the TOTAL SESSION value from each CSV (ignoring sub-periods like 1st half, 2nd half).
    For each athlete, the highest value per metric across all GAME sessions is stored as their peak.
    """
    
    coach_id = current_user["_id"]
    coach_id_str = str(coach_id)  # Normalize to string for consistent queries
    
    # STEP 1: Delete all existing peak values for this coach (to fix corrupted data)
    delete_result = await db.athlete_peak_values.delete_many({"coach_id": coach_id_str})
    print(f"Deleted {delete_result.deleted_count} old peak values")
    
    # Get all GPS sessions marked as GAME
    game_sessions = await db.gps_data.find({
        "coach_id": coach_id_str,
        "activity_type": "game"
    }).to_list(5000)
    
    if not game_sessions:
        return {"message": "No GAME sessions found", "athletes_updated": 0, "peaks_deleted": delete_result.deleted_count}
    
    # Group by athlete_id and session_id
    sessions_by_athlete = {}
    for record in game_sessions:
        athlete_id = str(record.get("athlete_id", ""))
        session_id = record.get("session_id", "")
        if not athlete_id or not session_id:
            continue
        
        key = f"{athlete_id}_{session_id}"
        if key not in sessions_by_athlete:
            sessions_by_athlete[key] = {
                "athlete_id": athlete_id,
                "session_id": session_id,
                "date": record.get("date", ""),
                "records": []
            }
        sessions_by_athlete[key]["records"].append(record)
    
    # Process each session and update peak values
    athletes_updated = set()
    athletes_processed = set()
    sessions_processed = 0
    
    for session_data in sessions_by_athlete.values():
        athlete_id = session_data["athlete_id"]
        
        # Verify athlete exists - use str for coach_id comparison since athletes.coach_id is stored as str
        try:
            athlete = await db.athletes.find_one({"_id": ObjectId(athlete_id), "coach_id": coach_id_str})
            if not athlete:
                # Try with ObjectId coach_id as fallback for legacy data
                athlete = await db.athletes.find_one({"_id": ObjectId(athlete_id), "coach_id": coach_id})
                if not athlete:
                    continue
        except Exception as e:
            print(f"Error finding athlete {athlete_id}: {e}")
            continue
        
        athletes_processed.add(athlete_id)
        
        # Extract metrics from session - this function correctly uses only session total, not sum of periods
        session_metrics = extract_gps_metrics_from_session(session_data["records"])
        
        # Update peak values (only if higher than current peak)
        updated = await update_athlete_peak_values(
            athlete_id=athlete_id,
            coach_id=coach_id_str,  # Always pass as string for consistency
            session_metrics=session_metrics,
            session_date=session_data["date"],
            athlete_name=athlete.get("name", "")
        )
        
        sessions_processed += 1
        if updated:
            athletes_updated.add(athlete_id)
    
    return {
        "message": f"Peak values recalculated from {sessions_processed} GAME sessions",
        "peaks_deleted": delete_result.deleted_count,
        "athletes_processed": len(athletes_processed),
        "athletes_updated": len(athletes_updated),
        "athlete_ids": list(athletes_updated)
    }


# ============= PERIODIZATION ROUTES =============

@router.get("/periodization/weeks")
async def get_periodization_weeks(current_user: dict = Depends(get_current_user)):
    """Get all periodization weeks for the coach"""
    coach_id_str = str(current_user["_id"])
    weeks = await db.periodization_weeks.find({
        "coach_id": coach_id_str
    }).sort("start_date", -1).to_list(100)
    
    # Fallback for legacy data with ObjectId
    if not weeks:
        weeks = await db.periodization_weeks.find({
            "coach_id": current_user["_id"]
        }).sort("start_date", -1).to_list(100)
    
    for week in weeks:
        week["id"] = str(week.pop("_id"))
    
    return weeks


@router.get("/periodization/weeks/{week_id}")
async def get_periodization_week(
    week_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific periodization week"""
    coach_id_str = str(current_user["_id"])
    week = await db.periodization_weeks.find_one({
        "_id": ObjectId(week_id),
        "coach_id": coach_id_str
    })
    # Fallback for legacy
    if not week:
        week = await db.periodization_weeks.find_one({
            "_id": ObjectId(week_id),
            "coach_id": current_user["_id"]
        })
    
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")
    
    week["id"] = str(week.pop("_id"))
    return week


@router.post("/periodization/weeks")
async def create_periodization_week(
    week_data: PeriodizationWeekCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new periodization week"""
    coach_id_str = str(current_user["_id"])
    week_doc = {
        "coach_id": coach_id_str,  # Store as string for consistency
        "name": week_data.name,
        "start_date": week_data.start_date,
        "end_date": week_data.end_date,
        "days": [day.dict() for day in week_data.days],
        "weekly_prescription": week_data.weekly_prescription.dict(),
        "athlete_overrides": [override.dict() for override in week_data.athlete_overrides],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db.periodization_weeks.insert_one(week_doc)
    week_doc["id"] = str(result.inserted_id)
    del week_doc["_id"]
    
    return week_doc


@router.put("/periodization/weeks/{week_id}")
async def update_periodization_week(
    week_id: str,
    week_data: PeriodizationWeekCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a periodization week (only if not past)"""
    coach_id_str = str(current_user["_id"])
    # Check if week exists and is editable
    existing_week = await db.periodization_weeks.find_one({
        "_id": ObjectId(week_id),
        "coach_id": coach_id_str
    })
    # Fallback for legacy
    if not existing_week:
        existing_week = await db.periodization_weeks.find_one({
            "_id": ObjectId(week_id),
            "coach_id": current_user["_id"]
        })
    
    if not existing_week:
        raise HTTPException(status_code=404, detail="Week not found")
    
    # Check if week is in the past
    end_date = datetime.strptime(existing_week["end_date"], "%Y-%m-%d")
    if end_date < datetime.now().replace(hour=0, minute=0, second=0, microsecond=0):
        raise HTTPException(status_code=400, detail="Cannot edit past weeks")
    
    update_doc = {
        "name": week_data.name,
        "start_date": week_data.start_date,
        "end_date": week_data.end_date,
        "days": [day.dict() for day in week_data.days],
        "weekly_prescription": week_data.weekly_prescription.dict(),
        "athlete_overrides": [override.dict() for override in week_data.athlete_overrides],
        "updated_at": datetime.utcnow()
    }
    
    await db.periodization_weeks.update_one(
        {"_id": ObjectId(week_id)},
        {"$set": update_doc}
    )
    
    return {"message": "Week updated successfully", "id": week_id}


@router.delete("/periodization/weeks/{week_id}")
async def delete_periodization_week(
    week_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a periodization week (only if not past)"""
    coach_id_str = str(current_user["_id"])
    existing_week = await db.periodization_weeks.find_one({
        "_id": ObjectId(week_id),
        "coach_id": coach_id_str
    })
    # Fallback for legacy
    if not existing_week:
        existing_week = await db.periodization_weeks.find_one({
            "_id": ObjectId(week_id),
            "coach_id": current_user["_id"]
        })
    
    if not existing_week:
        raise HTTPException(status_code=404, detail="Week not found")
    
    end_date = datetime.strptime(existing_week["end_date"], "%Y-%m-%d")
    if end_date < datetime.now().replace(hour=0, minute=0, second=0, microsecond=0):
        raise HTTPException(status_code=400, detail="Cannot delete past weeks")
    
    await db.periodization_weeks.delete_one({"_id": ObjectId(week_id)})
    
    return {"message": "Week deleted successfully"}


@router.get("/periodization/peak-values")
async def get_all_peak_values(current_user: dict = Depends(get_current_user)):
    """Get peak values for all athletes"""
    coach_id_str = str(current_user["_id"])
    peak_values = await db.athlete_peak_values.find({
        "coach_id": coach_id_str
    }).to_list(500)
    
    for pv in peak_values:
        pv["id"] = str(pv.pop("_id"))
    
    return peak_values


@router.get("/periodization/peak-values/{athlete_id}")
async def get_athlete_peak_values(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get peak values for a specific athlete"""
    coach_id_str = str(current_user["_id"])
    peak_values = await db.athlete_peak_values.find_one({
        "athlete_id": athlete_id,
        "coach_id": coach_id_str
    })
    
    if not peak_values:
        # Return default values if none exist
        return {
            "athlete_id": athlete_id,
            "total_distance": 0,
            "hid_z3": 0,
            "hsr_z4": 0,
            "sprint_z5": 0,
            "sprints_count": 0,
            "acc_dec_total": 0,
            "last_updated": None
        }
    
    peak_values["id"] = str(peak_values.pop("_id"))
    return peak_values


@router.get("/periodization/calculated/{week_id}")
async def get_calculated_prescriptions(
    week_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get calculated prescriptions for all athletes based on peak values and multipliers.
    
    Each athlete's daily and weekly prescription is calculated as:
    - Peak value (max from all GAME sessions) × multiplier/percentage
    
    Peak values use only the TOTAL SESSION value from CSVs (not sum of sub-periods).
    """
    coach_id = current_user["_id"]
    coach_id_str = str(coach_id)
    
    # Get the week - try str first (standard), then ObjectId for legacy
    week = await db.periodization_weeks.find_one({
        "_id": ObjectId(week_id),
        "coach_id": coach_id_str
    })
    if not week:
        week = await db.periodization_weeks.find_one({
            "_id": ObjectId(week_id),
            "coach_id": coach_id
        })
    
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")
    
    # Get all athletes - coach_id stored as str
    athletes = await db.athletes.find({
        "coach_id": coach_id_str
    }).to_list(500)
    if not athletes:
        # Fallback for legacy data with ObjectId
        athletes = await db.athletes.find({
            "coach_id": coach_id
        }).to_list(500)
    
    # Get all peak values - coach_id stored as str
    peak_values = await db.athlete_peak_values.find({
        "coach_id": coach_id_str
    }).to_list(500)
    
    peak_values_map = {str(pv["athlete_id"]): pv for pv in peak_values}
    
    # Get athlete overrides map
    overrides_map = {}
    for override in week.get("athlete_overrides", []):
        key = f"{override['athlete_id']}_{override['metric']}"
        overrides_map[key] = override
    
    weekly_prescription = week["weekly_prescription"]
    
    results = []
    for athlete in athletes:
        athlete_id = str(athlete["_id"])
        peak = peak_values_map.get(athlete_id, {})
        
        # Calculate weekly targets
        weekly_targets = {
            "total_distance": peak.get("total_distance", 0) * weekly_prescription.get("total_distance_multiplier", 1.0),
            "hid_z3": peak.get("hid_z3", 0) * weekly_prescription.get("hid_z3_multiplier", 1.0),
            "hsr_z4": peak.get("hsr_z4", 0) * weekly_prescription.get("hsr_z4_multiplier", 1.0),
            "sprint_z5": peak.get("sprint_z5", 0) * weekly_prescription.get("sprint_z5_multiplier", 1.0),
            "sprints_count": peak.get("sprints_count", 0) * weekly_prescription.get("sprints_count_multiplier", 1.0),
            "acc_dec_total": peak.get("acc_dec_total", 0) * weekly_prescription.get("acc_dec_total_multiplier", 1.0)
        }
        
        # Calculate daily targets
        daily_targets = []
        for day in week["days"]:
            day_target = {
                "date": day["date"],
                "day_classification": day["day_classification"],
                "total_distance": peak.get("total_distance", 0) * (day.get("total_distance_percent", 0) / 100),
                "hid_z3": peak.get("hid_z3", 0) * (day.get("hid_z3_percent", 0) / 100),
                "hsr_z4": peak.get("hsr_z4", 0) * (day.get("hsr_z4_percent", 0) / 100),
                "sprint_z5": peak.get("sprint_z5", 0) * (day.get("sprint_z5_percent", 0) / 100),
                "sprints_count": peak.get("sprints_count", 0) * (day.get("sprints_count_percent", 0) / 100),
                "acc_dec_total": peak.get("acc_dec_total", 0) * (day.get("acc_dec_total_percent", 0) / 100)
            }
            
            # Apply athlete-specific overrides
            for metric in ["total_distance", "hid_z3", "hsr_z4", "sprint_z5", "sprints_count", "acc_dec_total"]:
                override_key = f"{athlete_id}_{metric}_{day['date']}"
                if override_key in overrides_map:
                    override = overrides_map[override_key]
                    day_target[metric] = peak.get(metric, 0) * (override["value"] / 100)
            
            daily_targets.append(day_target)
        
        results.append({
            "athlete_id": athlete_id,
            "athlete_name": athlete.get("name", ""),
            "peak_values": {
                "total_distance": peak.get("total_distance", 0),
                "hid_z3": peak.get("hid_z3", 0),
                "hsr_z4": peak.get("hsr_z4", 0),
                "sprint_z5": peak.get("sprint_z5", 0),
                "sprints_count": peak.get("sprints_count", 0),
                "acc_dec_total": peak.get("acc_dec_total", 0)
            },
            "weekly_targets": weekly_targets,
            "daily_targets": daily_targets
        })

    # ===== WEEK FREEZE LOGIC =====
    # Past weeks (end_date < today) must be IMMUTABLE: their targets are snapshotted
    # the first time they are read after closing, and from that moment on the
    # snapshot is returned verbatim — new athlete peaks must NOT alter past weeks.
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        end_date_dt = datetime.strptime(week["end_date"], "%Y-%m-%d")
    except (ValueError, TypeError):
        end_date_dt = today  # treat unparseable as not-past
    is_past = end_date_dt < today

    if is_past:
        existing_snapshot = week.get("frozen_targets")
        if existing_snapshot and existing_snapshot.get("athletes"):
            # Return the persisted snapshot (immutable)
            return {
                "week_id": week_id,
                "week_name": week["name"],
                "start_date": week["start_date"],
                "end_date": week["end_date"],
                "weekly_prescription": weekly_prescription,
                "days_config": week["days"],
                "athletes": existing_snapshot["athletes"],
                "frozen": True,
                "frozen_at": existing_snapshot.get("frozen_at")
            }
        # No snapshot yet — persist current calculation now (one-time freeze)
        frozen_at = datetime.now(timezone.utc).isoformat()
        snapshot_doc = {
            "frozen_at": frozen_at,
            "athletes": results
        }
        try:
            await db.periodization_weeks.update_one(
                {"_id": week["_id"]},
                {"$set": {"frozen_targets": snapshot_doc}}
            )
        except Exception as e:
            logger.warning(f"Failed to persist frozen_targets for week {week_id}: {e}")
        return {
            "week_id": week_id,
            "week_name": week["name"],
            "start_date": week["start_date"],
            "end_date": week["end_date"],
            "weekly_prescription": weekly_prescription,
            "days_config": week["days"],
            "athletes": results,
            "frozen": True,
            "frozen_at": frozen_at
        }

    # Current/future week — dynamic calculation (reacts to peak updates)
    return {
        "week_id": week_id,
        "week_name": week["name"],
        "start_date": week["start_date"],
        "end_date": week["end_date"],
        "weekly_prescription": weekly_prescription,
        "days_config": week["days"],
        "athletes": results,
        "frozen": False
    }


@router.put("/periodization/athlete-override/{week_id}")
async def update_athlete_override(
    week_id: str,
    override: AthleteOverride,
    current_user: dict = Depends(get_current_user)
):
    """Add or update an athlete-specific override"""
    week = await db.periodization_weeks.find_one({
        "_id": ObjectId(week_id),
        "coach_id": current_user["_id"]
    })
    
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")
    
    # Check if week is editable
    end_date = datetime.strptime(week["end_date"], "%Y-%m-%d")
    if end_date < datetime.now().replace(hour=0, minute=0, second=0, microsecond=0):
        raise HTTPException(status_code=400, detail="Cannot edit past weeks")
    
    # Update or add override
    overrides = week.get("athlete_overrides", [])
    found = False
    for i, existing in enumerate(overrides):
        if existing["athlete_id"] == override.athlete_id and existing["metric"] == override.metric:
            overrides[i] = override.dict()
            found = True
            break
    
    if not found:
        overrides.append(override.dict())
    
    await db.periodization_weeks.update_one(
        {"_id": ObjectId(week_id)},
        {"$set": {"athlete_overrides": overrides, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Override updated successfully"}


@router.get("/periodization/notifications")
async def get_peak_value_notifications(
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get notifications about peak value updates"""
    query = {"coach_id": current_user["_id"]}
    if unread_only:
        query["read"] = False
    
    notifications = await db.peak_value_notifications.find(query).sort("created_at", -1).to_list(100)
    
    for n in notifications:
        n["id"] = str(n.pop("_id"))
    
    return notifications


@router.put("/periodization/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    await db.peak_value_notifications.update_one(
        {"_id": ObjectId(notification_id), "coach_id": current_user["_id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Notification marked as read"}


@router.put("/periodization/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.peak_value_notifications.update_many(
        {"coach_id": current_user["_id"]},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}


