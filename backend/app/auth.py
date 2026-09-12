import os
import secrets
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import User, UserSession

# auto_error=False: we raise our own 401 when the header is missing
bearer_scheme = HTTPBearer(auto_error=False)


def _to_bytes(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes; newer bcrypt versions raise an error
    # instead of cutting, so we cut explicitly
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(_to_bytes(password), password_hash.encode("utf-8"))

def is_admin_username(username: str) -> bool:
    """Admin = the user whose name matches the ADMIN_USERNAME environment variable."""
    # If ADMIN_USERNAME is not set, getenv returns None, so nobody is admin
    return username == os.getenv("ADMIN_USERNAME")

def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)  # random, URL-safe, about 43 characters
    db.add(UserSession(token=token, user_id=user.id))
    db.commit()
    return token


def get_user_by_token(db: Session, token: str) -> Optional[User]:
    session = db.get(UserSession, token)  # lookup by primary key
    if session is None:
        return None
    return session.user


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    user = get_user_by_token(db, credentials.credentials)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    return user