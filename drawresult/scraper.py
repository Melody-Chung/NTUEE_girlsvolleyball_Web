import os
import requests
import time
from datetime import datetime
from bs4 import BeautifulSoup
import config

# Define base directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def fetch_and_parse_schedule():
    session = requests.Session()
    
    # Standard headers from your original version
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',  
        'Referer': config.BASE_PAGE_URL,
        'Origin': 'https://rent.pe.ntu.edu.tw/' 
    }

    # --- Step 1: Authentication ---
    print("Step 1: Attempting to log into the system...")
    login_data = {
        'user_id': config.USERNAME, 
        'user_pw': config.PASSWORD
    }
    try:
        login_resp = session.post(config.LOGIN_URL, data=login_data, headers=headers)
        time.sleep(1)
        if login_resp.status_code != 200:
            print("Login request failed.")
            return []
    except Exception as e:
        print(f"Login connection error: {e}")
        return []

    # --- Step 2: Extracting security token (EnV) ---
    print("Step 2: Extracting security token (EnV)...")
    try:
        base_resp = session.get(config.BASE_PAGE_URL, headers=headers)
        soup_base = BeautifulSoup(base_resp.text, 'html.parser')
        
        env_token = ""
        sk_textarea = soup_base.find('textarea', {'name': 'SK'})
        if sk_textarea:
            env_token = sk_textarea.text.strip()
            print("Security token intercepted successfully!")
        else:
            print("Warning: SK token not found.")
    except Exception as e:
        print(f"Token extraction error: {e}")
        return []

    # --- Step 3: Requesting booking data from the server ---
    print(f"Step 3: Preparing to query custom date range: {config.start_date} to {config.end_date}")

    try:
        sdmk_val = int(datetime.strptime(config.start_date, "%Y-%m-%d").timestamp())
        edmk_cons = int(datetime.strptime(config.end_date, "%Y-%m-%d").timestamp())
    except Exception as e:
        print(f"Date conversion error: {e}")
        return []

    hit_results = []
    court_map = {
        '41': 'Court 1', '42': 'Court 2', '43': 'Court 3', 
        '44': 'Court 4', '45': 'Court 5', '46': 'Court 6', '47': 'Court 7'
    }
    reservation_markers = ['預約', 'reservation', 'reserve']

    while sdmk_val <= edmk_cons:
        edmk_val = sdmk_val + 86400
        # print(f"Processing: SDMK={sdmk_val}")
    
        payload = {
            'Fun': 'Schedule',
            'VenuesSN': '41,42,43,44,45,46,47',
            'OrderSource': 'undefined', 
            'BookingType': '',  
            'OrderSN': 'undefined',
            'OrderType': 'CV',
            'SDMK': str(sdmk_val),
            'EDMK': str(edmk_val),
            'ViewStatus': 'undefined',
            'EnV': env_token
        }

        schedule_html = ""
        try:
            api_resp = session.post(config.SCHEDULE_API_URL, data=payload, headers=headers, timeout=10)
            if api_resp.status_code == 200:
                try:
                    data = api_resp.json()
                    schedule_html = data.get('ScheduleList', '')
                except ValueError:
                    # 伺服器回傳的不是 JSON (可能是登入失效或被阻擋)
                    if not api_resp.text.strip():
                        print(f"API Error at {sdmk_val}: 伺服器回傳空白。可能登入已失效或被系統阻擋。")
                    else:
                        print(f"API Error at {sdmk_val}: 伺服器回傳非 JSON 格式 ({api_resp.text[:50]}...)")
                    break # 中斷迴圈，避免連續發送無效的請求
        except Exception as e:
            print(f"API Error at {sdmk_val}: {e}")

        # --- Step 4: Parse HTML blocks (Original Logic) ---
        if schedule_html:
            soup_schedule = BeautifulSoup(schedule_html, 'html.parser')
            day_blocks = soup_schedule.find_all('div', class_='D')
            
            for block in day_blocks:
                date_str = block.get('d')
                vs_code = block.get('vs')
                court_name = court_map.get(vs_code, f'Unknown Venue {vs_code}')

                booked_slots = block.find_all('div', class_='N E')
                for slot in booked_slots:
                    title_text = slot.get('title', '')
                    if config.IGNORE_RESERVATION and any(marker.lower() in title_text.lower() for marker in reservation_markers):
                        continue
                    
                    # 使用 config 內的關鍵字清單
                    if any(keyword in title_text for keyword in config.TARGET_KEYWORDS):
                        # 如果有排除清單也一併檢查
                        if hasattr(config, 'EXCLUDE_KEYWORDS'):
                            if any(exclude in title_text for exclude in config.EXCLUDE_KEYWORDS):
                                continue

                        try:
                            start_hour_str = title_text.split('[')[1].split()[0]
                            start_hour_int = int(start_hour_str)
                            end_hour_int = start_hour_int + 2
                            time_part = f"{start_hour_int:02d}:00-{end_hour_int:02d}:00"
                            winner_part = title_text.split(']')[-1].strip()
                        except:
                            time_part = "Time Error"
                            winner_part = title_text

                        hit_results.append({
                            'Date': date_str,
                            'Time': time_part,
                            'Court': court_name,
                            'Booked By': winner_part  
                        })
        
        sdmk_val = edmk_val # Move to next day

    if not hit_results:
        print(f"No records found for the range {config.start_date} to {config.end_date}.")
    else:
        print(f"Successfully retrieved {len(hit_results)} records.")

    return hit_results
