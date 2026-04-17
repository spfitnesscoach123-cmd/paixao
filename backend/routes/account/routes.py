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


router = APIRouter(tags=["Account"])

# ============= ACCOUNT DELETION =============

class AccountDeletionRequest(BaseModel):
    """Request body for account deletion - receives subscription info from client"""
    has_active_subscription: bool = False
    expiration_date: Optional[str] = None  # ISO format date string

class AccountDeletionResponse(BaseModel):
    status: str
    message: str
    deletion_scheduled_for: Optional[str] = None

@router.post("/account/request-deletion", response_model=AccountDeletionResponse)
async def request_account_deletion(
    request: AccountDeletionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Request account deletion.
    If user has active subscription/trial, account is marked PENDING.
    If no active subscription, account is deleted immediately.
    """
    user_id = current_user["_id"]
    
    # Check if already pending or deleted
    current_status = current_user.get("account_deletion_status", "ACTIVE")
    if current_status == AccountDeletionStatus.PENDING.value:
        deletion_scheduled = current_user.get("deletion_scheduled_for")
        return AccountDeletionResponse(
            status="PENDING",
            message="Sua conta já está agendada para exclusão.",
            deletion_scheduled_for=deletion_scheduled.isoformat() if deletion_scheduled else None
        )
    
    if current_status == AccountDeletionStatus.DELETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta conta já foi excluída."
        )
    
    now = datetime.utcnow()
    
    # STEP 1: Mark as PENDING
    update_data = {
        "account_deletion_status": AccountDeletionStatus.PENDING.value,
        "deletion_requested_at": now
    }
    
    # STEP 2: Check subscription status from client
    if request.has_active_subscription and request.expiration_date:
        # CASE 2: Has active subscription or trial
        try:
            expiration = datetime.fromisoformat(request.expiration_date.replace('Z', '+00:00'))
            # Remove timezone info for comparison
            if expiration.tzinfo is not None:
                expiration = expiration.replace(tzinfo=None)
        except ValueError:
            expiration = now  # If invalid date, delete immediately
        
        if expiration > now:
            # Schedule deletion for expiration date
            update_data["deletion_scheduled_for"] = expiration
            
            await db.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": update_data}
            )
            
            return AccountDeletionResponse(
                status="PENDING",
                message="Sua conta será excluída automaticamente ao final do período de assinatura.",
                deletion_scheduled_for=expiration.isoformat()
            )
    
    # CASE 1: No active subscription - delete immediately
    await execute_permanent_deletion(user_id)
    
    return AccountDeletionResponse(
        status="DELETED",
        message="Sua conta foi excluída permanentemente.",
        deletion_scheduled_for=None
    )


# RevenueCat Secret API Key (from environment)
REVENUECAT_SECRET_KEY = os.environ.get('REVENUECAT_SECRET_KEY', '')


async def delete_revenuecat_subscriber(app_user_id: str):
    """
    Delete subscriber from RevenueCat.
    This function does not interrupt deletion if RevenueCat returns an error.
    """
    if not REVENUECAT_SECRET_KEY:
        logging.warning(f"[RevenueCat] Secret API key not configured, skipping subscriber deletion for: {app_user_id}")
        return
    
    url = f"https://api.revenuecat.com/v1/subscribers/{app_user_id}"
    
    headers = {
        "Authorization": f"Bearer {REVENUECAT_SECRET_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(url, headers=headers, timeout=30.0)
            
            if response.status_code in [200, 204]:
                logging.info(f"[RevenueCat] Subscriber deleted successfully: {app_user_id}")
            elif response.status_code == 404:
                logging.info(f"[RevenueCat] Subscriber not found (already deleted or never existed): {app_user_id}")
            else:
                logging.warning(f"[RevenueCat] Deletion failed: {response.status_code} - {response.text}")
    except Exception as e:
        logging.error(f"[RevenueCat] Deletion exception for {app_user_id}: {str(e)}")
    
    # Always continue with database deletion regardless of RevenueCat response


async def execute_permanent_deletion(user_id: str):
    """
    Execute permanent and irreversible deletion of all user data.
    """
    user_oid = ObjectId(user_id) if isinstance(user_id, str) else user_id
    
    # STEP 1: Delete subscriber from RevenueCat BEFORE removing from database
    await delete_revenuecat_subscriber(user_id)
    
    # STEP 2: Delete all user-related data from database
    # Athletes
    await db.athletes.delete_many({"coach_id": user_id})
    
    # GPS sessions
    await db.gps_sessions.delete_many({"coach_id": user_id})
    
    # Jump assessments
    await db.jump_assessments.delete_many({"coach_id": user_id})
    
    # Body compositions
    await db.body_compositions.delete_many({"coach_id": user_id})
    
    # Wellness data
    await db.wellness.delete_many({"coach_id": user_id})
    
    # Wellness tokens
    await db.wellness_tokens.delete_many({"coach_id": user_id})
    
    # VBT sessions
    await db.vbt_sessions.delete_many({"coach_id": user_id})
    
    # Periodizations
    await db.periodizations.delete_many({"coach_id": user_id})
    
    # Periodization weeks
    await db.periodization_weeks.delete_many({"coach_id": user_id})
    
    # Subscriptions
    await db.subscriptions.delete_many({"user_id": user_id})
    
    # Aliases
    await db.athlete_aliases.delete_many({"coach_id": user_id})
    
    # Identity resolver data
    await db.unresolved_athletes.delete_many({"coach_id": user_id})
    
    # Finally, mark user as DELETED (keeping minimal record for audit)
    await db.users.update_one(
        {"_id": user_oid},
        {"$set": {
            "account_deletion_status": AccountDeletionStatus.DELETED.value,
            "deleted_at": datetime.utcnow(),
            # Clear personal data
            "name": "[DELETED]",
            "hashed_password": "",
            "registered_devices": [],
            "pro_access_override": False
        }}
    )


@router.get("/account/deletion-status")
async def get_deletion_status(current_user: dict = Depends(get_current_user)):
    """Get current account deletion status"""
    deletion_scheduled = current_user.get("deletion_scheduled_for")
    
    return {
        "account_deletion_status": current_user.get("account_deletion_status", "ACTIVE"),
        "deletion_requested_at": current_user.get("deletion_requested_at").isoformat() if current_user.get("deletion_requested_at") else None,
        "deletion_scheduled_for": deletion_scheduled.isoformat() if deletion_scheduled else None,
        "deleted_at": current_user.get("deleted_at").isoformat() if current_user.get("deleted_at") else None
    }


@router.post("/account/process-pending-deletions")
async def process_pending_deletions():
    """
    Process pending account deletions where deletion_scheduled_for <= now.
    This endpoint should be called by a cron job.
    """
    now = datetime.utcnow()
    
    # Find users with PENDING status and scheduled deletion in the past
    pending_users = await db.users.find({
        "account_deletion_status": AccountDeletionStatus.PENDING.value,
        "deletion_scheduled_for": {"$lte": now}
    }).to_list(100)
    
    deleted_count = 0
    
    for user in pending_users:
        user_id = str(user["_id"])
        try:
            await execute_permanent_deletion(user_id)
            deleted_count += 1
            logging.info(f"Permanently deleted user: {user_id}")
        except Exception as e:
            logging.error(f"Error deleting user {user_id}: {e}")
    
    return {
        "processed": len(pending_users),
        "deleted": deleted_count
    }

