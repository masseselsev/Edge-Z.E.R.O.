from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api import deps
from app.core import security
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from pydantic import BaseModel

router = APIRouter()

class Token(BaseModel):
    access_token: str
    token_type: str
    username: str
    role: str

class LoginPayload(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: Any
    username: str
    role: str
    telegram_id: Any

@router.post("/login", response_model=Token)
async def login(
    payload: LoginPayload,
    response: Response,
    db: AsyncSession = Depends(get_db)
) -> Any:
    result = await db.execute(select(User).where(User.username == payload.username))
    user = result.scalars().first()
    
    if not user or not security.verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = security.create_access_token(
        user.username, expires_delta=access_token_expires
    )
    
    # Set secure session cookie
    response.set_cookie(
        key="admin_session",
        value=token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=False, # Set to True in production with SSL/TLS
    )
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="admin_session", httponly=True, samesite="lax")
    return {"status": "success"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(deps.get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "telegram_id": current_user.telegram_id
    }
