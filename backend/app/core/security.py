"""
core/security.py
----------------
Handles two things:
  1. Password hashing   — store passwords safely (never plain text!)
  2. JWT tokens         — create & verify login tokens

What is a JWT token?
  When a user logs in with correct credentials, we give them a "token"
  (a long encoded string). They send this token with every future request.
  We verify the token to know WHO is making the request — without
  asking them to log in again each time.

Token flow:
  Login → verify password → create token → send to frontend
  Next request → frontend sends token → we decode it → we know the user
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings


# ── Password Hashing ──────────────────────────────────────────────────────────
# bcrypt is the industry standard for hashing passwords.
# "hashing" = one-way encryption. You can't reverse it.
# We NEVER store plain passwords — only their hashes.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """
    Converts a plain password into a safe hash.
    Example: "mypassword123" → "$2b$12$abc...xyz" (60-char hash)
    Store the hash in your database, NOT the original password.
    """
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Checks if a plain password matches a stored hash.
    Returns True if correct, False if wrong.
    Used during login to check the user's entered password.
    """
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT Token Creation ────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Creates a JWT token that encodes user information.

    Parameters:
        data         = dict with user info, e.g. {"sub": "user@email.com", "role": "admin"}
        expires_delta = how long until the token expires (default from .env)

    Returns:
        A JWT string like "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    """
    to_encode = data.copy()

    # Set expiry time
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    # Add expiry to the token payload
    to_encode.update({"exp": expire})

    # Encode everything into a JWT string using our secret key
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return encoded_jwt


# ── JWT Token Verification ────────────────────────────────────────────────────
def decode_access_token(token: str) -> Optional[dict]:
    """
    Decodes and verifies a JWT token.
    Returns the payload dict if valid, or None if invalid/expired.

    The payload will contain whatever was put in during creation,
    e.g. {"sub": "user@email.com", "role": "admin", "exp": 1234567890}
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError:
        # Token is invalid, tampered, or expired
        return None
