from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency for local/dev
    load_dotenv = None


BASE_DIR = Path(__file__).resolve().parent
if load_dotenv:
    load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_csv(name: str, default: list[str] | None = None) -> list[str]:
    raw = os.getenv(name, "")
    if not raw.strip():
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


DB_PATH = Path(os.getenv("VBT_DB_PATH", str(BASE_DIR / "vbt.db"))).resolve()

SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "change-me-in-.env")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
SUPABASE_GALLERY_BUCKET = os.getenv("SUPABASE_GALLERY_BUCKET", "gallery").strip() or "gallery"
SUPABASE_SHOWCASE_BUCKET = os.getenv("SUPABASE_SHOWCASE_BUCKET", "showcase").strip() or "showcase"

BOOTSTRAP_ADMIN_ENABLED = env_bool("VBT_BOOTSTRAP_ADMIN_ENABLED", True)
BOOTSTRAP_ADMIN_USERNAME = os.getenv("VBT_BOOTSTRAP_ADMIN_USERNAME", "admin")
BOOTSTRAP_ADMIN_PASSWORD = os.getenv("VBT_BOOTSTRAP_ADMIN_PASSWORD", "change-me")

SCRAPER_USERNAME = os.getenv("SCRAPER_USERNAME", "")
SCRAPER_PASSWORD = os.getenv("SCRAPER_PASSWORD", "")
