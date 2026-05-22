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

# ───────────────────────────────────────────────────────────────────────────
# PDF asset cache (module-level): logo embedded as base64 data URL.
# Read once per process; reused across all PDF report requests.
# Source: existing official logo asset already in the codebase.
# TODO: replace with optimized logo (current ~285KB too large for PDF;
# inflated to ~380KB after base64 encoding, included in every PDF).
# ───────────────────────────────────────────────────────────────────────────
import base64 as _b64

_PDF_LOGO_DATA_URL = ""
try:
    _LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..",
                              "frontend", "assets", "logo.png")
    _LOGO_PATH = os.path.normpath(_LOGO_PATH)
    if os.path.isfile(_LOGO_PATH):
        with open(_LOGO_PATH, "rb") as _f:
            _PDF_LOGO_DATA_URL = "data:image/png;base64," + _b64.b64encode(_f.read()).decode("ascii")
except Exception as _logo_err:
    logger.warning(f"[PDF] Failed to load brand logo: {_logo_err}")
    _PDF_LOGO_DATA_URL = ""


router = APIRouter(tags=["Dashboard"])


# ============= TEAM DASHBOARD =============

class TeamDashboardAthlete(BaseModel):
    id: str
    name: str
    position: str
    acwr: Optional[float] = None
    risk_level: str = "unknown"
    fatigue_score: Optional[float] = None
    readiness_score: Optional[float] = None  # Wellness readiness 0-100%
    last_gps_date: Optional[str] = None
    last_wellness_date: Optional[str] = None
    wellness_score: Optional[float] = None
    total_sessions_7d: int = 0
    avg_distance_7d: float = 0
    injury_risk: bool = False
    peripheral_fatigue: bool = False
    # Extended fields for dashboard metrics
    monotony: Optional[float] = None
    strain: Optional[float] = None
    metric_value: Optional[float] = None  # Value for selected ACWR metric

class TeamDashboardStats(BaseModel):
    total_athletes: int
    athletes_high_risk: int
    athletes_optimal: int
    athletes_fatigued: int
    team_avg_acwr: float
    team_avg_wellness: float
    team_avg_fatigue: float
    team_avg_readiness: Optional[float] = None  # Wellness readiness 0-100%
    sessions_this_week: int
    total_distance_this_week: float
    team_avg_power: Optional[float] = None
    team_avg_body_fat: Optional[float] = None
    team_avg_hid: Optional[float] = None  # High Intensity Distance
    team_avg_rsi: Optional[float] = None  # Reactive Strength Index
    rsi_trend: Optional[str] = None  # up, down, stable
    rsi_percentile: Optional[float] = None
    avg_distance_per_session: Optional[float] = None

class TeamDashboardResponse(BaseModel):
    stats: TeamDashboardStats
    athletes: List[TeamDashboardAthlete]
    risk_distribution: Dict[str, int]
    position_summary: Dict[str, Dict[str, Any]]
    alerts: List[str]

@router.get("/dashboard/team", response_model=TeamDashboardResponse)
async def get_team_dashboard(
    lang: str = "pt",
    acwr_metric: str = "total_distance",
    date_range: str = "7d",
    current_user: dict = Depends(get_current_user)
):
    """Get aggregated team statistics and individual athlete status for team-wide overview
    
    OPTIMIZED VERSION - Eliminates N+1 query problem by pre-loading all data
    
    Parameters:
    - acwr_metric: Metric to use for ACWR calculation. Options:
        - total_distance (default)
        - high_intensity_distance (HID Z3)
        - high_speed_running (HSR Z4)
        - sprint_distance (Sprint Z5)
        - number_of_sprints (Sprint count)
        - acc_dec (ACC + DEC events)
    - date_range: Date range filter. Options:
        - today (only today's data)
        - 7d (default, last 7 days)
        - 14d (last 14 days)
        - 28d (last 28 days)
        - 90d (last 90 days)
    """
    
    user_id = current_user["_id"]
    
    # Validate acwr_metric parameter
    valid_metrics = [
        "total_distance",
        "high_intensity_distance",
        "high_speed_running", 
        "sprint_distance",
        "number_of_sprints",
        "acc_dec"
    ]
    if acwr_metric not in valid_metrics:
        acwr_metric = "total_distance"
    
    # Parse date_range parameter
    valid_date_ranges = ["today", "7d", "14d", "28d", "90d"]
    if date_range not in valid_date_ranges:
        date_range = "7d"
    
    # Calculate filter days based on date_range
    date_range_days_map = {
        "today": 0,
        "7d": 7,
        "14d": 14,
        "28d": 28,
        "90d": 90
    }
    filter_days = date_range_days_map.get(date_range, 7)
    
    # Date ranges - calculated once
    today = datetime.utcnow()
    today_str = today.strftime("%Y-%m-%d")
    seven_days_ago = today - timedelta(days=7)
    ninety_days_ago = today - timedelta(days=90)  # Max window for queries
    ninety_days_ago_str = ninety_days_ago.strftime("%Y-%m-%d")
    
    # Calculate filter start date based on date_range parameter
    if filter_days == 0:  # today
        filter_start_date = datetime.strptime(today_str, "%Y-%m-%d")
    else:
        filter_start_date = today - timedelta(days=filter_days)
    
    # Get all athletes for this coach
    athletes = await db.athletes.find({"coach_id": user_id}).to_list(100)
    
    if not athletes:
        return TeamDashboardResponse(
            stats=TeamDashboardStats(
                total_athletes=0,
                athletes_high_risk=0,
                athletes_optimal=0,
                athletes_fatigued=0,
                team_avg_acwr=0,
                team_avg_wellness=0,
                team_avg_fatigue=0,
                sessions_this_week=0,
                total_distance_this_week=0
            ),
            athletes=[],
            risk_distribution={"low": 0, "optimal": 0, "moderate": 0, "high": 0, "unknown": 0},
            position_summary={},
            alerts=[]
        )
    
    # Create athlete ID list for bulk queries
    athlete_ids = [str(a["_id"]) for a in athletes]
    
    # ============================================================
    # OPTIMIZED: BULK LOAD ALL DATA BEFORE PROCESSING (5-6 queries total)
    # ============================================================
    
    # Query 1: GPS data - limited to 90 days max
    all_gps_data = await db.gps_data.find({
        "coach_id": user_id,
        "date": {"$gte": ninety_days_ago_str}
    }).to_list(5000)
    
    # Query 2: Wellness data - last 7 days per athlete is enough
    all_wellness_data = await db.wellness.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(1000)
    
    # Query 3: Jump assessments
    all_jump_assessments = await db.jump_assessments.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(500)
    
    # Query 4: Legacy assessments (strength)
    all_assessments = await db.assessments.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(500)
    
    # Query 5: Body compositions
    all_body_compositions = await db.body_compositions.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(200)
    
    # Query 6: EWMA load metrics (latest per athlete from load_engine)
    all_load_metrics = await db.athlete_load_metrics.find(
        {"coach_id": user_id}
    ).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(5000)
    
    # Index load metrics by athlete_id (keep only latest per athlete)
    load_metrics_by_athlete: Dict[str, dict] = {}
    for m in all_load_metrics:
        aid = m.get("athlete_id")
        if aid and aid not in load_metrics_by_athlete:
            load_metrics_by_athlete[aid] = m
    
    # Map the acwr_metric parameter to load_engine field name
    load_engine_field = ACWR_METRIC_TO_ENGINE_FIELD.get(acwr_metric, "distance")
    
    # ============================================================
    # BUILD INDEXED DATA STRUCTURES FOR O(1) LOOKUPS
    # ============================================================
    
    # GPS data indexed by athlete_id
    gps_by_athlete: Dict[str, List[dict]] = {}
    for record in all_gps_data:
        aid = record.get("athlete_id")
        if aid:
            if aid not in gps_by_athlete:
                gps_by_athlete[aid] = []
            gps_by_athlete[aid].append(record)
    
    # Sort GPS data by date descending for each athlete
    for aid in gps_by_athlete:
        gps_by_athlete[aid].sort(key=lambda x: x.get("date", ""), reverse=True)
    
    # Wellness data indexed by athlete_id (already sorted by date desc)
    wellness_by_athlete: Dict[str, List[dict]] = {}
    for record in all_wellness_data:
        aid = record.get("athlete_id")
        if aid:
            if aid not in wellness_by_athlete:
                wellness_by_athlete[aid] = []
            wellness_by_athlete[aid].append(record)
    
    # Jump assessments indexed by athlete_id
    jump_by_athlete: Dict[str, List[dict]] = {}
    for record in all_jump_assessments:
        aid = record.get("athlete_id")
        if aid:
            if aid not in jump_by_athlete:
                jump_by_athlete[aid] = []
            jump_by_athlete[aid].append(record)
    
    # Assessments indexed by athlete_id
    assessments_by_athlete: Dict[str, List[dict]] = {}
    for record in all_assessments:
        aid = record.get("athlete_id")
        if aid:
            if aid not in assessments_by_athlete:
                assessments_by_athlete[aid] = []
            assessments_by_athlete[aid].append(record)
    
    # Body compositions indexed by athlete_id (only need latest per athlete)
    body_comp_by_athlete: Dict[str, dict] = {}
    for record in all_body_compositions:
        aid = record.get("athlete_id")
        if aid and aid not in body_comp_by_athlete:  # Keep only first (latest)
            body_comp_by_athlete[aid] = record
    
    # ============================================================
    # CALCULATE GLOBAL SESSION COUNTS FROM PRE-LOADED DATA
    # ============================================================
    global_sessions_7d = set()
    global_sessions_total = set()
    global_sessions_filtered = set()
    
    for record in all_gps_data:
        try:
            record_date = datetime.strptime(record.get("date", ""), "%Y-%m-%d")
            session_key = f"{record.get('date')}_{record.get('session_name', 'default')}"
            global_sessions_total.add(session_key)
            if record_date >= seven_days_ago:
                global_sessions_7d.add(session_key)
            if record_date >= filter_start_date:
                global_sessions_filtered.add(session_key)
        except:
            continue
    
    total_sessions_7d_global = len(global_sessions_7d)
    
    # ============================================================
    # PROCESS EACH ATHLETE (NO DATABASE QUERIES IN THIS LOOP)
    # ============================================================
    athlete_data = []
    total_acwr = 0
    acwr_count = 0
    total_wellness = 0
    wellness_count = 0
    total_fatigue = 0
    fatigue_count = 0
    total_readiness = 0
    readiness_count = 0
    total_distance = 0
    total_power = 0
    power_count = 0
    total_body_fat = 0
    body_fat_count = 0
    total_hid = 0
    hid_count = 0
    all_rsi_values = []
    
    risk_distribution = {"low": 0, "optimal": 0, "moderate": 0, "high": 0, "unknown": 0}
    position_summary: Dict[str, Dict[str, Any]] = {}
    alerts = []
    
    for athlete in athletes:
        athlete_id = str(athlete["_id"])
        position = athlete.get("position", "")
        if not position or position == "Unknown":
            position = "Não especificado" if lang == "pt" else "Not specified"
        
        # Initialize position summary
        if position not in position_summary:
            position_summary[position] = {
                "count": 0, "avg_acwr": 0, "avg_wellness": 0, "avg_fatigue": 0,
                "avg_distance": 0, "avg_sprints": 0, "avg_max_speed": 0, "high_risk_count": 0,
                "_total_acwr": 0, "_total_wellness": 0, "_total_fatigue": 0,
                "_total_distance": 0, "_total_sprints": 0, "_total_max_speed": 0,
                "_acwr_count": 0, "_wellness_count": 0, "_fatigue_count": 0, "_gps_count": 0
            }
        position_summary[position]["count"] += 1
        
        # Get athlete's GPS data from pre-loaded index (O(1) lookup)
        gps_data = gps_by_athlete.get(athlete_id, [])
        
        # Calculate ACWR
        acwr = None
        athlete_ewma = None
        risk_level = "unknown"
        sessions_7d = 0
        distance_7d = 0
        last_gps_date = None
        gps_data_by_date = {}
        
        if gps_data:
            last_gps_date = gps_data[0].get("date")
            unique_sessions_7d = set()
            
            # ============================================================
            # GPS AGGREGATION FIX: Avoid double-counting periods
            # Group records by (date, session_name), then apply session/period logic
            # ============================================================
            _GPS_SESSION_KW = {"session", "total", "full", "complete", "summary", "sessão"}
            _GPS_PERIOD_KW = {"half", "1st", "2nd", "period", "split", "tempo", "parte"}
            
            # Step 1: Group records by (date, session_name)
            grouped: Dict[str, Dict[str, list]] = {}  # date -> session_name -> [records]
            for record in gps_data:
                try:
                    record_date_str = record["date"]
                    datetime.strptime(record_date_str, "%Y-%m-%d")
                except:
                    continue
                sname = record.get("session_name") or "default"
                grouped.setdefault(record_date_str, {}).setdefault(sname, []).append(record)
            
            # Step 2: For each (date, session), pick session-total or sum periods
            for record_date_str, sessions_map in grouped.items():
                record_date = datetime.strptime(record_date_str, "%Y-%m-%d")
                if record_date_str not in gps_data_by_date:
                    gps_data_by_date[record_date_str] = {
                        "total_distance": 0, "high_intensity_distance": 0,
                        "high_speed_running": 0, "sprint_distance": 0,
                        "number_of_sprints": 0, "acc_dec": 0
                    }
                
                for sname, records in sessions_map.items():
                    session_key = f"{record_date_str}_{sname}"
                    
                    # Apply session/period dedup logic (same as extract_gps_metrics_from_session)
                    session_total_rec = None
                    period_recs = []
                    for r in records:
                        pname = (r.get("period_name") or "").lower()
                        is_sess = any(kw in pname for kw in _GPS_SESSION_KW)
                        is_period = any(kw in pname for kw in _GPS_PERIOD_KW)
                        if is_sess and not is_period:
                            if session_total_rec is None:
                                session_total_rec = r
                        else:
                            period_recs.append(r)
                    
                    # Choose source: session total > periods > all records
                    source = [session_total_rec] if session_total_rec else (period_recs if period_recs else records)
                    
                    for r in source:
                        dist = r.get("total_distance", 0) or 0
                        hid = r.get("high_intensity_distance", 0) or 0
                        hsr = r.get("high_speed_running", 0) or 0
                        sprint_dist = r.get("sprint_distance", 0) or 0
                        sprint_count = r.get("number_of_sprints", 0) or 0
                        acc_count = r.get("number_of_accelerations", 0) or 0
                        dec_count = r.get("number_of_decelerations", 0) or 0
                        
                        gps_data_by_date[record_date_str]["total_distance"] += dist
                        gps_data_by_date[record_date_str]["high_intensity_distance"] += hid
                        gps_data_by_date[record_date_str]["high_speed_running"] += hsr
                        gps_data_by_date[record_date_str]["sprint_distance"] += sprint_dist
                        gps_data_by_date[record_date_str]["number_of_sprints"] += sprint_count
                        gps_data_by_date[record_date_str]["acc_dec"] += acc_count + dec_count
                        
                        if record_date >= seven_days_ago:
                            distance_7d += dist
                            unique_sessions_7d.add(session_key)
                            total_hid += hid
                            hid_count += 1
            
            sessions_7d = len(unique_sessions_7d)
            total_distance += distance_7d
            
            # ACWR from EWMA (load_engine) — replaces inline Coupled ACWR
            athlete_ewma = load_metrics_by_athlete.get(athlete_id)
            if athlete_ewma:
                ewma_metric_data = athlete_ewma.get(load_engine_field, {})
                if isinstance(ewma_metric_data, dict) and ewma_metric_data.get("acwr") is not None:
                    acwr = ewma_metric_data["acwr"]
                    total_acwr += acwr
                    acwr_count += 1
                    
                    if acwr < 0.8:
                        risk_level = "low"
                    elif acwr <= 1.3:
                        risk_level = "optimal"
                    elif acwr <= 1.5:
                        risk_level = "moderate"
                    else:
                        risk_level = "high"
                    
                    risk_distribution[risk_level] += 1
                    
                    if risk_level == "high":
                        position_summary[position]["high_risk_count"] += 1
                        alert_msg = f"⚠️ {athlete['name']} ({position}): ACWR alto ({acwr})" if lang == "pt" else f"⚠️ {athlete['name']} ({position}): High ACWR ({acwr})"
                        alerts.append(alert_msg)
                else:
                    risk_distribution["unknown"] += 1
            else:
                risk_distribution["unknown"] += 1
            
            # RSI from jump assessments (from pre-loaded data)
            athlete_jump_assessments = [j for j in jump_by_athlete.get(athlete_id, []) if j.get("protocol") == "cmj"][:10]
            
            if athlete_jump_assessments:
                for jump_assessment in athlete_jump_assessments:
                    rsi = jump_assessment.get("rsi")
                    if rsi and rsi > 0:
                        all_rsi_values.append({"value": rsi, "date": jump_assessment.get("date"), "athlete_id": athlete_id})
            else:
                # Fallback to legacy assessments
                athlete_assessments = assessments_by_athlete.get(athlete_id, [])
                for assessment in athlete_assessments:
                    metrics = assessment.get("metrics", {})
                    rsi = metrics.get("rsi") if isinstance(metrics, dict) else None
                    if rsi and rsi > 0:
                        all_rsi_values.append({"value": rsi, "date": assessment.get("date"), "athlete_id": athlete_id})
        else:
            risk_distribution["unknown"] += 1
        
        # Wellness data (from pre-loaded data)
        wellness_data = wellness_by_athlete.get(athlete_id, [])[:7]
        wellness_score = None
        fatigue_score = None
        readiness_score_pct = None  # Readiness as 0-100%
        last_wellness_date = None
        
        if wellness_data:
            latest_wellness = wellness_data[0]
            last_wellness_date = latest_wellness.get("date")
            wellness_score = latest_wellness.get("wellness_score")
            
            if wellness_score is None or wellness_score == 0:
                fatigue_val = latest_wellness.get("fatigue", 5)
                stress_val = latest_wellness.get("stress", 5)
                mood_val = latest_wellness.get("mood", 5)
                sleep_quality_val = latest_wellness.get("sleep_quality", 5)
                muscle_soreness_val = latest_wellness.get("muscle_soreness", 5)
                hydration_val = latest_wellness.get("hydration", 5)
                
                calculated_wellness = (
                    (10 - fatigue_val) * 0.20 + (10 - stress_val) * 0.15 +
                    mood_val * 0.15 + sleep_quality_val * 0.20 +
                    (10 - muscle_soreness_val) * 0.15 + hydration_val * 0.15
                )
                if calculated_wellness > 0:
                    wellness_score = round(calculated_wellness, 2)
            
            fatigue = latest_wellness.get("fatigue", 5)
            fatigue_score = fatigue * 10
            
            # Extract readiness_score (0-10 scale) and convert to 0-100%
            raw_readiness = latest_wellness.get("readiness_score")
            if raw_readiness is not None:
                readiness_score_pct = round(raw_readiness * 10, 1)
            
            if wellness_score and wellness_score > 0:
                total_wellness += wellness_score
                wellness_count += 1
            
            total_fatigue += fatigue_score
            fatigue_count += 1
            
            # Accumulate readiness for team average
            if readiness_score_pct is not None:
                total_readiness += readiness_score_pct
                readiness_count += 1
            
            if fatigue_score > 70:
                alert_msg = f"🔴 {athlete['name']}: Fadiga alta ({fatigue_score}%)" if lang == "pt" else f"🔴 {athlete['name']}: High fatigue ({fatigue_score}%)"
                alerts.append(alert_msg)
        
        # Peripheral fatigue (from pre-loaded data)
        peripheral_fatigue = False
        strength_assessments = [a for a in assessments_by_athlete.get(athlete_id, []) if a.get("assessment_type") == "strength"][:10]
        
        if len(strength_assessments) >= 2:
            latest = strength_assessments[0].get("metrics", {})
            historical_peak_power = max([a.get("metrics", {}).get("peak_power", 0) for a in strength_assessments])
            current_peak_power = latest.get("peak_power", 0)
            
            if historical_peak_power > 0:
                power_drop = (historical_peak_power - current_peak_power) / historical_peak_power * 100
                if power_drop > 20:
                    peripheral_fatigue = True
                    if power_drop > 30:
                        alert_msg = f"⚡ {athlete['name']}: Queda de potência de {power_drop:.0f}%" if lang == "pt" else f"⚡ {athlete['name']}: Power drop of {power_drop:.0f}%"
                        alerts.append(alert_msg)
        
        # Power data (from pre-loaded data)
        power_found = False
        if strength_assessments:
            latest_strength = strength_assessments[0].get("metrics", {})
            mean_power = latest_strength.get("mean_power")
            if mean_power and mean_power > 0:
                total_power += mean_power
                power_count += 1
                power_found = True
        
        if not power_found:
            jump_assessments = jump_by_athlete.get(athlete_id, [])[:5]
            if jump_assessments:
                peak_power = jump_assessments[0].get("peak_power_w")
                if peak_power and peak_power > 0:
                    total_power += peak_power
                    power_count += 1
        
        # Body composition (from pre-loaded data)
        latest_body_comp = body_comp_by_athlete.get(athlete_id)
        if latest_body_comp and latest_body_comp.get("body_fat_percentage"):
            total_body_fat += latest_body_comp["body_fat_percentage"]
            body_fat_count += 1
        
        # RC6: DO NOT compute load metrics manually.
        # ALWAYS use load_engine as single source of truth.
        monotony_value = None
        strain_value = None
        metric_value_for_athlete = None
        
        # Read monotony/strain from load_engine (same source as ACWR)
        if athlete_ewma:
            monotony_value = athlete_ewma.get("monotony") or None
            strain_value = athlete_ewma.get("strain") or None
        
        # metric_value is a display sum for the filter period (not a load engine metric)
        if gps_data:
            days_to_check = max(1, filter_days) if filter_days == 0 else filter_days
            days_to_check = min(days_to_check, 7)
            
            daily_loads = []
            for i in range(days_to_check if filter_days > 0 else 1):
                date_str = (today - timedelta(days=i)).strftime("%Y-%m-%d")
                day_data = gps_data_by_date.get(date_str, {})
                daily_loads.append(day_data.get(acwr_metric, 0) or 0)
            
            if filter_days == 0:
                metric_value_for_athlete = daily_loads[0] if daily_loads else 0
            else:
                metric_value_for_athlete = sum(daily_loads)
        
        athlete_data.append(TeamDashboardAthlete(
            id=athlete_id,
            name=athlete["name"],
            position=position,
            acwr=acwr,
            risk_level=risk_level,
            fatigue_score=fatigue_score,
            readiness_score=readiness_score_pct,
            last_gps_date=last_gps_date,
            last_wellness_date=last_wellness_date,
            wellness_score=wellness_score,
            total_sessions_7d=sessions_7d,
            avg_distance_7d=round(distance_7d / sessions_7d, 0) if sessions_7d > 0 else 0,
            injury_risk=risk_level == "high" or (fatigue_score is not None and fatigue_score > 70),
            peripheral_fatigue=peripheral_fatigue,
            monotony=monotony_value,
            strain=strain_value,
            metric_value=metric_value_for_athlete
        ))
        
        # Update position averages
        if acwr:
            position_summary[position]["_total_acwr"] += acwr
            position_summary[position]["_acwr_count"] += 1
        if wellness_score:
            position_summary[position]["_total_wellness"] += wellness_score
            position_summary[position]["_wellness_count"] += 1
        if fatigue_score:
            position_summary[position]["_total_fatigue"] += fatigue_score
            position_summary[position]["_fatigue_count"] += 1
        
        if gps_data:
            recent_gps = gps_data[:7]
            if recent_gps:
                avg_dist = sum(g.get("total_distance", 0) for g in recent_gps) / len(recent_gps)
                avg_sprints = sum(g.get("number_of_sprints", 0) for g in recent_gps) / len(recent_gps)
                max_speeds = [g.get("max_speed", 0) for g in recent_gps if g.get("max_speed")]
                avg_max_speed = sum(max_speeds) / len(max_speeds) if max_speeds else 0
                
                position_summary[position]["_total_distance"] += avg_dist
                position_summary[position]["_total_sprints"] += avg_sprints
                position_summary[position]["_total_max_speed"] += avg_max_speed
                position_summary[position]["_gps_count"] += 1
    
    # Calculate position averages and cleanup
    for pos in position_summary:
        ps = position_summary[pos]
        if ps["_acwr_count"] > 0:
            ps["avg_acwr"] = round(ps["_total_acwr"] / ps["_acwr_count"], 2)
        if ps["_wellness_count"] > 0:
            ps["avg_wellness"] = round(ps["_total_wellness"] / ps["_wellness_count"], 1)
        if ps["_fatigue_count"] > 0:
            ps["avg_fatigue"] = round(ps["_total_fatigue"] / ps["_fatigue_count"], 1)
        if ps["_gps_count"] > 0:
            ps["avg_distance"] = round(ps["_total_distance"] / ps["_gps_count"], 0)
            ps["avg_sprints"] = round(ps["_total_sprints"] / ps["_gps_count"], 1)
            ps["avg_max_speed"] = round(ps["_total_max_speed"] / ps["_gps_count"], 1)
        for key in list(ps.keys()):
            if key.startswith("_"):
                del ps[key]
    
    # Sort alerts and athletes
    alerts.sort(key=lambda x: (0 if "🔴" in x else (1 if "⚡" in x else 2)))
    risk_order = {"high": 0, "moderate": 1, "optimal": 2, "low": 3, "unknown": 4}
    athlete_data.sort(key=lambda x: risk_order.get(x.risk_level, 4))
    
    # Calculate RSI stats
    team_avg_rsi = None
    rsi_trend = None
    rsi_percentile = None
    
    if all_rsi_values:
        sorted_rsi = sorted(all_rsi_values, key=lambda x: x.get("date", ""))
        rsi_values_only = [r["value"] for r in sorted_rsi]
        team_avg_rsi = round(sum(rsi_values_only) / len(rsi_values_only), 2)
        
        if len(rsi_values_only) >= 6:
            recent_avg = sum(rsi_values_only[-3:]) / 3
            previous_avg = sum(rsi_values_only[-6:-3]) / 3
            rsi_trend = "up" if recent_avg > previous_avg * 1.05 else ("down" if recent_avg < previous_avg * 0.95 else "stable")
        elif len(rsi_values_only) >= 2:
            rsi_trend = "up" if rsi_values_only[-1] > rsi_values_only[-2] * 1.05 else ("down" if rsi_values_only[-1] < rsi_values_only[-2] * 0.95 else "stable")
        
        rsi_percentile = 25.0 if team_avg_rsi < 1.0 else (50.0 if team_avg_rsi < 2.0 else (75.0 if team_avg_rsi < 3.0 else 95.0))
    
    avg_distance_per_session = round(total_distance / total_sessions_7d_global, 0) if total_sessions_7d_global > 0 and total_distance > 0 else None
    
    return TeamDashboardResponse(
        stats=TeamDashboardStats(
            total_athletes=len(athletes),
            athletes_high_risk=risk_distribution["high"],
            athletes_optimal=risk_distribution["optimal"],
            athletes_fatigued=sum(1 for a in athlete_data if a.fatigue_score and a.fatigue_score > 70),
            team_avg_acwr=round(total_acwr / acwr_count, 2) if acwr_count > 0 else 0,
            team_avg_wellness=round(total_wellness / wellness_count, 1) if wellness_count > 0 else 0,
            team_avg_fatigue=round(total_fatigue / fatigue_count, 1) if fatigue_count > 0 else 0,
            team_avg_readiness=round(total_readiness / readiness_count, 1) if readiness_count > 0 else None,
            sessions_this_week=total_sessions_7d_global,
            total_distance_this_week=round(total_distance, 0),
            team_avg_power=round(total_power / power_count, 0) if power_count > 0 else None,
            team_avg_body_fat=round(total_body_fat / body_fat_count, 1) if body_fat_count > 0 else None,
            team_avg_hid=round(total_hid / hid_count, 0) if hid_count > 0 else None,
            team_avg_rsi=team_avg_rsi,
            rsi_trend=rsi_trend,
            rsi_percentile=rsi_percentile,
            avg_distance_per_session=avg_distance_per_session
        ),
        athletes=athlete_data,
        risk_distribution=risk_distribution,
        position_summary=position_summary,
        alerts=alerts[:10]
    )



# ============= TEAM TABLE (TABELA ANALÍTICA) =============

class TeamTableRow(BaseModel):
    athlete_id: str
    name: str
    position: str
    total_distance: float = 0
    z3: float = 0
    z4: float = 0
    z5: float = 0
    sprint_count: int = 0
    acc_dec: int = 0
    rsimod: Optional[float] = None
    rsimod_delta: Optional[float] = None
    rsimod_baseline_28d: Optional[float] = None
    fatigue_index: Optional[float] = None
    fatigue_baseline_28d: Optional[float] = None
    fatigue_status: str = "UNKNOWN"
    readiness_score: Optional[float] = None  # 0-100% derived from wellness.readiness_score
    readiness_status: str = "UNKNOWN"
    weight: Optional[float] = None
    body_fat: Optional[float] = None
    lean_mass: Optional[float] = None

class TeamTableResponse(BaseModel):
    rows: List[TeamTableRow]
    period_label: str

@router.get("/dashboard/team-table", response_model=TeamTableResponse)
async def get_team_table(
    lang: str = "pt",
    date_range: str = "7d",
    current_user: dict = Depends(get_current_user)
):
    """Aggregated table data for the analytical team table.
    Merges GPS, Jump, BodyComp and Wellness into a single flat row per athlete.
    NO metric recalculation — only read and merge."""
    
    user_id = current_user["_id"]
    
    date_range_days = {"today": 0, "7d": 7, "14d": 14, "28d": 28, "90d": 90}
    filter_days = date_range_days.get(date_range, 7)
    
    today = datetime.utcnow()
    today_str = today.strftime("%Y-%m-%d")
    
    if filter_days == 0:
        filter_start = datetime.strptime(today_str, "%Y-%m-%d")
    else:
        filter_start = today - timedelta(days=filter_days)
    filter_start_str = filter_start.strftime("%Y-%m-%d")
    
    period_labels = {
        "today": "Hoje" if lang == "pt" else "Today",
        "7d": "7 dias" if lang == "pt" else "7 days",
        "14d": "14 dias" if lang == "pt" else "14 days",
        "28d": "28 dias" if lang == "pt" else "28 days",
        "90d": "90 dias" if lang == "pt" else "90 days",
    }
    
    athletes = await db.athletes.find({"coach_id": user_id}).to_list(100)
    if not athletes:
        return TeamTableResponse(rows=[], period_label=period_labels.get(date_range, "7d"))
    
    athlete_ids = [str(a["_id"]) for a in athletes]
    
    # Bulk queries
    all_gps = await db.gps_data.find({
        "coach_id": user_id,
        "date": {"$gte": filter_start_str}
    }).to_list(5000)
    
    all_jumps = await db.jump_assessments.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(500)
    
    all_body = await db.body_compositions.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(200)
    
    all_wellness = await db.wellness.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(500)
    
    # Index by athlete
    _GPS_SESSION_KW = {"session", "total", "full", "complete", "summary", "sessão"}
    _GPS_PERIOD_KW = {"half", "1st", "2nd", "period", "split", "tempo", "parte"}
    
    gps_by_athlete: Dict[str, list] = {}
    for r in all_gps:
        aid = r.get("athlete_id")
        if aid:
            gps_by_athlete.setdefault(aid, []).append(r)
    
    jump_by_athlete: Dict[str, list] = {}
    for r in all_jumps:
        aid = r.get("athlete_id")
        if aid:
            jump_by_athlete.setdefault(aid, []).append(r)
    
    body_by_athlete: Dict[str, dict] = {}
    for r in all_body:
        aid = r.get("athlete_id")
        if aid and aid not in body_by_athlete:
            body_by_athlete[aid] = r
    
    wellness_by_athlete: Dict[str, list] = {}
    for r in all_wellness:
        aid = r.get("athlete_id")
        if aid:
            wellness_by_athlete.setdefault(aid, []).append(r)
    
    rows = []
    for athlete in athletes:
        aid = str(athlete["_id"])
        name = athlete.get("name", "")
        position = athlete.get("position", "")
        if not position or position == "Unknown":
            position = "N/A"
        
        # --- GPS aggregation (same dedup logic as team dashboard) ---
        total_dist = 0.0
        z3_total = 0.0
        z4_total = 0.0
        z5_total = 0.0
        sprint_total = 0
        acc_dec_total = 0
        
        gps_records = gps_by_athlete.get(aid, [])
        if gps_records:
            grouped: Dict[str, Dict[str, list]] = {}
            for rec in gps_records:
                try:
                    d = rec["date"]
                    datetime.strptime(d, "%Y-%m-%d")
                except:
                    continue
                sname = rec.get("session_name") or "default"
                grouped.setdefault(d, {}).setdefault(sname, []).append(rec)
            
            for date_str, sessions_map in grouped.items():
                for sname, records in sessions_map.items():
                    session_total_rec = None
                    period_recs = []
                    for r in records:
                        pname = (r.get("period_name") or "").lower()
                        is_sess = any(kw in pname for kw in _GPS_SESSION_KW)
                        is_period = any(kw in pname for kw in _GPS_PERIOD_KW)
                        if is_sess and not is_period:
                            if session_total_rec is None:
                                session_total_rec = r
                        else:
                            period_recs.append(r)
                    
                    source = [session_total_rec] if session_total_rec else (period_recs if period_recs else records)
                    for r in source:
                        total_dist += r.get("total_distance", 0) or 0
                        z3_total += r.get("high_intensity_distance", 0) or 0
                        z4_total += r.get("high_speed_running", 0) or 0
                        z5_total += r.get("sprint_distance", 0) or 0
                        sprint_total += r.get("number_of_sprints", 0) or 0
                        acc_dec_total += max(0, r.get("number_of_accelerations", 0) or 0) + max(0, r.get("number_of_decelerations", 0) or 0)
        
        # --- RSImod ---
        rsimod_val = None
        rsimod_delta_val = None
        rsimod_baseline_val = None
        cmj_jumps = [j for j in jump_by_athlete.get(aid, []) if j.get("protocol") == "cmj"]
        if cmj_jumps:
            latest_rsi = cmj_jumps[0].get("rsi")
            if latest_rsi and latest_rsi > 0:
                rsimod_val = round(latest_rsi, 2)
                if len(cmj_jumps) >= 2:
                    prev_rsi = cmj_jumps[1].get("rsi")
                    if prev_rsi and prev_rsi > 0:
                        rsimod_delta_val = round(((latest_rsi - prev_rsi) / prev_rsi) * 100, 1)
            # Baseline 28d: average of all CMJ RSI values (already sorted desc by date)
            rsi_vals_28d = []
            for j in cmj_jumps:
                jd = j.get("date", "")
                try:
                    if jd and (today - datetime.strptime(jd[:10], "%Y-%m-%d")).days <= 28:
                        rv = j.get("rsi")
                        if rv and rv > 0:
                            rsi_vals_28d.append(rv)
                except:
                    pass
            if rsi_vals_28d:
                rsimod_baseline_val = round(sum(rsi_vals_28d) / len(rsi_vals_28d), 2)
        
        # --- Body Composition ---
        weight_val = None
        bf_val = None
        lm_val = None
        bc = body_by_athlete.get(aid)
        if bc:
            weight_val = bc.get("weight") or bc.get("peso")
            bf_val = bc.get("body_fat_percentage")
            lm_val = bc.get("lean_mass_kg") or bc.get("lean_mass")
            if weight_val:
                weight_val = round(float(weight_val), 1)
            if bf_val:
                bf_val = round(float(bf_val), 1)
            if lm_val:
                lm_val = round(float(lm_val), 1)
        
        # --- Wellness / Fatigue / Readiness ---
        fatigue_idx = None
        fatigue_baseline_val = None
        fatigue_st = "UNKNOWN"
        readiness_st = "UNKNOWN"
        readiness_pct = None
        
        w_list = wellness_by_athlete.get(aid, [])
        if w_list:
            latest_w = w_list[0]
            fatigue_raw = latest_w.get("fatigue", None)
            if fatigue_raw is not None:
                fatigue_idx = round(float(fatigue_raw) * 10, 1)
                if fatigue_idx <= 30:
                    fatigue_st = "READY"
                elif fatigue_idx <= 60:
                    fatigue_st = "ATTENTION"
                else:
                    fatigue_st = "NOT_READY"
            
            readiness_raw = latest_w.get("readiness_score")
            if readiness_raw is not None:
                r_pct = float(readiness_raw) * 10
                readiness_pct = round(r_pct, 1)
                if r_pct >= 70:
                    readiness_st = "READY"
                elif r_pct >= 40:
                    readiness_st = "ATTENTION"
                else:
                    readiness_st = "NOT_READY"
            elif fatigue_st != "UNKNOWN":
                readiness_st = fatigue_st
            
            # Fatigue baseline 28d: average of last 28d wellness fatigue values
            fatigue_vals_28d = []
            for w in w_list:
                wd = w.get("date", "")
                try:
                    if wd and (today - datetime.strptime(wd[:10], "%Y-%m-%d")).days <= 28:
                        fv = w.get("fatigue")
                        if fv is not None:
                            fatigue_vals_28d.append(float(fv) * 10)
                except:
                    pass
            if fatigue_vals_28d:
                fatigue_baseline_val = round(sum(fatigue_vals_28d) / len(fatigue_vals_28d), 1)
        
        rows.append(TeamTableRow(
            athlete_id=aid,
            name=name,
            position=position,
            total_distance=round(total_dist, 0),
            z3=round(z3_total, 0),
            z4=round(z4_total, 0),
            z5=round(z5_total, 0),
            sprint_count=sprint_total,
            acc_dec=acc_dec_total,
            rsimod=rsimod_val,
            rsimod_delta=rsimod_delta_val,
            rsimod_baseline_28d=rsimod_baseline_val,
            fatigue_index=fatigue_idx,
            fatigue_baseline_28d=fatigue_baseline_val,
            fatigue_status=fatigue_st,
            readiness_score=readiness_pct,
            readiness_status=readiness_st,
            weight=weight_val,
            body_fat=bf_val,
            lean_mass=lm_val,
        ))
    
    rows.sort(key=lambda r: r.total_distance, reverse=True)
    
    return TeamTableResponse(rows=rows, period_label=period_labels.get(date_range, "7d"))



# ============= DASHBOARD OVERVIEW (VISÃO GERAL DA EQUIPE) =============

@router.get("/dashboard/overview")
async def get_dashboard_overview(
    lang: str = "pt",
    athlete_id: Optional[str] = None,
    position: Optional[str] = None,
    date_range: str = "28d",
    current_user: dict = Depends(get_current_user)
):
    """
    Advanced team performance intelligence dashboard.
    Aggregation & visualization layer over existing metrics.
    
    Modes:
    - TEAM: athlete_id=None, position=None → team averages
    - POSITION: athlete_id=None, position=<pos> → position group
    - ATHLETE: athlete_id=<id> → individual longitudinal
    
    ACWR always uses total_distance.
    """
    user_id = current_user["_id"]
    
    # Parse date range
    date_range_map = {"today": 0, "yesterday": 1, "7d": 7, "14d": 14, "28d": 28, "90d": 90}
    filter_days = date_range_map.get(date_range, 28)
    # RC2: "today" must be treated as 1 valid day, not 0
    effective_days = max(1, filter_days)
    
    today = datetime.utcnow()
    
    # RC3: Centralize temporal anchor in reference_date
    # "yesterday" → reference_date = yesterday; all else → reference_date = today
    if date_range == "yesterday":
        reference_date = today - timedelta(days=1)
    else:
        reference_date = today
    
    today_str = reference_date.strftime("%Y-%m-%d")
    
    filter_start = reference_date - timedelta(days=filter_days)
    filter_start_str = filter_start.strftime("%Y-%m-%d")
    
    ninety_days_ago_str = (reference_date - timedelta(days=90)).strftime("%Y-%m-%d")
    seven_days_ago = reference_date - timedelta(days=7)
    twentyeight_days_ago = reference_date - timedelta(days=28)
    
    # Load all athletes
    athletes = await db.athletes.find({"coach_id": user_id}).to_list(200)
    if not athletes:
        return {"mode": "team", "athletes": [], "layers": {}}
    
    athlete_map = {str(a["_id"]): a for a in athletes}
    all_athlete_ids = list(athlete_map.keys())
    
    # Determine mode and target athletes
    mode = "team"
    target_ids = all_athlete_ids
    
    if athlete_id and athlete_id != "all":
        mode = "athlete"
        target_ids = [athlete_id]
    elif position and position != "all":
        mode = "position"
        target_ids = [aid for aid, a in athlete_map.items() if a.get("position", "") == position]
    
    # ============ BULK DATA LOAD (same as team dashboard) ============
    all_gps = await db.gps_data.find({
        "coach_id": user_id,
        "date": {"$gte": ninety_days_ago_str}
    }).to_list(10000)
    
    # EWMA load metrics from RollingLoadEngine (same source as Team Dashboard)
    all_load_metrics = await db.athlete_load_metrics.find(
        {"coach_id": user_id}
    ).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(5000)
    
    # Index: latest per athlete + full history per athlete
    load_metrics_latest: dict = {}
    load_metrics_history: dict = {}
    for m in all_load_metrics:
        aid = m.get("athlete_id")
        if not aid:
            continue
        if aid not in load_metrics_latest:
            load_metrics_latest[aid] = m
        if aid not in load_metrics_history:
            load_metrics_history[aid] = []
        load_metrics_history[aid].append(m)
    
    all_wellness = await db.wellness.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(2000)
    
    all_jumps = await db.jump_assessments.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(500)
    
    all_vbt = await db.vbt_data.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(500)
    
    all_body_comp = await db.body_compositions.find({
        "coach_id": user_id
    }).sort([("date", -1), ("created_at", -1), ("_id", -1)]).to_list(200)
    
    # ============ INDEX BY ATHLETE ============
    gps_by_athlete: Dict[str, List[dict]] = {}
    for r in all_gps:
        aid = r.get("athlete_id")
        if aid:
            gps_by_athlete.setdefault(aid, []).append(r)
    for aid in gps_by_athlete:
        gps_by_athlete[aid].sort(key=lambda x: x.get("date", ""))
    
    wellness_by_athlete: Dict[str, List[dict]] = {}
    for r in all_wellness:
        aid = r.get("athlete_id")
        if aid:
            wellness_by_athlete.setdefault(aid, []).append(r)
    
    jump_by_athlete: Dict[str, List[dict]] = {}
    for r in all_jumps:
        aid = r.get("athlete_id")
        if aid:
            jump_by_athlete.setdefault(aid, []).append(r)
    
    vbt_by_athlete: Dict[str, List[dict]] = {}
    for r in all_vbt:
        aid = r.get("athlete_id")
        if aid:
            vbt_by_athlete.setdefault(aid, []).append(r)
    
    body_comp_by_athlete: Dict[str, dict] = {}
    for r in all_body_comp:
        aid = r.get("athlete_id")
        if aid and aid not in body_comp_by_athlete:
            body_comp_by_athlete[aid] = r
    
    # ============ GPS DEDUP HELPER ============
    _GPS_SESSION_KW = {"session", "total", "full", "complete", "summary", "sessão"}
    _GPS_PERIOD_KW = {"half", "1st", "2nd", "period", "split", "tempo", "parte"}
    
    def build_daily_gps(gps_records):
        """Build daily aggregated GPS from records, deduped by session/period."""
        daily = {}
        grouped = {}
        for r in gps_records:
            d = r.get("date", "")
            sname = r.get("session_name") or "default"
            grouped.setdefault(d, {}).setdefault(sname, []).append(r)
        
        for date_str, sessions_map in grouped.items():
            day = {"total_distance": 0, "high_intensity_distance": 0, "high_speed_running": 0,
                   "sprint_distance": 0, "number_of_sprints": 0, "acc_dec": 0}
            for sname, records in sessions_map.items():
                session_total = None
                period_recs = []
                for r in records:
                    pname = (r.get("period_name") or "").lower()
                    is_sess = any(kw in pname for kw in _GPS_SESSION_KW)
                    is_per = any(kw in pname for kw in _GPS_PERIOD_KW)
                    if is_sess and not is_per:
                        if session_total is None:
                            session_total = r
                    else:
                        period_recs.append(r)
                source = [session_total] if session_total else (period_recs if period_recs else records)
                for r in source:
                    day["total_distance"] += r.get("total_distance", 0) or 0
                    day["high_intensity_distance"] += r.get("high_intensity_distance", 0) or 0
                    day["high_speed_running"] += r.get("high_speed_running", 0) or 0
                    day["sprint_distance"] += r.get("sprint_distance", 0) or 0
                    day["number_of_sprints"] += r.get("number_of_sprints", 0) or 0
                    acc = r.get("number_of_accelerations", 0) or 0
                    dec = r.get("number_of_decelerations", 0) or 0
                    day["acc_dec"] += acc + dec
            daily[date_str] = day
        return daily
    
    def get_wellness_score(w):
        """Extract or compute wellness score from a wellness record."""
        ws = w.get("wellness_score")
        if ws and ws > 0:
            return ws
        f = w.get("fatigue", 5); s = w.get("stress", 5); m = w.get("mood", 5)
        sq = w.get("sleep_quality", 5); ms = w.get("muscle_soreness", 5); h = w.get("hydration", 5)
        calc = (10-f)*0.20 + (10-s)*0.15 + m*0.15 + sq*0.20 + (10-ms)*0.15 + h*0.15
        return round(calc, 2) if calc > 0 else None
    
    def calc_lmpi(acwr_val, wellness_val, rsimod_val, vbt_fatigue_pct, monotony_val):
        """
        LMPI = Performance Indicator (0-100).
        ACWR→30%, Wellness→25%, RSImod→20%, VBT Fatigue→15%, Monotony→10%
        
        VALIDITY RULES:
        - ACWR is MANDATORY. Without it, LMPI is invalid (returns None).
        - At least Wellness OR RSImod must be present for full validity.
        - Missing data ≠ low performance. Return None instead of artificial low score.
        """
        # RULE: Without ACWR, LMPI cannot be computed
        if acwr_val is None:
            return None, "invalid"
        
        # Determine data completeness
        has_wellness = wellness_val is not None and wellness_val > 0
        has_rsimod = rsimod_val is not None and rsimod_val > 0
        has_state_data = has_wellness or has_rsimod
        
        if has_state_data:
            validity = "valid"       # ACWR + at least 1 state indicator
        else:
            validity = "partial"     # ACWR only, no state data
        
        score = 0.0
        # ACWR component: optimal=1.0-1.3→100, <0.8→50, >1.5→20
        if 0.8 <= acwr_val <= 1.3:
            acwr_score = 100
        elif acwr_val < 0.8:
            acwr_score = max(20, acwr_val / 0.8 * 80)
        elif acwr_val <= 1.5:
            acwr_score = max(30, 100 - (acwr_val - 1.3) / 0.2 * 70)
        else:
            acwr_score = max(10, 100 - (acwr_val - 1.0) * 60)
        score += acwr_score * 0.30
        
        # Wellness: 0-10 scale → 0-100
        if has_wellness:
            score += min(100, wellness_val * 10) * 0.25
        
        # RSImod: typical range 0.2-0.6 → 0-100
        if has_rsimod:
            rsi_score = min(100, (rsimod_val / 0.5) * 100)
            score += rsi_score * 0.20
        
        # VBT Fatigue: velocity loss % (0=good, 20+=bad) → inverted
        if vbt_fatigue_pct is not None:
            vbt_score = max(0, 100 - vbt_fatigue_pct * 5)
            score += vbt_score * 0.15
        
        # Monotony: <1.5=good, >2=bad
        if monotony_val is not None:
            if monotony_val <= 1.5:
                mono_score = 100
            elif monotony_val <= 2.0:
                mono_score = 60
            else:
                mono_score = max(10, 100 - (monotony_val - 1.5) * 60)
            score += mono_score * 0.10
        
        # Normalize: divide by actual weight used (only components present)
        total_weight = 0.30  # ACWR always present
        if has_wellness: total_weight += 0.25
        if has_rsimod: total_weight += 0.20
        if vbt_fatigue_pct is not None: total_weight += 0.15
        if monotony_val is not None: total_weight += 0.10
        
        if total_weight > 0:
            normalized = score / total_weight
        else:
            normalized = score
        
        return round(min(100, max(0, normalized)), 1), validity
    
    # ============ PER-ATHLETE CALCULATIONS ============
    athlete_results = []
    
    for aid in target_ids:
        if aid not in athlete_map:
            continue
        a = athlete_map[aid]
        name = a.get("name", "")
        pos = a.get("position", "")
        
        # GPS daily
        gps_recs = gps_by_athlete.get(aid, [])
        daily_gps = build_daily_gps(gps_recs)
        has_gps_data = len(gps_recs) > 0
        
        # ACWR from EWMA (athlete_load_metrics) — ONLY when GPS data exists
        # This matches Team Dashboard logic: no GPS data = no load metrics shown
        acwr = None
        acute_load = None
        chronic_load = None
        monotony = None
        strain = None
        
        if has_gps_data:
            athlete_ewma = load_metrics_latest.get(aid)
            if athlete_ewma:
                ewma_distance = athlete_ewma.get("distance", {})
                if isinstance(ewma_distance, dict) and ewma_distance.get("acwr") is not None:
                    acwr = ewma_distance["acwr"]
                acute_load = ewma_distance.get("ewma_acute", 0) if isinstance(ewma_distance, dict) else 0
                chronic_load = ewma_distance.get("ewma_chronic", 0) if isinstance(ewma_distance, dict) else 0
                monotony = athlete_ewma.get("monotony") or None
                strain = athlete_ewma.get("strain") or None
            else:
                acute_load = 0
                chronic_load = 0
        
        # Daily load timeline (for charts)
        # RC2: use effective_days (min 1) so "today" filter generates 1 data point
        daily_timeline = []
        for i in range(effective_days):
            d = (reference_date - timedelta(days=effective_days - 1 - i)).strftime("%Y-%m-%d")
            day_data = daily_gps.get(d, {})
            daily_timeline.append({
                "date": d,
                "total_distance": day_data.get("total_distance", 0),
                "hid": day_data.get("high_intensity_distance", 0),
                "hsr": day_data.get("high_speed_running", 0),
                "sprint": day_data.get("sprint_distance", 0),
                "sprints_count": day_data.get("number_of_sprints", 0),
                "acc_dec": day_data.get("acc_dec", 0)
            })
        
        # Weekly heatmap (last 4 weeks, day-of-week)
        weekly_heatmap = []
        for w in range(4):
            week_data = []
            for dow in range(7):  # Mon=0 to Sun=6
                d = reference_date - timedelta(days=(3-w)*7 + (6 - dow))
                d_str = d.strftime("%Y-%m-%d")
                dist = daily_gps.get(d_str, {}).get("total_distance", 0)
                week_data.append({"date": d_str, "dow": dow, "value": dist})
            weekly_heatmap.append({"week": w, "days": week_data})
        
        # ACWR timeline from EWMA history (athlete_load_metrics)
        acwr_timeline = []
        history = load_metrics_history.get(aid, [])
        for m in reversed(history):  # oldest first
            m_date = m.get("date", "")
            if filter_start_str <= m_date <= today_str:
                dist = m.get("distance", {})
                if isinstance(dist, dict) and dist.get("acwr") is not None:
                    acwr_timeline.append({"date": m_date, "acwr": dist["acwr"]})
        
        # Velocity zones distribution (aggregate over period)
        vz_total = {"hid": 0, "hsr": 0, "sprint": 0, "other": 0}
        for d_str, day_data in daily_gps.items():
            if d_str >= filter_start_str:
                vz_total["hid"] += day_data.get("high_intensity_distance", 0)
                vz_total["hsr"] += day_data.get("high_speed_running", 0)
                vz_total["sprint"] += day_data.get("sprint_distance", 0)
                td = day_data.get("total_distance", 0)
                other = td - vz_total["hid"] - vz_total["hsr"] - vz_total["sprint"]
        total_dist_period = sum(daily_gps.get(d, {}).get("total_distance", 0) 
                               for d in [((reference_date - timedelta(days=i)).strftime("%Y-%m-%d")) for i in range(effective_days)])
        vz_other = max(0, total_dist_period - vz_total["hid"] - vz_total["hsr"] - vz_total["sprint"])
        velocity_zones = {
            "low_intensity": round(vz_other),
            "hid_z3": round(vz_total["hid"]),
            "hsr_z4": round(vz_total["hsr"]),
            "sprint_z5": round(vz_total["sprint"])
        }
        
        # Wellness + Readiness
        w_recs = wellness_by_athlete.get(aid, [])
        latest_wellness = None
        wellness_score = None
        readiness_score = None
        wellness_details = {}
        wellness_timeline = []
        
        if w_recs:
            latest_w = w_recs[0]
            latest_wellness = latest_w.get("date")
            wellness_score = get_wellness_score(latest_w)
            # Extract real readiness_score (different formula from wellness)
            raw_readiness = latest_w.get("readiness_score")
            if raw_readiness is not None and raw_readiness > 0:
                readiness_score = round(raw_readiness * 10, 1)  # 0-10 → 0-100%
            wellness_details = {
                "sleep": latest_w.get("sleep_quality", 5),
                "fatigue": latest_w.get("fatigue", 5),
                "stress": latest_w.get("stress", 5),
                "soreness": latest_w.get("muscle_soreness", 5),
                "mood": latest_w.get("mood", 5)
            }
            # Wellness timeline
            for w in w_recs[:filter_days]:
                ws = get_wellness_score(w)
                if ws:
                    wellness_timeline.append({
                        "date": w.get("date"),
                        "score": ws,
                        "sleep": w.get("sleep_quality", 5),
                        "fatigue": w.get("fatigue", 5),
                        "stress": w.get("stress", 5),
                        "soreness": w.get("muscle_soreness", 5),
                        "mood": w.get("mood", 5)
                    })
        
        # Jump data — CMJ (primary neuromuscular), SL-CMJ (asymmetry)
        j_recs = jump_by_athlete.get(aid, [])
        cmj_recs = [j for j in j_recs if j.get("protocol") == "cmj"]
        sl_right_recs = [j for j in j_recs if j.get("protocol") == "sl_cmj_right"]
        sl_left_recs = [j for j in j_recs if j.get("protocol") == "sl_cmj_left"]
        rsimod = None
        rsimod_timeline = []
        jump_metrics = {}
        asymmetry = None
        
        if cmj_recs:
            latest_j = cmj_recs[0]
            rsimod = latest_j.get("rsi") or latest_j.get("rsi_modified")
            jump_metrics = {
                "jump_height_cm": latest_j.get("jump_height_cm"),
                "flight_time_ms": latest_j.get("flight_time_ms"),
                "contraction_time_ms": latest_j.get("contraction_time_ms") or latest_j.get("time_to_takeoff_ms"),
                "rsimod": rsimod,
                "peak_power_w": latest_j.get("peak_power_w")
            }
            # CMJ fatigue index (baseline from best 3 in last 60 days)
            recent_rsi = [j.get("rsi") or j.get("rsi_modified") or 0 for j in cmj_recs[:20] if (j.get("rsi") or j.get("rsi_modified"))]
            if len(recent_rsi) >= 3:
                baseline_rsi = sum(sorted(recent_rsi, reverse=True)[:3]) / 3
                fatigue_index = round(((rsimod - baseline_rsi) / baseline_rsi) * 100, 1) if baseline_rsi > 0 and rsimod else None
            else:
                fatigue_index = None
                baseline_rsi = recent_rsi[0] if recent_rsi else None
            jump_metrics["fatigue_index"] = fatigue_index
            jump_metrics["baseline_rsi"] = round(baseline_rsi, 3) if baseline_rsi else None
            
            for j in cmj_recs[:20]:
                r = j.get("rsi") or j.get("rsi_modified")
                if r:
                    rsimod_timeline.append({"date": j.get("date"), "rsimod": r, 
                                           "height": j.get("jump_height_cm")})
        
        # SL-CMJ asymmetry
        if sl_right_recs and sl_left_recs:
            r_height = sl_right_recs[0].get("jump_height_cm", 0)
            l_height = sl_left_recs[0].get("jump_height_cm", 0)
            r_rsi = sl_right_recs[0].get("rsi") or sl_right_recs[0].get("rsi_modified") or 0
            l_rsi = sl_left_recs[0].get("rsi") or sl_left_recs[0].get("rsi_modified") or 0
            max_h = max(r_height, l_height)
            max_r = max(r_rsi, l_rsi)
            asymmetry = {
                "height_pct": round(abs(r_height - l_height) / max_h * 100, 1) if max_h > 0 else 0,
                "rsi_pct": round(abs(r_rsi - l_rsi) / max_r * 100, 1) if max_r > 0 else 0,
                "dominant": "right" if r_height >= l_height else "left",
                "right_height": r_height, "left_height": l_height,
                "right_rsi": round(r_rsi, 3), "left_rsi": round(l_rsi, 3),
                "risk_flag": abs(r_height - l_height) / max_h * 100 > 10 if max_h > 0 else False
            }
        
        # VBT data — grouped by exercise, never mixed
        v_recs = vbt_by_athlete.get(aid, [])
        vbt_fatigue_pct = None
        vbt_metrics = {}
        vbt_by_exercise = {}
        
        if v_recs:
            # Group by exercise
            for vr in v_recs:
                ex = vr.get("exercise", "unknown")
                vbt_by_exercise.setdefault(ex, []).append(vr)
            
            # For each exercise, get latest metrics
            vbt_exercises_summary = {}
            for ex, ex_recs in vbt_by_exercise.items():
                latest_v = ex_recs[0]
                sets = latest_v.get("sets", [])
                velocities = [s.get("mean_velocity", 0) for s in sets if s.get("mean_velocity")]
                ex_fatigue = None
                if len(velocities) >= 2 and velocities[0] > 0:
                    ex_fatigue = round((1 - velocities[-1] / velocities[0]) * 100, 1)
                vbt_exercises_summary[ex] = {
                    "mean_velocity": round(sum(velocities)/len(velocities), 3) if velocities else None,
                    "peak_velocity": round(max(velocities), 3) if velocities else None,
                    "fatigue_pct": ex_fatigue,
                    "date": latest_v.get("date"),
                    "sessions": len(ex_recs)
                }
            
            # Overall VBT fatigue: use the exercise with most recent data
            latest_v = v_recs[0]
            sets = latest_v.get("sets", [])
            if sets:
                velocities = [s.get("mean_velocity", 0) for s in sets if s.get("mean_velocity")]
                if len(velocities) >= 2 and velocities[0] > 0:
                    vbt_fatigue_pct = round((1 - velocities[-1] / velocities[0]) * 100, 1)
            
            vbt_metrics = {
                "latest_exercise": v_recs[0].get("exercise"),
                "fatigue_pct": vbt_fatigue_pct,
                "exercises": vbt_exercises_summary
            }
        
        # Body composition
        bc = body_comp_by_athlete.get(aid)
        body_comp = {}
        if bc:
            body_comp = {
                "weight": bc.get("weight_kg"),
                "body_fat_pct": bc.get("body_fat_percentage"),
                "lean_mass_kg": bc.get("lean_mass_kg")
            }
        
        # LMPI — only compute when athlete has GPS/load data
        # Returns (score, validity) where validity is "valid", "partial", or "invalid"
        lmpi = None
        lmpi_validity = "invalid"
        if has_gps_data:
            lmpi, lmpi_validity = calc_lmpi(acwr, wellness_score, rsimod, vbt_fatigue_pct, monotony)
        
        # Risk classification — derived from LMPI when valid, ACWR-only fallback when partial
        risk_level = "unknown"
        if lmpi is not None and lmpi_validity == "valid":
            # LMPI-based risk (performance-based)
            if lmpi >= 70: risk_level = "optimal"
            elif lmpi >= 40: risk_level = "moderate"
            else: risk_level = "high"
        elif acwr is not None:
            # ACWR-only fallback
            if acwr < 0.8: risk_level = "low"
            elif acwr <= 1.3: risk_level = "optimal"
            elif acwr <= 1.5: risk_level = "moderate"
            else: risk_level = "high"
        
        # Risk score — None when LMPI is invalid (missing data ≠ low performance)
        risk_score = (100 - lmpi) if lmpi is not None else None
        
        athlete_results.append({
            "id": aid,
            "name": name,
            "position": pos,
            "acwr": acwr,
            "acute_load": round(acute_load) if acute_load is not None else None,
            "chronic_load": round(chronic_load) if chronic_load is not None else None,
            "monotony": monotony,
            "strain": strain,
            "wellness_score": wellness_score,
            "readiness_score": readiness_score,
            "wellness_details": wellness_details,
            "wellness_timeline": wellness_timeline,
            "rsimod": rsimod,
            "rsimod_timeline": rsimod_timeline,
            "jump_metrics": jump_metrics,
            "asymmetry": asymmetry,
            "vbt_metrics": vbt_metrics,
            "vbt_fatigue_pct": vbt_fatigue_pct,
            "body_comp": body_comp,
            "lmpi": lmpi,
            "lmpi_validity": lmpi_validity,
            "risk_level": risk_level,
            "risk_score": round(risk_score, 1) if risk_score is not None else None,
            "daily_timeline": daily_timeline,
            "acwr_timeline": acwr_timeline,
            "velocity_zones": velocity_zones,
            "weekly_heatmap": weekly_heatmap,
            "has_gps_data": has_gps_data
        })
    
    # ============ AGGREGATION ============
    n = len(athlete_results)
    
    def safe_avg(vals):
        filtered = [v for v in vals if v is not None]
        return round(sum(filtered) / len(filtered), 2) if filtered else None
    
    # Load-related team averages: only from athletes WITH GPS data (matches Team Dashboard)
    gps_athletes = [a for a in athlete_results if a.get("has_gps_data")]
    
    team_acwr = safe_avg([a["acwr"] for a in gps_athletes])
    team_monotony = safe_avg([a["monotony"] for a in gps_athletes])
    team_strain = safe_avg([a["strain"] for a in gps_athletes])
    team_lmpi = safe_avg([a["lmpi"] for a in gps_athletes if a.get("lmpi") is not None])
    team_acute = safe_avg([a["acute_load"] for a in gps_athletes])
    team_chronic = safe_avg([a["chronic_load"] for a in gps_athletes])
    team_rsimod = safe_avg([a["rsimod"] for a in gps_athletes])
    
    # Wellness/readiness: from ALL athletes (not gated by GPS, same as Team Dashboard)
    team_wellness = safe_avg([a["wellness_score"] for a in athlete_results])
    team_readiness = safe_avg([a["readiness_score"] for a in athlete_results])
    
    # Aggregated daily timeline (team/position average)
    # RC2: use effective_days for consistent timeline generation
    agg_timeline = []
    if mode != "athlete" and n > 0:
        for day_idx in range(effective_days):
            d = (reference_date - timedelta(days=effective_days - 1 - day_idx)).strftime("%Y-%m-%d")
            day_vals = [a["daily_timeline"][day_idx] if day_idx < len(a["daily_timeline"]) else {} for a in athlete_results]
            agg_timeline.append({
                "date": d,
                "total_distance": round(safe_avg([dv.get("total_distance", 0) for dv in day_vals]) or 0),
                "hid": round(safe_avg([dv.get("hid", 0) for dv in day_vals]) or 0),
                "hsr": round(safe_avg([dv.get("hsr", 0) for dv in day_vals]) or 0),
                "sprint": round(safe_avg([dv.get("sprint", 0) for dv in day_vals]) or 0),
            })
    
    # Risk distribution
    risk_dist = {"low": 0, "optimal": 0, "moderate": 0, "high": 0, "unknown": 0}
    for a in athlete_results:
        risk_dist[a.get("risk_level", "unknown")] += 1
    
    # Available count (athletes with data in period)
    available = sum(1 for a in athlete_results if a["acwr"] is not None or a["wellness_score"] is not None)
    unavailable = n - available
    
    # Positions list
    positions = sorted(set(a.get("position", "") for a in athletes if a.get("position")))
    
    # ============ GENERATE INSIGHTS ============
    insights = {}
    
    # Smart Summary insight
    ss_parts = []
    if team_acwr is not None:
        if team_acwr > 1.5:
            ss_parts.append("ACWR elevado indica sobrecarga aguda. Risco aumentado de lesão." if lang == "pt" else "High ACWR indicates acute overload. Increased injury risk.")
        elif team_acwr < 0.8:
            ss_parts.append("ACWR baixo sugere sub-treinamento. Considerar aumento progressivo." if lang == "pt" else "Low ACWR suggests undertraining. Consider progressive increase.")
        else:
            ss_parts.append("ACWR na zona ótima (0.8-1.3)." if lang == "pt" else "ACWR in optimal zone (0.8-1.3).")
    if team_wellness is not None and team_wellness < 5:
        ss_parts.append("Wellness abaixo de 5/10 indica fadiga geral significativa." if lang == "pt" else "Wellness below 5/10 indicates significant general fatigue.")
    if team_rsimod is not None and team_monotony is not None and team_monotony > 2.0:
        ss_parts.append("Monotonia alta (>2.0) combinada com dados neuromusculares requer atenção." if lang == "pt" else "High monotony (>2.0) combined with neuromuscular data requires attention.")
    insights["smart_summary"] = " ".join(ss_parts) if ss_parts else ("Dados insuficientes para gerar insight." if lang == "pt" else "Insufficient data for insight.")
    
    # Load Intelligence insight
    li_parts = []
    if team_acwr is not None:
        if team_monotony and team_monotony > 2.0:
            li_parts.append("Monotonia elevada detectada. Variar estímulos de treino para reduzir risco." if lang == "pt" else "High monotony detected. Vary training stimuli to reduce risk.")
        if team_strain and team_strain > 5000:
            li_parts.append("Strain semanal alto. Monitorar recuperação individual." if lang == "pt" else "High weekly strain. Monitor individual recovery.")
    insights["load_intelligence"] = " ".join(li_parts) if li_parts else ("Carga dentro dos parâmetros esperados." if lang == "pt" else "Load within expected parameters.")
    
    # Team Status insight
    low_wellness = [a for a in athlete_results if a["wellness_score"] and a["wellness_score"] < 5]
    if low_wellness:
        names = ", ".join([a["name"].split()[0] for a in low_wellness[:3]])
        insights["team_status"] = f"Atletas com baixa prontidão: {names}. Considerar ajuste de volume." if lang == "pt" else f"Athletes with low readiness: {names}. Consider volume adjustment."
    else:
        insights["team_status"] = "Equipe com boa prontidão geral." if lang == "pt" else "Team with good overall readiness."
    
    # Neuromuscular insight
    nm_parts = []
    low_rsi = [a for a in athlete_results if a["rsimod"] and a["rsimod"] < 0.3]
    if low_rsi:
        nm_parts.append(f"{len(low_rsi)} atleta(s) com RSImod baixo (<0.30)." if lang == "pt" else f"{len(low_rsi)} athlete(s) with low RSImod (<0.30).")
    high_vbt_fatigue = [a for a in athlete_results if a["vbt_fatigue_pct"] and a["vbt_fatigue_pct"] > 15]
    if high_vbt_fatigue:
        nm_parts.append("Perda de velocidade >15% no VBT sugere fadiga neuromuscular periférica." if lang == "pt" else "Velocity loss >15% in VBT suggests peripheral neuromuscular fatigue.")
    insights["neuromuscular"] = " ".join(nm_parts) if nm_parts else ("Status neuromuscular estável." if lang == "pt" else "Stable neuromuscular status.")
    
    # Risk Intelligence insight
    high_risk = [a for a in athlete_results if a["risk_level"] == "high"]
    if high_risk:
        names = ", ".join([a["name"].split()[0] for a in high_risk[:3]])
        insights["risk_intelligence"] = f"Atletas em alto risco: {names}. ACWR + wellness combinados indicam necessidade de intervenção imediata." if lang == "pt" else f"High risk athletes: {names}. Combined ACWR + wellness indicate need for immediate intervention."
    else:
        insights["risk_intelligence"] = "Nenhum atleta em zona de alto risco atualmente." if lang == "pt" else "No athletes currently in high risk zone."
    
    # Build response
    response = {
        "mode": mode,
        "filter": {
            "athlete_id": athlete_id,
            "position": position,
            "date_range": date_range,
            "filter_days": filter_days
        },
        "positions": positions,
        "summary": {
            "total_athletes": n,
            "available": available,
            "unavailable": unavailable,
            "team_acwr": team_acwr,
            "team_wellness": team_wellness,
            "team_readiness": team_readiness,
            "team_rsimod": team_rsimod,
            "team_monotony": team_monotony,
            "team_strain": team_strain,
            "team_lmpi": team_lmpi,
            "team_acute_load": team_acute,
            "team_chronic_load": team_chronic,
            "risk_distribution": risk_dist
        },
        "athletes": athlete_results,
        "aggregated_timeline": agg_timeline,
        "insights": insights,
        "last_update": datetime.utcnow().isoformat()
    }
    
    return response



# ============= DASHBOARD OVERVIEW PDF REPORT =============

@router.get("/report/dashboard-overview")
async def get_dashboard_overview_pdf(
    lang: str = "pt",
    athlete_id: Optional[str] = None,
    position: Optional[str] = None,
    date_range: str = "28d",
    layers: str = "load,summary,status,neuro,risk",
    current_user: dict = Depends(get_current_user)
):
    """Generate HTML report for dashboard overview PDF export with inline SVG charts."""
    from fastapi.responses import HTMLResponse
    
    # TASK 6 — failsafe: never propagate internal errors to the client.
    # If the data fetch fails, the PDF still renders (with placeholders/fallbacks).
    try:
        overview = await get_dashboard_overview(lang, athlete_id, position, date_range, current_user)
    except Exception:
        overview = {}
    
    is_pt = lang == "pt"
    selected_layers = set(layers.split(","))
    mode = overview.get("mode", "team")
    
    # ── Map actual response data to PDF sections ──
    summary = overview.get("summary", {})
    athletes_list = overview.get("athletes", [])
    agg_timeline = overview.get("aggregated_timeline", [])
    insights = overview.get("insights", {})
    
    # Build load_data from summary + athletes + aggregated_timeline
    # Velocity zones: average across athletes
    vz_agg = {"low_intensity": 0, "hid_z3": 0, "hsr_z4": 0, "sprint_z5": 0}
    vz_count = 0
    for a in athletes_list:
        vz = a.get("velocity_zones", {})
        if vz:
            vz_agg["low_intensity"] += vz.get("low_intensity", 0)
            vz_agg["hid_z3"] += vz.get("hid_z3", 0)
            vz_agg["hsr_z4"] += vz.get("hsr_z4", 0)
            vz_agg["sprint_z5"] += vz.get("sprint_z5", 0)
            vz_count += 1
    if vz_count > 1:
        for k in vz_agg:
            vz_agg[k] = round(vz_agg[k] / vz_count)
    
    load_data = {
        "acwr": summary.get("team_acwr"),
        "acute_load": summary.get("team_acute_load"),
        "chronic_load": summary.get("team_chronic_load"),
        "monotony": summary.get("team_monotony"),
        "strain": summary.get("team_strain"),
        "velocity_zones": vz_agg,
        "distance_timeline": [{"date": d.get("date", ""), "distance": d.get("total_distance", 0)} for d in agg_timeline],
    }
    
    # Build summary_data from summary + athletes
    # LMPI VALIDITY: Only athletes with valid LMPI appear in risk rankings
    high_risk_athletes = [a for a in athletes_list if a.get("risk_level") == "high" and a.get("lmpi") is not None]
    total = summary.get("total_athletes", len(athletes_list))
    avail_count = summary.get("available", total)
    
    summary_data = {
        "lmpi": {"score": summary.get("team_lmpi") or 0},
        "availability": {"available_pct": round(avail_count / total * 100) if total else 0},
        "high_risk_athletes": [{"name": a.get("name"), "lmpi": a.get("lmpi", 0), "acwr": a.get("acwr", 0)} for a in high_risk_athletes],
        "performance_profile": {
            "load": min(100, round((summary.get("team_acwr") or 0) / 1.3 * 100)),
            "wellness": round((summary.get("team_wellness") or 0) * 10),
            "neuromuscular": round((summary.get("team_rsimod") or 0) * 100) if summary.get("team_rsimod") else 0,
            "power": 0,
        }
    }
    
    # Build status_data from athletes' wellness
    w_sleep, w_fatigue, w_soreness, w_stress, w_count = 0, 0, 0, 0, 0
    low_readiness_list = []
    for a in athletes_list:
        wd = a.get("wellness_details", {})
        ws = a.get("wellness_score")
        if ws is not None:
            w_sleep += wd.get("sleep", 5)
            w_fatigue += wd.get("fatigue", 5)
            w_soreness += wd.get("soreness", 5)
            w_stress += wd.get("stress", 5)
            w_count += 1
            readiness = ws * 10
            if readiness < 60:
                low_readiness_list.append({"name": a.get("name"), "readiness": readiness, "wellness": ws})
    
    team_wellness_score = (summary.get("team_wellness") or 0)
    status_data = {
        "readiness": {"score": round(team_wellness_score * 10)},
        "wellness_avg": {
            "sleep": round(w_sleep / w_count, 1) if w_count else 0,
            "fatigue": round(w_fatigue / w_count, 1) if w_count else 0,
            "soreness": round(w_soreness / w_count, 1) if w_count else 0,
            "stress": round(w_stress / w_count, 1) if w_count else 0,
        },
        "low_readiness_athletes": low_readiness_list,
    }
    
    # Build neuro_data from athletes' jump metrics
    rsimod_vals = [a.get("rsimod") for a in athletes_list if a.get("rsimod") is not None]
    fi_vals = [a.get("jump_metrics", {}).get("fatigue_index") for a in athletes_list if a.get("jump_metrics", {}).get("fatigue_index") is not None]
    team_rsimod = round(sum(rsimod_vals) / len(rsimod_vals), 3) if rsimod_vals else 0
    team_fi = round(sum(fi_vals) / len(fi_vals), 1) if fi_vals else 0
    neuro_score_val = round(50 + (team_rsimod * 50) + (team_fi * 0.5)) if rsimod_vals else 0
    
    neuro_data = {
        "neuro_score": {"score": min(100, max(0, neuro_score_val))},
        "rsimod": {"value": team_rsimod},
        "fatigue_index": team_fi,
    }
    
    # Build risk_data from athletes
    # LMPI VALIDITY: Only include athletes with valid risk_score in rankings
    risk_scores = [a.get("risk_score") for a in athletes_list if a.get("risk_score") is not None and a.get("lmpi_validity") != "invalid"]
    team_risk_score = round(sum(risk_scores) / len(risk_scores)) if risk_scores else 0
    risk_panel = sorted(
        [{"name": a.get("name"), "risk_score": a.get("risk_score") or 0, "acwr": a.get("acwr") or 0, "wellness": a.get("wellness_score") or 0, "lmpi_validity": a.get("lmpi_validity", "invalid")}
         for a in athletes_list if a.get("risk_score") is not None],
        key=lambda x: x["risk_score"], reverse=True
    )
    
    risk_data = {
        "risk_score": {"score": team_risk_score},
        "risk_panel": risk_panel,
    }
    
    # ── SVG chart helpers ──
    def make_line_chart_svg(values, dates_list, color, title, unit, w=500, h=140):
        if not values or all(v == 0 for v in values):
            return ""
        pad = 50
        max_v = max(values) * 1.1 or 1
        iw, ih = w - pad * 2, h - 40
        pts = []
        for i, v in enumerate(values):
            x = pad + (i / max(len(values) - 1, 1)) * iw
            y = h - 20 - (v / max_v) * ih
            pts.append((x, y, v))
        polyline = " ".join(f"{x},{y}" for x, y, _ in pts)
        circles = "".join(f'<circle cx="{x}" cy="{y}" r="3" fill="{color}"/>' for x, y, _ in pts)
        grid = ""
        for i in range(4):
            gy = h - 20 - (i / 3) * ih
            gv = (i / 3) * max_v
            grid += f'<line x1="{pad}" y1="{gy}" x2="{w - pad}" y2="{gy}" stroke="#cbd5e1" stroke-dasharray="3"/>'
            grid += f'<text x="{pad - 5}" y="{gy + 4}" text-anchor="end" fill="#64748b" font-size="9">{gv:,.0f}</text>'
        dlabels = ""
        step = max(1, len(dates_list) // 6)
        for i in range(0, len(dates_list), step):
            x = pad + (i / max(len(dates_list) - 1, 1)) * iw
            dlabels += f'<text x="{x}" y="{h - 4}" text-anchor="middle" fill="#64748b" font-size="8">{dates_list[i]}</text>'
        area_pts = f"{pts[0][0]},{h - 20} " + polyline + f" {pts[-1][0]},{h - 20}"
        return f'''<div class="chart-container">
            <div class="chart-title">{title} ({unit})</div>
            <svg width="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet">
                {grid}
                <polygon points="{area_pts}" fill="{color}" opacity="0.08"/>
                <polyline points="{polyline}" fill="none" stroke="{color}" stroke-width="2"/>
                {circles} {dlabels}
            </svg></div>'''

    def make_bar_chart_svg(values, labels, colors, title, w=500, h=140):
        if not values or all(v == 0 for v in values):
            return ""
        pad_l, pad_r, pad_t, pad_b = 50, 20, 20, 30
        iw = w - pad_l - pad_r
        ih = h - pad_t - pad_b
        max_v = max(values) * 1.1 or 1
        n = len(values)
        bw = min(40, iw / n * 0.6)
        gap = iw / n
        bars = ""
        for i, (v, lbl, col) in enumerate(zip(values, labels, colors)):
            x = pad_l + i * gap + (gap - bw) / 2
            bh = (v / max_v) * ih
            y = pad_t + ih - bh
            bars += f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="3" fill="{col}"/>'
            bars += f'<text x="{x + bw / 2}" y="{y - 4}" text-anchor="middle" fill="#374151" font-size="9" font-weight="600">{v:,.0f}</text>'
            bars += f'<text x="{x + bw / 2}" y="{h - 8}" text-anchor="middle" fill="#64748b" font-size="8">{lbl}</text>'
        grid = ""
        for i in range(4):
            gy = pad_t + ih - (i / 3) * ih
            gv = (i / 3) * max_v
            grid += f'<line x1="{pad_l}" y1="{gy}" x2="{w - pad_r}" y2="{gy}" stroke="#e2e8f0" stroke-dasharray="3"/>'
            grid += f'<text x="{pad_l - 5}" y="{gy + 3}" text-anchor="end" fill="#94a3b8" font-size="8">{gv:,.0f}</text>'
        return f'''<div class="chart-container">
            <div class="chart-title">{title}</div>
            <svg width="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet">{grid}{bars}</svg></div>'''

    def make_gauge_svg(value, label, w=120, h=120):
        cx, cy, r = w / 2, h / 2 + 5, 45
        circ = 2 * 3.14159 * r
        half = circ / 2
        pct = min(max(value / 2.0, 0), 1)
        col = "#10b981" if 0.8 <= value <= 1.3 else "#f59e0b" if value < 0.8 else "#ef4444"
        return f'''<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">
            <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#e2e8f0" stroke-width="8"
                stroke-dasharray="{half} {circ}" stroke-dashoffset="0" transform="rotate(180 {cx} {cy})"/>
            <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" stroke-width="8"
                stroke-dasharray="{pct * half} {circ}" stroke-dashoffset="0" transform="rotate(180 {cx} {cy})" stroke-linecap="round"/>
            <text x="{cx}" y="{cy + 2}" text-anchor="middle" fill="#1e293b" font-size="18" font-weight="800">{value:.2f}</text>
            <text x="{cx}" y="{cy + 16}" text-anchor="middle" fill="#64748b" font-size="9">{label}</text></svg>'''

    def make_horiz_bar(value, max_val, label, color, w=400, h=28):
        pct = (value / max_val * 100) if max_val else 0
        bw = max(2, pct / 100 * (w - 120))
        return f'''<svg width="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid meet">
            <text x="0" y="{h / 2 + 4}" fill="#374151" font-size="10">{label}</text>
            <rect x="90" y="{h / 2 - 6}" width="{w - 170}" height="12" rx="6" fill="#f1f5f9"/>
            <rect x="90" y="{h / 2 - 6}" width="{bw}" height="12" rx="6" fill="{color}"/>
            <text x="{w - 5}" y="{h / 2 + 4}" text-anchor="end" fill="#374151" font-size="10" font-weight="600">{value:,.0f}m</text></svg>'''

    # ══════════════════════════════════════════════════════════════════════
    # LAYER 3 — DETAILED METRICS  (P6 FULL REBUILD)
    # Strict report layout. NOT a dashboard.
    # Fixed structure per module: title + metrics row + chart container + footer.
    # 2-column grid (1fr 1fr), 24px gap, deterministic, page-break: avoid.
    # Data layer is UNCHANGED — same sources, same calculations.
    # ══════════════════════════════════════════════════════════════════════
    _L3_NAMES = {
        "load":    ("Load Intelligence",      "Load Intelligence"),
        "summary": ("Performance Profile",    "Performance Profile"),
        "status":  ("Team Status",            "Team Status"),
        "neuro":   ("Neuromuscular Status",   "Neuromuscular Status"),
        "risk":    ("Risk Intelligence",      "Risk Intelligence"),
    }
    _L3_EMPTY = ("Dados insuficientes."
                 if is_pt else
                 "Insufficient data.")

    def _l3_safe_fmt(val, fmt):
        if val is None:
            return "—"
        try:
            return f"{val:{fmt}}"
        except (TypeError, ValueError):
            return "—"

    def _l3_metric(label, value):
        """Single metric cell inside .pdf-module-metrics row."""
        return (f'<div class="pdf-metric">'
                f'<div class="pdf-metric-label">{label}</div>'
                f'<div class="pdf-metric-value">{value}</div>'
                f'</div>')

    def _l3_metric_styled(label, value, color):
        return (f'<div class="pdf-metric">'
                f'<div class="pdf-metric-label">{label}</div>'
                f'<div class="pdf-metric-value" style="color:{color}">{value}</div>'
                f'</div>')

    def _l3_module(module_id, metrics_html, chart_html, footer_html, has_data):
        """Render a Layer 3 module with the strict structure (always 4 slots).
        Empty modules still render structure (title + empty placeholders)."""
        name = _L3_NAMES[module_id][0 if is_pt else 1]
        # Empty-state preserves layout: empty metrics row + empty chart slot.
        if not has_data:
            metrics_html = f'<div class="pdf-metric pdf-metric-empty">{_L3_EMPTY}</div>'
            chart_html = ''
            footer_html = ''
        footer_block = f'<div class="pdf-module-footer">{footer_html}</div>' if footer_html else ''
        return (
            f'<div class="pdf-module">'
            f'<div class="pdf-module-title">{name}</div>'
            f'<div class="pdf-module-metrics">{metrics_html}</div>'
            f'<div class="pdf-chart-container">{chart_html}</div>'
            f'{footer_block}'
            f'</div>'
        )

    # Chart sized to fit 160px container exactly.
    # SVG uses viewBox so it scales to 100% width × 100% height of the container.
    L3_CHART_W = 480
    L3_CHART_H = 160

    l3_modules_html = ""

    # ── 3.1 LOAD INTELLIGENCE ─────────────────────────────────────────────
    if "load" in selected_layers:
        has_load = isinstance(load_data, dict) and bool(load_data)
        if has_load:
            acwr = load_data.get("acwr") or 0
            acute = load_data.get("acute_load") or 0
            chronic = load_data.get("chronic_load") or 0
            mono = load_data.get("monotony") or 0
            strain_val = load_data.get("strain") or 0
            vz = load_data.get("velocity_zones", {}) or {}
            timeline = load_data.get("distance_timeline", []) or []

            acwr_color = "#DC2626" if (acwr < 0.8 or acwr > 1.5) else "#111827"

            load_metrics = (
                _l3_metric("Acute 7d" if not is_pt else "Aguda 7d", f"{acute:,.0f}m")
                + _l3_metric("Chronic 28d" if not is_pt else "Crônica 28d", f"{chronic:,.0f}m")
                + _l3_metric_styled("ACWR", f"{acwr:.2f}", acwr_color)
                + _l3_metric("Monotony" if not is_pt else "Monotonia", f"{mono:.1f}")
                + _l3_metric("Strain", f"{strain_val:,.0f}")
            )

            load_chart = ""
            if timeline:
                tl_vals = [d.get("distance", 0) for d in timeline[-14:]]
                tl_dates = [d.get("date", "")[-5:] for d in timeline[-14:]]
                load_chart = make_line_chart_svg(
                    tl_vals, tl_dates, "#1F2937",
                    "Total Distance" if not is_pt else "Distância Total", "m",
                    w=L3_CHART_W, h=L3_CHART_H
                )

            vz_vals = [vz.get("low_intensity", 0), vz.get("hid_z3", 0),
                       vz.get("hsr_z4", 0), vz.get("sprint_z5", 0)]
            vz_labels = ["Low Int", "HID Z3", "HSR Z4", "Sprint Z5"]
            vz_total = sum(vz_vals) or 1
            vz_footer = "".join([
                make_horiz_bar(v, vz_total, l, "#1F2937")
                for v, l in zip(vz_vals, vz_labels)
            ])
            l3_modules_html += _l3_module("load", load_metrics, load_chart, vz_footer, True)
        else:
            l3_modules_html += _l3_module("load", "", "", "", False)

    # ── 3.2 PERFORMANCE PROFILE ───────────────────────────────────────────
    if "summary" in selected_layers:
        has_summary = isinstance(summary_data, dict) and bool(summary_data)
        if has_summary:
            profile = summary_data.get("performance_profile", {}) or {}
            p_load = profile.get("load", 0)
            p_wellness = profile.get("wellness", 0)
            p_neuro = profile.get("neuromuscular", 0)
            p_power = profile.get("power", 0)

            prof_metrics = (
                _l3_metric("Load", f"{p_load:.0f}")
                + _l3_metric("Wellness", f"{p_wellness:.0f}")
                + _l3_metric("Neuro", f"{p_neuro:.0f}")
                + _l3_metric("Power", f"{p_power:.0f}")
            )
            prof_chart = make_bar_chart_svg(
                [p_load, p_wellness, p_neuro, p_power],
                ["Load", "Wellness", "Neuro", "Power"],
                ["#1F2937"] * 4, "", w=L3_CHART_W, h=L3_CHART_H
            )
            l3_modules_html += _l3_module("summary", prof_metrics, prof_chart, "", True)
        else:
            l3_modules_html += _l3_module("summary", "", "", "", False)

    # ── 3.3 TEAM STATUS ───────────────────────────────────────────────────
    if "status" in selected_layers:
        has_status = isinstance(status_data, dict) and bool(status_data)
        if has_status:
            readiness = status_data.get("readiness", {}).get("score", 0) or 0
            wellness_avg = status_data.get("wellness_avg", {}) or {}
            rd_color = "#DC2626" if readiness < 50 else "#111827"
            if readiness < 50:
                rd_label = "Crítico" if is_pt else "Critical"
            elif readiness < 75:
                rd_label = "Moderado" if is_pt else "Moderate"
            else:
                rd_label = "Ótimo" if is_pt else "Optimal"

            sleep_v = wellness_avg.get("sleep", 0)
            fatigue_v = wellness_avg.get("fatigue", 0)
            soreness_v = wellness_avg.get("soreness", 0)
            stress_v = wellness_avg.get("stress", 0)

            status_metrics = (
                _l3_metric_styled(
                    "Readiness" if not is_pt else "Prontidão",
                    f"{readiness:.0f}%",
                    rd_color
                )
                + _l3_metric("Sleep" if not is_pt else "Sono", f"{sleep_v:.1f}")
                + _l3_metric("Fatigue" if not is_pt else "Fadiga", f"{fatigue_v:.1f}")
                + _l3_metric("Soreness" if not is_pt else "Dor", f"{soreness_v:.1f}")
            )

            status_chart = make_bar_chart_svg(
                [sleep_v, fatigue_v, soreness_v, stress_v],
                [
                    "Sleep" if not is_pt else "Sono",
                    "Fatigue" if not is_pt else "Fadiga",
                    "Soreness" if not is_pt else "Dor",
                    "Stress",
                ],
                ["#1F2937"] * 4, "", w=L3_CHART_W, h=L3_CHART_H
            )
            status_footer = (f'<div class="pdf-module-footer-note">{rd_label}</div>')
            l3_modules_html += _l3_module("status", status_metrics, status_chart, status_footer, True)
        else:
            l3_modules_html += _l3_module("status", "", "", "", False)

    # ── 3.4 NEUROMUSCULAR STATUS ──────────────────────────────────────────
    if "neuro" in selected_layers:
        has_neuro = isinstance(neuro_data, dict) and bool(neuro_data)
        if has_neuro:
            neuro_score = neuro_data.get("neuro_score", {}).get("score", 0) or 0
            rsimod = neuro_data.get("rsimod", {}).get("value", 0) or 0
            fatigue_idx = neuro_data.get("fatigue_index", 0) or 0
            ns_color = "#DC2626" if neuro_score < 50 else "#111827"
            fi_color = "#DC2626" if fatigue_idx < -10 else "#111827"

            neuro_metrics = (
                _l3_metric_styled("Neuro Score", f"{neuro_score:.0f}", ns_color)
                + _l3_metric("RSImod", f"{rsimod:.2f}")
                + _l3_metric_styled(
                    "Fatigue Idx" if not is_pt else "Ind. Fadiga",
                    f"{fatigue_idx:.1f}%", fi_color
                )
            )
            neuro_chart = make_bar_chart_svg(
                [neuro_score, max(rsimod * 100, 0), max(100 + fatigue_idx, 0)],
                ["Neuro", "RSImod", "Fatigue"],
                ["#1F2937"] * 3, "", w=L3_CHART_W, h=L3_CHART_H
            )
            l3_modules_html += _l3_module("neuro", neuro_metrics, neuro_chart, "", True)
        else:
            l3_modules_html += _l3_module("neuro", "", "", "", False)

    # ── 3.5 RISK INTELLIGENCE ─────────────────────────────────────────────
    if "risk" in selected_layers:
        has_risk = isinstance(risk_data, dict) and bool(risk_data)
        risk_panel = (risk_data.get("risk_panel", []) or []) if has_risk else []
        if has_risk and risk_panel:
            team_risk_score = risk_data.get("risk_score", {}).get("score", 0) or 0
            high_count = sum(1 for a in risk_panel if (a.get("risk_score") or 0) >= 60)
            mod_count = sum(1 for a in risk_panel if 30 <= (a.get("risk_score") or 0) < 60)
            risk_color = "#DC2626" if team_risk_score >= 60 else "#111827"

            risk_metrics = (
                _l3_metric_styled(
                    "Team Risk" if not is_pt else "Risco Equipe",
                    f"{team_risk_score:.0f}", risk_color
                )
                + _l3_metric_styled(
                    "High" if not is_pt else "Alto",
                    f"{high_count}",
                    "#DC2626" if high_count > 0 else "#111827"
                )
                + _l3_metric(
                    "Moderate" if not is_pt else "Moderado",
                    f"{mod_count}"
                )
            )

            # Top-5 highest risk athletes — fits 160px chart container exactly.
            top_n = risk_panel[:5]
            rows_html = []
            for a in top_n:
                risk_v = a.get("risk_score") or 0
                row_class = "danger" if risk_v >= 60 else ""
                if risk_v >= 60:
                    status_label = "High" if not is_pt else "Alto"
                elif risk_v >= 30:
                    status_label = "Moderate" if not is_pt else "Moderado"
                else:
                    status_label = "Low" if not is_pt else "Baixo"
                rows_html.append(
                    f'<tr>'
                    f'<td>{a.get("name","—")}</td>'
                    f'<td>{_l3_safe_fmt(a.get("lmpi"), ".0f")}</td>'
                    f'<td>{_l3_safe_fmt(a.get("acwr"), ".2f")}</td>'
                    f'<td class="{row_class}">{status_label}</td>'
                    f'</tr>'
                )
            risk_chart = (
                f'<table class="pdf-risk-table">'
                f'<thead><tr>'
                f'<th>{"Nome" if is_pt else "Name"}</th>'
                f'<th>LMPI</th>'
                f'<th>ACWR</th>'
                f'<th>Status</th>'
                f'</tr></thead>'
                f'<tbody>{"".join(rows_html)}</tbody>'
                f'</table>'
            )
            extra = len(risk_panel) - len(top_n)
            risk_footer = ""
            if extra > 0:
                risk_footer = (f'<div class="pdf-module-footer-note">'
                               f'+{extra} {"atletas" if is_pt else "athletes"}</div>')
            l3_modules_html += _l3_module("risk", risk_metrics, risk_chart, risk_footer, True)
        else:
            l3_modules_html += _l3_module("risk", "", "", "", False)

    # Wrap in section + 2-col grid + page-container 1024px (rendered only if at least one module).
    if l3_modules_html.strip():
        section_title = "3. Métricas Detalhadas" if is_pt else "3. Detailed Metrics"
        sections_html = (
            f'<div class="page-container">'
            f'<section class="pdf-section">'
            f'<h2 class="pdf-section-title">{section_title}</h2>'
            f'<div class="pdf-grid-2col">{l3_modules_html}</div>'
            f'</section>'
            f'</div>'
        )
    else:
        sections_html = ""
    
    from datetime import datetime
    now = datetime.now().strftime("%d/%m/%Y %H:%M")

    # ───── PDF HEADER (Layer 1.1) ─────
    # Strict spec: white bg, dark text, no cards/shadows/rounded UI.
    # Team Name is hardcoded to "—" (no team_name field exists in the data model;
    # spec forbids inferring or repurposing unrelated fields).
    header_team_name = "—"

    # Period label uses the existing date_range parameter only. If absent or empty
    # → fallback "—". No derivation from any other source.
    if date_range and isinstance(date_range, str) and date_range.strip():
        _dr = date_range.strip().lower()
        _period_map = {
            "7d":  ("Últimos 7 dias",  "Last 7 days"),
            "14d": ("Últimos 14 dias", "Last 14 days"),
            "28d": ("Últimos 28 dias", "Last 28 days"),
            "30d": ("Últimos 30 dias", "Last 30 days"),
            "90d": ("Últimos 90 dias", "Last 90 days"),
        }
        if _dr in _period_map:
            header_period = _period_map[_dr][0] if is_pt else _period_map[_dr][1]
        else:
            header_period = date_range
    else:
        header_period = "—"

    # Generated date: server-side datetime.now() at request time. Always present
    # by construction; defensive fallback retained per spec (never break).
    header_generated = now if now else "—"

    header_label_team = "Equipe" if is_pt else "Team"
    header_label_period = "Período" if is_pt else "Period"
    header_label_generated = "Gerado em" if is_pt else "Generated"

    pdf_header_html = f'''<header class="pdf-header">
        <div class="pdf-brand">
            {f'<img class="pdf-brand-logo" src="{_PDF_LOGO_DATA_URL}" alt="LoadManager Pro">' if _PDF_LOGO_DATA_URL else ''}
            <div class="pdf-brand-text">
                <div class="pdf-brand-name">LoadManager Pro</div>
                <div class="pdf-brand-tagline">If it&#39;s measured. It&#39;s managed. It can be scaled.</div>
            </div>
        </div>
        <h1 class="pdf-header-title">{"Relatório de Performance da Equipe" if is_pt else "Team Performance Report"}</h1>
        <div class="pdf-header-meta">
            <div class="pdf-header-meta-row"><span class="pdf-header-meta-label">{header_label_team}:</span> <span class="pdf-header-meta-value">{header_team_name}</span></div>
            <div class="pdf-header-meta-row"><span class="pdf-header-meta-label">{header_label_period}:</span> <span class="pdf-header-meta-value">{header_period}</span></div>
            <div class="pdf-header-meta-row"><span class="pdf-header-meta-label">{header_label_generated}:</span> <span class="pdf-header-meta-value">{header_generated}</span></div>
        </div>
    </header>'''

    # ───── EXECUTIVE SUMMARY (Layer 1.2) ─────
    # Strict spec: 3 metrics ONLY (LMPI, Availability, Readiness). No Status.
    # All values come directly from `summary`. No derivation. No recalculation.

    def _es_valid_number(v):
        # Accepts only finite, non-NaN numeric values. Booleans are rejected.
        if v is None or isinstance(v, bool):
            return False
        if not isinstance(v, (int, float)):
            return False
        if v != v:  # NaN
            return False
        if v == float("inf") or v == float("-inf"):
            return False
        return True

    _summary_obj = summary if isinstance(summary, dict) else {}

    # 1. LMPI Score — summary.team_lmpi → integer, never default to 0
    _lmpi_raw = _summary_obj.get("team_lmpi")
    exec_lmpi = f"{_lmpi_raw:.0f}" if _es_valid_number(_lmpi_raw) else "—"

    # 2. Availability — ATOMIC RULE: both `available` and `total_athletes` must
    #    be valid non-negative numbers. Partial values are FORBIDDEN.
    _avail_raw = _summary_obj.get("available")
    _total_raw = _summary_obj.get("total_athletes")
    if (_es_valid_number(_avail_raw) and _avail_raw >= 0
            and _es_valid_number(_total_raw) and _total_raw >= 0):
        exec_avail = f"{int(_avail_raw)} / {int(_total_raw)}"
    else:
        exec_avail = "—"

    # 3. Readiness — summary.team_readiness → integer
    _ready_raw = _summary_obj.get("team_readiness")
    exec_readiness = f"{_ready_raw:.0f}" if _es_valid_number(_ready_raw) else "—"

    es_label_lmpi = "LMPI Score"
    es_label_avail = "Disponibilidade" if is_pt else "Availability"
    es_label_ready = "Prontidão" if is_pt else "Readiness"

    pdf_exec_summary_html = f'''<section class="pdf-exec-summary">
        <div class="pdf-exec-item">
            <div class="pdf-exec-label">{es_label_lmpi}</div>
            <div class="pdf-exec-value">{exec_lmpi}</div>
        </div>
        <div class="pdf-exec-item">
            <div class="pdf-exec-label">{es_label_avail}</div>
            <div class="pdf-exec-value">{exec_avail}</div>
        </div>
        <div class="pdf-exec-item">
            <div class="pdf-exec-label">{es_label_ready}</div>
            <div class="pdf-exec-value">{exec_readiness}</div>
        </div>
    </section>'''

    # ───── KEY INSIGHTS (Layer 2) ─────
    # Strict spec: TEXT-ONLY rendering of existing insights. No generation,
    # no derivation, no AI. We only filter, dedup, and render the strings
    # already present in the `insights` payload.
    import html as _html_lib

    # Step 1 — Normalize input
    _insights_obj = insights if isinstance(insights, dict) else {}

    # Canonical module order (locked by spec §3.1): (module_id, insights_key)
    _KI_CANONICAL = [
        ("load",    "load_intelligence"),
        ("summary", "smart_summary"),
        ("status",  "team_status"),
        ("neuro",   "neuromuscular"),
        ("risk",    "risk_intelligence"),
    ]

    ki_bullets = []          # ordered list of (module_id, text)
    ki_seen_per_module = {}  # module_id -> set of texts already kept (per-module dedup)

    # Step 2 — Iterate ALL modules in canonical order
    # Step 3 — Filter by selection (`selected_layers` already a set)
    for module_id, insights_key in _KI_CANONICAL:
        if module_id not in selected_layers:
            continue
        # Step 4 — Extract; skip if missing/empty/wrong type
        raw = _insights_obj.get(insights_key)
        if raw is None or not isinstance(raw, str):
            continue
        text = raw.strip()
        if not text:
            continue
        # Step 5 — Dedup ONLY when (same module) AND (identical text)
        seen = ki_seen_per_module.setdefault(module_id, set())
        if text in seen:
            continue
        seen.add(text)
        ki_bullets.append((module_id, text))

    # Step 6 — Build flat bullet list (canonical order preserved by construction)
    # Step 7 — Fallback when empty
    if ki_bullets:
        _ki_items_html = "".join(
            f'<li class="pdf-insight-bullet">{_html_lib.escape(text)}</li>'
            for _, text in ki_bullets
        )
    else:
        _ki_fallback_text = (
            "Sem insights disponíveis para os módulos selecionados."
            if is_pt else
            "No insights available for the selected modules."
        )
        _ki_items_html = (
            f'<li class="pdf-insight-bullet pdf-insight-fallback">'
            f'{_html_lib.escape(_ki_fallback_text)}'
            f'</li>'
        )

    pdf_insights_html = f'''<section class="pdf-insights">
        <ul class="pdf-insights-list">{_ki_items_html}</ul>
    </section>'''
    
    html = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard Report</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #ffffff;
            color: #1e293b;
            padding: 24px;
            line-height: 1.5;
        }}
        .container {{ max-width: 800px; margin: 0 auto; }}
        .chart-container {{ margin: 12px 0; }}
        .chart-title {{ font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 8px; margin-top: 12px; letter-spacing: 0.3px; }}
        .data-table {{ width: 100%; border-collapse: collapse; margin-bottom: 14px; }}
        .data-table th {{
            text-align: left; font-size: 9px; color: #64748b; padding: 6px 10px;
            border-bottom: 2px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px;
        }}
        .data-table td {{
            font-size: 11px; color: #334155; padding: 6px 10px;
            border-bottom: 1px solid #f1f5f9;
        }}
        .data-table td.danger {{ color: #dc2626; font-weight: 600; }}
        .footer {{
            text-align: center; color: #94a3b8; font-size: 9px; margin-top: 24px;
            padding-top: 10px; border-top: 1px solid #e2e8f0;
        }}
        @media print {{
            body {{ background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
            .pdf-section {{ break-inside: avoid; }}
            .module {{ break-inside: avoid; }}
        }}

        /* ───── PDF HEADER (Layer 1.1) ───── */
        .pdf-header {{
            background: #ffffff;
            border: none;
            border-bottom: 1px solid #d1d5db;
            padding: 0 0 18px 0;
            margin-bottom: 24px;
            text-align: left;
        }}
        /* Brand block (logo + product name + tagline) */
        .pdf-brand {{
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
        }}
        .pdf-brand-logo {{
            height: 28px;
            width: auto;
            display: block;
            background: transparent;
            border: 0;
            box-shadow: none;
        }}
        .pdf-brand-text {{
            display: flex;
            flex-direction: column;
            gap: 2px;
        }}
        .pdf-brand-name {{
            font-size: 15px;
            font-weight: 700;
            color: #111827;
            letter-spacing: 0.2px;
            line-height: 1.1;
        }}
        .pdf-brand-tagline {{
            font-size: 11px;
            color: #6B7280;
            font-weight: 400;
            line-height: 1.3;
        }}
        .pdf-header-title {{
            font-size: 22px;
            font-weight: 700;
            color: #111827;
            letter-spacing: 0.2px;
            margin: 0 0 14px 0;
            line-height: 1.25;
        }}
        .pdf-header-meta {{
            display: block;
        }}
        .pdf-header-meta-row {{
            font-size: 11px;
            color: #374151;
            line-height: 1.7;
        }}
        .pdf-header-meta-label {{
            font-weight: 600;
            color: #4b5563;
            margin-right: 4px;
        }}
        .pdf-header-meta-value {{
            font-weight: 400;
            color: #111827;
        }}

        /* ───── EXECUTIVE SUMMARY (Layer 1.2) ───── */
        .pdf-exec-summary {{
            display: flex;
            gap: 24px;
            padding: 0 0 18px 0;
            margin-bottom: 24px;
            border-bottom: 1px solid #d1d5db;
            background: #ffffff;
        }}
        .pdf-exec-item {{
            flex: 1 1 0;
            text-align: left;
            min-width: 0;
        }}
        .pdf-exec-label {{
            font-size: 10px;
            font-weight: 600;
            color: #6b7280;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            margin-bottom: 6px;
        }}
        .pdf-exec-value {{
            font-size: 26px;
            font-weight: 700;
            color: #111827;
            line-height: 1.2;
            font-variant-numeric: tabular-nums;
        }}

        /* ───── KEY INSIGHTS (Layer 2) ───── */
        .pdf-insights {{
            padding: 0 0 18px 0;
            margin-bottom: 24px;
            border-bottom: 1px solid #d1d5db;
            background: #ffffff;
        }}
        .pdf-insights-list {{
            margin: 0;
            padding-left: 18px;
            list-style: disc outside;
            color: #374151;
        }}
        .pdf-insight-bullet {{
            font-size: 12px;
            line-height: 1.65;
            color: #374151;
            margin-bottom: 6px;
        }}
        .pdf-insight-bullet:last-child {{
            margin-bottom: 0;
        }}
        .pdf-insight-fallback {{
            color: #6b7280;
            font-style: italic;
        }}

        /* ═══════════════════════════════════════════════════════════════
           VISUAL POLISH — Design System Final Overrides (LAST IN CASCADE)
           Tokens:
             bg: #FFFFFF | text: #111827 | secondary: #6B7280
             divider: #E5E7EB | accent: #1F2937 | risk: #DC2626
           Spacing scale: 8 / 16 / 24 / 32
           No border-radius, no shadows, no colored cards, no gradients.
           ═══════════════════════════════════════════════════════════════ */

        body {{
            color: #111827;
            background: #FFFFFF;
            padding: 32px 24px;
            line-height: 1.6;
        }}
        .container {{ max-width: 820px; }}

        .pdf-header {{
            border-bottom: 1px solid #E5E7EB;
            padding: 0 0 24px 0;
            margin-bottom: 32px;
        }}
        .pdf-header-title {{ color: #111827; font-weight: 700; }}
        .pdf-header-meta-row {{ color: #374151; }}
        .pdf-header-meta-label {{ color: #6B7280; }}
        .pdf-header-meta-value {{ color: #111827; }}

        .pdf-exec-summary {{
            border-bottom: 1px solid #E5E7EB;
            padding: 0 0 24px 0;
            margin-bottom: 32px;
            gap: 32px;
        }}
        .pdf-exec-label {{ color: #6B7280; font-size: 11px; letter-spacing: 1.2px; }}
        .pdf-exec-value {{ color: #111827; font-size: 26px; font-weight: 700; }}

        .pdf-insights {{
            border-bottom: 1px solid #E5E7EB;
            padding: 0 0 24px 0;
            margin-bottom: 32px;
        }}
        .pdf-insights-list {{ padding-left: 20px; }}
        .pdf-insight-bullet {{
            color: #374151;
            font-size: 13px;
            line-height: 1.7;
            margin-bottom: 8px;
        }}
        .pdf-insight-bullet:last-child {{ margin-bottom: 0; }}
        .pdf-insight-fallback {{ color: #6B7280; font-style: italic; }}

        /* ═══════════ LAYER 3 — DETAILED METRICS (P6 FULL REBUILD) ═══════════
           Strict report layout. Deterministic. No dashboard semantics.
           1024px page container · 2-col grid · fixed module structure.
           ═══════════════════════════════════════════════════════════════════ */
        .page-container {{
            width: 1024px;
            max-width: 1024px;
            margin: 0 auto;
            padding: 0 24px;
            box-sizing: border-box;
        }}
        .pdf-section {{
            margin-bottom: 32px;
        }}
        .pdf-section-title {{
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 16px 0;
            letter-spacing: 0.2px;
        }}
        .pdf-grid-2col {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            align-items: stretch;
        }}
        .pdf-module {{
            border: 1px solid #E5E7EB;
            padding: 16px;
            background: #FFFFFF;
            page-break-inside: avoid;
            break-inside: avoid;
            border-radius: 0;
            box-shadow: none;
            display: flex;
            flex-direction: column;
            min-width: 0;
            box-sizing: border-box;
        }}
        .pdf-module-title {{
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 1px;
            color: #1F2937;
            margin: 0 0 12px 0;
            text-transform: uppercase;
        }}
        .pdf-module-metrics {{
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
            flex-wrap: nowrap;
        }}
        .pdf-metric {{
            flex: 1 1 0;
            min-width: 0;
        }}
        .pdf-metric-empty {{
            font-size: 12px;
            color: #6B7280;
            font-style: italic;
            text-align: left;
        }}
        .pdf-metric-label {{
            font-size: 10px;
            color: #6B7280;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            font-weight: 600;
            margin-bottom: 4px;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        .pdf-metric-value {{
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            font-variant-numeric: tabular-nums;
            line-height: 1.15;
            white-space: nowrap;
        }}
        .pdf-chart-container {{
            width: 100%;
            height: 160px;
            overflow: hidden;
            box-sizing: border-box;
            position: relative;
        }}
        .pdf-chart-container > svg {{
            width: 100%;
            height: 100%;
            display: block;
        }}
        .pdf-chart-container .chart-container {{
            margin: 0;
            width: 100%;
            height: 100%;
        }}
        .pdf-chart-container .chart-container svg {{
            width: 100%;
            height: 100%;
            display: block;
        }}
        .pdf-chart-container .chart-title {{
            display: none;
        }}
        .pdf-module-footer {{
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #F3F4F6;
        }}
        .pdf-module-footer-note {{
            font-size: 10px;
            color: #6B7280;
            font-weight: 500;
            letter-spacing: 0.4px;
        }}
        /* Risk module table — fits inside 160px chart-container */
        .pdf-risk-table {{
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }}
        .pdf-risk-table th {{
            font-size: 9px;
            color: #6B7280;
            font-weight: 600;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            text-align: left;
            padding: 4px 6px;
            border-bottom: 1px solid #E5E7EB;
        }}
        .pdf-risk-table td {{
            font-size: 11px;
            color: #111827;
            padding: 4px 6px;
            border-bottom: 1px solid #F3F4F6;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        .pdf-risk-table td.danger {{
            color: #DC2626;
            font-weight: 700;
        }}
        @media print {{
            .pdf-section {{ break-inside: avoid; }}
            .pdf-module {{ break-inside: avoid; page-break-inside: avoid; }}
        }}

        /* Footer */
        .footer {{
            color: #6B7280;
            font-size: 10px;
            border-top: 1px solid #E5E7EB;
            margin-top: 32px;
            padding-top: 16px;
            text-align: left;
        }}
    </style>
</head>
<body>
<div class="container">
    {pdf_header_html}
    {pdf_exec_summary_html}
    {pdf_insights_html}
</div>
{sections_html}
<div class="container">
    <div class="footer">Load Manager Pro &mdash; {now}</div>
</div>
</body>
</html>"""
    
    return HTMLResponse(content=html)

