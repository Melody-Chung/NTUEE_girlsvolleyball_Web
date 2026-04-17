# Drawresult Notes

`drawresult/main.py` is now a backend worker that:

- logs into the NTU venue system
- syncs matching court data into `vbt.db`

## Environment

Set deployment values in the repo-root `.env`:

```env
SCRAPER_USERNAME=your_ntu_account
SCRAPER_PASSWORD=your_ntu_password
SCRAPER_TARGET_KEYWORDS=keyword1,keyword2
SCRAPER_EXCLUDE_KEYWORDS=keyword3,keyword4
```

## Local run

```bash
pip install requests beautifulsoup4 python-dotenv
python drawresult/main.py
```

## Notes

- The generated data is stored in `vbt.db`; the old standalone `dashboard.html`, Google Sheets sync, and drawresult-side probability tools are no longer used.
- Runtime defaults for date range and reservation filtering live in `drawresult/config.py`.
