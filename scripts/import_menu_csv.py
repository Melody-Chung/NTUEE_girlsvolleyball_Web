from __future__ import annotations

import argparse
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from menu_import import load_rows_from_path, serialize_payload
import settings


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

    rows = load_rows_from_path(csv_path, args.encoding)
    print(f"Loaded {len(rows)} menu rows from {csv_path}")
    if rows:
        print(f"Sample: {rows[0]['name']} / {rows[0]['people_count']} people")

    if args.dry_run:
        print("Dry run only. No data written.")
        return 0

    from supabase import create_client

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
