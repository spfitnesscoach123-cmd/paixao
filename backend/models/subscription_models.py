from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from enum import Enum


class SubscriptionPlan(str, Enum):
    FREE_TRIAL = "free_trial"
    PRO = "pro"


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    TRIAL = "trial"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


PLAN_LIMITS = {
    "free_trial": {
        "name": "Trial Gratis",
        "name_en": "Free Trial",
        "price_brl": 0,
        "price_usd": 0,
        "max_athletes": 999,
        "history_months": -1,
        "features": ["all"],
        "trial_days": 7,
        "advanced_analytics": True,
        "ai_insights": True,
        "fatigue_alerts": True,
        "vbt_analysis": True,
        "body_composition": True,
        "body_3d_model": True,
        "multi_user": True,
        "max_users": 5,
        "description_pt": "Experimente todas as funcionalidades por 7 dias gratis",
        "description_en": "Try all features free for 7 days",
    },
    "pro": {
        "name": "Pro",
        "name_en": "Pro",
        "price_brl": 199.00,
        "price_usd": 39.99,
        "max_athletes": -1,
        "history_months": -1,
        "features": ["all"],
        "trial_days": 7,
        "billing_period_days": 30,
        "auto_renew": True,
        "advanced_analytics": True,
        "ai_insights": True,
        "fatigue_alerts": True,
        "vbt_analysis": True,
        "body_composition": True,
        "body_3d_model": True,
        "multi_user": True,
        "max_users": 5,
        "priority_support": True,
        "popular": True,
        "description_pt": "Acesso completo a todas as funcionalidades do Load Manager. Renovacao automatica mensal.",
        "description_en": "Full access to all Load Manager features. Auto-renews monthly.",
        "features_list_pt": [
            "Atletas ilimitados",
            "Historico ilimitado",
            "VBT - Velocity Based Training",
            "Composicao Corporal completa",
            "Modelo 3D do corpo humano",
            "Insights gerados por IA",
            "ACWR detalhado por metrica",
            "Comparacao entre atletas",
            "Alertas de fadiga inteligentes",
            "Exportacao PDF e CSV",
            "Ate 5 usuarios simultaneos",
            "Suporte prioritario",
            "Integracao GPS - Catapult* (Playertek / Statsport) Em breve"
        ],
        "features_list_en": [
            "Unlimited athletes",
            "Unlimited history",
            "VBT - Velocity Based Training",
            "Full Body Composition",
            "3D human body model",
            "AI-generated insights",
            "Detailed ACWR by metric",
            "Athlete comparison",
            "Smart fatigue alerts",
            "PDF and CSV export",
            "Up to 5 simultaneous users",
            "Priority support",
            "GPS Integration - Catapult* (Playertek / Statsport) Coming soon"
        ],
        "limitations_pt": [],
        "limitations_en": []
    },
}


class SubscriptionCreate(BaseModel):
    plan: SubscriptionPlan
    payment_method: Optional[str] = None


class Subscription(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    plan: str
    status: str
    start_date: datetime
    trial_end_date: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class SubscriptionResponse(BaseModel):
    plan: str
    plan_name: str
    status: str
    price: float
    max_athletes: int
    current_athletes: int
    history_months: int
    days_remaining: Optional[int] = None
    trial_end_date: Optional[str] = None
    features: dict
    limits_reached: dict


class RevenueCatEventData(BaseModel):
    event_timestamp_ms: Optional[int] = None
    product_id: Optional[str] = None
    purchased_at_ms: Optional[int] = None
    expiration_at_ms: Optional[int] = None
    environment: Optional[str] = None
    entitlement_ids: Optional[List[str]] = None
    app_user_id: str
    original_app_user_id: Optional[str] = None
    currency: Optional[str] = None
    price: Optional[float] = None
    cancel_reason: Optional[str] = None
    store: Optional[str] = None


class RevenueCatWebhookPayload(BaseModel):
    event: RevenueCatEventData
    api_version: str
    type: str
    id: str
