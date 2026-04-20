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

from gps_import import GPSCSVParser, GPSDataNormalizer, Manufacturer, parse_gps_csv, consolidate_session, METRIC_CATEGORIES
from identity_resolver import IdentityResolver
from routes.periodization.routes import extract_gps_metrics_from_session, update_athlete_peak_values

router = APIRouter(tags=["GPS Data"])

# ============= GPS DATA ROUTES =============

@router.post("/gps-data", response_model=GPSData)
async def create_gps_data(
    gps_data: GPSDataCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create GPS data entry.
    
    IMPORTANT: If activity_type is 'game', this will also update the athlete's
    peak values for periodization calculations.
    """
    coach_id = current_user["_id"]
    coach_id_str = str(coach_id)
    
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(gps_data.athlete_id),
        "coach_id": coach_id
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    # Prepare GPS data dict
    gps_dict = gps_data.model_dump()
    
    # Generate session_id for manual entries if not provided
    if not gps_dict.get("session_id"):
        gps_dict["session_id"] = f"manual_{gps_data.date}_{gps_data.athlete_id}"
    
    gps = GPSData(
        coach_id=coach_id,
        **gps_dict
    )
    
    result = await db.gps_data.insert_one(gps.model_dump(by_alias=True, exclude=["id"]))
    gps.id = str(result.inserted_id)
    
    # CRITICAL: Update peak values if this is a GAME session
    # This ensures manual entries are considered in periodization calculations
    if gps_data.activity_type == "game":
        session_metrics = {
            "total_distance": gps_data.total_distance or 0,
            "hid_z3": gps_data.high_intensity_distance or 0,
            "hsr_z4": gps_data.high_speed_running or 0,
            "sprint_z5": gps_data.sprint_distance or 0,
            "sprints_count": gps_data.number_of_sprints or 0,
            "acc_dec_total": (gps_data.number_of_accelerations or 0) + (gps_data.number_of_decelerations or 0)
        }
        
        await update_athlete_peak_values(
            athlete_id=gps_data.athlete_id,
            coach_id=coach_id_str,
            session_metrics=session_metrics,
            session_date=gps_data.date,
            athlete_name=athlete.get("name", "")
        )
    
    # UPDATE ROLLING LOAD METRICS (EWMA, ACWR, etc.)
    try:
        await load_engine.update_athlete_metrics(
            athlete_id=gps_data.athlete_id,
            coach_id=coach_id_str,
            date=gps_data.date
        )
    except Exception as e:
        logging.warning(f"[LoadEngine] Failed to update metrics for {gps_data.athlete_id}: {e}")
    
    return gps

@router.get("/gps-data/athlete/{athlete_id}", response_model=List[GPSData])
async def get_athlete_gps_data(
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
    
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(1000)
    
    for record in gps_records:
        record["_id"] = str(record["_id"])
    return [GPSData(**record) for record in gps_records]

class GPSDeleteRequest(BaseModel):
    session_ids: List[str]

@router.post("/gps-data/delete-activities")
async def delete_gps_activities(
    data: GPSDeleteRequest,
    current_user: dict = Depends(get_current_user)
):
    """Delete GPS activities by session_ids. Removes all period records for each session
    and recalculates athlete_load_metrics for affected athletes from the earliest affected date."""
    if not data.session_ids or len(data.session_ids) == 0:
        raise HTTPException(status_code=400, detail="No session_ids provided")
    
    coach_id_str = str(current_user["_id"])
    
    # PHASE 1: Collect affected athletes and dates BEFORE deleting
    affected: dict = {}  # {athlete_id: set(dates)}
    for session_id in data.session_ids:
        query = {"session_id": session_id, "coach_id": current_user["_id"]}
        records = await db.gps_data.find(query, {"athlete_id": 1, "date": 1, "_id": 0}).to_list(500)
        for r in records:
            aid = r.get("athlete_id")
            dt = r.get("date")
            if aid and dt:
                affected.setdefault(aid, set()).add(dt)
        if session_id.startswith("legacy_"):
            date_str = session_id.replace("legacy_", "")
            query2 = {"date": date_str, "coach_id": current_user["_id"], "session_id": {"$exists": False}}
            records2 = await db.gps_data.find(query2, {"athlete_id": 1, "date": 1, "_id": 0}).to_list(500)
            for r in records2:
                aid = r.get("athlete_id")
                if aid:
                    affected.setdefault(aid, set()).add(date_str)
    
    # PHASE 2: Delete the GPS records
    total_deleted = 0
    for session_id in data.session_ids:
        result = await db.gps_data.delete_many({
            "session_id": session_id,
            "coach_id": current_user["_id"]
        })
        total_deleted += result.deleted_count
        if session_id.startswith("legacy_"):
            date_str = session_id.replace("legacy_", "")
            result2 = await db.gps_data.delete_many({
                "date": date_str,
                "coach_id": current_user["_id"],
                "session_id": {"$exists": False}
            })
            total_deleted += result2.deleted_count
    
    if total_deleted == 0:
        raise HTTPException(status_code=404, detail="No activities found to delete")
    
    # PHASE 3: Recalculate athlete_load_metrics from earliest affected date
    recalc_results = []
    for athlete_id, dates in affected.items():
        earliest_date = min(dates)
        try:
            # Delete stale metrics from the affected dates forward
            await db.athlete_load_metrics.delete_many({
                "athlete_id": athlete_id,
                "date": {"$gte": earliest_date}
            })
            
            # Find the earliest remaining GPS date >= earliest affected date
            next_gps = await db.gps_data.find_one(
                {"athlete_id": athlete_id, "coach_id": coach_id_str, "date": {"$gte": earliest_date}},
                sort=[("date", 1)],
                projection={"date": 1, "_id": 0}
            )
            
            if next_gps and next_gps.get("date"):
                results = await load_engine.recalculate_from_date(
                    athlete_id=athlete_id,
                    coach_id=coach_id_str,
                    start_date=next_gps["date"]
                )
                recalc_results.append({"athlete_id": athlete_id, "dates_recalculated": len(results)})
            else:
                recalc_results.append({"athlete_id": athlete_id, "stale_metrics_cleaned": True})
        except Exception as e:
            logging.warning(f"[LoadEngine] Failed to recalculate after GPS delete for {athlete_id}: {e}")
            recalc_results.append({"athlete_id": athlete_id, "error": str(e)})
    
    return {
        "message": f"Deleted {total_deleted} records",
        "deleted_count": total_deleted,
        "metrics_recalculated": recalc_results
    }

@router.get("/gps-data/athlete/{athlete_id}/sessions")
async def get_athlete_sessions(
    athlete_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get GPS data grouped by sessions (aggregated from periods)"""
    # Verify athlete belongs to current user
    athlete = await db.athletes.find_one({
        "_id": ObjectId(athlete_id),
        "coach_id": current_user["_id"]
    })
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    
    gps_records = await db.gps_data.find({
        "athlete_id": athlete_id,
        "coach_id": current_user["_id"]
    }).sort("date", -1).to_list(1000)
    
    # Group by session_id or by date if no session_id
    sessions = {}
    for record in gps_records:
        session_key = record.get("session_id") or record.get("date", "unknown")
        
        if session_key not in sessions:
            sessions[session_key] = {
                "session_id": session_key,
                "session_name": record.get("session_name", f"Sessão {record.get('date', 'N/A')}"),
                "date": record.get("date"),
                "activity_type": record.get("activity_type"),  # "game" or "training"
                "periods": [],
                "totals": {
                    "total_distance": 0,
                    "high_intensity_distance": 0,
                    "high_speed_running": 0,
                    "sprint_distance": 0,
                    "number_of_sprints": 0,
                    "number_of_accelerations": 0,
                    "number_of_decelerations": 0,
                },
                "max_speed": 0,
                "max_acceleration": 0,
                "max_deceleration": 0,
            }
        
        period_name = record.get("period_name") or (record.get("notes") or "").replace("Período: ", "") or "Full Session"
        sessions[session_key]["periods"].append({
            "period_name": period_name,
            "total_distance": record.get("total_distance", 0),
            "high_intensity_distance": record.get("high_intensity_distance", 0),
            "high_speed_running": record.get("high_speed_running", 0),
            "sprint_distance": record.get("sprint_distance", 0),
            "number_of_sprints": record.get("number_of_sprints", 0),
            "number_of_accelerations": record.get("number_of_accelerations", 0),
            "number_of_decelerations": record.get("number_of_decelerations", 0),
            "max_speed": record.get("max_speed", 0),
        })
        
        # Sum totals (for periods that are not "Session" to avoid double counting)
        period_lower = period_name.lower()
        if "session" not in period_lower and "total" not in period_lower:
            sessions[session_key]["totals"]["total_distance"] += record.get("total_distance", 0)
            sessions[session_key]["totals"]["high_intensity_distance"] += record.get("high_intensity_distance", 0)
            sessions[session_key]["totals"]["high_speed_running"] += record.get("high_speed_running", 0) or 0
            sessions[session_key]["totals"]["sprint_distance"] += record.get("sprint_distance", 0)
            sessions[session_key]["totals"]["number_of_sprints"] += record.get("number_of_sprints", 0)
            sessions[session_key]["totals"]["number_of_accelerations"] += record.get("number_of_accelerations", 0)
            sessions[session_key]["totals"]["number_of_decelerations"] += record.get("number_of_decelerations", 0)
        elif len(sessions[session_key]["periods"]) == 1:
            # If this is the only period (Session/Total), use its values
            sessions[session_key]["totals"]["total_distance"] = record.get("total_distance", 0)
            sessions[session_key]["totals"]["high_intensity_distance"] = record.get("high_intensity_distance", 0)
            sessions[session_key]["totals"]["high_speed_running"] = record.get("high_speed_running", 0) or 0
            sessions[session_key]["totals"]["sprint_distance"] = record.get("sprint_distance", 0)
            sessions[session_key]["totals"]["number_of_sprints"] = record.get("number_of_sprints", 0)
            sessions[session_key]["totals"]["number_of_accelerations"] = record.get("number_of_accelerations", 0)
            sessions[session_key]["totals"]["number_of_decelerations"] = record.get("number_of_decelerations", 0)
        
        # Track max values
        if (record.get("max_speed") or 0) > sessions[session_key]["max_speed"]:
            sessions[session_key]["max_speed"] = record.get("max_speed") or 0
        if (record.get("max_acceleration") or 0) > sessions[session_key]["max_acceleration"]:
            sessions[session_key]["max_acceleration"] = record.get("max_acceleration") or 0
        if (record.get("max_deceleration") or 0) > sessions[session_key]["max_deceleration"]:
            sessions[session_key]["max_deceleration"] = record.get("max_deceleration") or 0
    
    return list(sessions.values())


class ActivityTypeUpdate(BaseModel):
    activity_type: str  # "game" or "training"
    athlete_id: str  # Required to update only for specific athlete


@router.put("/gps-data/session/{session_id}/activity-type")
async def update_session_activity_type(
    session_id: str,
    data: ActivityTypeUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update the activity type (game/training) for a specific athlete's session"""
    if data.activity_type not in ["game", "training"]:
        raise HTTPException(status_code=400, detail="activity_type must be 'game' or 'training'")
    
    if not data.athlete_id:
        raise HTTPException(status_code=400, detail="athlete_id is required")
    
    coach_id_str = str(current_user["_id"])
    
    # Get the session records for this specific athlete
    session_records = await db.gps_data.find({
        "session_id": session_id,
        "athlete_id": data.athlete_id,
        "coach_id": coach_id_str
    }).to_list(100)
    
    if not session_records:
        raise HTTPException(status_code=404, detail="Session not found for this athlete")
    
    # Update GPS records only for this specific athlete's session
    result = await db.gps_data.update_many(
        {
            "session_id": session_id,
            "athlete_id": data.athlete_id,
            "coach_id": coach_id_str
        },
        {"$set": {"activity_type": data.activity_type}}
    )
    
    # If marked as GAME, update peak values for the athlete
    peak_updated = False
    if data.activity_type == "game" and session_records:
        athlete_id = str(session_records[0].get("athlete_id"))
        session_date = session_records[0].get("date", "")
        
        # Get athlete name for notifications
        athlete = await db.athletes.find_one({"_id": ObjectId(athlete_id)})
        athlete_name = athlete.get("name", "") if athlete else ""
        
        # Extract metrics from session
        session_metrics = extract_gps_metrics_from_session(session_records)
        
        # Update peak values
        peak_updated = await update_athlete_peak_values(
            athlete_id=athlete_id,
            coach_id=coach_id_str,
            session_metrics=session_metrics,
            session_date=session_date,
            athlete_name=athlete_name
        )
    
    # NOTE: Game/Training classification affects ONLY the Periodization module.
    # We intentionally DO NOT trigger load_engine.recalculate_from_date here —
    # ACWR, monotony, strain and other global load metrics are engine-wide and
    # must remain untouched by this UX action. Avoids ~15s blocking on the UI.
    
    return {
        "message": "Activity type updated successfully",
        "session_id": session_id,
        "activity_type": data.activity_type,
        "records_updated": result.modified_count,
        "peak_values_updated": peak_updated,
        "metrics_recalculated": False
    }


# Endpoint to get all GPS sessions grouped by session_id (for centralized classification)
@router.get("/gps-data/sessions/all")
async def get_all_gps_sessions(
    current_user: dict = Depends(get_current_user)
):
    """Get all GPS sessions grouped by session_id for centralized classification"""
    coach_id = str(current_user["_id"])
    
    # Aggregate to group by session_id
    pipeline = [
        {"$match": {"coach_id": coach_id, "session_id": {"$ne": None}}},
        {"$group": {
            "_id": "$session_id",
            "date": {"$first": "$date"},
            "activity_type": {"$first": "$activity_type"},
            "athlete_ids": {"$addToSet": "$athlete_id"},
            "total_records": {"$sum": 1},
            "avg_distance": {"$avg": "$total_distance"},
            "avg_hsr": {"$avg": "$high_speed_running"},
            "total_distance_sum": {"$sum": "$total_distance"},
        }},
        {"$sort": {"date": -1}},
        {"$limit": 100}
    ]
    
    sessions = await db.gps_data.aggregate(pipeline).to_list(100)
    
    result = []
    for s in sessions:
        result.append({
            "session_id": s["_id"],
            "date": s.get("date"),
            "activity_type": s.get("activity_type", "training"),
            "athlete_count": len(s.get("athlete_ids", [])),
            "total_records": s.get("total_records", 0),
            "avg_distance": s.get("avg_distance", 0),
            "avg_hsr": s.get("avg_hsr", 0),
        })
    
    return result


# Model for classifying all athletes at once
class ClassifyAllRequest(BaseModel):
    activity_type: str  # "game" or "training"


@router.put("/gps-data/session/{session_id}/classify-all")
async def classify_session_for_all_athletes(
    session_id: str,
    data: ClassifyAllRequest,
    current_user: dict = Depends(get_current_user)
):
    """Classify a session as game/training for ALL athletes and recalculate peaks"""
    if data.activity_type not in ["game", "training"]:
        raise HTTPException(status_code=400, detail="activity_type must be 'game' or 'training'")
    
    coach_id = str(current_user["_id"])
    
    # Get all records for this session
    session_records = await db.gps_data.find({
        "session_id": session_id,
        "coach_id": coach_id
    }).to_list(1000)
    
    if not session_records:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Update all GPS records for this session (all athletes)
    result = await db.gps_data.update_many(
        {"session_id": session_id, "coach_id": coach_id},
        {"$set": {"activity_type": data.activity_type}}
    )
    
    # Get unique athlete IDs from this session
    athlete_ids = list(set([str(r.get("athlete_id")) for r in session_records]))
    
    # Recalculate peak values for each athlete if marked as GAME
    peaks_updated = []
    if data.activity_type == "game":
        for athlete_id in athlete_ids:
            try:
                # Get this athlete's records from the session
                athlete_records = [r for r in session_records if str(r.get("athlete_id")) == athlete_id]
                if not athlete_records:
                    continue
                
                session_date = athlete_records[0].get("date", "")
                
                # Get athlete name
                athlete = await db.athletes.find_one({"_id": ObjectId(athlete_id)})
                athlete_name = athlete.get("name", "") if athlete else ""
                
                # Extract metrics from session
                session_metrics = extract_gps_metrics_from_session(athlete_records)
                
                # Update peak values
                peak_updated = await update_athlete_peak_values(
                    athlete_id=athlete_id,
                    coach_id=coach_id,
                    session_metrics=session_metrics,
                    session_date=session_date,
                    athlete_name=athlete_name
                )
                if peak_updated:
                    peaks_updated.append(athlete_id)
            except Exception as e:
                print(f"Error updating peaks for athlete {athlete_id}: {e}")
    
    # NOTE: Game/Training classification affects ONLY the Periodization module.
    # We intentionally DO NOT trigger load_engine.recalculate_from_date here —
    # global load metrics (ACWR, monotony, strain) must stay untouched by this
    # UX action. This also removes the previous ~15-20s blocking loop over
    # every athlete that used to happen on each classify click.
    
    return {
        "success": True,
        "session_id": session_id,
        "activity_type": data.activity_type,
        "records_updated": result.modified_count,
        "athletes_affected": len(athlete_ids),
        "peaks_updated": len(peaks_updated),
        "metrics_recalculated": 0
    }


