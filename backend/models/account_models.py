from pydantic import BaseModel
from typing import Optional


class AccountDeletionRequest(BaseModel):
    has_active_subscription: bool = False
    expiration_date: Optional[str] = None


class AccountDeletionResponse(BaseModel):
    status: str
    message: str
    deletion_scheduled_for: Optional[str] = None
