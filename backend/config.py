from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
import os
import logging

from load_engine import create_load_engine

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize Rolling Load Engine
load_engine = create_load_engine(db)

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Mapping: dashboard acwr_metric parameter -> load_engine field name
ACWR_METRIC_TO_ENGINE_FIELD = {
    "total_distance": "distance",
    "high_intensity_distance": "high_intensity_distance",
    "high_speed_running": "hsr",
    "sprint_distance": "sprint_distance",
    "number_of_sprints": "number_of_sprints",
    "acc_dec": "acc_dec_load",
}

# ACWR STANDARDIZATION:
# ACWR MUST always come from load_engine (EWMA)
# DO NOT implement rolling average manually

# Mapping: analysis metric keys -> load_engine field names
ANALYSIS_METRIC_TO_ENGINE = {
    "total_distance": "distance",
    "hid": "high_intensity_distance",
    "hid_z3": "high_intensity_distance",
    "high_intensity_distance": "high_intensity_distance",
    "hsr": "hsr",
    "hsr_z4": "hsr",
    "high_speed_running": "hsr",
    "sprint": "sprint_distance",
    "sprint_z5": "sprint_distance",
    "sprint_distance": "sprint_distance",
    "sprints_count": "number_of_sprints",
    "number_of_sprints": "number_of_sprints",
    "acc_dec": "acc_dec_load",
    "acc_dec_total": "acc_dec_load",
    "acc_dec_load": "acc_dec_load",
}

# RevenueCat Configuration
REVENUECAT_WEBHOOK_SECRET = os.environ.get('REVENUECAT_WEBHOOK_SECRET', '')
REVENUECAT_SECRET_KEY = os.environ.get('REVENUECAT_SECRET_KEY', '')

# Max devices per user
MAX_DEVICES_PER_USER = 3

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to import emergentintegrations, fallback if not available (Railway deploy)
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    EMERGENT_AVAILABLE = True
except ImportError:
    EMERGENT_AVAILABLE = False
    LlmChat = None
    UserMessage = None
