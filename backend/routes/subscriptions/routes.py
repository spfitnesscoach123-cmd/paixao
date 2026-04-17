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


router = APIRouter(tags=["Subscriptions"])

@router.get("/subscription/plans")
async def get_subscription_plans(lang: str = "pt", region: str = "BR"):
    """Get all available subscription plans with regional pricing"""
    plans = []
    is_brazil = region.upper() == "BR"
    is_portuguese = lang.lower() in ["pt", "pt-br"]
    
    for plan_id, plan_data in PLAN_LIMITS.items():
        if plan_id != "free_trial":  # Don't show trial as a purchasable plan
            price = plan_data.get("price_brl", 0) if is_brazil else plan_data.get("price_usd", 0)
            currency = "BRL" if is_brazil else "USD"
            currency_symbol = "R$" if is_brazil else "$"
            
            plans.append({
                "id": plan_id,
                "name": plan_data["name"] if is_portuguese else plan_data.get("name_en", plan_data["name"]),
                "price": price,
                "price_formatted": f"{currency_symbol} {price:.2f}".replace(".", ",") if is_brazil else f"{currency_symbol}{price:.2f}",
                "currency": currency,
                "max_athletes": plan_data["max_athletes"],
                "history_months": plan_data["history_months"],
                "advanced_analytics": plan_data.get("advanced_analytics", False),
                "ai_insights": plan_data.get("ai_insights", False),
                "fatigue_alerts": plan_data.get("fatigue_alerts", False),
                "multi_user": plan_data.get("multi_user", False),
                "max_users": plan_data.get("max_users", 1),
                "features": plan_data.get("features", []),
                "trial_days": plan_data.get("trial_days", 7),
                "billing_period_days": plan_data.get("billing_period_days", 30),
                "auto_renew": plan_data.get("auto_renew", True),
                "description": plan_data.get("description_pt" if is_portuguese else "description_en", ""),
                "features_list": plan_data.get("features_list_pt" if is_portuguese else "features_list_en", []),
                "limitations": plan_data.get("limitations_pt" if is_portuguese else "limitations_en", []),
                "popular": plan_data.get("popular", False),
            })
    return plans

@router.get("/subscription/current", response_model=SubscriptionResponse)
async def get_current_subscription(
    lang: str = "pt", 
    region: str = "BR",
    current_user: dict = Depends(get_current_user)
):
    """Get current user's subscription status"""
    user_id = current_user["_id"]
    is_brazil = region.upper() == "BR"
    
    # Get subscription from database
    subscription = await db.subscriptions.find_one({
        "user_id": user_id,
        "status": {"$in": ["active", "trial"]}
    })
    
    # Count current athletes
    athlete_count = await db.athletes.count_documents({"coach_id": user_id})
    
    if not subscription:
        # Create default trial subscription
        trial_end = datetime.utcnow() + timedelta(days=7)
        new_subscription = {
            "user_id": user_id,
            "plan": "free_trial",
            "status": "trial",
            "start_date": datetime.utcnow(),
            "trial_end_date": trial_end,
            "current_period_end": trial_end,
            "created_at": datetime.utcnow(),
        }
        await db.subscriptions.insert_one(new_subscription)
        subscription = new_subscription
    
    plan = subscription.get("plan", "free_trial")
    plan_limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free_trial"])
    status = subscription.get("status", "trial")
    
    # Get price based on region
    price = plan_limits.get("price_brl", 0) if is_brazil else plan_limits.get("price_usd", 0)
    
    # Calculate days remaining
    days_remaining = None
    trial_end_str = None
    if subscription.get("trial_end_date"):
        trial_end = subscription["trial_end_date"]
        if isinstance(trial_end, str):
            trial_end = datetime.fromisoformat(trial_end)
        days_remaining = max(0, (trial_end - datetime.utcnow()).days)
        trial_end_str = trial_end.strftime("%Y-%m-%d")
        
        # Check if trial expired
        if days_remaining == 0 and status == "trial":
            await db.subscriptions.update_one(
                {"_id": subscription.get("_id")},
                {"$set": {"status": "expired"}}
            )
            status = "expired"
    
    # Calculate limits reached
    max_athletes = plan_limits.get("max_athletes", 25)
    limits_reached = {
        "athletes": athlete_count >= max_athletes if max_athletes > 0 else False,
        "advanced_analytics": not plan_limits.get("advanced_analytics", False),
        "ai_insights": not plan_limits.get("ai_insights", False),
    }
    
    return SubscriptionResponse(
        plan=plan,
        plan_name=plan_limits.get("name", "Trial"),
        status=status,
        price=price,
        max_athletes=max_athletes,
        current_athletes=athlete_count,
        history_months=plan_limits.get("history_months", 3),
        days_remaining=days_remaining,
        trial_end_date=trial_end_str,
        features={
            "advanced_analytics": plan_limits.get("advanced_analytics", False),
            "ai_insights": plan_limits.get("ai_insights", False),
            "fatigue_alerts": plan_limits.get("fatigue_alerts", False),
            "multi_user": plan_limits.get("multi_user", False),
            "priority_support": plan_limits.get("priority_support", False),
        },
        limits_reached=limits_reached
    )

@router.post("/subscription/subscribe")
async def subscribe_to_plan(
    subscription_data: SubscriptionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Subscribe to a plan (simulated - no real payment)"""
    user_id = current_user["_id"]
    plan = subscription_data.plan.value
    
    if plan not in PLAN_LIMITS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    plan_limits = PLAN_LIMITS[plan]
    
    # Cancel any existing subscription
    await db.subscriptions.update_many(
        {"user_id": user_id, "status": {"$in": ["active", "trial"]}},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.utcnow()}}
    )
    
    # Create new subscription
    trial_end = datetime.utcnow() + timedelta(days=plan_limits.get("trial_days", 7))
    period_end = datetime.utcnow() + timedelta(days=30)  # Monthly billing
    
    new_subscription = {
        "user_id": user_id,
        "plan": plan,
        "status": "trial",  # Start with trial
        "start_date": datetime.utcnow(),
        "trial_end_date": trial_end,
        "current_period_end": period_end,
        "created_at": datetime.utcnow(),
    }
    
    result = await db.subscriptions.insert_one(new_subscription)
    
    return {
        "message": "Subscription created successfully",
        "subscription_id": str(result.inserted_id),
        "plan": plan,
        "trial_end_date": trial_end.strftime("%Y-%m-%d"),
        "status": "trial"
    }

@router.post("/subscription/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    """Cancel current subscription"""
    user_id = current_user["_id"]
    
    result = await db.subscriptions.update_one(
        {"user_id": user_id, "status": {"$in": ["active", "trial"]}},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No active subscription found")
    
    return {"message": "Subscription cancelled successfully"}

@router.post("/subscription/restore")
async def restore_subscription(current_user: dict = Depends(get_current_user)):
    """Restore a previously cancelled subscription (simulates App Store/Google Play restore)"""
    user_id = current_user["_id"]
    
    # Find any cancelled subscription for this user
    cancelled_sub = await db.subscriptions.find_one({
        "user_id": user_id,
        "status": "cancelled"
    }, sort=[("cancelled_at", -1)])  # Get most recently cancelled
    
    if not cancelled_sub:
        raise HTTPException(status_code=404, detail="No previous subscription found to restore")
    
    # Reactivate the subscription
    # In a real app, this would verify with App Store/Google Play
    new_period_end = datetime.utcnow() + timedelta(days=30)
    
    result = await db.subscriptions.update_one(
        {"_id": cancelled_sub["_id"]},
        {
            "$set": {
                "status": "active",
                "cancelled_at": None,
                "current_period_end": new_period_end,
                "restored_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Failed to restore subscription")
    
    return {"message": "Subscription restored successfully", "plan": cancelled_sub.get("plan", "pro")}

@router.get("/subscription/check-feature/{feature}")
async def check_feature_access(
    feature: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if user has access to a specific feature"""
    user_id = current_user["_id"]
    
    subscription = await db.subscriptions.find_one({
        "user_id": user_id,
        "status": {"$in": ["active", "trial"]}
    })
    
    if not subscription:
        return {"has_access": False, "reason": "no_subscription"}
    
    plan = subscription.get("plan", "free_trial")
    plan_limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free_trial"])
    
    # Check trial expiration
    if subscription.get("status") == "trial":
        trial_end = subscription.get("trial_end_date")
        if trial_end:
            if isinstance(trial_end, str):
                trial_end = datetime.fromisoformat(trial_end)
            if datetime.utcnow() > trial_end:
                return {"has_access": False, "reason": "trial_expired"}
    
    # Check feature access
    feature_map = {
        "advanced_analytics": plan_limits.get("advanced_analytics", False),
        "ai_insights": plan_limits.get("ai_insights", False),
        "fatigue_alerts": plan_limits.get("fatigue_alerts", False),
        "athlete_comparison": "athlete_comparison" in plan_limits.get("features", []) or "all" in plan_limits.get("features", []),
    }
    
    has_access = feature_map.get(feature, False)
    
    return {
        "has_access": has_access,
        "feature": feature,
        "plan": plan,
        "upgrade_required": not has_access
    }

# ============= UNIVERSAL LINKS / DEEP LINKS CONFIGURATION =============
# These routes serve the verification files needed for iOS Universal Links and Android App Links
# Note: In production, these files should be served from the root domain (.well-known/)
# For now, we provide them via /api/well-known for testing purposes

@router.get("/well-known/apple-app-site-association")
async def apple_app_site_association():
    """Serve Apple App Site Association file for iOS Universal Links"""
    return JSONResponse(
        content={
            "applinks": {
                "apps": [],
                "details": [
                    {
                        "appID": "TEAM_ID.com.loadmanager.app",
                        "paths": [
                            "/wellness-form/*",
                            "/wellness/*"
                        ]
                    }
                ]
            },
            "webcredentials": {
                "apps": [
                    "TEAM_ID.com.loadmanager.app"
                ]
            }
        },
        headers={
            "Content-Type": "application/json"
        }
    )

@router.get("/well-known/assetlinks.json")
async def android_asset_links():
    """Serve Asset Links file for Android App Links"""
    return JSONResponse(
        content=[
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": "com.loadmanager.app",
                    "sha256_cert_fingerprints": [
                        "SHA256_FINGERPRINT_PLACEHOLDER"
                    ]
                }
            }
        ],
        headers={
            "Content-Type": "application/json"
        }
    )

# ============= REVENUECAT WEBHOOK INTEGRATION =============
# These endpoints handle webhook events from RevenueCat for subscription management

REVENUECAT_WEBHOOK_SECRET = os.environ.get('REVENUECAT_WEBHOOK_SECRET', '')

class RevenueCatEventData(BaseModel):
    """RevenueCat webhook event data"""
    event_timestamp_ms: Optional[int] = None
    product_id: Optional[str] = None
    purchased_at_ms: Optional[int] = None
    expiration_at_ms: Optional[int] = None
    environment: Optional[str] = None  # SANDBOX or PRODUCTION
    entitlement_ids: Optional[List[str]] = None
    app_user_id: str
    original_app_user_id: Optional[str] = None
    currency: Optional[str] = None
    price: Optional[float] = None
    cancel_reason: Optional[str] = None
    store: Optional[str] = None  # APP_STORE, PLAY_STORE

class RevenueCatWebhookPayload(BaseModel):
    """RevenueCat webhook payload"""
    event: RevenueCatEventData
    api_version: str
    type: str  # Event type: INITIAL_PURCHASE, RENEWAL, CANCELLATION, etc.
    id: str  # Unique event ID

async def verify_revenuecat_webhook(authorization: Optional[str]) -> bool:
    """Verify webhook authenticity using authorization header"""
    if not REVENUECAT_WEBHOOK_SECRET:
        logging.warning("RevenueCat webhook secret not configured")
        return True  # Allow in development if not configured
    
    if not authorization:
        return False
    
    expected = f"Bearer {REVENUECAT_WEBHOOK_SECRET}"
    return authorization == expected

@router.post("/webhooks/revenuecat")
async def handle_revenuecat_webhook(
    payload: RevenueCatWebhookPayload,
    authorization: Optional[str] = Header(None)
):
    """
    Handle RevenueCat webhooks for subscription events.
    
    Event types handled:
    - INITIAL_PURCHASE: First-time subscription
    - RENEWAL: Subscription renewed
    - CANCELLATION: User cancelled
    - EXPIRATION: Subscription expired
    - BILLING_ISSUE: Payment failed
    - UNCANCELLATION: User resubscribed
    - PRODUCT_CHANGE: User changed plan
    """
    # Verify webhook authenticity
    if REVENUECAT_WEBHOOK_SECRET and not await verify_revenuecat_webhook(authorization):
        logging.warning(f"RevenueCat webhook: Invalid authorization")
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    event = payload.event
    event_type = payload.type
    event_id = payload.id
    
    logging.info(f"RevenueCat webhook received: type={event_type}, user={event.app_user_id}, id={event_id}")
    
    # Check for duplicate events (idempotency)
    existing_event = await db.webhook_events.find_one({"event_id": event_id})
    if existing_event:
        logging.info(f"RevenueCat webhook: Duplicate event {event_id}, skipping")
        return {"status": "duplicate", "message": "Event already processed"}
    
    # Log the event for audit trail
    await db.webhook_events.insert_one({
        "event_id": event_id,
        "event_type": event_type,
        "app_user_id": event.app_user_id,
        "product_id": event.product_id,
        "raw_payload": payload.model_dump(),
        "processed": False,
        "received_at": datetime.utcnow()
    })
    
    try:
        # Find user by app_user_id (this should match your user's _id)
        user = await db.users.find_one({"_id": ObjectId(event.app_user_id)})
        if not user:
            # Try to find by email or other identifier
            logging.warning(f"RevenueCat webhook: User not found for app_user_id={event.app_user_id}")
            # Still process the event, user might register later
        
        user_id = event.app_user_id
        
        # Process based on event type
        if event_type == "INITIAL_PURCHASE":
            await handle_initial_purchase(user_id, event)
        elif event_type == "RENEWAL":
            await handle_renewal(user_id, event)
        elif event_type == "CANCELLATION":
            await handle_cancellation(user_id, event)
        elif event_type == "EXPIRATION":
            await handle_expiration(user_id, event)
        elif event_type == "BILLING_ISSUE":
            await handle_billing_issue(user_id, event)
        elif event_type == "UNCANCELLATION":
            await handle_uncancellation(user_id, event)
        elif event_type == "PRODUCT_CHANGE":
            await handle_product_change(user_id, event)
        elif event_type == "SUBSCRIBER_ALIAS":
            # User IDs were merged in RevenueCat
            logging.info(f"RevenueCat webhook: Subscriber alias event for {user_id}")
        else:
            logging.info(f"RevenueCat webhook: Unhandled event type {event_type}")
        
        # Mark event as processed
        await db.webhook_events.update_one(
            {"event_id": event_id},
            {"$set": {"processed": True, "processed_at": datetime.utcnow()}}
        )
        
        return {"status": "success", "message": f"Event {event_type} processed"}
        
    except Exception as e:
        logging.error(f"RevenueCat webhook error: {str(e)}")
        await db.webhook_events.update_one(
            {"event_id": event_id},
            {"$set": {"processed": False, "error": str(e)}}
        )
        raise HTTPException(status_code=500, detail="Internal server error")

async def handle_initial_purchase(user_id: str, event: RevenueCatEventData):
    """Handle initial purchase event from RevenueCat"""
    expires_at = None
    if event.expiration_at_ms:
        expires_at = datetime.fromtimestamp(event.expiration_at_ms / 1000)
    
    purchased_at = datetime.utcnow()
    if event.purchased_at_ms:
        purchased_at = datetime.fromtimestamp(event.purchased_at_ms / 1000)
    
    subscription_data = {
        "user_id": user_id,
        "plan": "pro",
        "status": "active",
        "source": "revenuecat",
        "store": event.store,
        "product_id": event.product_id,
        "entitlement_ids": event.entitlement_ids,
        "environment": event.environment,
        "currency": event.currency,
        "price": event.price,
        "start_date": purchased_at,
        "current_period_end": expires_at,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    # Upsert subscription
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {"$set": subscription_data},
        upsert=True
    )
    
    logging.info(f"RevenueCat: Initial purchase recorded for user {user_id}")

async def handle_renewal(user_id: str, event: RevenueCatEventData):
    """Handle subscription renewal event"""
    expires_at = None
    if event.expiration_at_ms:
        expires_at = datetime.fromtimestamp(event.expiration_at_ms / 1000)
    
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "status": "active",
                "current_period_end": expires_at,
                "cancel_reason": None,
                "updated_at": datetime.utcnow()
            },
            "$inc": {"renewal_count": 1}
        }
    )
    
    logging.info(f"RevenueCat: Subscription renewed for user {user_id}")

async def handle_cancellation(user_id: str, event: RevenueCatEventData):
    """Handle cancellation event"""
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "status": "cancelled",
                "cancel_reason": event.cancel_reason,
                "cancelled_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.info(f"RevenueCat: Subscription cancelled for user {user_id}, reason: {event.cancel_reason}")

async def handle_expiration(user_id: str, event: RevenueCatEventData):
    """Handle subscription expiration event"""
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "status": "expired",
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.info(f"RevenueCat: Subscription expired for user {user_id}")

async def handle_billing_issue(user_id: str, event: RevenueCatEventData):
    """Handle billing issue event"""
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "billing_issue": True,
                "billing_issue_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.warning(f"RevenueCat: Billing issue for user {user_id}")

async def handle_uncancellation(user_id: str, event: RevenueCatEventData):
    """Handle uncancellation (user resubscribed)"""
    expires_at = None
    if event.expiration_at_ms:
        expires_at = datetime.fromtimestamp(event.expiration_at_ms / 1000)
    
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "status": "active",
                "current_period_end": expires_at,
                "cancel_reason": None,
                "cancelled_at": None,
                "billing_issue": False,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.info(f"RevenueCat: Subscription reactivated for user {user_id}")

async def handle_product_change(user_id: str, event: RevenueCatEventData):
    """Handle product change event (user changed plan)"""
    expires_at = None
    if event.expiration_at_ms:
        expires_at = datetime.fromtimestamp(event.expiration_at_ms / 1000)
    
    await db.subscriptions.update_one(
        {"user_id": user_id, "source": "revenuecat"},
        {
            "$set": {
                "product_id": event.product_id,
                "current_period_end": expires_at,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    logging.info(f"RevenueCat: Product changed for user {user_id} to {event.product_id}")

@router.get("/subscription/revenuecat-status/{app_user_id}")
async def get_revenuecat_subscription_status(
    app_user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get subscription status from local database (synced via RevenueCat webhooks).
    This is used to verify subscription status on the backend.
    """
    # Security: Only allow users to check their own subscription
    if current_user["_id"] != app_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this subscription")
    
    subscription = await db.subscriptions.find_one({
        "user_id": app_user_id,
        "source": "revenuecat"
    })
    
    if not subscription:
        return {
            "is_active": False,
            "status": "NO_SUBSCRIPTION",
            "message": "No RevenueCat subscription found"
        }
    
    # Check if expired
    is_expired = False
    if subscription.get("current_period_end"):
        is_expired = subscription["current_period_end"] < datetime.utcnow()
    
    return {
        "is_active": subscription.get("status") == "active" and not is_expired,
        "status": subscription.get("status", "unknown"),
        "product_id": subscription.get("product_id"),
        "store": subscription.get("store"),
        "expires_at": subscription.get("current_period_end").isoformat() if subscription.get("current_period_end") else None,
        "environment": subscription.get("environment"),
        "has_billing_issue": subscription.get("billing_issue", False)
    }

