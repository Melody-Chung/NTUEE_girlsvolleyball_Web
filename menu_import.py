from __future__ import annotations

import csv
import json
from io import StringIO
from pathlib import Path


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
        "\u7df4\u7684\u90e8\u4f4d",
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
        "\u5834",
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
        "\u7d2f\u5ea6",
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
CSV_DECODE_ENCODINGS = ("utf-8-sig", "utf-8", "cp950", "big5")


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


def load_rows_from_text(csv_text: str) -> list[dict[str, object]]:
    reader = csv.DictReader(StringIO(csv_text))
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


def decode_csv_bytes(file_bytes: bytes, encodings: tuple[str, ...] = CSV_DECODE_ENCODINGS) -> str:
    last_error: UnicodeDecodeError | None = None
    for encoding in encodings:
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError as error:
            last_error = error
    if last_error:
        raise ValueError("CSV encoding is not supported. Please save as UTF-8 or Big5.") from last_error
    raise ValueError("CSV file is empty or unreadable.")


def load_rows_from_bytes(file_bytes: bytes) -> list[dict[str, object]]:
    if not file_bytes:
        raise ValueError("CSV file is empty.")
    return load_rows_from_text(decode_csv_bytes(file_bytes))


def load_rows_from_path(csv_path: Path, encoding: str = "utf-8-sig") -> list[dict[str, object]]:
    with csv_path.open("r", encoding=encoding, newline="") as handle:
        return load_rows_from_text(handle.read())
