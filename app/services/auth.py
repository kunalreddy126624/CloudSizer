from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from app.db import get_connection
from app.models import AuthenticatedUser
from app.settings import get_app_settings


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


def ensure_default_user() -> None:
    settings = get_app_settings()
    if not settings.bootstrap_legacy_demo_user:
        return

    with get_connection() as connection:
        row = connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (settings.legacy_demo_email,),
        ).fetchone()
        if row is None:
            cursor = connection.execute(
                """
                INSERT INTO users (email, full_name, password_hash)
                VALUES (?, ?, ?)
                """,
                (
                    settings.legacy_demo_email,
                    settings.legacy_demo_name,
                    hash_password(settings.legacy_demo_password),
                ),
            )
            user_id = cursor.lastrowid
        else:
            user_id = row["id"]

        connection.execute(
            """
            UPDATE saved_estimates
            SET user_id = ?
            WHERE user_id IS NULL
            """,
            (user_id,),
        )


def authenticate_user(email: str, password: str) -> AuthenticatedUser | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, email, full_name, password_hash, created_at
            FROM users
            WHERE lower(email) = lower(?)
            """,
            (email,),
        ).fetchone()

    if row is None or not verify_password(password, row["password_hash"]):
        return None

    return _row_to_user(row)


def create_session(user_id: int, remember_me: bool = True) -> str:
    token = secrets.token_urlsafe(32)
    lifetime = timedelta(days=30 if remember_me else 1)
    expires_at = (datetime.now(UTC) + lifetime).isoformat()

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO auth_sessions (user_id, token, expires_at)
            VALUES (?, ?, ?)
            """,
            (user_id, token, expires_at),
        )

    return token


def get_user_for_token(token: str) -> AuthenticatedUser | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                users.id,
                users.email,
                users.full_name,
                users.created_at,
                auth_sessions.expires_at
            FROM auth_sessions
            JOIN users ON users.id = auth_sessions.user_id
            WHERE auth_sessions.token = ?
            """,
            (token,),
        ).fetchone()

        if row is None:
            return None

        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at <= datetime.now(UTC):
            connection.execute(
                "DELETE FROM auth_sessions WHERE token = ?",
                (token,),
            )
            return None

    return _row_to_user(row)


def revoke_session(token: str) -> None:
    with get_connection() as connection:
        connection.execute(
            "DELETE FROM auth_sessions WHERE token = ?",
            (token,),
        )


def _row_to_user(row) -> AuthenticatedUser:
    return AuthenticatedUser.model_validate(
        {
            "id": row["id"],
            "email": row["email"],
            "full_name": row["full_name"],
            "created_at": row["created_at"],
        }
    )
