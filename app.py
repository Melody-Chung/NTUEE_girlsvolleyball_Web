import calendar
import json
import math
import os
import shutil
import subprocess
import threading
from datetime import date, datetime

from flask import Flask, jsonify, render_template, request
from supabase import Client, create_client
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

import settings

app = Flask(__name__)
app.secret_key = settings.SECRET_KEY

DB_PATH = str(settings.DB_PATH)
UPLOAD_FOLDER = str(settings.UPLOAD_FOLDER)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
SHOWCASE_CROP_FOLDER = str(settings.SHOWCASE_CROP_FOLDER)
os.makedirs(SHOWCASE_CROP_FOLDER, exist_ok=True)
LEGACY_SHOWCASE_CROP_FOLDER = os.path.join(os.path.dirname(SHOWCASE_CROP_FOLDER), "hero")
supabase: Client | None = (
    create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    if settings.SUPABASE_URL and settings.SUPABASE_KEY
    else None
)


def dumps_json(value):
    return json.dumps(value, ensure_ascii=False)


def require_supabase() -> Client:
    if supabase is None:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY in .env.")
    return supabase


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
    response = query.execute()
    return response.data or []


def sb_select_one(table, columns="*", filters=None, order_by=None, desc=False):
    rows = sb_select(table, columns=columns, filters=filters, order_by=order_by, desc=desc, limit=1)
    return rows[0] if rows else None


def sb_insert(table, payload):
    response = require_supabase().table(table).insert(payload).execute()
    return response.data or []


def sb_upsert(table, payload, on_conflict=None):
    response = require_supabase().table(table).upsert(payload, on_conflict=on_conflict).execute()
    return response.data or []


def sb_update(table, values, filters=None):
    query = require_supabase().table(table).update(values)
    query = _apply_filters(query, filters)
    response = query.execute()
    return response.data or []


def sb_delete(table, filters=None):
    query = require_supabase().table(table).delete()
    query = _apply_filters(query, filters)
    response = query.execute()
    return response.data or []


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


def get_saved_court_status(month_id):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return None

    row = sb_select_one("court_status", columns="content", filters=[("eq", "month_id", target_month)])
    content = row.get("content") if row else None
    return content if content not in (None, "", "[]") else None


def get_showcase_photos():
    photos = get_system_data_json("showcase_photos", None)
    if photos is None:
        photos = get_system_data_json("hero_photos", [])
    return photos if isinstance(photos, list) else []


def set_showcase_photos(photos):
    set_system_data_json("showcase_photos", photos)
    set_system_data_json("hero_photos", photos)


def get_showcase_crop_map():
    crop_map = get_system_data_json("showcase_photo_crops", None)
    if crop_map is None:
        crop_map = get_system_data_json("hero_photo_crops", {})
    return crop_map if isinstance(crop_map, dict) else {}


def set_showcase_crop_map(crop_map):
    set_system_data_json("showcase_photo_crops", crop_map)
    set_system_data_json("hero_photo_crops", crop_map)


def resolve_showcase_crop_path(filename):
    if not filename:
        return ""

    showcase_path = os.path.join(SHOWCASE_CROP_FOLDER, filename)
    if os.path.exists(showcase_path):
        return showcase_path

    legacy_path = os.path.join(LEGACY_SHOWCASE_CROP_FOLDER, filename)
    if os.path.exists(legacy_path):
        os.makedirs(SHOWCASE_CROP_FOLDER, exist_ok=True)
        shutil.copy2(legacy_path, showcase_path)
        return showcase_path

    return showcase_path


LOTTERY_COURTS = ["Court 4", "Court 5", "Court 6", "Court 7"]
LOTTERY_TIMES = {"slot1": "18:00-20:00", "slot2": "20:00-22:00"}
LOTTERY_WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MENU_COMPLEXITY_DEFAULTS = ["拆分", "串接"]
MENU_DIFFICULTY_DEFAULTS = ["簡單", "困難"]
MENU_COMPLEXITY_ORDER = {"拆分": 0, "串接": 1}
MENU_FATIGUE_ORDER = {"輕鬆": 0, "普通": 1, "累": 2}
MENU_DIFFICULTY_ORDER = {"簡單": 0, "普通": 1, "困難": 2}


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
    normalized = str(value).replace("、", ",").replace("，", ",")
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
    if "有場" in values and "沒場" not in values:
        return 0
    if "有場" in values and "沒場" in values:
        return 1
    if "沒場" in values:
        return 2
    return 3


def menu_difficulty_rank(difficulties):
    ranks = [MENU_DIFFICULTY_ORDER[item] for item in (difficulties or []) if item in MENU_DIFFICULTY_ORDER]
    return min(ranks) if ranks else 99


def normalize_menu_row_payload(payload, existing_id=None):
    payload = payload or {}
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ValueError("Menu name is required")

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


def get_saved_lottery_bids(month_id):
    target_month = normalize_month_id(month_id)
    content = fetch_month_content("lottery_bids", target_month)
    return build_lottery_month_rows(target_month, parse_json_array(content))


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
    return text


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
                    "slot1": extract_court_name(slot1.get("line1")),
                    "slot2": extract_court_name(slot2.get("line1")),
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
        grouped.setdefault(date_key, {"date": date_key, "slot1": "", "slot2": ""})
        if "18" in time_value or "19" in time_value:
            grouped[date_key]["slot1"] = court_name
        elif "20" in time_value or "21" in time_value:
            grouped[date_key]["slot2"] = court_name

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


def build_probability_records(month_ids):
    records = []
    skipped_months = []

    for month_id in month_ids:
        bid_content = fetch_month_content("lottery_bids", month_id)
        court_content = fetch_month_content("court_status", month_id)

        bid_rows = build_lottery_month_rows(month_id, parse_json_array(bid_content)) if bid_content is not None else []
        court_rows = parse_court_status_rows(court_content) if court_content is not None else []
        court_map = {row["date"]: row for row in court_rows if row.get("date")}

        total_bids = 0
        for row in bid_rows:
            total_bids += sum(row["slot1"].values()) + sum(row["slot2"].values())

        has_bid_data = bid_content is not None and total_bids > 0
        has_court_data = court_content is not None
        if not has_bid_data or not has_court_data:
            skipped_months.append(month_id)
            continue

        for row in bid_rows:
            date_key = row["date"]
            weekday = LOTTERY_WEEKDAY_NAMES[datetime.strptime(date_key, "%Y-%m-%d").weekday()]
            court_row = court_map.get(date_key, {"slot1": "", "slot2": ""})
            for slot_key, time_label in LOTTERY_TIMES.items():
                won_court = extract_court_name(court_row.get(slot_key))
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
                            "wins": 1 if won_court == court else 0,
                        }
                    )
    return records, skipped_months


def estimate_ticket_probability(records):
    filtered = [record for record in records if record["bids"] > 0]
    if not filtered:
        return 0.001

    best_q = 0.001
    best_score = float("-inf")
    for step in range(1, 701):
        q = step / 1000
        score = 0.0
        for record in filtered:
            win_prob = 1 - ((1 - q) ** record["bids"])
            win_prob = min(max(win_prob, 1e-9), 1 - 1e-9)
            score += math.log(win_prob) if record["wins"] else math.log(1 - win_prob)
        if score > best_score:
            best_score = score
            best_q = q

    return best_q


def summarize_probability_records(records):
    summary = {}
    for record in records:
        key = (record["weekday"], record["time"], record["court"])
        if key not in summary:
            summary[key] = {
                "weekday": key[0],
                "time": key[1],
                "court": key[2],
                "total_bids": 0,
                "total_wins": 0,
                "attempts": 0,
                "records": [],
            }
        summary[key]["total_bids"] += record["bids"]
        summary[key]["total_wins"] += record["wins"]
        summary[key]["attempts"] += 1
        summary[key]["records"].append(record)

    results = []
    weekday_order = {name: index for index, name in enumerate(LOTTERY_WEEKDAY_NAMES)}
    time_order = {"18:00-20:00": 0, "20:00-22:00": 1}
    court_order = {court: index for index, court in enumerate(LOTTERY_COURTS)}

    for item in summary.values():
        attempts = item["attempts"] or 0
        item["win_rate"] = round((item["total_wins"] / attempts * 100) if attempts else 0, 1)
        item["ticket_rate"] = round((item["total_wins"] / item["total_bids"] * 100) if item["total_bids"] else 0, 1)
        item["avg_bids"] = round((item["total_bids"] / attempts) if attempts else 0, 1)
        item["ticket_probability"] = round(estimate_ticket_probability(item["records"]) * 100, 1)
        item.pop("records", None)
        results.append(item)

    results.sort(key=lambda item: (weekday_order[item["weekday"]], time_order[item["time"]], court_order[item["court"]]))
    return results


def build_strategy_rows(target_month, probability_stats, weekdays=None, time_weights=None):
    month_id = normalize_month_id(target_month)
    if not month_id:
        return []

    selected_weekdays = weekdays or [1, 3]
    time_weights = time_weights or {"18:00-20:00": 1.0, "20:00-22:00": 1.0}
    stat_map = {(item["weekday"], item["time"], item["court"]): item for item in probability_stats}
    year, month = map(int, month_id.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    slots = []
    total_budget = 50

    for day in range(1, last_day + 1):
        date_obj = date(year, month, day)
        weekday_num = date_obj.weekday()
        if weekday_num not in selected_weekdays:
            continue
        weekday_name = LOTTERY_WEEKDAY_NAMES[weekday_num]
        date_key = f"{year}-{month:02d}-{day:02d}"

        for time_label in LOTTERY_TIMES.values():
            slot = {
                "date": date_key,
                "weekday": weekday_name,
                "time": time_label,
                "allocations": {court: 0 for court in LOTTERY_COURTS},
                "probabilities": {},
            }
            for court in LOTTERY_COURTS:
                stat = stat_map.get((weekday_name, time_label, court))
                slot["probabilities"][court] = (stat["ticket_probability"] / 100.0) if stat else 0.001
            slots.append(slot)

    if not slots:
        return []

    def slot_total_bids(slot):
        return sum(slot["allocations"].values())

    def slot_success(slot):
        loss_prob = 1.0
        for court in LOTTERY_COURTS:
            loss_prob *= (1 - slot["probabilities"][court]) ** slot["allocations"][court]
        return 1 - loss_prob

    def date_success(date_key):
        related_slots = [slot for slot in slots if slot["date"] == date_key]
        loss_prob = 1.0
        for slot in related_slots:
            loss_prob *= (1 - slot_success(slot))
        return 1 - loss_prob

    def slot_weight(slot):
        return max(float(time_weights.get(slot["time"], 1.0)), 0.01)

    def total_month_utility():
        return sum(slot_weight(slot) * slot_success(slot) for slot in slots)

    unique_dates = sorted({slot["date"] for slot in slots})

    for _ in range(total_budget):
        candidates = [slot for slot in slots if slot_total_bids(slot) < 5]
        if not candidates:
            break

        baseline_total = total_month_utility()
        best_choice = None
        best_gain = float("-inf")
        for slot in candidates:
            for court in LOTTERY_COURTS:
                slot["allocations"][court] += 1
                gain = total_month_utility() - baseline_total
                slot["allocations"][court] -= 1
                if gain > best_gain:
                    best_gain = gain
                    best_choice = (slot, court)

        if not best_choice:
            break

        chosen_slot, chosen_court = best_choice
        chosen_slot["allocations"][chosen_court] += 1

    rows = []
    for slot in slots:
        rows.append(
            {
                "date": slot["date"],
                "weekday": slot["weekday"],
                "time": slot["time"],
                "allocations": slot["allocations"],
                "success_rate": round(slot_success(slot) * 100, 1),
                "date_success_rate": round(date_success(slot["date"]) * 100, 1),
                "total_bids": slot_total_bids(slot),
            }
        )

    rows.sort(key=lambda item: (item["date"], 0 if item["time"] == "18:00-20:00" else 1))
    return rows


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
    return render_template("index.html")


@app.route("/api/register", methods=["POST"])
def register():
    data = request.json or {}
    username = data.get("username")
    password = data.get("password")
    role = data.get("role")

    if not username or not password or not role:
        return jsonify({"error": "Missing data"}), 400

    hashed_pw = generate_password_hash(password)

    existing = sb_select_one("users", columns="id", filters=[("eq", "username", username)])
    if existing:
        return jsonify({"error": "Username already exists."}), 400
    sb_insert("users", {"username": username, "password": hashed_pw, "role": role})
    return jsonify(
        {
            "status": "success",
            "message": "Registration successful. Please wait for captain approval.",
        }
    )


@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    username = data.get("username")
    password = data.get("password")

    user = sb_select_one("users", columns="password, role, status", filters=[("eq", "username", username)])
    if not user:
        return jsonify({"error": "User not found."}), 404

    db_password = user["password"]
    role = user["role"]
    status = user["status"]

    if not check_password_hash(db_password, password):
        return jsonify({"error": "Invalid password."}), 401

    if status == "pending":
        return jsonify({"error": "Account is pending approval from a captain."}), 403
    if status == "rejected":
        return jsonify({"error": "Account registration was rejected."}), 403

    return jsonify({"status": "success", "role": role, "username": username})

@app.route('/api/change_password', methods=['POST'])
def change_password():
    data = request.get_json()
    username = data.get('username')
    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not username or not old_password or not new_password:
        return jsonify({"error": "Missing fields."}), 400

    user = sb_select_one("users", columns="password", filters=[("eq", "username", username)])
    if not user:
        return jsonify({"error": "User not found."}), 404

    db_password = user["password"]
    if not check_password_hash(db_password, old_password):
        return jsonify({"error": "Incorrect current password."}), 401

    hashed_new_password = generate_password_hash(new_password)
    sb_update("users", {"password": hashed_new_password}, [("eq", "username", username)])
    return jsonify({"message": "Password updated successfully."}), 200

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
        default_content = "(還沒有人有話要說)"
        content = get_system_data_json("announcements", default_content)
        return jsonify({"content": content})

    if request.method == 'POST':
        data = request.get_json()
        new_content = data.get('content', '')
        set_system_data_json("announcements", new_content)
        return jsonify({"message": "Saved successfully"}), 200
    
@app.route("/get_videos", methods=["GET"])
def get_videos():
    records = sb_select("videos", columns="url, title", order_by="id", desc=True)
    videos = [{"url": row["url"], "title": row.get("title") or ""} for row in records]
    return jsonify(videos)


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

    return jsonify(sections)


@app.route("/api/video_sections/<int:section_id>", methods=["DELETE"])
def delete_video_section(section_id):
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
    video_url = data.get("url")
    video_title = (data.get("title") or "").strip()
    section_id = data.get("section_id")
    if not video_url or not section_id:
        return jsonify({"status": "error"}), 400

    sb_insert("videos", {"url": video_url, "title": video_title, "section_id": section_id})
    return jsonify({"status": "success"})


@app.route("/delete_video", methods=["POST"])
def delete_video():
    data = request.json or {}
    video_id = data.get("id")
    if not video_id:
        return jsonify({"status": "error"}), 400

    sb_delete("videos", [("eq", "id", video_id)])
    return jsonify({"status": "success"})

@app.route("/api/court_status/<month_id>", methods=["GET", "DELETE"])
def get_court_status(month_id):
    requested_month = normalize_month_id(month_id)
    if not requested_month:
        return jsonify({"error": "Invalid month_id"}), 400

    if request.method == "DELETE":
        scope = (request.args.get("scope") or "all").strip().lower()
        deleted = False
        deleted = bool(sb_delete("court_status", [("eq", "month_id", requested_month)])) or deleted
        deleted = bool(sb_delete("court_status_history", [("eq", "month_id", requested_month)])) or deleted
        if scope != "court":
            deleted = bool(sb_delete("lottery_bids", [("eq", "month_id", requested_month)])) or deleted
            deleted = bool(sb_delete("lottery_bids_history", [("eq", "month_id", requested_month)])) or deleted
        return jsonify({"status": "success", "month_id": requested_month, "deleted": deleted, "scope": scope})

    row = sb_select_one("court_status", columns="content", filters=[("eq", "month_id", requested_month)])

    return jsonify(
        {
            "month_id": requested_month,
            "content": row.get("content") if row else "[]",
            "is_current_month": requested_month == get_month_id(0),
            "is_next_month": requested_month == get_month_id(1),
        }
    )


@app.route("/api/court_status/months", methods=["GET"])
def list_court_status_months():
    months = [normalize_month_id(row.get("month_id")) for row in sb_select("court_status", columns="month_id", order_by="month_id", desc=True)]
    return jsonify({"months": [month for month in months if month]})


@app.route("/api/court_status", methods=["POST"])
def save_court_status():
    data = request.json or {}
    target_month = normalize_month_id(data.get("month_id"))
    content = data.get("content")

    if not target_month or content is None:
        return jsonify({"error": "Missing month_id or content"}), 400

    sb_upsert("court_status", {"month_id": target_month, "content": content}, on_conflict="month_id")
    archive_court_status(target_month, content, source="manual")

    return jsonify({"status": "success", "month_id": target_month})


@app.route("/api/court_status/history/<month_id>", methods=["GET"])
def get_court_status_history(month_id):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return jsonify({"error": "Invalid month_id"}), 400

    rows = sb_select("court_status_history", columns="id, source, created_at", filters=[("eq", "month_id", target_month)], order_by="created_at", desc=True)
    history = [{"id": row["id"], "source": row.get("source"), "created_at": row.get("created_at")} for row in rows]
    return jsonify({"month_id": target_month, "history": history})


@app.route("/api/lottery_bids/<month_id>", methods=["GET", "DELETE"])
def get_lottery_bids(month_id):
    target_month = normalize_month_id(month_id)
    if not target_month:
        return jsonify({"error": "Invalid month_id"}), 400

    if request.method == "DELETE":
        deleted = bool(sb_delete("lottery_bids", [("eq", "month_id", target_month)]))
        deleted = bool(sb_delete("lottery_bids_history", [("eq", "month_id", target_month)])) or deleted
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

    return jsonify({"status": "success", "month_id": target_month})


@app.route("/api/lottery_bids_summary", methods=["GET"])
def get_lottery_bids_summary():
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
        has_bid_data = len(bid_rows) > 0
        has_court_data = len(court_rows) > 0
        summary.append(
            {
                "month_id": month_id,
                "total_bids": count_lottery_bids(bid_rows),
                "has_bid_data": has_bid_data,
                "has_court_data": has_court_data,
            }
        )

    return jsonify({"months": summary})


@app.route("/api/lottery_dashboard", methods=["GET"])
def get_lottery_dashboard():
    start_month = normalize_month_id(request.args.get("start_month"))
    end_month = normalize_month_id(request.args.get("end_month"))
    target_month = normalize_month_id(request.args.get("target_month")) or get_month_id(0)
    strategy_weekday_values = request.args.getlist("strategy_weekday")
    strategy_weekdays = [int(value) for value in strategy_weekday_values if str(value).isdigit()]
    try:
        late_ratio = float(request.args.get("strategy_weight_ratio", 1.3))
    except (TypeError, ValueError):
        late_ratio = 1.3
    strategy_time_weights = {
        "18:00-20:00": 1.0,
        "20:00-22:00": max(0.1, late_ratio),
    }

    if not start_month:
        start_month = target_month
    if not end_month:
        end_month = target_month

    selected_month_ids = iterate_month_ids(start_month, end_month)
    selected_records, selected_skipped = build_probability_records(selected_month_ids)
    selected_stats = summarize_probability_records(selected_records)

    history_month_ids = sorted(set(fetch_existing_month_ids("lottery_bids")) | set(fetch_existing_month_ids("court_status")))
    all_records, all_skipped = build_probability_records(history_month_ids)
    all_stats = summarize_probability_records(all_records)

    selected_strategy_rows = build_strategy_rows(target_month, selected_stats, strategy_weekdays, strategy_time_weights)
    all_time_strategy_rows = build_strategy_rows(target_month, all_stats, strategy_weekdays, strategy_time_weights)

    return jsonify(
        {
            "selected": {
                "start_month": start_month,
                "end_month": end_month,
                "months_used": sorted({record["month_id"] for record in selected_records}),
                "skipped_months": selected_skipped,
                "stats": selected_stats,
            },
            "all_time": {
                "months_used": sorted({record["month_id"] for record in all_records}),
                "skipped_months": all_skipped,
                "stats": all_stats,
            },
            "strategy": {
                "target_month": target_month,
                "weights": {
                    "18:00-20:00": strategy_time_weights["18:00-20:00"],
                    "20:00-22:00": strategy_time_weights["20:00-22:00"],
                },
                "selected": {
                    "rows": selected_strategy_rows,
                    "source": "selected",
                },
                "all_time": {
                    "rows": all_time_strategy_rows,
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
        return jsonify({"error": "Menu item not found"}), 404
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

    def run_scraper_task():
        try:
            set_scrape_status("running", "Scraper is running.", target_month or "")
            print(f"Starting scraper for {target_month}...")
            payload_str = json.dumps(data)
            result = subprocess.run(
                ["python", "main.py", payload_str],
                capture_output=True,
                text=True,
                cwd="drawresult",
                errors="replace",
            )
            print("Scraper finished. Output:")
            print(result.stdout)
            if result.stderr:
                print("Scraper stderr:", result.stderr)

            combined_output = f"{result.stdout}\n{result.stderr}".lower()
            denied_markers = [
                "非 json 格式",
                "non json",
                "non-json",
                "doctype html",
                "拒絕存取",
                "access denied",
                "forbidden",
            ]
            saved_content = get_saved_court_status(target_month)
            if result.returncode != 0 or any(marker in combined_output for marker in denied_markers):
                if saved_content:
                    set_scrape_status(
                        "success",
                        "系統拒絕存取，已改用資料庫中這個月已儲存的場地資料。",
                        target_month or "",
                    )
                else:
                    set_scrape_status(
                        "error",
                        "系統拒絕存取。請先登入台大場地管理系統，再重新爬一次。",
                        target_month or "",
                    )
            else:
                set_scrape_status("success", "Scraper completed successfully.", target_month or "")
        except Exception as e:
            print(f"Failed to run scraper: {e}")
            if get_saved_court_status(target_month):
                set_scrape_status(
                    "success",
                    "系統拒絕存取，已改用資料庫中這個月已儲存的場地資料。",
                    target_month or "",
                )
            else:
                set_scrape_status(
                    "error",
                    "系統拒絕存取。請先登入台大場地管理系統，再重新爬一次。",
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


@app.route("/api/scrape_status", methods=["GET"])
def get_scrape_status():
    return jsonify(get_system_data_json("scrape_status", {"status": "idle", "message": "", "target_month": ""}))


@app.route("/api/probability/<month_id>", methods=["GET"])
def get_probability(month_id):
    row = sb_select_one("probability_stats", columns="content", filters=[("eq", "month_id", month_id)])
    return jsonify(
        {
            "content": row.get("content")
            if row
            else "<p style='text-align:center; color:#999;'>No probability data generated for this month yet.</p>"
        }
    )


@app.route("/api/scrape", methods=["POST"])
def scrape_data():
    return jsonify({"status": "success", "message": "Scraping task completed."})


@app.route("/api/strategy", methods=["GET"])
def get_strategy():
    return jsonify(
        {
            "best_court": "Court 5",
            "suggestion": "Focus tickets on Thursday second half.",
        }
    )


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

        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(file_path)
        sb_insert("gallery", {"filename": filename, "uploaded_by": uploader})
        saved_files.append(filename)

    return jsonify(
        {
            "status": "success",
            "message": f"{len(saved_files)} files uploaded successfully.",
        }
    )


@app.route("/api/gallery", methods=["GET"])
def get_gallery():
    photos = [row["filename"] for row in sb_select("gallery", columns="filename", order_by="id", desc=True)]
    return jsonify(photos)


@app.route("/api/delete-photo", methods=["POST"])
def delete_photo():
    data = request.json or {}
    filename = data.get("filename")

    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    sb_delete("gallery", [("eq", "filename", filename)])

    file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    selected_photos = get_showcase_photos()
    if filename in selected_photos:
        selected_photos = [item for item in selected_photos if item != filename]
        set_showcase_photos(selected_photos)

    crop_map = get_showcase_crop_map()
    cropped_filename = crop_map.pop(filename, None)
    if cropped_filename:
        cropped_path = resolve_showcase_crop_path(cropped_filename)
        if os.path.exists(cropped_path):
            os.remove(cropped_path)
        legacy_cropped_path = os.path.join(LEGACY_SHOWCASE_CROP_FOLDER, cropped_filename)
        if os.path.exists(legacy_cropped_path):
            os.remove(legacy_cropped_path)
        set_showcase_crop_map(crop_map)

    return jsonify({"status": "success", "message": "Photo deleted."})


@app.route('/api/showcase_photos', methods=['GET', 'POST'])
@app.route('/api/hero_photos', methods=['GET', 'POST'])
def handle_showcase_photos():
    if request.method == 'GET':
        return jsonify(get_showcase_photos())

    if request.method == 'POST':
        data = request.get_json() or {}
        selected_photos = data.get('photos', [])
        set_showcase_photos(selected_photos)
        return jsonify({"message": "Showcase photos updated successfully"}), 200


@app.route('/api/showcase_photo_assets', methods=['GET'])
@app.route('/api/hero_photo_assets', methods=['GET'])
def get_showcase_photo_assets():
    selected_photos = get_showcase_photos()
    crop_map = get_showcase_crop_map()
    assets = []
    for filename in selected_photos:
        cropped_filename = crop_map.get(filename)
        cropped_path = resolve_showcase_crop_path(cropped_filename) if cropped_filename else ""
        if cropped_filename and os.path.exists(cropped_path):
            version = int(os.path.getmtime(cropped_path))
            src = f"/static/uploads/showcase/{cropped_filename}?v={version}"
        else:
            gallery_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            version = int(os.path.getmtime(gallery_path)) if os.path.exists(gallery_path) else int(datetime.now().timestamp())
            src = f"/static/uploads/gallery/{filename}?v={version}"
        assets.append({"filename": filename, "src": src})
    return jsonify(assets)


@app.route('/api/showcase_photo_crop', methods=['POST'])
@app.route('/api/hero_photo_crop', methods=['POST'])
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
        previous_cropped_path = resolve_showcase_crop_path(previous_cropped_filename)
        if os.path.exists(previous_cropped_path):
            os.remove(previous_cropped_path)
        legacy_previous_path = os.path.join(LEGACY_SHOWCASE_CROP_FOLDER, previous_cropped_filename)
        if os.path.exists(legacy_previous_path):
            os.remove(legacy_previous_path)

    cropped_filename = f"{base_name}_showcase_{int(datetime.now().timestamp())}.jpg"
    cropped_path = os.path.join(SHOWCASE_CROP_FOLDER, cropped_filename)
    file.save(cropped_path)

    crop_map[safe_name] = cropped_filename
    set_showcase_crop_map(crop_map)
    return jsonify({"message": "Showcase crop saved", "src": f"/static/uploads/showcase/{cropped_filename}"})

if __name__ == "__main__":
    app.run(debug=True, port=5000)


