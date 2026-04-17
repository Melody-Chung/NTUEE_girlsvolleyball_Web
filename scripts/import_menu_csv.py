from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from supabase import create_client

import settings


HEADER_ALIASES = {
    "name": {
        "name",
        "menu",
        "drill",
        "drill_name",
        "menu_name",
        "\u9805\u76ee",
        "\u540d\u7a31",
        "\u83dc\u55ae",
        "\u83dc\u55ae\u540d\u7a31",
        "\u8a13\u7df4\u9805\u76ee",
    },
    "focuses": {
        "focuses",
        "focus",
        "training_focus",
        "training_focuses",
        "\u8a13\u7df4\u91cd\u9ede",
        "\u91cd\u9ede",
        "focuses_list",
    },
    "people_count": {
        "people_count",
        "people",
        "players",
        "player_count",
        "\u4eba\u6578",
        "\u53c3\u8207\u4eba\u6578",
        "\u6240\u9700\u4eba\u6578",
    },
    "court_modes": {
        "court_modes",
        "court_mode",
        "court",
        "courts",
        "\u5834\u5730",
        "\u5834\u5730\u9700\u6c42",
        "\u6709\u7121\u5834\u5730",
    },
    "complexities": {
        "complexities",
        "complexity",
        "\u5c64\u6b21",
        "\u8907\u96dc\u5ea6",
        "\u62c6\u5206\u4e32\u63a5",
    },
    "fatigue_levels": {
        "fatigue_levels",
        "fatigue",
        "fatigue_level",
        "\u9ad4\u529b",
        "\u75b2\u52de",
        "\u75b2\u52de\u7a0b\u5ea6",
    },
    "difficulty_levels": {
        "difficulty_levels",
        "difficulty",
        "difficulty_level",
        "\u96e3\u5ea6",
        "\u56f0\u96e3\u5ea6",
    },
}

DEFAULT_COMPLEXITIES = ["\u62c6\u5206", "\u4e32\u63a5"]
DEFAULT_DIFFICULTIES = ["\u7c21\u55ae", "\u56f0\u96e3"]


def normalize_header(value: str) -> str:
    return (
        str(value or "")
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
    )


def split_values(value: str) -> list[str]:
    if value is None:
        return []
    normalized = (
        str(value)
        .replace("\u3001", ",")
        .replace("\uff0c", ",")
        .replace("/", ",")
        .replace("\uff1b", ",")
        .replace(";", ",")
        .replace("\n", ",")
    )
    return [item.strip() for item in normalized.split(",") if item.strip()]


def resolve_header_map(fieldnames: list[str]) -> dict[str, str]:
    normalized_map = {normalize_header(name): name for name in fieldnames if name}
    resolved: dict[str, str] = {}
    for target, aliases in HEADER_ALIASES.items():
        for alias in aliases:
            original = normalized_map.get(normalize_header(alias))
            if original:
                resolved[target] = original
                break
    if "name" not in resolved:
        raise ValueError(
            "CSV is missing a name column. Use one of: "
            "name, menu_name, 名稱, 菜單名稱, 訓練項目."
        )
    return resolved


def parse_people_count(value: str) -> int:
    try:
        return max(0, int(str(value or "").strip()))
    except ValueError:
        digits = "".join(ch for ch in str(value or "") if ch.isdigit())
        return int(digits) if digits else 0


def build_payload(row: dict[str, str], header_map: dict[str, str]) -> dict[str, object]:
    def get_text(target: str) -> str:
        column = header_map.get(target)
        return str(row.get(column, "")).strip() if column else ""

    payload = {
        "name": get_text("name"),
        "focuses": split_values(get_text("focuses")),
        "people_count": parse_people_count(get_text("people_count")),
        "court_modes": split_values(get_text("court_modes")),
        "complexities": split_values(get_text("complexities")) or list(DEFAULT_COMPLEXITIES),
        "fatigue_levels": split_values(get_text("fatigue_levels")),
        "difficulty_levels": split_values(get_text("difficulty_levels")) or list(DEFAULT_DIFFICULTIES),
    }
    if not payload["name"]:
        raise ValueError("Blank menu name cannot be imported.")
    return payload


def serialize_payload(payload: dict[str, object]) -> dict[str, object]:
    return {
        "name": payload["name"],
        "focuses": json.dumps(payload["focuses"], ensure_ascii=False),
        "people_count": payload["people_count"],
        "court_modes": json.dumps(payload["court_modes"], ensure_ascii=False),
        "complexities": json.dumps(payload["complexities"], ensure_ascii=False),
        "fatigue_levels": json.dumps(payload["fatigue_levels"], ensure_ascii=False),
        "difficulty_levels": json.dumps(payload["difficulty_levels"], ensure_ascii=False),
    }


def load_rows(csv_path: Path, encoding: str) -> list[dict[str, object]]:
    with csv_path.open("r", encoding=encoding, newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV file has no header row.")

        header_map = resolve_header_map(reader.fieldnames)
        rows: list[dict[str, object]] = []
        for index, raw_row in enumerate(reader, start=2):
            if not any(str(value or "").strip() for value in raw_row.values()):
                continue
            try:
                rows.append(build_payload(raw_row, header_map))
            except ValueError as error:
                raise ValueError(f"Row {index} import failed: {error}") from error
        return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Import training menu CSV into Supabase menu_drills.")
    parser.add_argument("csv_path", help="Path to the CSV file")
    parser.add_argument("--encoding", default="utf-8-sig", help="CSV encoding, default: utf-8-sig")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing rows in menu_drills before importing",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse CSV and print summary without writing to Supabase",
    )
    args = parser.parse_args()

    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise RuntimeError("Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY in .env.")

    csv_path = Path(args.csv_path).expanduser().resolve()
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    rows = load_rows(csv_path, args.encoding)
    print(f"Loaded {len(rows)} menu rows from {csv_path}")
    if rows:
        print(f"Sample: {rows[0]['name']} / {rows[0]['people_count']} people")

    if args.dry_run:
        print("Dry run only. No data written.")
        return 0

    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    if args.replace:
        client.table("menu_drills").delete().neq("id", 0).execute()
        print("Deleted existing menu_drills rows.")

    payload = [serialize_payload(row) for row in rows]
    batch_size = 200
    for start in range(0, len(payload), batch_size):
        chunk = payload[start : start + batch_size]
        client.table("menu_drills").insert(chunk).execute()
        print(f"Inserted rows {start + 1}-{start + len(chunk)}")

    print("Import completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
