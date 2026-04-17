import calendar
import json
import sys
from pathlib import Path

from supabase import create_client


ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import config
import settings
from scraper import fetch_and_parse_schedule

supabase = (
    create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    if settings.SUPABASE_URL and settings.SUPABASE_KEY
    else None
)


def normalize_month_id(month_id):
    if not month_id:
        return None
    cleaned = str(month_id).strip().replace("/", "-")
    parts = [part for part in cleaned.split("-") if part]
    if len(parts) < 2:
        return cleaned
    return f"{parts[0]}-{parts[1].zfill(2)}"


def load_saved_court_status(month_id):
    target_month = normalize_month_id(month_id)
    if not target_month or supabase is None:
        return []

    response = supabase.table("court_status").select("content").eq("month_id", target_month).limit(1).execute()
    rows = response.data or []
    if not rows or not rows[0].get("content"):
        return []

    try:
        data = json.loads(rows[0]["content"])
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def resolve_runtime_payload():
    if len(sys.argv) <= 1:
        return {}

    try:
        payload = json.loads(sys.argv[1])
        return payload if isinstance(payload, dict) else {}
    except Exception as error:
        print(f"Error parsing web parameters: {error}")
        return {}


def apply_runtime_config(payload):
    month_id = normalize_month_id(payload.get("month_id"))
    if not month_id and payload.get("start_date"):
        month_id = normalize_month_id(str(payload["start_date"])[:7])
    if not month_id:
        month_id = normalize_month_id(config.start_date[:7])

    year, month = map(int, month_id.split("-"))
    _, last_day = calendar.monthrange(year, month)

    config.start_date = payload.get("start_date") or f"{year}-{month:02d}-01"
    config.end_date = payload.get("end_date") or f"{year}-{month:02d}-{last_day:02d}"
    config.IGNORE_RESERVATION = payload.get("ignore_reservation", True)
    config.NEED_SCRAPE = True

    print(f"Received web command, target month: {month_id}")
    print(f"Parameter override complete: {config.start_date}~{config.end_date}")
    return month_id


def save_court_status(target_month, court_rows, source):
    if supabase is None:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY in .env.")
    json_content = json.dumps(court_rows, ensure_ascii=False)
    supabase.table("court_status").upsert(
        {"month_id": target_month, "content": json_content},
        on_conflict="month_id",
    ).execute()
    supabase.table("court_status_history").insert(
        {"month_id": target_month, "content": json_content, "source": source}
    ).execute()


def main():
    print("\n=== Court Booking Results ===")

    payload = resolve_runtime_payload()
    target_month = apply_runtime_config(payload)

    print("[Scrape] Logging into the NTU system to fetch the latest booking schedule...")
    my_courts = fetch_and_parse_schedule()

    if my_courts:
        print(f"Fetched {len(my_courts)} matching court records.")
        save_court_status(target_month, my_courts, "scraper")
        print(f"Schedule database updated successfully for month: {target_month}")
        return

    saved_courts = load_saved_court_status(target_month)
    if saved_courts:
        print(f"No new matching courts found. Reusing saved database data for {target_month}.")
        print("Skipped overwriting court_status; existing database data was kept.")
        return

    print("No matching courts found.")
    print(f"No court data available for {target_month}; database was not updated.")


if __name__ == "__main__":
    main()
