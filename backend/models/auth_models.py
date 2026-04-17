from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from enum import Enum


class AccountDeletionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    DELETED = "DELETED"


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    platform: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    platform: Optional[str] = None


class RegisteredDevice(BaseModel):
    device_id: str
    device_name: str
    platform: str
    last_login: datetime


class User(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email: EmailStr
    name: str
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str = "coach"
    pro_access_override: bool = False
    account_deletion_status: str = "ACTIVE"
    deletion_scheduled_for: Optional[str] = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UpdateProfileRequest(BaseModel):
    name: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str
