from __future__ import annotations

import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import settings


NEED_SCRAPE = False
start_date = "2026-04-01"
end_date = "2026-04-30"

IGNORE_RESERVATION = True
SWAP_IN = []
SWAP_OUT = []

USERNAME = settings.SCRAPER_USERNAME
PASSWORD = settings.SCRAPER_PASSWORD

LOGIN_URL = "https://rent.pe.ntu.edu.tw/member/LoginCheck.php?BUrl="
BASE_PAGE_URL = "https://rent.pe.ntu.edu.tw/venues/?K=89&SD=Y"
SCHEDULE_API_URL = "https://rent.pe.ntu.edu.tw/__/f/ScheduleVenues.php"

TARGET_KEYWORDS = settings.env_csv("SCRAPER_TARGET_KEYWORDS", default=[])
EXCLUDE_KEYWORDS = settings.env_csv("SCRAPER_EXCLUDE_KEYWORDS", default=[])
