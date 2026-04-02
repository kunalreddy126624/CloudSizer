from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from app.rbac.config import RbacSettings
from app.rbac.schemas import PermissionName, Principal, RoleName


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_hex, digest_hex = password_hash.split(":", maxsplit=1)
    except ValueError:
        return False
    computed = hashlib.scrypt(
        password.encode("utf-8"),
        salt=bytes.fromhex(salt_hex),
        n=16384,
        r=8,
        p=1,
    ).hex()
    return hmac.compare_digest(computed, digest_hex)


def create_access_token(
    *,
    settings: RbacSettings,
    user_id: int,
    email: str,
    roles: list[RoleName],
    permissions: list[PermissionName],
) -> tuple[str, int]:
    expires_in = settings.access_token_expiry_minutes * 60
    expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)
    payload = {
        "sub": str(user_id),
        "email": email,
        "roles": [role.value for role in roles],
        "permissions": [permission.value for permission in permissions],
        "iss": settings.issuer,
        "aud": settings.audience,
        "iat": int(datetime.now(UTC).timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(settings: RbacSettings, token: str) -> Principal:
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        audience=settings.audience,
        issuer=settings.issuer,
    )
    return Principal(
        sub=int(payload["sub"]),
        email=payload["email"],
        roles=[RoleName(item) for item in payload.get("roles", [])],
        permissions=[PermissionName(item) for item in payload.get("permissions", [])],
    )
