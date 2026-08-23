import calendar
import hashlib
import json
import math
import os
import subprocess
import sys
import threading
import time
from datetime import date, datetime
from io import BytesIO
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import httpx
from flask import Flask, jsonify, render_template, request
from supabase import Client, create_client
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from menu_import import load_rows_from_bytes, serialize_payload as serialize_imported_menu_payload
import settings

app = Flask(__name__)
app.secret_key = settings.SECRET_KEY

DB_PATH = str(settings.DB_PATH)
GALLERY_BUCKET = settings.SUPABASE_GALLERY_BUCKET
SHOWCASE_BUCKET = settings.SUPABASE_SHOWCASE_BUCKET
STATIC_ASSET_FILES = ("static/style.css", "static/script.js", "templates/index.html")
SCRAPER_SUBPROCESS_TIMEOUT_SECONDS = 90
SUPABASE_RETRY_ATTEMPTS = 3
SUPABASE_RETRY_DELAY_SECONDS = 0.6
LOTTERY_ANALYSIS_VERSION_KEY = "lottery_analysis_version_v2"
COURT_STATUS_OVERRIDE_KEY = "court_status_overrides_v1"
LOTTERY_ANALYSIS_CACHE_PREFIX = "lottery_analysis_cache_v3"
LOTTERY_MONTH_SUMMARY_CACHE_PREFIX = "lottery_month_summary_cache_v1"
LOTTERY_ANALYSIS_MEMORY_CACHE = {}


class SupabaseConfigurationError(RuntimeError):
    pass


class SupabaseUnavailableError(RuntimeError):
    pass


def validate_supabase_url(raw_url):
    url = str(raw_url or "").strip()
    if not url:
        return ""

    try:
        parsed = urlparse(url)
    except ValueError as error:
        raise SupabaseConfigurationError("SUPABASE_URL is not a valid URL.") from error

    hostname = (parsed.hostname or "").strip()
    if parsed.scheme not in {"http", "https"} or not hostname:
        raise SupabaseConfigurationError(
            "SUPABASE_URL must include a valid http(s) hostname, for example https://your-project.supabase.co."
        )

    if any(char.isspace() for char in url) or "\"" in url or "'" in url:
        raise SupabaseConfigurationError(
            "SUPABASE_URL contains unexpected spaces or quotes. Check the Render environment variable value."
        )

    return url


SUPABASE_URL = validate_supabase_url(settings.SUPABASE_URL)
supabase: Client | None = (
    create_client(SUPABASE_URL, settings.SUPABASE_KEY)
    if SUPABASE_URL and settings.SUPABASE_KEY
    else None
)


def dumps_json(value):
    return json.dumps(value, ensure_ascii=False)


def get_static_asset_version():
    latest_mtime = 0
    for relative_path in STATIC_ASSET_FILES:
        abs_path = os.path.join(app.root_path, relative_path)
        try:
            latest_mtime = max(latest_mtime, int(os.path.getmtime(abs_path)))
        except OSError:
            continue
    return latest_mtime or int(datetime.now().timestamp())


def require_supabase() -> Client:
    if supabase is None:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY in .env.")
    return supabase


def execute_supabase_query(query, operation_name="supabase query"):
    last_error = None
    for attempt in range(1, SUPABASE_RETRY_ATTEMPTS + 1):
        try:
            return query.execute()
        except httpx.ConnectError as error:
            last_error = error
            print(f"{operation_name} failed on attempt {attempt}/{SUPABASE_RETRY_ATTEMPTS}: {error}")
            if attempt >= SUPABASE_RETRY_ATTEMPTS:
                raise SupabaseUnavailableError(
                    "Supabase host could not be reached. Check SUPABASE_URL and DNS/network settings."
                ) from error
            time.sleep(SUPABASE_RETRY_DELAY_SECONDS * attempt)
        except httpx.HTTPError as error:
            last_error = error
            print(f"{operation_name} failed on attempt {attempt}/{SUPABASE_RETRY_ATTEMPTS}: {error}")
            if attempt >= SUPABASE_RETRY_ATTEMPTS:
                raise SupabaseUnavailableError(
                    "Supabase request failed after retries. Check SUPABASE_URL, SUPABASE_KEY, and service availability."
                ) from error
            time.sleep(SUPABASE_RETRY_DELAY_SECONDS * attempt)
    if last_error:
        raise last_error


@app.errorhandler(SupabaseConfigurationError)
def handle_supabase_configuration_error(error):
    return jsonify({"error": str(error)}), 503


@app.errorhandler(SupabaseUnavailableError)
def handle_supabase_unavailable_error(error):
    return jsonify({"error": str(error)}), 503


def _apply_filters(query, filters=None):
    for operator, column, value in filters or []:
        if operator == "eq":
            query = query.eq(column, value)
        elif operator == "neq":
            query = query.neq(column, value)
        elif operator == "is":
            query = query.is_(column, value)
        elif operator == "in":
            query = query.in_(column, value)
        else:
            raise ValueError(f"Unsupported filter operator: {operator}")
    return query


def sb_select(table, columns="*", filters=None, order_by=None, desc=False, limit=None):
    query = require_supabase().table(table).select(columns)
    query = _apply_filters(query, filters)
    if order_by:
        query = query.order(order_by, desc=desc)
    if limit is not None:
        query = query.limit(limit)
    response = execute_supabase_query(query, f"select {table}")
    return response.data or []


def sb_select_one(table, columns="*", filters=None, order_by=None, desc=False):
    rows = sb_select(table, columns=columns, filters=filters, order_by=order_by, desc=desc, limit=1)
    return rows[0] if rows else None


def sb_insert(table, payload):
    query = require_supabase().table(table).insert(payload)
    response = execute_supabase_query(query, f"insert {table}")
    return response.data or []


def sb_upsert(table, payload, on_conflict=None):
    query = require_supabase().table(table).upsert(payload, on_conflict=on_conflict)
    response = execute_supabase_query(query, f"upsert {table}")
    return response.data or []


def sb_update(table, values, filters=None):
    query = require_supabase().table(table).update(values)
    query = _apply_filters(query, filters)
    response = execute_supabase_query(query, f"update {table}")
    return response.data or []


def sb_delete(table, filters=None):
    query = require_supabase().table(table).delete()
    query = _apply_filters(query, filters)
    response = execute_supabase_query(query, f"delete {table}")
    return response.data or []


def storage_bucket(bucket):
    return require_supabase().storage.from_(bucket)


def storage_upload(bucket, path, content, content_type):
    client = storage_bucket(bucket)
    options = {"content-type": content_type, "upsert": "true"}
    try:
        return client.upload(path=path, file=content, file_options=options)
    except TypeError:
        return client.upload(path, content, options)


def storage_remove(bucket, paths):
    if not paths:
        return None
    try:
        return storage_bucket(bucket).remove(paths)
    except Exception:
        return None


def storage_public_url(bucket, path):
    return storage_bucket(bucket).get_public_url(path)


def build_storage_key(original_name, suffix=""):
    safe_name = secure_filename(original_name or "")
    base_name, extension = os.path.splitext(safe_name)
    extension = extension or ".jpg"
    unique_id = uuid4().hex[:12]
    if suffix:
        return f"{base_name or 'file'}_{suffix}_{unique_id}{extension}"
    return f"{base_name or 'file'}_{unique_id}{extension}"


def get_system_data_json(key, default):
    row = sb_select_one("system_data", columns="value", filters=[("eq", "key", key)])
    if not row or not row.get("value"):
        return default
    try:
        return json.loads(row["value"])
    except (TypeError, json.JSONDecodeError):
        return default


def set_system_data_json(key, value):
    sb_upsert("system_data", {"key": key, "value": dumps_json(value)}, on_conflict="key")


def build_system_cache_key(prefix, payload):
    payload_json = dumps_json(payload)
    digest = hashlib.sha1(payload_json.encode("utf-8")).hexdigest()[:20]
    return f"{prefix}:{digest}"


def get_cached_system_json(key, default=None):
    if key in LOTTERY_ANALYSIS_MEMORY_CACHE:
        return LOTTERY_ANALYSIS_MEMORY_CACHE[key]
    value = get_system_data_json(key, default)
    LOTTERY_ANALYSIS_MEMORY_CACHE[key] = value
    return value


def set_cached_system_json(key, value):
    LOTTERY_ANALYSIS_MEMORY_CACHE[key] = value
    set_system_data_json(key, value)


def get_lottery_analysis_version():
    payload = get_system_data_json(LOTTERY_ANALYSIS_VERSION_KEY, {"version": 0})
    try:
        return max(int(payload.get("version", 0)), 0)
    except (AttributeError, TypeError, ValueError):
        return 0


def bump_lottery_analysis_version():
    next_version = get_lottery_analysis_version() + 1
    set_system_data_json(LOTTERY_ANALYSIS_VERSION_KEY, {"version": next_version, "updated_at": datetime.now().isoformat()})
    LOTTERY_ANALYSIS_MEMORY_CACHE.clear()
    return next_version


VIDEO_IMPROVEMENT_GOALS_KEY = "video_improvement_goals"


def get_video_improvement_goals_payload():
    payload = get_system_data_json(VIDEO_IMPROVEMENT_GOALS_KEY, {"users": {}})
    users = payload.get("users")
    if not isinstance(users, dict):
        users = {}
    normalized = {}
    for username, values in users.items():
        if not str(username or "").strip():
            continue
        values = values or {}
        normalized[str(username).strip()] = {
            "receive": str(values.get("receive") or "").strip(),
            "set": str(values.get("set") or "").strip(),
            "spike": str(values.get("spike") or "").strip(),
            "serve": str(values.get("serve") or "").strip(),
            "other": str(values.get("other") or "").strip(),
            "updated_at": str(values.get("updated_at") or "").strip(),
        }
    return {"users": normalized}


def save_video_improvement_goals_payload(payload):
    set_system_data_json(VIDEO_IMPROVEMENT_GOALS_KEY, payload)


def parse_youtube_resource(url):
    raw_url = str(url or "").strip()
    if not raw_url:
        return None
    if "://" not in raw_url and raw_url.startswith(("www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be")):
        raw_url = f"https://{raw_url}"

    try:
        parsed = urlparse(raw_url)
    except ValueError:
        return None

    host = (parsed.netloc or "").lower()
    path = parsed.path or ""
    query = parse_qs(parsed.query or "")
    is_youtube_host = (
        host.endswith("youtube.com")
        or host.endswith("youtu.be")
        or host.endswith("youtube-nocookie.com")
    )
    if not is_youtube_host:
        return None

    playlist_id = (query.get("list") or [""])[0].strip()
    video_id = ""
    if host.endswith("youtu.be"):
        video_id = path.strip("/").split("/")[0].strip()
    elif "/embed/" in path:
        video_id = path.split("/embed/", 1)[1].split("/", 1)[0].strip()
    else:
        video_id = (query.get("v") or [""])[0].strip()

    valid_video_id = video_id if len(video_id) == 11 else ""
    valid_playlist_id = playlist_id if playlist_id else ""
    if not valid_video_id and not valid_playlist_id:
        return None

    return {
        "kind": "playlist" if valid_playlist_id else "video",
        "url": raw_url,
        "video_id": valid_video_id,
        "playlist_id": valid_playlist_id,
    }


def normalize_month_id(month_id):
    if not month_id:
        return None

    cleaned = str(month_id).strip().replace("/", "-")
    parts = [part for part in cleaned.split("-") if part != ""]

    if len(parts) < 2:
        return cleaned

    year = parts[0]
    month = parts[1].zfill(2)
    return f"{year}-{month}"


def get_month_id(offset=0, base_date=None):
    today = base_date or date.today()
    year = today.year
    month = today.month + offset

    while month > 12:
        year += 1
        month -= 12
    while month < 1:
        year -= 1
        month += 12

    return f"{year}-{str(month).zfill(2)}"


def archive_court_status(month_id, content, source="system"):
    sb_insert(
        "court_status_history",
        {"month_id": month_id, "content": content, "source": source},
    )


def normalize_court_status_table():
    rows = sb_select("court_status", columns="month_id, content")

    normalized_rows = {}
    for row in rows:
        raw_month_id = row.get("month_id")
        content = row.get("content")
        normalized_month = normalize_month_id(raw_month_id)
        if not normalized_month:
            continue
        normalized_rows[normalized_month] = content

    for month_id, content in normalized_rows.items():
        sb_upsert("court_status", {"month_id": month_id, "content": content}, on_conflict="month_id")
        if raw_month_id and raw_month_id != month_id:
            sb_delete("court_status", [("eq", "month_id", raw_month_id)])


def set_scrape_status(status, message="", target_month=""):
    set_system_data_json("scrape_status", {"status": status, "message": message, "target_month": target_month})


def classify_scraper_failure(output_text, returncode=0):
    text = (output_text or "").lower()

    if not settings.SCRAPER_USERNAME or not settings.SCRAPER_PASSWORD:
        return (
            "config_missing",
            "\u722c\u87f2\u5e33\u865f\u6216\u5bc6\u78bc\u672a\u8a2d\u5b9a\uff0c\u8acb\u5148\u6aa2\u67e5 Render \u6216 .env \u4e2d\u7684 SCRAPER_USERNAME \u8207 SCRAPER_PASSWORD\u3002",
        )

    if "login request failed" in text or "login connection error" in text:
        return (
            "credential_error",
            "\u7121\u6cd5\u5b8c\u6210\u53f0\u5927\u79df\u501f\u7cfb\u7d71\u767b\u5165\uff0c\u8acb\u6aa2\u67e5\u722c\u87f2\u5e33\u865f\u5bc6\u78bc\u662f\u5426\u6b63\u78ba\uff0c\u6216\u5148\u624b\u52d5\u767b\u5165\u5f8c\u518d\u8a66\u4e00\u6b21\u3002",
        )

    if any(marker in text for marker in ["access denied", "forbidden", "non json", "non-json", "doctype html"]):
        return (
            "manual_login_required",
            "\u53f0\u5927\u79df\u501f\u7db2\u7ad9\u62d2\u7d55\u9019\u6b21\u722c\u53d6\uff0c\u591a\u534a\u9700\u8981\u5148\u624b\u52d5\u767b\u5165\u79df\u501f\u7cfb\u7d71\u5f8c\u518d\u91cd\u65b0\u57f7\u884c\u3002",
        )

    if any(
        marker in text
        for marker in [
            "name or service not known",
            "temporary failure in name resolution",
            "connection error",
            "max retries exceeded",
            "failed to establish a new connection",
            "read timed out",
            "connect timeout",
            "ssl",
        ]
    ):
        return (
            "network_error",
            "\u722c\u87f2\u9023\u7dda\u5931\u6557\uff0c\u53ef\u80fd\u662f\u79df\u501f\u7db2\u7ad9\u6216\u4f3a\u670d\u5668\u66ab\u6642\u7121\u6cd5\u9023\u7dda\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002",
        )

    if "token extraction error" in text or "warning: sk token not found" in text:
        return (
            "token_error",
            "\u5df2\u9023\u4e0a\u79df\u501f\u7db2\u7ad9\uff0c\u4f46\u7121\u6cd5\u53d6\u5f97\u5fc5\u8981\u7684\u9a57\u8b49\u8cc7\u6599\u3002\u7db2\u7ad9\u7d50\u69cb\u53ef\u80fd\u5df2\u8b8a\u66f4\uff0c\u9700\u8981\u6aa2\u67e5\u722c\u87f2\u908f\u8f2f\u3002",
        )

    if "api error" in text:
        return (
            "api_error",
            "\u53f0\u5927\u79df\u501f\u7cfb\u7d71\u6709\u56de\u61c9\uff0c\u4f46\u56de\u50b3\u5167\u5bb9\u4e0d\u7b26\u9810\u671f\uff0c\u53ef\u80fd\u662f\u7db2\u7ad9\u9650\u5236\u6216\u9801\u9762\u683c\u5f0f\u8b8a\u66f4\u3002",
        )

    if returncode != 0:
        return (
            "process_error",
            "\u722c\u87f2\u7a0b\u5f0f\u57f7\u884c\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\uff0c\u82e5\u6301\u7e8c\u767c\u751f\u8acb\u6aa2\u67e5 Render logs\u3002",
        )

    return (
        "unknown_error",
        "\u722c\u87f2\u672a\u5b8c\u6210\uff0c\u4f46\u66ab\u6642\u7121\u6cd5\u5224\u65b7\u5177\u9ad4\u539f\u56e0\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u6216\u6aa2\u67e5 logs\u3002",
    )


def build_scrape_fallback_message(base_message, target_month):
    month_label = target_month or "\u76ee\u6a19\u6708\u4efd"
    return f"{base_message}\u76ee\u524d\u5df2\u5148\u6cbf\u7528 {month_label} \u65e2\u6709\u5834\u5730\u8cc7\u6599\u3002"


def start_scrape_thread(payload, target_month):
    def run_scraper_task():
        try:
            set_scrape_status("running", "\u722c\u87f2\u57f7\u884c\u4e2d\uff0c\u8acb\u7a0d\u5019\u2026", target_month or "")
            print(f"Starting scraper for {target_month}...")
            payload_str = json.dumps(payload)
            result = subprocess.run(
                [sys.executable, "main.py", payload_str],
                capture_output=True,
                text=True,
                cwd="drawresult",
                errors="replace",
                timeout=SCRAPER_SUBPROCESS_TIMEOUT_SECONDS,
            )
            print("Scraper finished. Output:")
            print(result.stdout)
            if result.stderr:
                print("Scraper stderr:", result.stderr)

            combined_output = f"{result.stdout}\n{result.stderr}"
            combined_output_lower = combined_output.lower()
            saved_content = get_saved_court_status(target_month)
            scrape_succeeded = (
                result.returncode == 0
                and "successfully retrieved" in combined_output_lower
                and "no matching courts found" not in combined_output_lower
            )

            if scrape_succeeded:
                set_scrape_status("success", "\u722c\u87f2\u5b8c\u6210\uff0c\u5df2\u66f4\u65b0\u5834\u5730\u8cc7\u6599\u3002", target_month or "")
                return

            failure_code, failure_message = classify_scraper_failure(combined_output, result.returncode)
            print(f"Scraper classified failure: {failure_code}")
            if saved_content:
                set_scrape_status(
                    "warning",
                    build_scrape_fallback_message(failure_message, target_month),
                    target_month or "",
                )
            else:
                set_scrape_status("error", failure_message, target_month or "")
        except subprocess.TimeoutExpired:
            print(f"Scraper timed out after {SCRAPER_SUBPROCESS_TIMEOUT_SECONDS} seconds.")
            if get_saved_court_status(target_month):
                set_scrape_status(
                    "warning",
                    build_scrape_fallback_message(
                        f"\u722c\u87f2\u8d85\u904e {SCRAPER_SUBPROCESS_TIMEOUT_SECONDS} \u79d2\u4ecd\u672a\u5b8c\u6210\uff0c",
                        target_month,
                    ),
                    target_month or "",
                )
            else:
                set_scrape_status(
                    "error",
                    f"\u722c\u87f2\u8d85\u904e {SCRAPER_SUBPROCESS_TIMEOUT_SECONDS} \u79d2\u4ecd\u672a\u5b8c\u6210\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002",
                    target_month or "",
                )
        except Exception as error:
            print(f"Failed to run scraper: {error}")
            if get_saved_court_status(target_month):
                set_scrape_status(
                    "warning",
                    build_scrape_fallback_message(
                        "\u722c\u87f2\u57f7\u884c\u904e\u7a0b\u767c\u751f\u4f8b\u5916\uff0c",
                        target_month,
                    ),
                    target_month or "",
                )
            else:
                set_scrape_status(
                    "error",
                    "\u722c\u87f2\u57f7\u884c\u904e\u7a0b\u767c\u751f\u4f8b\u5916\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u6216\u6aa2\u67e5 logs\u3002",
                    target_month or "",
                )

    thread = threading.Thread(target=run_scraper_task)
    thread.start()

    return jsonify(
        {
            "status": "success",
            "message": f"Started scraper for {target_month}. Please wait a moment and refresh later.",
        }
    )


def get_saved_court_status(month_id):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return None

    row = sb_select_one("court_status", columns="content", filters=[("eq", "month_id", target_month)])
    content = row.get("content") if row else None
    return content if content not in (None, "", "[]") else None


def get_court_status_overrides():
    payload = get_system_data_json(COURT_STATUS_OVERRIDE_KEY, {})
    return payload if isinstance(payload, dict) else {}


def get_display_court_status(month_id):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return None
    overrides = get_court_status_overrides()
    override_content = overrides.get(target_month)
    if override_content not in (None, "", "[]"):
        return override_content
    return get_saved_court_status(target_month)


def set_display_court_status(month_id, content):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return
    overrides = get_court_status_overrides()
    overrides[target_month] = content
    set_system_data_json(COURT_STATUS_OVERRIDE_KEY, overrides)


def delete_display_court_status(month_id):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return False
    overrides = get_court_status_overrides()
    if target_month not in overrides:
        return False
    del overrides[target_month]
    set_system_data_json(COURT_STATUS_OVERRIDE_KEY, overrides)
    return True


def get_showcase_photos():
    photos = get_system_data_json("showcase_photos", [])
    return photos if isinstance(photos, list) else []


def set_showcase_photos(photos):
    set_system_data_json("showcase_photos", photos)


GALLERY_PHOTO_ORDER_KEY = "gallery_photo_order"


def normalize_filename_list(items, allowed=None):
    allowed_set = set(allowed or [])
    filtered = []
    seen = set()
    for item in items or []:
        filename = str(item or "").strip()
        if not filename or filename in seen:
            continue
        if allowed is not None and filename not in allowed_set:
            continue
        seen.add(filename)
        filtered.append(filename)
    return filtered


def get_gallery_photo_order():
    order = get_system_data_json(GALLERY_PHOTO_ORDER_KEY, [])
    return normalize_filename_list(order)


def save_gallery_photo_order(order):
    set_system_data_json(GALLERY_PHOTO_ORDER_KEY, normalize_filename_list(order))


def sort_gallery_rows_by_saved_order(rows):
    rows = rows or []
    saved_order = get_gallery_photo_order()
    if not saved_order:
        return rows

    row_map = {row.get("filename"): row for row in rows if row.get("filename")}
    ordered_filenames = normalize_filename_list(saved_order, allowed=row_map.keys())
    ordered_rows = [row_map[filename] for filename in ordered_filenames]
    remaining_rows = [row for row in rows if row.get("filename") not in set(ordered_filenames)]
    return ordered_rows + remaining_rows


def sort_filenames_by_gallery_order(filenames):
    normalized = normalize_filename_list(filenames)
    if not normalized:
        return []

    order_map = {filename: index for index, filename in enumerate(get_gallery_photo_order())}
    fallback_map = {filename: index for index, filename in enumerate(normalized)}
    return sorted(normalized, key=lambda filename: (order_map.get(filename, 10**9), fallback_map.get(filename, 10**9)))


def get_showcase_crop_map():
    crop_map = get_system_data_json("showcase_photo_crops", {})
    return crop_map if isinstance(crop_map, dict) else {}


def set_showcase_crop_map(crop_map):
    set_system_data_json("showcase_photo_crops", crop_map)


TEAM_RESOURCES_KEY = "team_resources"
TEAM_RESOURCE_VISIBILITIES = {"captain", "all"}
VIDEO_SECTION_ORDER_KEY = "video_section_order"
VIDEO_ITEM_ORDER_KEY = "video_item_order"


def default_team_resources_payload():
    return {"sections": []}


def get_team_resources_payload():
    payload = get_system_data_json(TEAM_RESOURCES_KEY, default_team_resources_payload())
    if not isinstance(payload, dict):
        return default_team_resources_payload()

    normalized_sections = []
    for section in payload.get("sections", []):
        if not isinstance(section, dict):
            continue
        section_id = str(section.get("id") or uuid4())
        visibility = str(section.get("visibility") or "captain").strip().lower()
        if visibility not in TEAM_RESOURCE_VISIBILITIES:
            visibility = "captain"
        notes = section.get("notes")
        resources = section.get("resources")
        normalized_sections.append(
            {
                "id": section_id,
                "title": str(section.get("title") or "").strip(),
                "visibility": visibility,
                "created_at": section.get("created_at") or datetime.now().isoformat(timespec="seconds"),
                "notes": notes if isinstance(notes, list) else [],
                "resources": [
                    {
                        "id": str(item.get("id") or uuid4()),
                        "title": str(item.get("title") or "").strip(),
                        "url": str(item.get("url") or "").strip(),
                        "created_at": item.get("created_at") or datetime.now().isoformat(timespec="seconds"),
                    }
                    for item in (resources if isinstance(resources, list) else [])
                    if isinstance(item, dict) and str(item.get("url") or "").strip()
                ],
            }
        )

    return {"sections": normalized_sections}


def save_team_resources_payload(payload):
    set_system_data_json(TEAM_RESOURCES_KEY, payload)


def is_allowed_team_resource_url(url):
    normalized = str(url or "").strip().lower()
    return (
        normalized.startswith("https://docs.google.com/")
        or normalized.startswith("https://forms.gle/")
        or normalized.startswith("https://www.notion.so/")
        or normalized.startswith("https://notion.so/")
        or normalized.startswith("https://www.notion.site/")
        or normalized.startswith("https://notion.site/")
    )


def filter_team_sections_by_role(sections, role):
    normalized_role = str(role or "").strip().lower()
    if normalized_role == "captain":
        return sections
    return [section for section in sections if section.get("visibility") == "all"]


def get_video_section_order():
    order = get_system_data_json(VIDEO_SECTION_ORDER_KEY, [])
    return [int(item) for item in order if str(item).isdigit()] if isinstance(order, list) else []


def save_video_section_order(order):
    normalized = [int(item) for item in order if str(item).isdigit()]
    set_system_data_json(VIDEO_SECTION_ORDER_KEY, normalized)


def get_video_item_order_map():
    payload = get_system_data_json(VIDEO_ITEM_ORDER_KEY, {})
    if not isinstance(payload, dict):
        return {}

    normalized = {}
    for section_id, order in payload.items():
        if not isinstance(order, list):
            continue
        normalized[str(section_id)] = [int(item) for item in order if str(item).isdigit()]
    return normalized


def save_video_item_order_map(order_map):
    normalized = {}
    for section_id, order in (order_map or {}).items():
        if not isinstance(order, list):
            continue
        normalized[str(section_id)] = [int(item) for item in order if str(item).isdigit()]
    set_system_data_json(VIDEO_ITEM_ORDER_KEY, normalized)


def sort_items_by_saved_order(items, order, get_id=lambda item: item.get("id")):
    order_map = {str(item_id): index for index, item_id in enumerate(order or [])}
    ordered_items = []
    remaining_items = []
    for item in items:
        item_id = str(get_id(item))
        if item_id in order_map:
            ordered_items.append(item)
        else:
            remaining_items.append(item)
    ordered_items.sort(key=lambda item: order_map.get(str(get_id(item)), 0))
    return ordered_items + remaining_items


def sort_sections_by_saved_order(sections, order):
    return sort_items_by_saved_order(sections, order, lambda section: section.get("id"))


LOTTERY_COURTS = ["Court 4", "Court 5", "Court 6", "Court 7"]
LOTTERY_TIMES = {"slot1": "18:00-20:00", "slot2": "20:00-22:00"}
LOTTERY_WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"]
LOTTERY_ACCOUNT_NAMES = ["A", "B", "C", "D", "E"]
MENU_COMPLEXITY_DEFAULTS = ["basic", "standard"]
MENU_DIFFICULTY_DEFAULTS = ["beginner", "advanced"]
MENU_COMPLEXITY_ORDER = {"basic": 0, "standard": 1}
MENU_FATIGUE_ORDER = {"low": 0, "medium": 1, "high": 2}
MENU_DIFFICULTY_ORDER = {"beginner": 0, "intermediate": 1, "advanced": 2}


def normalize_court_date_value(date_value):
    if not date_value:
        return ""
    value = str(date_value).strip()
    try:
        return datetime.fromisoformat(value[:10]).strftime("%Y-%m-%d")
    except ValueError:
        return value[:10] if len(value) >= 10 else ""


def build_empty_lottery_slot():
    return {court: 0 for court in LOTTERY_COURTS}


def normalize_lottery_slot(slot_data):
    normalized = build_empty_lottery_slot()
    if isinstance(slot_data, dict):
        for court in LOTTERY_COURTS:
            raw_value = slot_data.get(court, slot_data.get(court.lower(), 0))
            try:
                value = int(raw_value or 0)
            except (TypeError, ValueError):
                value = 0
            normalized[court] = max(0, min(5, value))
    return normalized


def normalize_lottery_row(row):
    row = row or {}
    return {
        "date": normalize_court_date_value(row.get("date")),
        "slot1": normalize_lottery_slot(row.get("slot1")),
        "slot2": normalize_lottery_slot(row.get("slot2")),
    }


def parse_json_array(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def split_menu_values(value):
    if value is None:
        return []
    normalized = str(value).replace(",", ",").replace(";", ",")
    return [item.strip() for item in normalized.split(",") if item.strip()]


def normalize_menu_value_list(values, defaults=None):
    cleaned = [str(item).strip() for item in (values or []) if str(item).strip()]
    return cleaned if cleaned else list(defaults or [])


def build_menu_filters(rows):
    focuses = sorted({item for row in rows for item in row["focuses"]})
    complexities = sorted(
        {item for row in rows for item in row["complexities"]},
        key=lambda item: (MENU_COMPLEXITY_ORDER.get(item, 99), item),
    )
    fatigue_levels = sorted(
        {item for row in rows for item in row["fatigue_levels"]},
        key=lambda item: (MENU_FATIGUE_ORDER.get(item, 99), item),
    )
    difficulty_levels = sorted(
        {item for row in rows for item in row["difficulty_levels"]},
        key=lambda item: (MENU_DIFFICULTY_ORDER.get(item, 99), item),
    )
    return {
        "focuses": focuses,
        "people_counts": sorted({row["people_count"] for row in rows if row["people_count"]}),
        "court_modes": sorted({item for row in rows for item in row["court_modes"]}),
        "complexities": complexities,
        "fatigue_levels": fatigue_levels,
        "difficulty_levels": difficulty_levels,
    }


def serialize_menu_values(values):
    return json.dumps([item for item in (values or []) if str(item).strip()], ensure_ascii=False)


def deserialize_menu_values(value):
    parsed = parse_json_array(value)
    if parsed:
        return [str(item).strip() for item in parsed if str(item).strip()]
    return split_menu_values(value)


def menu_court_rank(court_modes):
    values = set(court_modes or [])
    if "half" in values and "full" not in values:
        return 0
    if "half" in values and "full" in values:
        return 1
    if "full" in values:
        return 2
    return 3


def menu_difficulty_rank(difficulties):
    ranks = [MENU_DIFFICULTY_ORDER[item] for item in (difficulties or []) if item in MENU_DIFFICULTY_ORDER]
    return min(ranks) if ranks else 99


def normalize_menu_row_payload(payload, existing_id=None):
    payload = payload or {}
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ValueError("name is required")

    try:
        people_count = int(payload.get("people_count") or 0)
    except (TypeError, ValueError):
        people_count = 0

    return {
        "id": existing_id,
        "name": name,
        "focuses": split_menu_values(payload.get("focuses")) if isinstance(payload.get("focuses"), str) else [str(item).strip() for item in (payload.get("focuses") or []) if str(item).strip()],
        "people_count": max(0, people_count),
        "court_modes": split_menu_values(payload.get("court_modes")) if isinstance(payload.get("court_modes"), str) else [str(item).strip() for item in (payload.get("court_modes") or []) if str(item).strip()],
        "complexities": normalize_menu_value_list(
            split_menu_values(payload.get("complexities")) if isinstance(payload.get("complexities"), str) else [str(item).strip() for item in (payload.get("complexities") or []) if str(item).strip()],
            MENU_COMPLEXITY_DEFAULTS,
        ),
        "fatigue_levels": split_menu_values(payload.get("fatigue_levels")) if isinstance(payload.get("fatigue_levels"), str) else [str(item).strip() for item in (payload.get("fatigue_levels") or []) if str(item).strip()],
        "difficulty_levels": normalize_menu_value_list(
            split_menu_values(payload.get("difficulty_levels")) if isinstance(payload.get("difficulty_levels"), str) else [str(item).strip() for item in (payload.get("difficulty_levels") or []) if str(item).strip()],
            MENU_DIFFICULTY_DEFAULTS,
        ),
    }


def sort_menu_rows(rows):
    return sorted(
        rows,
        key=lambda row: (
            menu_court_rank(row.get("court_modes")),
            row.get("people_count") or 999,
            menu_difficulty_rank(row.get("difficulty_levels")),
            row.get("name", ""),
        ),
    )


def init_menu_drills_table():
    existing_rows = sb_select("menu_drills", columns="id, complexities, difficulty_levels")
    if existing_rows:
        for row in existing_rows:
            row_id = row["id"]
            complexities = row.get("complexities")
            difficulty_levels = row.get("difficulty_levels")
            normalized_complexities = normalize_menu_value_list(deserialize_menu_values(complexities), MENU_COMPLEXITY_DEFAULTS)
            normalized_difficulties = normalize_menu_value_list(deserialize_menu_values(difficulty_levels), MENU_DIFFICULTY_DEFAULTS)
            sb_update(
                "menu_drills",
                {
                    "complexities": serialize_menu_values(normalized_complexities),
                    "difficulty_levels": serialize_menu_values(normalized_difficulties),
                    "updated_at": datetime.now().isoformat(),
                },
                [("eq", "id", row_id)],
            )


def fetch_menu_rows_from_db():
    records = sb_select(
        "menu_drills",
        columns="id, name, focuses, people_count, court_modes, complexities, fatigue_levels, difficulty_levels",
    )
    rows = []
    for row in records:
        rows.append(
            {
                "id": row["id"],
                "name": row["name"],
                "focuses": deserialize_menu_values(row["focuses"]),
                "people_count": row["people_count"],
                "court_modes": deserialize_menu_values(row["court_modes"]),
                "complexities": normalize_menu_value_list(deserialize_menu_values(row["complexities"]), MENU_COMPLEXITY_DEFAULTS),
                "fatigue_levels": deserialize_menu_values(row["fatigue_levels"]),
                "difficulty_levels": normalize_menu_value_list(deserialize_menu_values(row["difficulty_levels"]), MENU_DIFFICULTY_DEFAULTS),
            }
        )
    return sort_menu_rows(rows)


def build_lottery_month_rows(month_id, saved_rows=None):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return []

    saved_map = {}
    for row in saved_rows or []:
        normalized = normalize_lottery_row(row)
        if normalized["date"]:
            saved_map[normalized["date"]] = normalized

    year, month = map(int, target_month.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    rows = []
    for day in range(1, last_day + 1):
        date_key = f"{year}-{month:02d}-{day:02d}"
        existing = saved_map.get(date_key, {})
        rows.append(
            {
                "date": date_key,
                "slot1": normalize_lottery_slot(existing.get("slot1")),
                "slot2": normalize_lottery_slot(existing.get("slot2")),
            }
        )
    return rows


def fetch_month_content(table_name, month_id):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return None
    row = sb_select_one(table_name, columns="content", filters=[("eq", "month_id", target_month)])
    return row.get("content") if row else None


def count_lottery_bids(rows):
    total = 0
    for row in rows or []:
        total += sum(normalize_lottery_slot((row or {}).get("slot1")).values())
        total += sum(normalize_lottery_slot((row or {}).get("slot2")).values())
    return total


def extract_court_name(value):
    if not value:
        return ""
    text = str(value).replace("Volleyball Court", "Court").strip()
    for court in LOTTERY_COURTS:
        if court.lower() in text.lower():
            return court
    compact_text = text.replace(" ", "")
    for court in LOTTERY_COURTS:
        court_number = court.replace("Court ", "")
        if f"court{court_number}".lower() in compact_text.lower() or f"場{court_number}" in compact_text:
            return court
    return text


def extract_court_names(value):
    if value is None:
        return []
    if isinstance(value, list):
        names = []
        for item in value:
            names.extend(extract_court_names(item))
        deduped = []
        for name in names:
            if name and name not in deduped:
                deduped.append(name)
        return deduped
    if isinstance(value, dict):
        return extract_court_names(value.get("line1") or value.get("court"))

    text = str(value).strip()
    if not text:
        return []

    matches = []
    for court in LOTTERY_COURTS:
        court_number = court.replace("Court ", "")
        patterns = [
            rf"court\s*{court_number}\b",
            rf"volleyball\s*court\s*{court_number}\b",
            rf"場\s*{court_number}\b",
        ]
        if any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns):
            matches.append(court)

    if matches:
        return matches

    single_name = extract_court_name(text)
    return [single_name] if single_name else []


def parse_court_status_rows(content):
    raw_rows = parse_json_array(content)
    if not raw_rows:
        return []

    if isinstance(raw_rows[0], dict) and "slot1" in raw_rows[0]:
        parsed_rows = []
        for row in raw_rows:
            slot1 = row.get("slot1") or {}
            slot2 = row.get("slot2") or {}
            parsed_rows.append(
                {
                    "date": normalize_court_date_value(row.get("date")),
                    "slot1": extract_court_names(slot1),
                    "slot2": extract_court_names(slot2),
                }
            )
        return parsed_rows

    grouped = {}
    for item in raw_rows:
        if not isinstance(item, dict):
            continue
        date_key = normalize_court_date_value(item.get("date") or item.get("Date"))
        if not date_key:
            continue
        time_value = str(item.get("time") or item.get("Time") or "")
        court_name = extract_court_name(item.get("court") or item.get("Court") or item.get("court_name"))
        if not court_name:
            continue
        grouped.setdefault(date_key, {"date": date_key, "slot1": [], "slot2": []})
        if "18" in time_value or "19" in time_value:
            if court_name not in grouped[date_key]["slot1"]:
                grouped[date_key]["slot1"].append(court_name)
        elif "20" in time_value or "21" in time_value:
            if court_name not in grouped[date_key]["slot2"]:
                grouped[date_key]["slot2"].append(court_name)

    return [grouped[key] for key in sorted(grouped.keys())]


def iterate_month_ids(start_month, end_month):
    start = normalize_month_id(start_month)
    end = normalize_month_id(end_month)
    if not start or not end:
        return []

    start_year, start_mon = map(int, start.split("-"))
    end_year, end_mon = map(int, end.split("-"))
    current_year, current_mon = start_year, start_mon
    month_ids = []

    while (current_year, current_mon) <= (end_year, end_mon):
        month_ids.append(f"{current_year}-{current_mon:02d}")
        current_mon += 1
        if current_mon > 12:
            current_mon = 1
            current_year += 1
    return month_ids


def fetch_existing_month_ids(table_name):
    records = sb_select(table_name, columns="month_id")
    rows = [normalize_month_id(row.get("month_id")) for row in records]
    return sorted([row for row in rows if row])


def build_lottery_analysis_rows(month_id, saved_rows):
    normalized_month = normalize_month_id(month_id)
    normalized_rows = []
    for row in saved_rows or []:
        normalized = normalize_lottery_row(row)
        if normalized["date"]:
            normalized_rows.append(normalized)

    if normalized_rows:
        return sorted(normalized_rows, key=lambda row: row["date"])

    if not normalized_month:
        return []

    return build_lottery_month_rows(normalized_month, saved_rows)


def build_probability_records(month_ids):
    records = []
    skipped_months = []
    court_map_cache = {}

    def get_court_map(month_id):
        normalized_month = normalize_month_id(month_id)
        if not normalized_month:
            return {}
        if normalized_month not in court_map_cache:
            court_content = fetch_month_content("court_status", normalized_month)
            court_rows = parse_court_status_rows(court_content) if court_content is not None else []
            court_map_cache[normalized_month] = {row["date"]: row for row in court_rows if row.get("date")}
        return court_map_cache[normalized_month]

    for month_id in month_ids:
        bid_content = fetch_month_content("lottery_bids", month_id)
        bid_rows = build_lottery_analysis_rows(month_id, parse_json_array(bid_content)) if bid_content is not None else []

        total_bids = 0
        for row in bid_rows:
            total_bids += sum(row["slot1"].values()) + sum(row["slot2"].values())

        has_bid_data = bid_content is not None and total_bids > 0
        has_court_data = any(get_court_map((row.get("date") or "")[:7]).get(row.get("date")) for row in bid_rows if row.get("date"))
        if not has_bid_data or not has_court_data:
            skipped_months.append(month_id)
            continue

        for row in bid_rows:
            date_key = row["date"]
            weekday = LOTTERY_WEEKDAY_NAMES[datetime.strptime(date_key, "%Y-%m-%d").weekday()]
            court_row = get_court_map(date_key[:7]).get(date_key, {"slot1": [], "slot2": []})
            for slot_key, time_label in LOTTERY_TIMES.items():
                won_courts = set(extract_court_names(court_row.get(slot_key)))
                for court in LOTTERY_COURTS:
                    bids = row[slot_key].get(court, 0)
                    if bids <= 0:
                        continue
                    records.append(
                        {
                            "month_id": month_id,
                            "date": date_key,
                            "weekday": weekday,
                            "time": time_label,
                            "court": court,
                            "bids": bids,
                            "wins": 1 if court in won_courts else 0,
                        }
                    )
    return records, skipped_months


def get_pool_support_limit(records, minimum=40):
    max_bids = max([record["bids"] for record in (records or []) if record.get("bids", 0) > 0] or [0])
    return max(int(minimum), int(max_bids * 15), 20)


def group_probability_records_by_pool(records):
    grouped = {}
    for record in records or []:
        key = (record["weekday"], record["time"], record["court"])
        if key not in grouped:
            grouped[key] = {
                "weekday": key[0],
                "time": key[1],
                "court": key[2],
                "records": [],
            }
        grouped[key]["records"].append(record)
    return grouped


def point_estimate_pool_size(records, max_base_tickets):
    filtered = [record for record in records if record["bids"] > 0]
    if not filtered:
        return max(1.0, max_base_tickets / 3)

    min_base = 0
    best_base = 0
    best_score = float("-inf")
    for base_tickets in range(min_base, max_base_tickets + 1):
        score = 0.0
        for record in filtered:
            win_prob = min(max(record["bids"] / (base_tickets + record["bids"]), 1e-9), 1 - 1e-9)
            score += math.log(win_prob) if record["wins"] else math.log(1 - win_prob)
        if score > best_score:
            best_score = score
            best_base = base_tickets
    return float(best_base)


def normalize_weights(weights):
    total = sum(weights)
    if total <= 0:
        return [1.0 / len(weights)] * len(weights) if weights else []
    return [weight / total for weight in weights]


def build_uniform_prior(max_base_tickets):
    return [1.0 / (max_base_tickets + 1)] * (max_base_tickets + 1)


def build_poisson_prior(max_base_tickets, mean_value):
    mean_value = max(float(mean_value), 0.1)
    weights = []
    for base_tickets in range(max_base_tickets + 1):
        log_weight = -mean_value + (base_tickets * math.log(mean_value)) - math.lgamma(base_tickets + 1)
        weights.append(math.exp(log_weight))
    return normalize_weights(weights)


def build_negative_binomial_prior(max_base_tickets, mean_value, variance_value):
    mean_value = max(float(mean_value), 0.1)
    variance_value = max(float(variance_value), mean_value + 0.1)
    dispersion = max((mean_value ** 2) / max(variance_value - mean_value, 0.1), 0.5)
    success_prob = dispersion / (dispersion + mean_value)
    weights = []
    for base_tickets in range(max_base_tickets + 1):
        log_weight = (
            math.lgamma(base_tickets + dispersion)
            - math.lgamma(dispersion)
            - math.lgamma(base_tickets + 1)
            + (dispersion * math.log(success_prob))
            + (base_tickets * math.log(1 - success_prob))
        )
        weights.append(math.exp(log_weight))
    return normalize_weights(weights)


def build_empirical_prior(histories, max_base_tickets):
    if not histories:
        return build_uniform_prior(max_base_tickets)

    histogram = [1.0] * (max_base_tickets + 1)
    for history in histories:
        estimate = int(round(point_estimate_pool_size(history, max_base_tickets)))
        estimate = max(0, min(max_base_tickets, estimate))
        histogram[estimate] += 1.0
    return normalize_weights(histogram)


def compute_history_moments(histories, max_base_tickets):
    estimates = [point_estimate_pool_size(history, max_base_tickets) for history in histories if history]
    if not estimates:
        return 12.0, 24.0
    mean_value = sum(estimates) / len(estimates)
    variance_value = sum((value - mean_value) ** 2 for value in estimates) / max(len(estimates), 1)
    variance_value = max(variance_value, mean_value + 1.0)
    return mean_value, variance_value


def build_prior_candidates(pool_histories, max_base_tickets):
    histories = [item["records"] for item in pool_histories.values() if item.get("records")]
    mean_value, variance_value = compute_history_moments(histories, max_base_tickets)
    return {
        "uniform": build_uniform_prior(max_base_tickets),
        "poisson": build_poisson_prior(max_base_tickets, mean_value),
        "negative_binomial": build_negative_binomial_prior(max_base_tickets, mean_value, variance_value),
        "empirical": build_empirical_prior(histories, max_base_tickets),
    }


def compute_pool_posterior(history, prior):
    if not prior:
        return []

    log_weights = []
    for base_tickets, prior_weight in enumerate(prior):
        if prior_weight <= 0:
            log_weights.append(float("-inf"))
            continue
        score = math.log(prior_weight)
        for record in history:
            bids = max(int(record["bids"]), 0)
            win_prob = min(max(bids / (base_tickets + bids), 1e-9), 1 - 1e-9) if bids > 0 else 1e-9
            score += math.log(win_prob) if record["wins"] else math.log(1 - win_prob)
        log_weights.append(score)

    max_log_weight = max(log_weights)
    weights = [math.exp(value - max_log_weight) if value != float("-inf") else 0.0 for value in log_weights]
    return normalize_weights(weights)


def predictive_win_probability_from_posterior(posterior, bids):
    if bids <= 0:
        return 0.0
    return sum((bids / (base_tickets + bids)) * weight for base_tickets, weight in enumerate(posterior))


def predictive_lose_probability_from_posterior(posterior, bids):
    if bids <= 0:
        return 1.0
    return sum((base_tickets / (base_tickets + bids)) * weight for base_tickets, weight in enumerate(posterior))


def posterior_mean(posterior):
    return sum(base_tickets * weight for base_tickets, weight in enumerate(posterior))


def posterior_map(posterior):
    return max(range(len(posterior)), key=lambda index: posterior[index]) if posterior else 0


def posterior_stddev(posterior):
    mean_value = posterior_mean(posterior)
    variance = sum((((base_tickets - mean_value) ** 2) * weight) for base_tickets, weight in enumerate(posterior))
    return math.sqrt(max(variance, 0.0))


def posterior_credible_interval(posterior, mass=0.8):
    lower_tail = (1 - mass) / 2
    upper_tail = 1 - lower_tail
    cumulative = 0.0
    lower_value = 0
    upper_value = len(posterior) - 1
    lower_set = False
    for base_tickets, weight in enumerate(posterior):
        cumulative += weight
        if not lower_set and cumulative >= lower_tail:
            lower_value = base_tickets
            lower_set = True
        if cumulative >= upper_tail:
            upper_value = base_tickets
            break
    return {"low": lower_value, "high": upper_value, "mass": mass}


def posterior_entropy(posterior):
    return -sum(weight * math.log(weight) for weight in posterior if weight > 0)


def expected_information_gain(history, prior, bids):
    if bids <= 0:
        return 0.0
    base_posterior = compute_pool_posterior(history, prior)
    win_probability = predictive_win_probability_from_posterior(base_posterior, bids)
    lose_probability = 1 - win_probability
    win_entropy = posterior_entropy(compute_pool_posterior(history + [{"bids": bids, "wins": 1}], prior))
    lose_entropy = posterior_entropy(compute_pool_posterior(history + [{"bids": bids, "wins": 0}], prior))
    return posterior_entropy(base_posterior) - ((win_probability * win_entropy) + (lose_probability * lose_entropy))


def relative_information_gain_percent(history, prior, bids):
    base_posterior = compute_pool_posterior(history, prior)
    base_entropy = posterior_entropy(base_posterior)
    if base_entropy <= 1e-9:
        return 0.0
    return (expected_information_gain(history, prior, bids) / base_entropy) * 100.0


def score_prior_model(pool_histories, prior):
    score = 0.0
    for item in pool_histories.values():
        history = item["records"]
        if not history:
            continue
        for index, record in enumerate(history):
            reduced_history = history[:index] + history[index + 1 :]
            posterior = compute_pool_posterior(reduced_history, prior)
            win_probability = predictive_win_probability_from_posterior(posterior, int(record["bids"]))
            win_probability = min(max(win_probability, 1e-9), 1 - 1e-9)
            score += math.log(win_probability) if record["wins"] else math.log(1 - win_probability)
    return score


def summarize_probability_records(records):
    pool_histories = group_probability_records_by_pool(records)
    max_base_tickets = get_pool_support_limit(records)
    prior_candidates = build_prior_candidates(pool_histories, max_base_tickets)
    model_scores = {
        name: score_prior_model(pool_histories, prior)
        for name, prior in prior_candidates.items()
    }
    selected_model = max(model_scores, key=model_scores.get) if model_scores else "uniform"
    selected_prior = prior_candidates.get(selected_model, build_uniform_prior(max_base_tickets))

    results = []
    weekday_order = {name: index for index, name in enumerate(LOTTERY_WEEKDAY_NAMES)}
    time_order = {"18:00-20:00": 0, "20:00-22:00": 1}
    court_order = {court: index for index, court in enumerate(LOTTERY_COURTS)}

    for item in pool_histories.values():
        attempts = len(item["records"])
        total_bids = sum(record["bids"] for record in item["records"])
        total_wins = sum(record["wins"] for record in item["records"])
        posterior = compute_pool_posterior(item["records"], selected_prior)
        mean_base_tickets = posterior_mean(posterior)
        base_entropy = posterior_entropy(posterior)
        pool_summary = {
            "weekday": item["weekday"],
            "time": item["time"],
            "court": item["court"],
            "total_bids": total_bids,
            "total_wins": total_wins,
            "attempts": attempts,
            "win_rate": round((total_wins / attempts * 100) if attempts else 0, 1),
            "ticket_rate": round((total_wins / total_bids * 100) if total_bids else 0, 1),
            "avg_bids": round((total_bids / attempts) if attempts else 0, 1),
            "estimated_pool_tickets": round(mean_base_tickets, 1),
            "posterior_mean_base_tickets": round(mean_base_tickets, 1),
            "posterior_stddev": round(posterior_stddev(posterior), 2),
            "posterior_map_base_tickets": posterior_map(posterior),
            "credible_interval": posterior_credible_interval(posterior),
            "posterior_entropy": round(base_entropy, 4),
            "ticket_probability": round(predictive_win_probability_from_posterior(posterior, 1) * 100, 1),
            "predictive_win_probability_by_tickets": {
                str(bids): round(predictive_win_probability_from_posterior(posterior, bids) * 100, 1)
                for bids in range(1, 6)
            },
            "expected_information_gain_by_tickets": {
                str(bids): round(expected_information_gain(item["records"], selected_prior, bids), 4)
                for bids in range(1, 6)
            },
            "relative_information_gain_percent_by_tickets": {
                str(bids): round(relative_information_gain_percent(item["records"], selected_prior, bids), 3)
                for bids in range(1, 6)
            },
            "history": [
                {
                    "month_id": record["month_id"],
                    "date": record["date"],
                    "bids": record["bids"],
                    "wins": record["wins"],
                }
                for record in item["records"]
            ],
        }
        results.append(pool_summary)

    results.sort(key=lambda item: (weekday_order[item["weekday"]], time_order[item["time"]], court_order[item["court"]]))
    return {
        "selected_model": selected_model,
        "candidate_models": [
            {"name": name, "score": round(score, 4)}
            for name, score in sorted(model_scores.items(), key=lambda entry: entry[1], reverse=True)
        ],
        "pool_summaries": results,
        "prior_support_max": max_base_tickets,
    }


def build_probability_summary_bundle(month_ids):
    normalized_month_ids = [month_id for month_id in (normalize_month_id(value) for value in (month_ids or [])) if month_id]
    version = get_lottery_analysis_version()
    cache_key = build_system_cache_key(
        LOTTERY_ANALYSIS_CACHE_PREFIX,
        {
            "version": version,
            "month_ids": normalized_month_ids,
        },
    )
    cached = get_cached_system_json(cache_key, None)
    if cached:
        return cached

    records, skipped_months = build_probability_records(normalized_month_ids)
    payload = {
        "months_used": [month_id for month_id in normalized_month_ids if month_id not in skipped_months],
        "skipped_months": skipped_months,
        "summary": summarize_probability_records(records),
    }
    set_cached_system_json(cache_key, payload)
    return payload


def build_uniform_average_probability_summary(probability_summary):
    source_items = list((probability_summary or {}).get("pool_summaries", []))
    if not source_items:
        return {
            "selected_model": "uniform",
            "candidate_models": [],
            "pool_summaries": [],
            "prior_support_max": 40,
        }

    predictive_keys = [str(index) for index in range(1, 6)]
    mean_base = round(sum(float(item.get("posterior_mean_base_tickets") or 0) for item in source_items) / len(source_items), 1)
    stddev = round(sum(float(item.get("posterior_stddev") or 0) for item in source_items) / len(source_items), 2)
    total_bids = int(round(sum(float(item.get("total_bids") or 0) for item in source_items) / len(source_items)))
    total_wins = int(round(sum(float(item.get("total_wins") or 0) for item in source_items) / len(source_items)))
    attempts = int(round(sum(float(item.get("attempts") or 0) for item in source_items) / len(source_items)))
    posterior_entropy = round(sum(float(item.get("posterior_entropy") or 0) for item in source_items) / len(source_items), 4)
    predictive = {}
    info_gain = {}
    relative_info_gain = {}
    for key in predictive_keys:
        predictive[key] = round(
            sum(float((item.get("predictive_win_probability_by_tickets") or {}).get(key, 0)) for item in source_items) / len(source_items),
            1,
        )
        info_gain[key] = round(
            sum(float((item.get("expected_information_gain_by_tickets") or {}).get(key, 0)) for item in source_items) / len(source_items),
            4,
        )
        relative_info_gain[key] = round(
            sum(float((item.get("relative_information_gain_percent_by_tickets") or {}).get(key, 0)) for item in source_items) / len(source_items),
            3,
        )
    interval_lows = [int((item.get("credible_interval") or {}).get("low", 0)) for item in source_items]
    interval_highs = [int((item.get("credible_interval") or {}).get("high", 0)) for item in source_items]
    averaged_item = {
        "posterior_mean_base_tickets": mean_base,
        "posterior_stddev": stddev,
        "credible_interval": {"low": min(interval_lows), "high": max(interval_highs), "mass": 0.8},
        "predictive_win_probability_by_tickets": predictive,
        "expected_information_gain_by_tickets": info_gain,
        "relative_information_gain_percent_by_tickets": relative_info_gain,
        "total_bids": total_bids,
        "total_wins": total_wins,
        "attempts": attempts,
        "posterior_entropy": posterior_entropy,
        "win_rate": round((total_wins / attempts * 100) if attempts else 0, 1),
        "ticket_rate": round((total_wins / total_bids * 100) if total_bids else 0, 1),
        "avg_bids": round((total_bids / attempts) if attempts else 0, 1),
        "estimated_pool_tickets": mean_base,
        "posterior_map_base_tickets": int(round(mean_base)),
        "ticket_probability": predictive.get("1", 0),
    }

    replicated_items = []
    for weekday in LOTTERY_WEEKDAY_NAMES:
        for time_label in LOTTERY_TIMES.values():
            for court in LOTTERY_COURTS:
                item = dict(averaged_item)
                item["weekday"] = weekday
                item["time"] = time_label
                item["court"] = court
                replicated_items.append(item)

    return {
        "selected_model": (probability_summary or {}).get("selected_model", "uniform"),
        "candidate_models": list((probability_summary or {}).get("candidate_models", [])),
        "pool_summaries": replicated_items,
        "prior_support_max": (probability_summary or {}).get("prior_support_max", 40),
    }


def build_lottery_bids_month_summary():
    version = get_lottery_analysis_version()
    cache_key = build_system_cache_key(LOTTERY_MONTH_SUMMARY_CACHE_PREFIX, {"version": version})
    cached = get_cached_system_json(cache_key, None)
    if cached:
        return cached

    summary = []
    month_ids = sorted(
        set(fetch_existing_month_ids("lottery_bids")) | set(fetch_existing_month_ids("court_status")),
        reverse=True,
    )
    for month_id in month_ids:
        bid_content = fetch_month_content("lottery_bids", month_id)
        court_content = fetch_month_content("court_status", month_id)
        bid_rows = build_lottery_month_rows(month_id, parse_json_array(bid_content)) if bid_content is not None else []
        court_rows = parse_court_status_rows(court_content) if court_content is not None else []
        summary.append(
            {
                "month_id": month_id,
                "total_bids": count_lottery_bids(bid_rows),
                "has_bid_data": len(bid_rows) > 0,
                "has_court_data": len(court_rows) > 0,
            }
        )

    payload = {"months": summary}
    set_cached_system_json(cache_key, payload)
    return payload


def build_account_bid_plan(target_month):
    normalized_month = normalize_month_id(target_month)
    if not normalized_month:
        return {
            "target_month": target_month,
            "accounts": [],
            "total_tickets": 0,
            "unassigned_tickets": [],
            "status": "invalid_month",
            "message": "Invalid target month.",
        }

    saved_content = fetch_month_content("lottery_bids", normalized_month)
    rows = build_lottery_month_rows(normalized_month, parse_json_array(saved_content))
    ticket_requests = []
    total_tickets = 0

    for row in rows:
        date_value = row.get("date")
        if not date_value:
            continue
        weekday_name = LOTTERY_WEEKDAY_NAMES[datetime.strptime(date_value, "%Y-%m-%d").weekday()]
        for slot_key, time_label in LOTTERY_TIMES.items():
            slot_data = normalize_lottery_slot(row.get(slot_key) or {})
            for court in LOTTERY_COURTS:
                tickets = max(int(slot_data.get(court, 0) or 0), 0)
                if tickets <= 0:
                    continue
                ticket_requests.append(
                    {
                        "date": date_value,
                        "weekday": weekday_name,
                        "time": time_label,
                        "court": court,
                        "tickets": tickets,
                    }
                )
                total_tickets += tickets

    account_state = {
        name: {
            "account": name,
            "capacity": 10,
            "tickets_used": 0,
            "assignments": [],
            "slot_counts": {},
        }
        for name in LOTTERY_ACCOUNT_NAMES
    }
    unassigned_tickets = []

    ticket_requests.sort(key=lambda item: (-item["tickets"], item["date"], item["time"], LOTTERY_COURTS.index(item["court"])))

    for request in ticket_requests:
        slot_key = f"{request['date']}|{request['time']}"
        eligible_accounts = [
            state for state in account_state.values()
            if state["tickets_used"] < state["capacity"]
        ]
        eligible_accounts.sort(
            key=lambda state: (
                state["tickets_used"],
                state["slot_counts"].get(slot_key, 0),
                state["account"],
            )
        )
        assigned_accounts = eligible_accounts[: request["tickets"]]
        assigned_count = len(assigned_accounts)

        for state in assigned_accounts:
            state["tickets_used"] += 1
            state["slot_counts"][slot_key] = state["slot_counts"].get(slot_key, 0) + 1
            state["assignments"].append(
                {
                    "date": request["date"],
                    "weekday": request["weekday"],
                    "time": request["time"],
                    "court": request["court"],
                }
            )

        if assigned_count < request["tickets"]:
            unassigned_tickets.append(
                {
                    "date": request["date"],
                    "weekday": request["weekday"],
                    "time": request["time"],
                    "court": request["court"],
                    "unassigned_count": request["tickets"] - assigned_count,
                }
            )

    accounts = []
    for name in LOTTERY_ACCOUNT_NAMES:
        state = account_state[name]
        state["assignments"].sort(key=lambda item: (item["date"], 0 if item["time"] == "18:00-20:00" else 1, LOTTERY_COURTS.index(item["court"])))
        accounts.append(
            {
                "account": name,
                "tickets_used": state["tickets_used"],
                "remaining_capacity": state["capacity"] - state["tickets_used"],
                "assignments": state["assignments"],
            }
        )

    status = "ok"
    message = ""
    if total_tickets == 0:
        status = "empty"
        message = "目標月份目前還沒有輸入投籤紀錄。"
    elif unassigned_tickets:
        status = "partial"
        message = "部分投籤超出五個帳號總容量或分配限制，仍有未分配的籤。"

    return {
        "target_month": normalized_month,
        "accounts": accounts,
        "total_tickets": total_tickets,
        "unassigned_tickets": unassigned_tickets,
        "status": status,
        "message": message,
    }


def build_candidate_pools(target_month, probability_summary, weekdays=None, include_dates=None, exclude_dates=None, courts=None):
    month_id = normalize_month_id(target_month)
    if not month_id:
        return []

    selected_weekdays = weekdays or list(range(7))
    selected_courts = list(courts or LOTTERY_COURTS)
    included_date_set = {normalize_court_date_value(value) for value in (include_dates or []) if normalize_court_date_value(value)}
    excluded_date_set = {normalize_court_date_value(value) for value in (exclude_dates or []) if normalize_court_date_value(value)}
    pool_summaries = list((probability_summary or {}).get("pool_summaries", []))
    summary_map = {
        (item["weekday"], item["time"], item["court"]): item
        for item in pool_summaries
    }
    time_court_map = {}
    court_map = {}
    global_fallback = None

    def average_summary(items, fallback_source="aggregate"):
        predictive_keys = [str(index) for index in range(1, 6)]
        mean_base = round(sum(float(entry.get("posterior_mean_base_tickets") or 0) for entry in items) / len(items), 1)
        stddev = round(sum(float(entry.get("posterior_stddev") or 0) for entry in items) / len(items), 2)
        total_bids = int(round(sum(float(entry.get("total_bids") or 0) for entry in items) / len(items)))
        total_wins = int(round(sum(float(entry.get("total_wins") or 0) for entry in items) / len(items)))
        attempts = int(round(sum(float(entry.get("attempts") or 0) for entry in items) / len(items)))
        posterior_entropy = round(sum(float(entry.get("posterior_entropy") or 0) for entry in items) / len(items), 4)
        predictive = {}
        info_gain = {}
        relative_info_gain = {}
        for key in predictive_keys:
            values = [float((entry.get("predictive_win_probability_by_tickets") or {}).get(key, 0)) for entry in items]
            predictive[key] = round(sum(values) / len(values), 1)
            gain_values = [float((entry.get("expected_information_gain_by_tickets") or {}).get(key, 0)) for entry in items]
            info_gain[key] = round(sum(gain_values) / len(gain_values), 4)
            relative_gain_values = [float((entry.get("relative_information_gain_percent_by_tickets") or {}).get(key, 0)) for entry in items]
            relative_info_gain[key] = round(sum(relative_gain_values) / len(relative_gain_values), 3)
        lows = [int((entry.get("credible_interval") or {}).get("low", 0)) for entry in items]
        highs = [int((entry.get("credible_interval") or {}).get("high", 0)) for entry in items]
        return {
            "posterior_mean_base_tickets": mean_base,
            "posterior_stddev": stddev,
            "credible_interval": {"low": min(lows), "high": max(highs), "mass": 0.8},
            "posterior_entropy": posterior_entropy,
            "predictive_win_probability_by_tickets": predictive,
            "expected_information_gain_by_tickets": info_gain,
            "relative_information_gain_percent_by_tickets": relative_info_gain,
            "total_bids": total_bids,
            "total_wins": total_wins,
            "attempts": attempts,
            "fallback_source": fallback_source,
        }

    def make_candidate_pool(date_key, weekday_name, time_label, court, summary, fallback_source=None):
        return {
            "pool_id": f"{date_key}|{time_label}|{court}",
            "date": date_key,
            "weekday": weekday_name,
            "time": time_label,
            "court": court,
            "template_key": f"{weekday_name}|{time_label}|{court}",
            "posterior_mean_base_tickets": summary["posterior_mean_base_tickets"],
            "posterior_stddev": summary["posterior_stddev"],
            "credible_interval": summary["credible_interval"],
            "posterior_entropy": summary.get("posterior_entropy", 0),
            "predictive_win_probability_by_tickets": summary["predictive_win_probability_by_tickets"],
            "expected_information_gain_by_tickets": summary["expected_information_gain_by_tickets"],
            "relative_information_gain_percent_by_tickets": summary.get("relative_information_gain_percent_by_tickets", {}),
            "total_bids": summary["total_bids"],
            "total_wins": summary["total_wins"],
            "attempts": summary["attempts"],
            "fallback_source": fallback_source or summary.get("fallback_source", "exact"),
        }

    if pool_summaries:
        grouped_time_court = {}
        grouped_court = {}
        for item in pool_summaries:
            grouped_time_court.setdefault((item["time"], item["court"]), []).append(item)
            grouped_court.setdefault(item["court"], []).append(item)

        for key, items in grouped_time_court.items():
            time_court_map[key] = average_summary(items, fallback_source="time_court")
        for key, items in grouped_court.items():
            court_map[key] = average_summary(items, fallback_source="court")
        global_fallback = average_summary(pool_summaries, fallback_source="global")
    year, month = map(int, month_id.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    candidate_pools = []
    pending_pools = []

    for day in range(1, last_day + 1):
        date_obj = date(year, month, day)
        weekday_num = date_obj.weekday()
        date_key = f"{year}-{month:02d}-{day:02d}"
        if date_key in excluded_date_set:
            continue
        if weekday_num not in selected_weekdays and date_key not in included_date_set:
            continue
        weekday_name = LOTTERY_WEEKDAY_NAMES[weekday_num]

        for time_label in LOTTERY_TIMES.values():
            for court in selected_courts:
                summary = summary_map.get((weekday_name, time_label, court))
                if summary:
                    candidate_pools.append(make_candidate_pool(date_key, weekday_name, time_label, court, summary, fallback_source="exact"))
                    continue
                pending_pools.append(
                    {
                        "date": date_key,
                        "weekday": weekday_name,
                        "time": time_label,
                        "court": court,
                    }
                )

    exact_slot_groups = {}
    exact_court_groups = {}
    for pool in candidate_pools:
        if pool.get("fallback_source") != "exact":
            continue
        exact_slot_groups.setdefault((pool["date"], pool["time"]), []).append(pool)
        exact_court_groups.setdefault(pool["court"], []).append(pool)

    for pending in pending_pools:
        summary = None
        fallback_source = None
        same_slot_items = exact_slot_groups.get((pending["date"], pending["time"]), [])
        if same_slot_items:
            summary = average_summary(same_slot_items, fallback_source="same_day_time")
            fallback_source = "same_day_time"
        if not summary:
            same_court_items = exact_court_groups.get(pending["court"], [])
            if same_court_items:
                summary = average_summary(same_court_items, fallback_source="same_court")
                fallback_source = "same_court"
        if not summary:
            summary = time_court_map.get((pending["time"], pending["court"]))
            fallback_source = "time_court" if summary else fallback_source
        if not summary:
            summary = court_map.get(pending["court"])
            fallback_source = "court" if summary else fallback_source
        if not summary:
            summary = global_fallback
            fallback_source = "global" if summary else fallback_source
        if not summary:
            continue
        candidate_pools.append(
            make_candidate_pool(
                pending["date"],
                pending["weekday"],
                pending["time"],
                pending["court"],
                summary,
                fallback_source=fallback_source,
            )
        )

    candidate_pools.sort(key=lambda item: (item["date"], 0 if item["time"] == "18:00-20:00" else 1, LOTTERY_COURTS.index(item["court"])))
    return candidate_pools


def get_pool_win_probability(pool, tickets):
    predictive_map = pool.get("predictive_win_probability_by_tickets", {})
    if tickets <= 0:
        return 0.0
    return float(predictive_map.get(str(tickets), 0)) / 100.0


def compute_time_balance_score(time_to_slot_success, time_weights=None):
    time_weights = time_weights or {}
    normalized_time_weights = {
        time_label: max(float(time_weights.get(time_label, 1.0)), 0.0001)
        for time_label in LOTTERY_TIMES.values()
    }
    total_success = sum(float(value) for value in (time_to_slot_success or {}).values())
    if total_success <= 0:
        return 0.0
    total_weight = sum(normalized_time_weights.values()) or 1.0
    penalty = 0.0
    for time_label in LOTTERY_TIMES.values():
        desired_share = normalized_time_weights[time_label] / total_weight
        actual_share = float((time_to_slot_success or {}).get(time_label, 0.0)) / total_success
        penalty += abs(actual_share - desired_share)
    return -penalty


def evaluate_allocation_metrics(candidate_pools, allocations, time_weights=None):
    time_weights = time_weights or {}
    expected_total_wins = 0.0
    date_to_lose_probability = {}
    slot_to_lose_probability = {}
    time_to_slot_success = {time_label: 0.0 for time_label in LOTTERY_TIMES.values()}
    expected_weighted_winning_slots = 0.0
    expected_weighted_total_wins = 0.0
    active_pool_count = 0
    for pool, tickets in zip(candidate_pools, allocations):
        win_probability = get_pool_win_probability(pool, tickets)
        expected_total_wins += win_probability
        weight = float(time_weights.get(pool["time"], 1.0))
        expected_weighted_total_wins += win_probability * weight
        if tickets > 0:
            active_pool_count += 1
        date_key = pool["date"]
        slot_key = f"{pool['date']}|{pool['time']}"
        date_to_lose_probability.setdefault(date_key, 1.0)
        date_to_lose_probability[date_key] *= (1 - win_probability)
        slot_to_lose_probability.setdefault(slot_key, 1.0)
        slot_to_lose_probability[slot_key] *= (1 - win_probability)

    expected_winning_days = sum(1 - lose_probability for lose_probability in date_to_lose_probability.values())
    expected_winning_slots = 0.0
    for slot_key, lose_probability in slot_to_lose_probability.items():
        _date_key, time_label = slot_key.split("|", 1)
        weight = float(time_weights.get(time_label, 1.0))
        slot_win_probability = 1 - lose_probability
        expected_winning_slots += slot_win_probability
        expected_weighted_winning_slots += slot_win_probability * weight
        time_to_slot_success[time_label] = time_to_slot_success.get(time_label, 0.0) + slot_win_probability
    probability_at_least_one_win = 1 - math.prod(date_to_lose_probability.values()) if date_to_lose_probability else 0.0
    return {
        "expected_winning_days": expected_winning_days,
        "expected_winning_slots": expected_winning_slots,
        "expected_weighted_winning_slots": expected_weighted_winning_slots,
        "expected_total_wins": expected_total_wins,
        "expected_weighted_total_wins": expected_weighted_total_wins,
        "time_to_slot_success": time_to_slot_success,
        "time_balance_score": compute_time_balance_score(time_to_slot_success, time_weights),
        "active_pool_count": active_pool_count,
        "probability_at_least_one_win": probability_at_least_one_win,
    }


def optimize_pool_allocations(candidate_pools, total_tickets, top_n=5, per_pool_cap=5, time_weights=None, beam_width=120):
    total_tickets = max(int(total_tickets or 0), 0)
    time_weights = time_weights or {}
    if not candidate_pools:
        return {"recommended_allocation": None, "alternatives": []}

    def build_state_score_tuple(item):
        return (
            item["expected_winning_days"],
            item["expected_weighted_winning_slots"],
            item["expected_weighted_total_wins"],
            item["expected_winning_slots"],
            item["expected_total_wins"],
            item["time_balance_score"],
            item["active_pool_count"],
            item["probability_at_least_one_win"],
        )

    total_slots = len({(pool["date"], pool["time"]) for pool in candidate_pools})
    if total_slots > 24 or len(candidate_pools) > 72 or total_tickets > 24:
        allocations = [0] * len(candidate_pools)
        best_metrics = evaluate_allocation_metrics(candidate_pools, allocations, time_weights)

        for _ in range(total_tickets):
            best_choice = None
            best_choice_metrics = None
            best_choice_score = None
            for index, current_tickets in enumerate(allocations):
                if current_tickets >= per_pool_cap:
                    continue
                trial_allocations = list(allocations)
                trial_allocations[index] += 1
                trial_metrics = evaluate_allocation_metrics(candidate_pools, trial_allocations, time_weights)
                trial_score = build_state_score_tuple(trial_metrics)
                if best_choice is None or trial_score > best_choice_score:
                    best_choice = index
                    best_choice_metrics = trial_metrics
                    best_choice_score = trial_score
            if best_choice is None:
                break
            allocations[best_choice] += 1
            best_metrics = best_choice_metrics

        recommended = {
            "rank": 1,
            "allocation_vector": allocations,
            "expected_winning_days": round(best_metrics["expected_winning_days"], 2),
            "expected_winning_slots": round(best_metrics["expected_winning_slots"], 2),
            "expected_weighted_winning_slots": round(best_metrics["expected_weighted_winning_slots"], 2),
            "expected_total_wins": round(best_metrics["expected_total_wins"], 2),
            "expected_weighted_total_wins": round(best_metrics["expected_weighted_total_wins"], 2),
            "active_pool_count": best_metrics["active_pool_count"],
            "probability_at_least_one_win": round(best_metrics["probability_at_least_one_win"] * 100, 1),
            "allocation_by_pool": [
                {
                    "pool_id": pool["pool_id"],
                    "date": pool["date"],
                    "weekday": pool["weekday"],
                    "time": pool["time"],
                    "court": pool["court"],
                    "tickets": tickets,
                }
                for pool, tickets in zip(candidate_pools, allocations)
                if tickets > 0
            ],
        }
        return {"recommended_allocation": recommended, "alternatives": [recommended]}

    def build_slot_option_score_tuple(item):
        return (
            item["slot_win_probability"] * item["slot_weight"],
            item["expected_weighted_total_wins"],
            item["slot_win_probability"],
            item["expected_total_wins"],
            item["active_pool_count"],
        )

    pools_by_slot = {}
    for index, pool in enumerate(candidate_pools):
        slot_key = (pool["date"], pool["time"])
        pools_by_slot.setdefault(slot_key, []).append((index, pool))

    slot_options = []
    for slot_key in sorted(pools_by_slot.keys()):
        slot_pools = pools_by_slot[slot_key]
        options = []
        slot_date, slot_time = slot_key
        slot_weight = float(time_weights.get(slot_time, 1.0))

        def enumerate_allocations(position, remaining_tickets, current_allocations):
            if position >= len(slot_pools):
                tickets_used = sum(tickets for _, tickets in current_allocations)
                slot_lose_probability = 1.0
                expected_total_wins = 0.0
                active_pool_count = 0
                allocation_items = []
                for pool_index, tickets in current_allocations:
                    if tickets <= 0:
                        continue
                    pool = candidate_pools[pool_index]
                    win_probability = get_pool_win_probability(pool, tickets)
                    slot_lose_probability *= (1 - win_probability)
                    expected_total_wins += win_probability
                    active_pool_count += 1
                    allocation_items.append((pool_index, tickets))
                slot_win_probability = 1 - slot_lose_probability
                options.append(
                    {
                        "tickets_used": tickets_used,
                        "slot_date": slot_date,
                        "slot_time": slot_time,
                        "slot_weight": slot_weight,
                        "slot_lose_probability": slot_lose_probability,
                        "slot_win_probability": slot_win_probability,
                        "allocation_items": allocation_items,
                        "expected_total_wins": expected_total_wins,
                        "expected_weighted_total_wins": expected_total_wins * slot_weight,
                        "active_pool_count": active_pool_count,
                    }
                )
                return

            pool_index, _pool = slot_pools[position]
            for tickets in range(min(per_pool_cap, remaining_tickets) + 1):
                enumerate_allocations(position + 1, remaining_tickets - tickets, current_allocations + [(pool_index, tickets)])

        enumerate_allocations(0, total_tickets, [])
        per_ticket_best = {}
        for option in options:
            key = option["tickets_used"]
            current_best = per_ticket_best.get(key)
            score_tuple = build_slot_option_score_tuple(option)
            if not current_best or score_tuple > build_slot_option_score_tuple(current_best):
                per_ticket_best[key] = option
        slot_options.append([per_ticket_best[key] for key in sorted(per_ticket_best.keys())])

    states = {
        0: [
            {
                "allocations": {},
                "date_to_lose_probability": {},
                "time_to_slot_success": {time_label: 0.0 for time_label in LOTTERY_TIMES.values()},
                "expected_winning_days": 0.0,
                "expected_winning_slots": 0.0,
                "expected_weighted_winning_slots": 0.0,
                "expected_total_wins": 0.0,
                "expected_weighted_total_wins": 0.0,
                "time_balance_score": 0.0,
                "active_pool_count": 0,
                "all_days_lose_probability": 1.0,
                "probability_at_least_one_win": 0.0,
            }
        ]
    }
    for options in slot_options:
        next_states = {}
        for used_tickets, entries in states.items():
            for entry in entries:
                for option in options:
                    new_total = used_tickets + option["tickets_used"]
                    if new_total > total_tickets:
                        continue
                    previous_day_lose_probability = entry["date_to_lose_probability"].get(option["slot_date"], 1.0)
                    next_day_lose_probability = previous_day_lose_probability * option["slot_lose_probability"]
                    next_date_to_lose_probability = dict(entry["date_to_lose_probability"])
                    next_date_to_lose_probability[option["slot_date"]] = next_day_lose_probability
                    combined_allocations = dict(entry["allocations"])
                    for pool_index, tickets in option["allocation_items"]:
                        combined_allocations[pool_index] = tickets
                    next_time_to_slot_success = dict(entry["time_to_slot_success"])
                    next_time_to_slot_success[option["slot_time"]] = next_time_to_slot_success.get(option["slot_time"], 0.0) + option["slot_win_probability"]
                    expected_winning_days = (
                        entry["expected_winning_days"]
                        - (1 - previous_day_lose_probability)
                        + (1 - next_day_lose_probability)
                    )
                    candidate_entry = {
                        "allocations": combined_allocations,
                        "date_to_lose_probability": next_date_to_lose_probability,
                        "time_to_slot_success": next_time_to_slot_success,
                        "expected_winning_days": expected_winning_days,
                        "expected_winning_slots": entry["expected_winning_slots"] + option["slot_win_probability"],
                        "expected_weighted_winning_slots": entry["expected_weighted_winning_slots"] + (option["slot_win_probability"] * option["slot_weight"]),
                        "expected_total_wins": entry["expected_total_wins"] + option["expected_total_wins"],
                        "expected_weighted_total_wins": entry["expected_weighted_total_wins"] + option["expected_weighted_total_wins"],
                        "time_balance_score": 0.0,
                        "active_pool_count": entry["active_pool_count"] + option["active_pool_count"],
                        "all_days_lose_probability": entry["all_days_lose_probability"] / previous_day_lose_probability * next_day_lose_probability if previous_day_lose_probability > 0 else math.prod(next_date_to_lose_probability.values()),
                        "probability_at_least_one_win": 0.0,
                    }
                    candidate_entry["time_balance_score"] = compute_time_balance_score(next_time_to_slot_success)
                    candidate_entry["probability_at_least_one_win"] = 1 - candidate_entry["all_days_lose_probability"]
                    next_states.setdefault(new_total, []).append(candidate_entry)
        for used_tickets, entries in next_states.items():
            entries.sort(key=build_state_score_tuple, reverse=True)
            deduped = []
            seen = set()
            for item in entries:
                key = tuple(sorted(item["allocations"].items()))
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(item)
                if len(deduped) >= beam_width:
                    break
            next_states[used_tickets] = deduped
        states = next_states

    final_entries = states.get(total_tickets, [])
    if not final_entries:
        return {"recommended_allocation": None, "alternatives": []}

    final_entries.sort(key=build_state_score_tuple, reverse=True)

    alternatives = []
    for rank, entry in enumerate(final_entries[:top_n], start=1):
        allocation_vector = [entry["allocations"].get(index, 0) for index in range(len(candidate_pools))]
        alternatives.append(
            {
                "rank": rank,
                "allocation_vector": allocation_vector,
                "expected_winning_days": round(entry["expected_winning_days"], 2),
                "expected_winning_slots": round(entry["expected_winning_slots"], 2),
                "expected_weighted_winning_slots": round(entry["expected_weighted_winning_slots"], 2),
                "expected_total_wins": round(entry["expected_total_wins"], 2),
                "expected_weighted_total_wins": round(entry["expected_weighted_total_wins"], 2),
                "active_pool_count": entry["active_pool_count"],
                "probability_at_least_one_win": round(entry["probability_at_least_one_win"] * 100, 1),
                "allocation_by_pool": [
                    {
                        "pool_id": pool["pool_id"],
                        "date": pool["date"],
                        "weekday": pool["weekday"],
                        "time": pool["time"],
                        "court": pool["court"],
                        "tickets": tickets,
                    }
                    for pool, tickets in zip(candidate_pools, allocation_vector)
                    if tickets > 0
                ],
            }
        )

    recommended = alternatives[0]
    return {"recommended_allocation": recommended, "alternatives": alternatives}


def build_strategy_explanation(candidate_pools, recommended_allocation, second_best_allocation=None):
    if not recommended_allocation:
        return "No eligible pools are available for optimization."

    top_pools = sorted(recommended_allocation["allocation_by_pool"], key=lambda item: item["tickets"], reverse=True)[:3]
    if not top_pools:
        return "The optimizer recommends holding tickets because no pool had usable history."

    fragments = []
    for pool_entry in top_pools:
        matched_pool = next((pool for pool in candidate_pools if pool["pool_id"] == pool_entry["pool_id"]), None)
        if not matched_pool:
            continue
        fragments.append(
            f"{pool_entry['date']} {pool_entry['time']} {pool_entry['court']} "
            f"(base {matched_pool['posterior_mean_base_tickets']:.1f}, +/- {matched_pool['posterior_stddev']:.1f})"
        )

    explanation = "Recommended tickets prioritize spreading winning chances across more days, then improving each time-slot success rate, and finally increasing expected total court wins."
    if fragments:
        explanation += " Top weighted pools: " + "; ".join(fragments) + "."
    if second_best_allocation:
        day_gap = recommended_allocation["expected_winning_days"] - second_best_allocation["expected_winning_days"]
        slot_gap = recommended_allocation["expected_winning_slots"] - second_best_allocation["expected_winning_slots"]
        win_gap = recommended_allocation["expected_total_wins"] - second_best_allocation["expected_total_wins"]
        explanation += f" It beats the next alternative by {day_gap:.2f} expected winning days, {slot_gap:.2f} expected winning slots, and {win_gap:.2f} expected courts."
    return explanation


def build_strategy_plan(target_month, probability_summary, weekdays=None, include_dates=None, exclude_dates=None, courts=None, total_tickets=5, top_n=5, time_weights=None):
    candidate_pools = build_candidate_pools(
        target_month,
        probability_summary,
        weekdays=weekdays,
        include_dates=include_dates,
        exclude_dates=exclude_dates,
        courts=courts,
    )
    optimization = optimize_pool_allocations(candidate_pools, total_tickets=total_tickets, top_n=top_n, per_pool_cap=5, time_weights=time_weights)
    recommended = optimization["recommended_allocation"]
    alternatives = optimization["alternatives"]
    second_best = alternatives[1] if len(alternatives) > 1 else None
    explanation = build_strategy_explanation(candidate_pools, recommended, second_best)

    recommended_vector = recommended["allocation_vector"] if recommended else [0] * len(candidate_pools)
    candidate_rows = []
    for pool, recommended_tickets in zip(candidate_pools, recommended_vector):
        row = dict(pool)
        row["recommended_tickets"] = recommended_tickets
        row["recommended_win_probability"] = round(
            float((pool.get("predictive_win_probability_by_tickets") or {}).get(str(recommended_tickets), 0)),
            1,
        ) if recommended_tickets > 0 else 0.0
        candidate_rows.append(row)

    return {
        "available_tickets": total_tickets,
        "per_pool_cap": 5,
        "candidate_pools": candidate_rows,
        "recommended_allocation": recommended,
        "alternatives": alternatives,
        "explanation": explanation,
    }


def init_db():
    require_supabase()
    if settings.BOOTSTRAP_ADMIN_ENABLED:
        existing = sb_select_one("users", columns="id", filters=[("eq", "username", settings.BOOTSTRAP_ADMIN_USERNAME)])
        if not existing:
            hashed_pw = generate_password_hash(settings.BOOTSTRAP_ADMIN_PASSWORD)
            sb_insert(
                "users",
                {
                    "username": settings.BOOTSTRAP_ADMIN_USERNAME,
                    "password": hashed_pw,
                    "role": "captain",
                    "status": "approved",
                },
            )


init_db()
normalize_court_status_table()
init_menu_drills_table()


@app.route("/")
def index():
    return render_template(
        "index.html",
        server_today=date.today().isoformat(),
        static_asset_version=get_static_asset_version(),
    )


@app.route("/api/ping", methods=["GET", "HEAD"])
def ping():
    # Keep the response tiny for uptime checks and cron jobs.
    return "ok", 200, {"Content-Type": "text/plain; charset=utf-8"}

@app.route("/api/register", methods=["POST"])
def register():
    data = request.json or {}
    username = data.get("username")
    password = data.get("password")
    role = data.get("role")

    if not username or not password or not role:
        return jsonify({"error": "missing username, password, or role"}), 400

    hashed_pw = generate_password_hash(password)

    existing = sb_select_one("users", columns="id", filters=[("eq", "username", username)])
    if existing:
        return jsonify({"error": "user already exists"}), 400
    sb_insert("users", {"username": username, "password": hashed_pw, "role": role})
    return jsonify(
        {
            "status": "success",
            "message": "registration submitted; awaiting approval",
        }
    )


@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    username = data.get("username")
    password = data.get("password")

    user = sb_select_one("users", columns="password, role, status", filters=[("eq", "username", username)])
    if not user:
        return jsonify({"error": "user not found"}), 404

    db_password = user["password"]
    role = user["role"]
    status = user["status"]

    if not check_password_hash(db_password, password):
        return jsonify({"error": "invalid password"}), 401

    if status == "pending":
        return jsonify({"error": "account approval pending"}), 403
    if status == "rejected":
        return jsonify({"error": "account request rejected"}), 403

    return jsonify({"status": "success", "role": role, "username": username})

@app.route('/api/change_password', methods=['POST'])
def change_password():
    data = request.get_json()
    username = data.get('username')
    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not username or not old_password or not new_password:
        return jsonify({"error": "missing password fields"}), 400

    user = sb_select_one("users", columns="password", filters=[("eq", "username", username)])
    if not user:
        return jsonify({"error": "User not found."}), 404

    db_password = user["password"]
    if not check_password_hash(db_password, old_password):
        return jsonify({"error": "old password is incorrect"}), 401

    hashed_new_password = generate_password_hash(new_password)
    sb_update("users", {"password": hashed_new_password}, [("eq", "username", username)])
    return jsonify({"message": "password updated successfully"}), 200

@app.route("/api/pending_users", methods=["GET"])
def get_pending_users():
    records = sb_select("users", columns="id, username, role", filters=[("eq", "status", "pending")])
    users = [{"id": row["id"], "username": row["username"], "role": row["role"]} for row in records]
    return jsonify(users)


@app.route("/api/approve_user", methods=["POST"])
def approve_user():
    data = request.json or {}
    user_id = data.get("user_id")
    action = data.get("action")

    if not user_id or action not in ["approve", "reject"]:
        return jsonify({"error": "Invalid data."}), 400

    new_status = "approved" if action == "approve" else "rejected"

    sb_update("users", {"status": new_status}, [("eq", "id", user_id)])
    return jsonify({"status": "success", "message": f"User {action}d successfully."})


@app.route("/api/team_members", methods=["GET"])
def get_team_members():
    records = sb_select(
        "users",
        columns="id, username, role",
        filters=[("eq", "status", "approved"), ("neq", "username", settings.BOOTSTRAP_ADMIN_USERNAME)],
    )
    users = [{"id": row["id"], "username": row["username"], "role": row["role"]} for row in records]
    return jsonify(users)


@app.route("/api/update_role", methods=["POST"])
def update_role():
    data = request.json or {}
    user_id = data.get("user_id")
    new_role = data.get("new_role")

    if not user_id or new_role not in ["member", "captain"]:
        return jsonify({"error": "Invalid data."}), 400

    sb_update("users", {"role": new_role}, [("eq", "id", user_id)])
    return jsonify({"status": "success", "message": "Role updated successfully."})


@app.route("/api/delete_user", methods=["POST"])
def delete_user():
    data = request.json or {}
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "Invalid data."}), 400

    sb_delete("users", [("eq", "id", user_id)])
    return jsonify({"status": "success", "message": "User deleted successfully."})

@app.route('/api/announcements', methods=['GET', 'POST'])
def handle_announcements():
    if request.method == 'GET':
        default_content = "(Edit announcements here)"
        content = get_system_data_json("announcements", default_content)
        return jsonify({"content": content})

    if request.method == 'POST':
        data = request.get_json()
        new_content = data.get('content', '')
        set_system_data_json("announcements", new_content)
        return jsonify({"message": "Saved successfully"}), 200

@app.route('/api/footer', methods=['GET', 'POST'])
def handle_footer():
    default_footer_data = {
        'captainText': 'Captain',
        'captainLink': '#',
        'viceText': 'Vice Captain',
        'viceLink': '#',
        'igText': 'Follow IG',
        'igLink': '#'
    }
    
    if request.method == 'GET':
        footer_data = get_system_data_json("footer_data", default_footer_data)
        return jsonify(footer_data)

    if request.method == 'POST':
        new_data = request.get_json() or {}
        set_system_data_json("footer_data", new_data)
        return jsonify({"status": "success"}), 200
    
def ensure_default_video_section():
    row = sb_select_one("video_sections", columns="id", filters=[("eq", "title", "Imported Videos")])
    if row:
        return row["id"]
    inserted = sb_insert("video_sections", {"title": "Imported Videos", "notes_content": "[]"})
    return inserted[0]["id"]


def migrate_unsectioned_videos():
    unassigned = sb_select("videos", columns="id", filters=[("is", "section_id", "null")])
    if not unassigned:
        return
    default_section_id = ensure_default_video_section()
    for row in unassigned:
        sb_update("videos", {"section_id": default_section_id}, [("eq", "id", row["id"])])


@app.route("/api/video_sections", methods=["GET", "POST"])
def video_sections_api():
    if request.method == "POST":
        data = request.json or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Missing title"}), 400
        inserted = sb_insert("video_sections", {"title": title, "notes_content": "[]"})
        section_id = inserted[0]["id"]
        return jsonify({"status": "success", "id": section_id, "title": title})

    migrate_unsectioned_videos()
    saved_order = get_video_section_order()
    saved_video_item_orders = get_video_item_order_map()
    sections_rows = sb_select("video_sections", columns="id, title, notes_content, created_at", order_by="created_at", desc=True)
    videos_rows = sb_select("videos", columns="id, url, title, section_id", order_by="id", desc=True)
    sections = []
    section_map = {}
    for row in sections_rows:
        section_id = row["id"]
        notes_content = row.get("notes_content")
        try:
            notes = json.loads(notes_content or "[]")
        except json.JSONDecodeError:
            notes = []
        section = {
            "id": section_id,
            "title": row["title"],
            "notes": notes if isinstance(notes, list) else [],
            "created_at": row.get("created_at"),
            "videos": [],
        }
        section_map[section_id] = section
        sections.append(section)

    for row in videos_rows:
        section_id = row.get("section_id")
        if section_id in section_map and row.get("url"):
            section_map[section_id]["videos"].append(
                {"id": row["id"], "url": row["url"], "title": row.get("title") or ""}
            )

    for section in sections:
        section["videos"] = sort_items_by_saved_order(
            section.get("videos", []),
            saved_video_item_orders.get(str(section.get("id")), []),
        )

    return jsonify(sort_sections_by_saved_order(sections, saved_order))


@app.route("/api/video_sections/<int:section_id>", methods=["PUT", "DELETE"])
def update_or_delete_video_section(section_id):
    if request.method == "PUT":
        data = request.json or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Missing title"}), 400
        updated = sb_update("video_sections", {"title": title}, [("eq", "id", section_id)])
        return jsonify({"status": "success", "updated": bool(updated)})

    deleted_videos = sb_delete("videos", [("eq", "section_id", section_id)])
    deleted_sections = sb_delete("video_sections", [("eq", "id", section_id)])
    deleted = bool(deleted_videos or deleted_sections)
    return jsonify({"status": "success", "deleted": deleted})


@app.route("/api/video_sections/<int:section_id>/notes", methods=["POST"])
def save_video_section_notes(section_id):
    data = request.json or {}
    notes = data.get("notes", [])
    if not isinstance(notes, list):
        return jsonify({"error": "Invalid notes format"}), 400

    updated = sb_update(
        "video_sections",
        {"notes_content": dumps_json(notes)},
        [("eq", "id", section_id)],
    )
    return jsonify({"status": "success", "updated": bool(updated)})


@app.route("/add_video", methods=["POST"])
def add_video_api():
    data = request.json or {}
    video_url = (data.get("url") or "").strip()
    video_title = (data.get("title") or "").strip()
    section_id = data.get("section_id")
    youtube_resource = parse_youtube_resource(video_url)
    if not youtube_resource or not section_id:
        return jsonify({"status": "error", "error": "Please provide a valid YouTube link and section."}), 400

    sb_insert("videos", {"url": youtube_resource["url"], "title": video_title, "section_id": section_id})
    return jsonify({"status": "success", "kind": youtube_resource["kind"]})


@app.route("/delete_video", methods=["POST"])
def delete_video():
    data = request.json or {}
    video_id = data.get("id")
    if not video_id:
        return jsonify({"status": "error"}), 400

    sb_delete("videos", [("eq", "id", video_id)])
    return jsonify({"status": "success"})


@app.route("/api/team_resources", methods=["GET"])
def get_team_resources():
    role = (request.args.get("role") or "").strip().lower()
    payload = get_team_resources_payload()
    sections = filter_team_sections_by_role(payload.get("sections", []), role)
    return jsonify(sections)


@app.route("/api/video_sections/reorder", methods=["POST"])
def reorder_video_sections():
    data = request.json or {}
    order = data.get("order", [])
    if not isinstance(order, list):
        return jsonify({"error": "Invalid order format"}), 400
    save_video_section_order(order)
    return jsonify({"status": "success"})


@app.route("/api/video_sections/<int:section_id>/videos/reorder", methods=["POST"])
def reorder_video_items(section_id):
    data = request.json or {}
    order = data.get("order", [])
    if not isinstance(order, list):
        return jsonify({"error": "Invalid order format"}), 400

    valid_video_rows = sb_select("videos", columns="id", filters=[("eq", "section_id", section_id)])
    valid_video_ids = {int(row["id"]) for row in valid_video_rows if str(row.get("id", "")).isdigit()}
    normalized_order = [int(item) for item in order if str(item).isdigit() and int(item) in valid_video_ids]

    order_map = get_video_item_order_map()
    order_map[str(section_id)] = normalized_order
    save_video_item_order_map(order_map)
    return jsonify({"status": "success"})


@app.route("/api/video_improvement_goals", methods=["GET", "POST"])
def video_improvement_goals_api():
    payload = get_video_improvement_goals_payload()

    if request.method == "GET":
        viewer_username = (request.args.get("viewer_username") or "").strip()
        viewer_role = (request.args.get("viewer_role") or "").strip().lower()
        requested_username = (request.args.get("username") or viewer_username).strip()
        if not requested_username:
            return jsonify({"error": "Missing username"}), 400
        if viewer_role != "captain":
            requested_username = viewer_username
        values = payload["users"].get(
            requested_username,
            {"receive": "", "set": "", "spike": "", "serve": "", "other": "", "updated_at": ""},
        )
        return jsonify(
            {
                "username": requested_username,
                "goals": values,
            }
        )

    data = request.json or {}
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "Missing username"}), 400

    payload["users"][username] = {
        "receive": str(data.get("receive") or "").strip(),
        "set": str(data.get("set") or "").strip(),
        "spike": str(data.get("spike") or "").strip(),
        "serve": str(data.get("serve") or "").strip(),
        "other": str(data.get("other") or "").strip(),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    save_video_improvement_goals_payload(payload)
    return jsonify({"status": "success", "username": username, "goals": payload["users"][username]})


@app.route("/api/team_resources/sections", methods=["POST"])
def create_team_resource_section():
    data = request.json or {}
    title = (data.get("title") or "").strip()
    visibility = (data.get("visibility") or "captain").strip().lower()
    if not title:
        return jsonify({"error": "Missing title"}), 400
    if visibility not in TEAM_RESOURCE_VISIBILITIES:
        return jsonify({"error": "Invalid visibility"}), 400

    payload = get_team_resources_payload()
    section = {
        "id": str(uuid4()),
        "title": title,
        "visibility": visibility,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "notes": [],
        "resources": [],
    }
    payload["sections"] = [section, *(payload.get("sections") or [])]
    save_team_resources_payload(payload)
    return jsonify({"status": "success", "section": section})


@app.route("/api/team_resources/sections/<section_id>", methods=["PUT", "DELETE"])
def update_or_delete_team_resource_section(section_id):
    payload = get_team_resources_payload()
    if request.method == "PUT":
        data = request.json or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Missing title"}), 400
        updated = False
        for section in payload.get("sections") or []:
            if section.get("id") == section_id:
                section["title"] = title
                updated = True
                break
        if updated:
            save_team_resources_payload(payload)
        return jsonify({"status": "success", "updated": updated})

    sections = payload.get("sections") or []
    next_sections = [section for section in sections if section.get("id") != section_id]
    deleted = len(next_sections) != len(sections)
    payload["sections"] = next_sections
    save_team_resources_payload(payload)
    return jsonify({"status": "success", "deleted": deleted})


@app.route("/api/team_resources/sections/<section_id>/notes", methods=["POST"])
def save_team_resource_notes(section_id):
    data = request.json or {}
    notes = data.get("notes", [])
    if not isinstance(notes, list):
        return jsonify({"error": "Invalid notes format"}), 400

    payload = get_team_resources_payload()
    updated = False
    for section in payload.get("sections", []):
        if section.get("id") == section_id:
            section["notes"] = notes
            updated = True
            break

    if updated:
        save_team_resources_payload(payload)
    return jsonify({"status": "success", "updated": updated})


@app.route("/api/team_resources/items", methods=["POST"])
def add_team_resource_item():
    data = request.json or {}
    url = (data.get("url") or "").strip()
    title = (data.get("title") or "").strip()
    section_id = (data.get("section_id") or "").strip()
    if not section_id or not url:
        return jsonify({"error": "Missing section_id or url"}), 400
    if not is_allowed_team_resource_url(url):
        return jsonify({"error": "Only Google Docs, Google Sheets, Google Forms, or Notion links are allowed"}), 400

    payload = get_team_resources_payload()
    created_item = None
    for section in payload.get("sections", []):
        if section.get("id") == section_id:
            created_item = {
                "id": str(uuid4()),
                "title": title,
                "url": url,
                "created_at": datetime.now().isoformat(timespec="seconds"),
            }
            section["resources"] = [created_item, *(section.get("resources") or [])]
            break

    if created_item is None:
        return jsonify({"error": "Section not found"}), 404

    save_team_resources_payload(payload)
    return jsonify({"status": "success", "item": created_item})


@app.route("/api/team_resources/items/<item_id>", methods=["DELETE"])
def delete_team_resource_item(item_id):
    payload = get_team_resources_payload()
    deleted = False
    for section in payload.get("sections", []):
        resources = section.get("resources") or []
        next_resources = [item for item in resources if item.get("id") != item_id]
        if len(next_resources) != len(resources):
            section["resources"] = next_resources
            deleted = True
            break

    if deleted:
        save_team_resources_payload(payload)
    return jsonify({"status": "success", "deleted": deleted})


@app.route("/api/team_resources/reorder", methods=["POST"])
def reorder_team_resource_sections():
    data = request.json or {}
    order = data.get("order", [])
    if not isinstance(order, list):
        return jsonify({"error": "Invalid order format"}), 400

    payload = get_team_resources_payload()
    sections = payload.get("sections") or []
    section_map = {str(section.get("id")): section for section in sections}
    ordered_sections = [section_map[section_id] for section_id in order if str(section_id) in section_map]
    remaining_sections = [section for section in sections if str(section.get("id")) not in set(str(item) for item in order)]
    payload["sections"] = ordered_sections + remaining_sections
    save_team_resources_payload(payload)
    return jsonify({"status": "success"})

@app.route("/api/court_status/<month_id>", methods=["GET", "DELETE"])
def get_court_status(month_id):
    requested_month = normalize_month_id(month_id)
    if not requested_month:
        return jsonify({"error": "Invalid month_id"}), 400

    if request.method == "DELETE":
        scope = (request.args.get("scope") or "all").strip().lower()
        deleted = False
        deleted = delete_display_court_status(requested_month) or deleted
        deleted = bool(sb_delete("court_status", [("eq", "month_id", requested_month)])) or deleted
        deleted = bool(sb_delete("court_status_history", [("eq", "month_id", requested_month)])) or deleted
        if scope != "court":
            deleted = bool(sb_delete("lottery_bids", [("eq", "month_id", requested_month)])) or deleted
            deleted = bool(sb_delete("lottery_bids_history", [("eq", "month_id", requested_month)])) or deleted
        if deleted:
            bump_lottery_analysis_version()
        return jsonify({"status": "success", "month_id": requested_month, "deleted": deleted, "scope": scope})

    content = get_display_court_status(requested_month) or "[]"

    return jsonify(
        {
            "month_id": requested_month,
            "content": content,
            "is_current_month": requested_month == get_month_id(0),
            "is_next_month": requested_month == get_month_id(1),
        }
    )


@app.route("/api/court_status", methods=["POST"])
def save_court_status():
    data = request.json or {}
    target_month = normalize_month_id(data.get("month_id"))
    content = data.get("content")

    if not target_month or content is None:
        return jsonify({"error": "Missing month_id or content"}), 400

    set_display_court_status(target_month, content)

    return jsonify({"status": "success", "month_id": target_month})


@app.route("/api/lottery_bids/<month_id>", methods=["GET", "DELETE"])
def get_lottery_bids(month_id):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return jsonify({"error": "Invalid month_id"}), 400

    if request.method == "DELETE":
        deleted = bool(sb_delete("lottery_bids", [("eq", "month_id", target_month)]))
        deleted = bool(sb_delete("lottery_bids_history", [("eq", "month_id", target_month)])) or deleted
        if deleted:
            bump_lottery_analysis_version()
        return jsonify({"status": "success", "month_id": target_month, "deleted": deleted})

    content = fetch_month_content("lottery_bids", target_month)
    rows = build_lottery_month_rows(target_month, parse_json_array(content))
    return jsonify({"month_id": target_month, "content": rows})


@app.route("/api/lottery_bids", methods=["POST"])
def save_lottery_bids():
    data = request.json or {}
    target_month = normalize_month_id(data.get("month_id"))
    content = data.get("content")

    if not target_month or content is None:
        return jsonify({"error": "Missing month_id or content"}), 400

    rows = build_lottery_month_rows(target_month, parse_json_array(content))
    normalized_content = json.dumps(rows, ensure_ascii=False)

    sb_upsert("lottery_bids", {"month_id": target_month, "content": normalized_content}, on_conflict="month_id")
    sb_insert("lottery_bids_history", {"month_id": target_month, "content": normalized_content, "source": "manual"})
    bump_lottery_analysis_version()

    return jsonify({"status": "success", "month_id": target_month})


@app.route("/api/lottery_bids_summary", methods=["GET"])
def get_lottery_bids_summary():
    try:
        return jsonify(build_lottery_bids_month_summary())
    except httpx.HTTPError as error:
        print(f"Failed to build lottery bids summary: {error}")
        return jsonify({"months": [], "error": "Unable to load lottery history right now."}), 503


@app.route("/api/lottery_dashboard", methods=["GET"])
def get_lottery_dashboard():
    start_month = normalize_month_id(request.args.get("start_month"))
    end_month = normalize_month_id(request.args.get("end_month"))
    target_month = normalize_month_id(request.args.get("target_month")) or get_month_id(1)
    strategy_weekday_values = request.args.getlist("strategy_weekday")
    strategy_weekdays = [int(value) for value in strategy_weekday_values if str(value).isdigit()]
    strategy_courts = [court for court in request.args.getlist("strategy_court") if court in LOTTERY_COURTS]
    strategy_include_dates = [normalize_court_date_value(value) for value in request.args.getlist("strategy_include_date")]
    strategy_exclude_dates = [normalize_court_date_value(value) for value in request.args.getlist("strategy_exclude_date")]
    strategy_include_dates = [value for value in strategy_include_dates if value]
    strategy_exclude_dates = [value for value in strategy_exclude_dates if value]
    try:
        strategy_ticket_budget = int(request.args.get("strategy_ticket_budget", 5))
    except (TypeError, ValueError):
        strategy_ticket_budget = 5
    strategy_ticket_budget = max(strategy_ticket_budget, 0)
    try:
        late_ratio = float(request.args.get("strategy_weight_ratio", 1.3))
    except (TypeError, ValueError):
        late_ratio = 1.3
    late_ratio = max(0.1, late_ratio)
    strategy_time_weights = {
        "18:00-20:00": 1.0,
        "20:00-22:00": late_ratio,
    }

    if not start_month:
        start_month = target_month
    if not end_month:
        end_month = target_month

    selected_month_ids = iterate_month_ids(start_month, end_month)
    selected_bundle = build_probability_summary_bundle(selected_month_ids)

    history_month_ids = sorted(set(fetch_existing_month_ids("lottery_bids")) | set(fetch_existing_month_ids("court_status")))
    all_bundle = build_probability_summary_bundle(history_month_ids)
    selected_has_history = bool((selected_bundle.get("summary") or {}).get("pool_summaries"))
    selected_effective_bundle = (
        selected_bundle
        if selected_has_history
        else {
            "months_used": selected_bundle.get("months_used", []),
            "skipped_months": selected_bundle.get("skipped_months", []),
            "summary": build_uniform_average_probability_summary(all_bundle.get("summary")),
        }
    )

    selected_strategy_plan = build_strategy_plan(
        target_month,
        selected_effective_bundle["summary"],
        weekdays=strategy_weekdays,
        include_dates=strategy_include_dates,
        exclude_dates=strategy_exclude_dates,
        courts=strategy_courts or LOTTERY_COURTS,
        total_tickets=strategy_ticket_budget,
        time_weights=strategy_time_weights,
    )
    all_time_strategy_plan = build_strategy_plan(
        target_month,
        all_bundle["summary"],
        weekdays=strategy_weekdays,
        include_dates=strategy_include_dates,
        exclude_dates=strategy_exclude_dates,
        courts=strategy_courts or LOTTERY_COURTS,
        total_tickets=strategy_ticket_budget,
        time_weights=strategy_time_weights,
    )
    account_bid_plan = build_account_bid_plan(target_month)

    return jsonify(
        {
            "selected": {
                "start_month": start_month,
                "end_month": end_month,
                "months_used": selected_bundle["months_used"],
                "skipped_months": selected_bundle["skipped_months"],
                "used_all_history_fallback": not selected_has_history,
                "stats": selected_effective_bundle["summary"]["pool_summaries"],
                "pool_summaries": selected_effective_bundle["summary"]["pool_summaries"],
                "model": {
                    "inference": "bayesian_discrete",
                    "selected_prior": selected_effective_bundle["summary"]["selected_model"],
                    "candidates": selected_effective_bundle["summary"]["candidate_models"],
                },
            },
            "all_time": {
                "months_used": all_bundle["months_used"],
                "skipped_months": all_bundle["skipped_months"],
                "stats": all_bundle["summary"]["pool_summaries"],
                "pool_summaries": all_bundle["summary"]["pool_summaries"],
                "model": {
                    "inference": "bayesian_discrete",
                    "selected_prior": all_bundle["summary"]["selected_model"],
                    "candidates": all_bundle["summary"]["candidate_models"],
                },
            },
            "strategy": {
                "target_month": target_month,
                "weights": strategy_time_weights,
                "account_bid_plan": account_bid_plan,
                "selected": {
                    **selected_strategy_plan,
                    "source": "selected",
                },
                "all_time": {
                    **all_time_strategy_plan,
                    "source": "all_time",
                },
            },
        }
    )


@app.route("/api/menu_data", methods=["GET"])
def get_menu_data():
    rows = fetch_menu_rows_from_db()
    return jsonify(
        {
            "count": len(rows),
            "filters": build_menu_filters(rows),
            "rows": rows,
        }
    )


@app.route("/api/menu_data", methods=["POST"])
def create_menu_item():
    try:
        row = normalize_menu_row_payload(request.json or {})
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    inserted = sb_insert(
        "menu_drills",
        {
            "name": row["name"],
            "focuses": serialize_menu_values(row["focuses"]),
            "people_count": row["people_count"],
            "court_modes": serialize_menu_values(row["court_modes"]),
            "complexities": serialize_menu_values(row["complexities"]),
            "fatigue_levels": serialize_menu_values(row["fatigue_levels"]),
            "difficulty_levels": serialize_menu_values(row["difficulty_levels"]),
            "updated_at": datetime.now().isoformat(),
        },
    )
    row["id"] = inserted[0]["id"]
    return jsonify({"status": "success", "item": row})


@app.route("/api/menu_data/import", methods=["POST"])
def import_menu_data():
    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "Please upload a CSV file."}), 400

    replace_existing = str(request.form.get("replace", "")).strip().lower() in {"1", "true", "yes", "on"}

    try:
        rows = load_rows_from_bytes(uploaded_file.read())
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    if not rows:
        return jsonify({"error": "The CSV does not contain any valid rows to import."}), 400

    if replace_existing:
        sb_delete("menu_drills", [("neq", "id", 0)])

    timestamp = datetime.now().isoformat()
    payload = []
    for row in rows:
        item = serialize_imported_menu_payload(row)
        item["updated_at"] = timestamp
        payload.append(item)

    batch_size = 200
    inserted_count = 0
    for start in range(0, len(payload), batch_size):
        chunk = payload[start : start + batch_size]
        sb_insert("menu_drills", chunk)
        inserted_count += len(chunk)

    return jsonify(
        {
            "status": "success",
            "count": inserted_count,
            "replaced": replace_existing,
            "filename": uploaded_file.filename,
        }
    )


@app.route("/api/menu_data/<int:item_id>", methods=["PUT", "DELETE"])
def update_or_delete_menu_item(item_id):
    if request.method == "DELETE":
        deleted = bool(sb_delete("menu_drills", [("eq", "id", item_id)]))
        return jsonify({"status": "success", "deleted": deleted, "id": item_id})

    try:
        row = normalize_menu_row_payload(request.json or {}, existing_id=item_id)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    updated = sb_update(
        "menu_drills",
        {
            "name": row["name"],
            "focuses": serialize_menu_values(row["focuses"]),
            "people_count": row["people_count"],
            "court_modes": serialize_menu_values(row["court_modes"]),
            "complexities": serialize_menu_values(row["complexities"]),
            "fatigue_levels": serialize_menu_values(row["fatigue_levels"]),
            "difficulty_levels": serialize_menu_values(row["difficulty_levels"]),
            "updated_at": datetime.now().isoformat(),
        },
        [("eq", "id", item_id)],
    )
    if not updated:
        return jsonify({"error": "Menu item not found."}), 404
    return jsonify({"status": "success", "item": row})


@app.route("/api/practice_menu", methods=["GET", "POST"])
def practice_menu():
    if request.method == "GET":
        value = get_system_data_json(
            "practice_menu",
            {"first_half": [], "second_half": [], "weekdays": [], "updated_at": ""},
        )
        value.setdefault("first_half", [])
        value.setdefault("second_half", [])
        value.setdefault("weekdays", [])
        value.setdefault("updated_at", "")
        return jsonify(value)

    data = request.json or {}
    payload = {
        "first_half": data.get("first_half", []),
        "second_half": data.get("second_half", []),
        "weekdays": data.get("weekdays", []),
        "updated_at": datetime.now().strftime("%Y-%m-%d"),
    }
    set_system_data_json("practice_menu", payload)
    return jsonify({"status": "success", "practice_menu": payload})

@app.route("/api/trigger_scrape", methods=["POST"])
def trigger_scrape():
    data = request.json or {}
    target_month = data.get("month_id")
    return start_scrape_thread(data, target_month)



@app.route("/api/scrape_status", methods=["GET"])
def get_scrape_status():
    return jsonify(get_system_data_json("scrape_status", {"status": "idle", "message": "", "target_month": ""}))


@app.route("/api/upload-photo", methods=["POST"])
def upload_photo():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400

    files = request.files.getlist("file")
    uploader = request.form.get("uploader", "Unknown")

    saved_files = []
    for file in files:
        if file.filename == "":
            continue

        filename = build_storage_key(file.filename)
        content = file.read()
        if not content:
            continue
        storage_upload(GALLERY_BUCKET, filename, content, file.mimetype or "application/octet-stream")
        sb_insert("gallery", {"filename": filename, "uploaded_by": uploader})
        saved_files.append(filename)

    if saved_files:
        current_order = get_gallery_photo_order()
        save_gallery_photo_order(saved_files + [item for item in current_order if item not in set(saved_files)])

    return jsonify(
        {
            "status": "success",
            "message": f"{len(saved_files)} files uploaded successfully.",
        }
    )


@app.route("/api/gallery", methods=["GET"])
def get_gallery():
    rows = sb_select("gallery", columns="filename, uploaded_date", order_by="id", desc=True)
    rows = sort_gallery_rows_by_saved_order(rows)
    photos = [
        {
            "filename": row["filename"],
            "src": f"{storage_public_url(GALLERY_BUCKET, row['filename'])}?v={row.get('uploaded_date', '')}",
        }
        for row in rows
        if row.get("filename")
    ]
    return jsonify(photos)


@app.route("/api/gallery/order", methods=["POST"])
def save_gallery_order():
    data = request.get_json() or {}
    requested_order = data.get("photos", [])
    known_rows = sb_select("gallery", columns="filename", order_by="id", desc=True)
    known_filenames = [row.get("filename") for row in known_rows if row.get("filename")]
    normalized = normalize_filename_list(requested_order, allowed=known_filenames)
    remaining = [filename for filename in known_filenames if filename not in set(normalized)]
    save_gallery_photo_order(normalized + remaining)
    return jsonify({"message": "Gallery order updated successfully"}), 200


@app.route("/api/delete-photo", methods=["POST"])
def delete_photo():
    data = request.json or {}
    filename = data.get("filename")

    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    sb_delete("gallery", [("eq", "filename", filename)])

    storage_remove(GALLERY_BUCKET, [filename])

    selected_photos = get_showcase_photos()
    if filename in selected_photos:
        selected_photos = [item for item in selected_photos if item != filename]
        set_showcase_photos(selected_photos)

    save_gallery_photo_order([item for item in get_gallery_photo_order() if item != filename])

    crop_map = get_showcase_crop_map()
    cropped_filename = crop_map.pop(filename, None)
    if cropped_filename:
        storage_remove(SHOWCASE_BUCKET, [cropped_filename])
        set_showcase_crop_map(crop_map)

    return jsonify({"status": "success", "message": "Photo deleted."})


@app.route('/api/showcase_photos', methods=['GET', 'POST'])
def handle_showcase_photos():
    if request.method == 'GET':
        return jsonify(sort_filenames_by_gallery_order(get_showcase_photos()))

    if request.method == 'POST':
        data = request.get_json() or {}
        selected_photos = normalize_filename_list(data.get('photos', []))
        set_showcase_photos(selected_photos)
        return jsonify({"message": "Showcase photos updated successfully"}), 200


@app.route('/api/showcase_photo_assets', methods=['GET'])
def get_showcase_photo_assets():
    selected_photos = sort_filenames_by_gallery_order(get_showcase_photos())
    crop_map = get_showcase_crop_map()
    gallery_rows = {
        row["filename"]: row
        for row in sb_select("gallery", columns="filename, uploaded_date")
        if row.get("filename")
    }
    assets = []
    for filename in selected_photos:
        if not filename or not isinstance(filename, str):
            print(f"Skipping invalid photo filename: {filename}")
            continue
        cropped_filename = crop_map.get(filename)
        if cropped_filename:
            src = storage_public_url(SHOWCASE_BUCKET, cropped_filename)
        else:
            row = gallery_rows.get(filename, {})
            src = f"{storage_public_url(GALLERY_BUCKET, filename)}?v={row.get('uploaded_date', '')}"
        assets.append({"filename": filename, "src": src})
    return jsonify(assets)


@app.route('/api/showcase_photo_crop', methods=['POST'])
def save_showcase_photo_crop():
    filename = request.form.get("filename", "").strip()
    file = request.files.get("crop")
    if not filename or file is None:
        return jsonify({"error": "Missing filename or crop file"}), 400

    safe_name = secure_filename(filename)
    base_name, _ = os.path.splitext(safe_name)
    crop_map = get_showcase_crop_map()
    previous_cropped_filename = crop_map.get(safe_name)
    if previous_cropped_filename:
        storage_remove(SHOWCASE_BUCKET, [previous_cropped_filename])
    cropped_filename = build_storage_key(f"{base_name}.jpg", suffix="showcase")
    content = file.read()
    if not content:
        return jsonify({"error": "Empty crop file"}), 400
    storage_upload(SHOWCASE_BUCKET, cropped_filename, content, file.mimetype or "image/jpeg")

    crop_map[safe_name] = cropped_filename
    set_showcase_crop_map(crop_map)
    return jsonify({"message": "Showcase crop saved", "src": storage_public_url(SHOWCASE_BUCKET, cropped_filename)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
