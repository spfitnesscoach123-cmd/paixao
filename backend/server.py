"""
Load Manager Pro - FastAPI Backend
Modularized architecture: server.py is the orchestrator only.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging

from config import db, load_engine, client, REVENUECAT_SECRET_KEY
from models.auth_models import AccountDeletionStatus

# Import all route modules
from routes.auth.routes import router as auth_router
from routes.athletes.routes import router as athletes_router
from routes.gps.routes import router as gps_router
from routes.periodization.routes import router as periodization_router
from routes.wellness.routes import router as wellness_router
from routes.body_composition.routes import router as body_composition_router
from routes.load.routes import router as load_router
from routes.jumps.routes import router as jumps_router
from routes.jumps.camera_routes import router as jump_camera_router
from routes.strength.routes import router as strength_router
from routes.scientific.routes import router as scientific_router
from routes.dashboard.routes import router as dashboard_router
from routes.csv_import.routes import router as csv_import_router
from routes.vbt.routes import router as vbt_router
from routes.subscriptions.routes import router as subscriptions_router
from routes.account.routes import router as account_router

# Create FastAPI app
app = FastAPI(title="Load Manager Pro API")

# Include all routers with /api prefix
app.include_router(auth_router, prefix="/api")
app.include_router(athletes_router, prefix="/api")
app.include_router(gps_router, prefix="/api")
app.include_router(periodization_router, prefix="/api")
app.include_router(wellness_router, prefix="/api")
app.include_router(body_composition_router, prefix="/api")
app.include_router(load_router, prefix="/api")
app.include_router(jumps_router, prefix="/api")
app.include_router(jump_camera_router, prefix="/api")
app.include_router(strength_router, prefix="/api")
app.include_router(scientific_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(csv_import_router, prefix="/api")
app.include_router(vbt_router, prefix="/api")
app.include_router(subscriptions_router, prefix="/api")
app.include_router(account_router, prefix="/api")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============= BACKGROUND TASKS =============

async def process_pending_deletions_job():
    """Background job to process pending account deletions. Runs every 1 hour."""
    while True:
        try:
            await asyncio.sleep(3600)
            from datetime import datetime
            now = datetime.utcnow()
            logging.info(f"[DeletionScheduler] Running pending deletions check at {now.isoformat()}")
            
            pending_users = await db.users.find({
                "account_deletion_status": AccountDeletionStatus.PENDING.value,
                "deletion_scheduled_for": {"$lte": now}
            }).to_list(100)
            
            deleted_count = 0
            for user in pending_users:
                user_id = str(user["_id"])
                try:
                    from routes.account.routes import execute_permanent_deletion
                    await execute_permanent_deletion(user_id)
                    deleted_count += 1
                    logging.info(f"[DeletionScheduler] Permanently deleted user: {user_id}")
                except Exception as e:
                    logging.error(f"[DeletionScheduler] Error deleting user {user_id}: {e}")
            
            logging.info(f"[DeletionScheduler] Processed {len(pending_users)} pending, deleted {deleted_count}")
        except asyncio.CancelledError:
            logging.info("[DeletionScheduler] Scheduler stopped")
            break
        except Exception as e:
            logging.error(f"[DeletionScheduler] Job error: {e}")
            await asyncio.sleep(60)


@app.on_event("startup")
async def startup_event():
    """Start background tasks on application startup"""
    if not REVENUECAT_SECRET_KEY:
        logging.error("[STARTUP] REVENUECAT_SECRET_KEY not configured")
    else:
        logging.info("[STARTUP] REVENUECAT_SECRET_KEY configured successfully")
    
    asyncio.create_task(process_pending_deletions_job())
    logging.info("[DeletionScheduler] Started automatic pending deletions scheduler (runs every 1 hour)")
    
    async def _populate_ewma():
        try:
            count = await db.athlete_load_metrics.count_documents({})
            if count == 0:
                logging.info("[LoadEngine] athlete_load_metrics empty - populating EWMA metrics...")
                await load_engine.ensure_indexes()
                await load_engine.populate_all_athletes()
            else:
                logging.info(f"[LoadEngine] athlete_load_metrics already has {count} documents")
        except Exception as e:
            logging.error(f"[LoadEngine] Population failed: {e}")
    asyncio.create_task(_populate_ewma())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
