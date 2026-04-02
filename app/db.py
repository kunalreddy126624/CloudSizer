import sqlite3
from pathlib import Path


DB_PATH = Path(__file__).resolve().parent / "data" / "cloudsizer.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_estimates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                estimate_type TEXT NOT NULL,
                provider TEXT,
                estimated_monthly_cost_usd REAL,
                summary TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS estimate_actuals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                estimate_id INTEGER,
                provider TEXT NOT NULL,
                workload_type TEXT,
                service_code TEXT,
                service_name TEXT,
                region TEXT,
                billing_period_start TEXT NOT NULL,
                billing_period_end TEXT NOT NULL,
                estimated_monthly_cost_usd REAL,
                actual_monthly_cost_usd REAL NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                observed_usage_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (estimate_id) REFERENCES saved_estimates(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS catalog_price_overrides (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                service_code TEXT NOT NULL UNIQUE,
                base_monthly_cost_usd REAL NOT NULL,
                dimensions_json TEXT NOT NULL,
                pricing_source TEXT NOT NULL,
                last_validated_at TEXT NOT NULL,
                detail_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(saved_estimates)").fetchall()
        }
        if "user_id" not in columns:
            connection.execute("ALTER TABLE saved_estimates ADD COLUMN user_id INTEGER")

        actual_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(estimate_actuals)").fetchall()
        }
        if "service_code" not in actual_columns:
            connection.execute("ALTER TABLE estimate_actuals ADD COLUMN service_code TEXT")
        if "service_name" not in actual_columns:
            connection.execute("ALTER TABLE estimate_actuals ADD COLUMN service_name TEXT")
