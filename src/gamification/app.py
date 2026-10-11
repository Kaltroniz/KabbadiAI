"""KabadiAI Gamification Lambda (/gamification/*).
Handles XP, levels, streaks, badges, daily/weekly challenges, collectible cards,
environmental impact metrics (CO2, energy, trees), quests, leaderboards, and lucky spins.
Pure Python standard library + boto3 (zero heavy dependencies for fast cold starts).
"""
import json, math, os, random, time, uuid
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
import boto3

XP_TABLE = os.environ.get("XP_TABLE", "")
USERS_TABLE = os.environ.get("USERS_TABLE", "")

_ddb = None
def _table(name):
    global _ddb
    if not name:
        return None
    if not _ddb:
        _ddb = boto3.resource("dynamodb")
    return _ddb.Table(name)

# ─── ENVIRONMENTAL IMPACT FACTORS ──────────────────────────────────────────
# (co2_kg_saved_per_kg, energy_kwh_saved_per_kg)
IMPACT_FACTORS = {
    "motherboard": (6.0, 8.0),
    "ram_stick": (5.0, 7.0),
    "mobile_pcb": (7.0, 9.0),
    "copper_wire": (3.5, 4.5),
    "copper_scrap": (4.0, 5.0),
    "aluminium_heatsink": (8.0, 11.0),
    "charger_adapter": (2.0, 3.0),
    "hard_drive": (4.0, 6.0),
    "power_supply": (3.0, 4.0),
    "printer": (2.5, 3.5),
    "crt_monitor_or_tv": (7.0, 10.0),
    "lcd_led_monitor_or_tv": (5.0, 7.5),
    "router_or_modem": (3.0, 4.0),
    "remote": (1.5, 2.0),
    "laptop": (5.0, 7.0),
    "desktop_cpu": (4.5, 6.5),
    "mobile_phone": (4.0, 6.0),
    "lead_acid_battery": (8.0, 12.0),
    "li_ion_battery": (6.0, 9.0),
    "alkaline_battery": (2.0, 3.0),
    "cfl_or_tube_light": (1.5, 2.0),
    "ups_unit": (5.0, 7.0),
    "split_ac": (18.0, 25.0),
    "window_ac": (15.0, 20.0),
    "refrigerator": (15.0, 20.0),
    "washing_machine": (10.0, 14.0),
    "microwave": (4.0, 6.0),
    "other": (2.0, 3.0),
}

# ─── LEVEL TIERS ────────────────────────────────────────────────────────────
LEVEL_TIERS = [
    {"level": 1, "name": "Kabaadi Novice", "min_xp": 0, "badge": "🌱", "perk": "Basic app access & eco tracking"},
    {"level": 2, "name": "Scrap Scout", "min_xp": 200, "badge": "🔍", "perk": "Profile badge & title unlocked"},
    {"level": 3, "name": "Recycler Rookie", "min_xp": 600, "badge": "⚡", "perk": "City leaderboard qualification"},
    {"level": 4, "name": "Circuit Saver", "min_xp": 1200, "badge": "🔌", "perk": "Streak challenge multipliers"},
    {"level": 5, "name": "Green Guardian", "min_xp": 2500, "badge": "🛡️", "perk": "Early access to verified recyclers"},
    {"level": 6, "name": "Eco Warrior", "min_xp": 5000, "badge": "⚔️", "perk": "Custom avatar frame & glow"},
    {"level": 7, "name": "E-Waste Expert", "min_xp": 10000, "badge": "🔬", "perk": "AI Waste Analyst full access"},
    {"level": 8, "name": "Bharat's Best Recycler", "min_xp": 20000, "badge": "🇮🇳", "perk": "Verified Green Recycler badge"},
    {"level": 9, "name": "Environmental Champion", "min_xp": 40000, "badge": "🏆", "perk": "Monthly official impact report"},
    {"level": 10, "name": "Prakriti Rakshak 🌿", "min_xp": 80000, "badge": "👑", "perk": "Permanent National Hall of Fame entry"},
]

# ─── 30 BADGES ─────────────────────────────────────────────────────────────
ALL_BADGES = [
    # Environmental (11)
    {"id": "first_scan", "category": "environmental", "name": "First Responder", "description": "Complete your very first e-waste scan", "rarity": "common", "icon": "📸", "xp": 100},
    {"id": "detective_10", "category": "environmental", "name": "E-Waste Detective", "description": "Scan 10 distinct item categories", "rarity": "common", "icon": "🕵️", "xp": 250},
    {"id": "copper_king", "category": "environmental", "name": "Copper King", "description": "Scan or divert over 5 kg of copper wire/scrap", "rarity": "uncommon", "icon": "➰", "xp": 350},
    {"id": "battery_buster", "category": "environmental", "name": "Battery Buster", "description": "Safely flag swollen or leaking lithium batteries", "rarity": "uncommon", "icon": "🔋", "xp": 300},
    {"id": "mercury_guard", "category": "environmental", "name": "Mercury Guardian", "description": "Safely handle mercury CFLs or tubes", "rarity": "uncommon", "icon": "💡", "xp": 300},
    {"id": "zero_landfill", "category": "environmental", "name": "Zero Landfill Hero", "description": "Route 5 lots to registered recyclers", "rarity": "rare", "icon": "♻️", "xp": 600},
    {"id": "century_scans", "category": "environmental", "name": "Century Recycler", "description": "Track 100 e-waste units safely", "rarity": "rare", "icon": "💯", "xp": 750},
    {"id": "cpcb_champion", "category": "environmental", "name": "CPCB Champion", "description": "Visit or route to official CPCB registered facilities", "rarity": "rare", "icon": "🏢", "xp": 800},
    {"id": "carbon_crusher", "category": "environmental", "name": "Carbon Crusher", "description": "Prevent over 50 kg of greenhouse CO2 emissions", "rarity": "epic", "icon": "☁️", "xp": 1200},
    {"id": "green_heart", "category": "environmental", "name": "City's Green Heart", "description": "Achieve top 10 rank in your city leaderboard", "rarity": "epic", "icon": "💚", "xp": 1500},
    {"id": "prakriti_mitra", "category": "environmental", "name": "Prakriti Mitra", "description": "Scan 500+ items and save 100+ trees equivalent", "rarity": "legendary", "icon": "🌳", "xp": 3000},

    # Knowledge & Safety (4)
    {"id": "safety_first", "category": "safety", "name": "Safety First", "description": "Review and acknowledge deterministic hazard guardrails", "rarity": "common", "icon": "⚠️", "xp": 150},
    {"id": "quiz_master", "category": "safety", "name": "Quiz Master", "description": "Pass the interactive e-waste hazard safety quiz", "rarity": "uncommon", "icon": "🎓", "xp": 350},
    {"id": "hazard_sentinel", "category": "safety", "name": "Hazard Sentinel", "description": "Identify 4 different types of environmental hazards", "rarity": "rare", "icon": "🛡️", "xp": 700},
    {"id": "toxin_terminator", "category": "safety", "name": "Toxin Terminator", "description": "Prevent lead, acid, and mercury contamination", "rarity": "epic", "icon": "☣️", "xp": 1200},

    # Community & Social (5)
    {"id": "neighborhood_hero", "category": "community", "name": "Neighborhood Hero", "description": "Post or accept a bulk pickup alert on the community board", "rarity": "common", "icon": "🚛", "xp": 250},
    {"id": "whatsapp_warrior", "category": "community", "name": "WhatsApp Warrior", "description": "Share 5 verified appraisals with local kabadiwalas", "rarity": "uncommon", "icon": "💬", "xp": 350},
    {"id": "recruiter", "category": "community", "name": "Green Ambassador", "description": "Invite friends who complete their first scan", "rarity": "rare", "icon": "🤝", "xp": 600},
    {"id": "society_captain", "category": "community", "name": "Society Captain", "description": "Organize society-level electronic cleanup drive", "rarity": "epic", "icon": "🏘️", "xp": 1200},
    {"id": "city_legend", "category": "community", "name": "City Legend", "description": "Hold #1 position on a metropolitan leaderboard", "rarity": "legendary", "icon": "👑", "xp": 3500},

    # Exploration (6)
    {"id": "map_maker", "category": "exploration", "name": "Map Maker", "description": "Scan items across 3 different postal pincodes", "rarity": "uncommon", "icon": "🗺️", "xp": 400},
    {"id": "hotspot_hunter", "category": "exploration", "name": "Hotspot Hunter", "description": "Locate e-waste accumulation in an active map cell", "rarity": "uncommon", "icon": "📍", "xp": 350},
    {"id": "night_owl", "category": "exploration", "name": "Midnight Recycler", "description": "Perform an audit scan after 9 PM", "rarity": "common", "icon": "🌙", "xp": 200},
    {"id": "weekend_warrior", "category": "exploration", "name": "Weekend Warrior", "description": "Complete cleanup scans over 3 consecutive weekends", "rarity": "uncommon", "icon": "📅", "xp": 450},
    {"id": "offline_hero", "category": "exploration", "name": "Offline Pioneer", "description": "Scan offline and sync successfully when back online", "rarity": "rare", "icon": "📡", "xp": 500},
    {"id": "globe_trotter", "category": "exploration", "name": "Bharat Explorer", "description": "Audit e-waste across multiple Indian cities", "rarity": "epic", "icon": "🚂", "xp": 1000},

    # Streaks & Special (4)
    {"id": "streak_3", "category": "streak", "name": "Consistent Collector", "description": "Maintain a 3-day active scanning streak", "rarity": "common", "icon": "🔥", "xp": 200},
    {"id": "streak_7", "category": "streak", "name": "Weekly Warrior", "description": "Maintain a 7-day active scanning streak", "rarity": "uncommon", "icon": "⚡", "xp": 500},
    {"id": "streak_30", "category": "streak", "name": "Month of Green", "description": "Maintain a 30-day active scanning streak", "rarity": "rare", "icon": "💎", "xp": 2000},
    {"id": "lucky_spinner", "category": "special", "name": "Lucky Recycler", "description": "Hit a jackpot on the Lucky Spin wheel", "rarity": "epic", "icon": "🎰", "xp": 777},
]

# ─── 28 COLLECTIBLE ITEM CARDS ─────────────────────────────────────────────
COLLECTIBLE_CARDS = [
    {"id": "motherboard", "name": "Motherboard", "category": "Computing", "rarity": "uncommon", "icon": "🧩", "value_range": "₹150–₹400/kg", "fact": "Contains up to 40x more gold per ton than raw gold ore from mining!"},
    {"id": "ram_stick", "name": "RAM Stick", "category": "Computing", "rarity": "uncommon", "icon": "💾", "value_range": "₹400–₹800/kg", "fact": "Gold plated contacts ensure high electrical conductivity and anti-oxidation."},
    {"id": "mobile_pcb", "name": "Mobile PCB", "category": "Telecom", "rarity": "rare", "icon": "📱", "value_range": "₹250–₹450/kg", "fact": "Dense concentrations of silver, palladium, and copper make it a prime target for hydrometallurgy."},
    {"id": "copper_wire", "name": "Insulated Copper Wire", "category": "Metals", "rarity": "rare", "icon": "➰", "value_range": "₹170–₹480/kg", "fact": "Copper is 100% recyclable with zero loss of conductivity or physical performance."},
    {"id": "copper_scrap", "name": "Heavy Copper Scrap", "category": "Metals", "rarity": "rare", "icon": "🟠", "value_range": "₹850–₹1,000/kg", "fact": "Recycling copper saves 85% of the energy compared to primary copper smelting."},
    {"id": "aluminium_heatsink", "name": "Aluminium Heatsink", "category": "Metals", "rarity": "uncommon", "icon": "🔩", "value_range": "₹180–₹350/kg", "fact": "Recycled aluminium saves 95% of greenhouse gas emissions versus bauxite refining."},
    {"id": "charger_adapter", "name": "Power Adapter / Charger", "category": "Accessories", "rarity": "common", "icon": "🔌", "value_range": "₹40–₹100/kg", "fact": "Over 50,000 tons of phone chargers are discarded globally each year."},
    {"id": "hard_drive", "name": "Mechanical Hard Drive", "category": "Computing", "rarity": "uncommon", "icon": "💽", "value_range": "₹50–₹100/pc", "fact": "Contains rare earth neodymium magnets inside the actuator arm mechanism."},
    {"id": "power_supply", "name": "Computer SMPS Unit", "category": "Computing", "rarity": "common", "icon": "⚡", "value_range": "₹30–₹70/pc", "fact": "Contains heavy copper transformer coils and aluminium cooling brackets."},
    {"id": "printer", "name": "Printer / Scanner", "category": "Office", "rarity": "common", "icon": "🖨️", "value_range": "₹30–₹60/kg", "fact": "Disassembling stepper motors yields recyclable copper and steel."},
    {"id": "crt_monitor_or_tv", "name": "CRT Monitor / TV", "category": "Displays", "rarity": "epic", "icon": "📺", "value_range": "₹100–₹300/pc", "fact": "Contains up to 3 kg of toxic lead in the funnel glass. Must never be smashed open!"},
    {"id": "lcd_led_monitor_or_tv", "name": "LCD / LED Monitor", "category": "Displays", "rarity": "rare", "icon": "🖥️", "value_range": "₹50–₹250/pc", "fact": "Older CCFL-backlit LCD panels contain trace mercury vapor lamps."},
    {"id": "router_or_modem", "name": "Wi-Fi Router / Modem", "category": "Telecom", "rarity": "common", "icon": "📡", "value_range": "₹20–₹60/kg", "fact": "Plastic casings are often flame-retardant ABS or polycarbonate blends."},
    {"id": "remote", "name": "Remote Controller", "category": "Accessories", "rarity": "common", "icon": "🎛️", "value_range": "₹5–₹30/kg", "fact": "Small carbon-pill switch pads can be recovered along with single-sided phenolic boards."},
    {"id": "laptop", "name": "Laptop Computer", "category": "Computing", "rarity": "rare", "icon": "💻", "value_range": "₹150–₹600/pc", "fact": "A complete laptop embodies up to 1,200 kWh of manufacturing energy."},
    {"id": "desktop_cpu", "name": "Desktop CPU Cabinet", "category": "Computing", "rarity": "rare", "icon": "🗄️", "value_range": "₹120–₹600/pc", "fact": "Often contains gold-cornered processors, steel chassis, and modular components."},
    {"id": "mobile_phone", "name": "Smart / Keypad Phone", "category": "Telecom", "rarity": "rare", "icon": "📱", "value_range": "₹50–₹350/pc", "fact": "1 million recycled mobile phones yield 16,000 kg of copper and 350 kg of silver!"},
    {"id": "li_ion_battery", "name": "Lithium-Ion Battery", "category": "Hazards", "rarity": "epic", "icon": "🔋", "value_range": "Hazardous (₹0)", "fact": "DANGER: High thermal runaway risk when swollen or pierced. Black mass recovers cobalt and lithium."},
    {"id": "alkaline_battery", "name": "Alkaline Battery (AA/AAA)", "category": "Hazards", "rarity": "common", "icon": "🪫", "value_range": "Hazardous (₹0)", "fact": "Contains zinc, manganese dioxide, and steel casing. Keep out of household trash."},
    {"id": "cfl_or_tube_light", "name": "CFL / Fluorescent Tube", "category": "Hazards", "rarity": "legendary", "icon": "💡", "value_range": "Hazardous (₹0)", "fact": "Contains toxic mercury vapor. Even 1 broken bulb can contaminate 20,000 liters of drinking water."},
    {"id": "lead_acid_battery", "name": "Lead-Acid Inverter Battery", "category": "Hazards", "rarity": "epic", "icon": "🔋", "value_range": "₹85–₹130/kg", "fact": "Contains 60% lead and sulfuric acid electrolyte. Registered smelters recover over 97% of lead."},
    {"id": "ups_unit", "name": "Home / Office UPS Unit", "category": "Power", "rarity": "uncommon", "icon": "🔌", "value_range": "₹200–₹800/pc", "fact": "Heavy internal transformers contain high-purity copper and silicon steel laminations."},
    {"id": "split_ac", "name": "Split Air Conditioner", "category": "Appliances", "rarity": "legendary", "icon": "❄️", "value_range": "₹2,000–₹5,500/pc", "fact": "Refrigerant must be recovered with closed evacuation pumps to prevent ozone and global warming damage."},
    {"id": "window_ac", "name": "Window Air Conditioner", "category": "Appliances", "rarity": "legendary", "icon": "❄️", "value_range": "₹1,500–₹5,000/pc", "fact": "Heavy rotary compressor contains substantial copper winding and cast iron casing."},
    {"id": "refrigerator", "name": "Refrigerator", "category": "Appliances", "rarity": "legendary", "icon": "🧊", "value_range": "₹500–₹9,000/pc", "fact": "Compressor oil and cyclopentane insulation foam require specialized professional degassing."},
    {"id": "washing_machine", "name": "Washing Machine", "category": "Appliances", "rarity": "legendary", "icon": "🧺", "value_range": "₹700–₹800/pc", "fact": "Stainless steel inner drum and induction drive motor carry substantial circular scrap value."},
    {"id": "microwave", "name": "Microwave Oven", "category": "Appliances", "rarity": "rare", "icon": "🍲", "value_range": "₹150–₹1,000/pc", "fact": "The high-voltage transformer and magnetron contain copper wire and heavy ferrite magnets."},
    {"id": "other", "name": "Miscellaneous Electronics", "category": "Mixed", "rarity": "common", "icon": "📦", "value_range": "Varies by item", "fact": "Every electronic device contains valuable materials that belong in circular recycling facilities."},
]

# ─── 5 STORY QUESTS ────────────────────────────────────────────────────────
STORY_QUESTS = [
    {
        "id": "quest_apprentice",
        "title": "The Kabaadi's Apprentice",
        "description": "Master the fundamentals of AI-powered e-waste identification and safety.",
        "icon": "🎓",
        "total_xp": 500,
        "steps": [
            {"id": "step_scan", "text": "Scan your first e-waste item", "reward_xp": 100},
            {"id": "step_hazard", "text": "Identify any hazardous component (battery, lamp, or CRT)", "reward_xp": 150},
            {"id": "step_recycler", "text": "Find and view a registered CPCB recycler", "reward_xp": 100},
            {"id": "step_share", "text": "Generate a fair WhatsApp appraisal card", "reward_xp": 150},
        ],
    },
    {
        "id": "quest_copper",
        "title": "The Copper Trail",
        "description": "Trace and divert valuable conductive copper from informal burn yards.",
        "icon": "➰",
        "total_xp": 900,
        "steps": [
            {"id": "step_find_wire", "text": "Scan insulated wire or copper scrap", "reward_xp": 200},
            {"id": "step_weigh", "text": "Provide calibrated lot weight on your scan", "reward_xp": 300},
            {"id": "step_route_cpcb", "text": "Route copper to an authorized metal recovery center", "reward_xp": 400},
        ],
    },
    {
        "id": "quest_safety",
        "title": "Safety Sentinel",
        "description": "Safeguard health by preventing open battery burning and mercury poisoning.",
        "icon": "🛡️",
        "total_xp": 1200,
        "steps": [
            {"id": "step_listen_tts", "text": "Listen to bilingual voice safety instructions", "reward_xp": 200},
            {"id": "step_flag_hazards", "text": "Scan and safely isolate 2 hazardous components", "reward_xp": 400},
            {"id": "step_quiz", "text": "Complete the hazard awareness safety check", "reward_xp": 600},
        ],
    },
    {
        "id": "quest_community",
        "title": "Community Champion",
        "description": "Mobilize your apartment society or neighborhood for clean e-waste collection.",
        "icon": "🏘️",
        "total_xp": 1500,
        "steps": [
            {"id": "step_pickup", "text": "Post or review a bulk pickup alert on the board", "reward_xp": 300},
            {"id": "step_hotspot", "text": "Explore neighborhood hotzones on the Leaflet map", "reward_xp": 400},
            {"id": "step_refer", "text": "Share your referral link with a neighbor or colleague", "reward_xp": 800},
        ],
    },
    {
        "id": "quest_legend",
        "title": "The Great Indian Recycler",
        "description": "Achieve legendary status by diverting over 25 kg of e-waste responsibly.",
        "icon": "👑",
        "total_xp": 3000,
        "steps": [
            {"id": "step_level_5", "text": "Reach Level 5 (Green Guardian)", "reward_xp": 500},
            {"id": "step_streak_7", "text": "Build a 7-day scanning streak", "reward_xp": 1000},
            {"id": "step_divert_25kg", "text": "Divert 25+ kg of electronic scrap from landfills", "reward_xp": 1500},
        ],
    },
]

# ─── DAILY & WEEKLY CHALLENGES TEMPLATES ───────────────────────────────────
def get_current_challenges():
    today = date.today().isoformat()
    return [
        {"id": f"daily_scan_{today}", "title": "Daily Eco Scan", "text": "Scan at least 1 e-waste item today", "xp": 150, "target": 1, "type": "daily", "icon": "📸"},
        {"id": f"daily_hazard_{today}", "title": "Hazard Watch", "text": "Check an item's condition or hazard guardrails", "xp": 200, "target": 1, "type": "daily", "icon": "⚠️"},
        {"id": f"daily_gps_{today}", "title": "Location Contributor", "text": "Attach location to help build the hotspot map", "xp": 120, "target": 1, "type": "daily", "icon": "📍"},
        {"id": f"weekly_3scans_{today[:7]}", "title": "Weekly Habit", "text": "Complete 3 distinct scans this week", "xp": 600, "target": 3, "type": "weekly", "icon": "⚡"},
        {"id": f"weekly_drop_{today[:7]}", "title": "Recycler Route", "text": "Navigate to an authorized recycler or drop-off point", "xp": 800, "target": 1, "type": "weekly", "icon": "🏢"},
    ]

# ─── HELPER: CALCULATE LEVEL ───────────────────────────────────────────────
def calculate_level(xp):
    current = LEVEL_TIERS[0]
    next_tier = LEVEL_TIERS[1] if len(LEVEL_TIERS) > 1 else None
    for i, tier in enumerate(LEVEL_TIERS):
        if xp >= tier["min_xp"]:
            current = tier
            next_tier = LEVEL_TIERS[i + 1] if i + 1 < len(LEVEL_TIERS) else None
        else:
            break
    
    current_tier_min = current["min_xp"]
    next_tier_min = next_tier["min_xp"] if next_tier else current_tier_min + 50000
    tier_progress_xp = max(0, xp - current_tier_min)
    tier_span_xp = max(1, next_tier_min - current_tier_min)
    percent = min(100, int((tier_progress_xp / tier_span_xp) * 100))

    return {
        "level": current["level"],
        "name": current["name"],
        "badge": current["badge"],
        "perk": current["perk"],
        "current_xp": xp,
        "next_level_xp": next_tier_min,
        "progress_percent": percent,
        "is_max_level": next_tier is None,
    }

# ─── HELPER: CALCULATE STREAK ──────────────────────────────────────────────
def update_user_streak(last_scan_date, current_streak, freeze_tokens=1):
    today = date.today()
    today_str = today.isoformat()
    yesterday_str = (today - timedelta(days=1)).isoformat()
    day_before_str = (today - timedelta(days=2)).isoformat()

    if not last_scan_date:
        return {"streak": 1, "last_scan_date": today_str, "multiplier": 1.0, "freeze_tokens": freeze_tokens, "used_freeze": False}

    if last_scan_date == today_str:
        multiplier = 2.0 if current_streak >= 30 else (1.5 if current_streak >= 14 else (1.25 if current_streak >= 7 else (1.1 if current_streak >= 3 else 1.0)))
        return {"streak": current_streak, "last_scan_date": today_str, "multiplier": multiplier, "freeze_tokens": freeze_tokens, "used_freeze": False}

    if last_scan_date == yesterday_str:
        new_streak = current_streak + 1
        # Award extra freeze token every 10 days
        new_freezes = min(3, freeze_tokens + (1 if new_streak % 10 == 0 else 0))
        multiplier = 2.0 if new_streak >= 30 else (1.5 if new_streak >= 14 else (1.25 if new_streak >= 7 else (1.1 if new_streak >= 3 else 1.0)))
        return {"streak": new_streak, "last_scan_date": today_str, "multiplier": multiplier, "freeze_tokens": new_freezes, "used_freeze": False}

    if last_scan_date == day_before_str and freeze_tokens > 0:
        # Used a freeze token to save the streak!
        new_streak = current_streak + 1
        multiplier = 1.1 if new_streak >= 3 else 1.0
        return {"streak": new_streak, "last_scan_date": today_str, "multiplier": multiplier, "freeze_tokens": freeze_tokens - 1, "used_freeze": True}

    # Reset streak
    return {"streak": 1, "last_scan_date": today_str, "multiplier": 1.0, "freeze_tokens": freeze_tokens, "used_freeze": False}

# ─── HELPER: CALCULATE ENVIRONMENTAL IMPACT ────────────────────────────────
def calculate_environmental_impact(items):
    co2_kg = 0.0
    energy_kwh = 0.0
    total_weight_g = 0

    for it in items:
        comp = it.get("component", "other")
        wt_g = it.get("est_weight_g", 0) or 0
        cnt = it.get("count", 1) or 1
        total_weight_g += wt_g

        # If weight is 0, estimate default unit weight for whole items
        if wt_g <= 0:
            defaults = {
                "laptop": 2200, "desktop_cpu": 6500, "mobile_phone": 180,
                "crt_monitor_or_tv": 12000, "lcd_led_monitor_or_tv": 4500,
                "motherboard": 350, "ram_stick": 30, "power_supply": 1200,
                "refrigerator": 45000, "split_ac": 35000, "washing_machine": 30000,
            }
            wt_g = defaults.get(comp, 200) * cnt

        factors = IMPACT_FACTORS.get(comp, (2.0, 3.0))
        kg = wt_g / 1000.0
        co2_kg += kg * factors[0]
        energy_kwh += kg * factors[1]

    trees_eq = round(co2_kg / 20.0, 2)  # 1 mature tree absorbs ~20kg CO2/year
    return {
        "co2_offset_kg": round(co2_kg, 2),
        "energy_saved_kwh": round(energy_kwh, 2),
        "trees_equivalent": trees_eq,
        "total_weight_kg": round(total_weight_g / 1000.0, 2),
    }

# ─── LEADERBOARD GENERATION ────────────────────────────────────────────────
def get_mock_leaderboard(city="delhi", user_id="me", user_name="You", user_xp=1250, user_diverted_kg=14.5):
    delhi_names = [
        ("Aarav Sharma", 14500, 185.0, "https://api.dicebear.com/7.x/bottts/svg?seed=Aarav"),
        ("Sunita Verma", 11200, 142.2, "https://api.dicebear.com/7.x/bottts/svg?seed=Sunita"),
        ("Vikram Chauhan", 8900, 110.8, "https://api.dicebear.com/7.x/bottts/svg?seed=Vikram"),
        ("Priya Nair", 6700, 84.0, "https://api.dicebear.com/7.x/bottts/svg?seed=Priya"),
        ("Rajesh Kabadiwala", 5400, 72.5, "https://api.dicebear.com/7.x/bottts/svg?seed=Rajesh"),
        ("Ananya Das", 4300, 56.1, "https://api.dicebear.com/7.x/bottts/svg?seed=Ananya"),
        ("Mohd. Imran", 3200, 41.0, "https://api.dicebear.com/7.x/bottts/svg?seed=Imran"),
        ("Deepak Kumar", 2100, 28.3, "https://api.dicebear.com/7.x/bottts/svg?seed=Deepak"),
    ]
    national_names = [
        ("Green Earth Bangalore", 28500, 390.0, "https://api.dicebear.com/7.x/bottts/svg?seed=Blr"),
        ("Eco Recyclers Mumbai", 24100, 310.5, "https://api.dicebear.com/7.x/bottts/svg?seed=Mum"),
        ("Delhi Circular Hub", 19800, 260.0, "https://api.dicebear.com/7.x/bottts/svg?seed=Del"),
        ("Kolkata Clean Electronics", 16200, 215.0, "https://api.dicebear.com/7.x/bottts/svg?seed=Kol"),
        ("Pune Scrap Warriors", 13400, 175.2, "https://api.dicebear.com/7.x/bottts/svg?seed=Pune"),
        ("Hyderabad Green Force", 11000, 140.0, "https://api.dicebear.com/7.x/bottts/svg?seed=Hyd"),
    ]

    source = delhi_names if city.lower() in ("delhi", "delhi-ncr", "ncr") else national_names

    board = []
    inserted_user = False
    for i, (name, xp, kg, avatar) in enumerate(source):
        if not inserted_user and user_xp >= xp:
            board.append({
                "rank": len(board) + 1,
                "user_id": user_id,
                "name": f"{user_name} (You)",
                "xp": user_xp,
                "kg_diverted": user_diverted_kg,
                "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=" + user_name,
                "is_current_user": True,
                "level": calculate_level(user_xp)["name"]
            })
            inserted_user = True
        board.append({
            "rank": len(board) + 1,
            "user_id": f"user_{i}",
            "name": name,
            "xp": xp,
            "kg_diverted": kg,
            "avatar": avatar,
            "is_current_user": False,
            "level": calculate_level(xp)["name"]
        })

    if not inserted_user:
        board.append({
            "rank": len(board) + 1,
            "user_id": user_id,
            "name": f"{user_name} (You)",
            "xp": user_xp,
            "kg_diverted": user_diverted_kg,
            "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=" + user_name,
            "is_current_user": True,
            "level": calculate_level(user_xp)["name"]
        })

    return board[:20]

# ─── RESPONSE HELPER ───────────────────────────────────────────────────────
def _res(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization"
        },
        "body": json.dumps(body)
    }

# ─── LAMBDA HANDLER ────────────────────────────────────────────────────────
def handler(event, context):
    http_method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET"
    path = event.get("rawPath") or event.get("path") or ""

    if http_method == "OPTIONS":
        return _res(200, {"ok": True})

    try:
        # Route 1: POST /gamification/scan-reward
        if "/scan-reward" in path:
            body = json.loads(event.get("body") or "{}")
            user_id = body.get("user_id") or "guest"
            items = body.get("items", [])
            hazards = body.get("hazards", [])
            has_coords = bool(body.get("has_coords"))
            is_offline_sync = bool(body.get("is_offline_sync"))
            user_weight_provided = bool(body.get("user_weight_provided"))
            last_scan_date = body.get("last_scan_date")
            current_streak = int(body.get("current_streak", 0))
            freeze_tokens = int(body.get("freeze_tokens", 1))
            known_cards = set(body.get("known_cards", []))

            # 1. Base scan XP
            base_xp = 50
            bonuses = []

            # Hazard detection bonus
            if hazards:
                hazard_bonus = 30 * len(hazards)
                base_xp += hazard_bonus
                bonuses.append({"reason": "Hazard Safety Identification", "xp": hazard_bonus})

            # GPS location bonus
            if has_coords:
                base_xp += 15
                bonuses.append({"reason": "GPS Hotspot Contribution", "xp": 15})

            # User weight calibrated bonus
            if user_weight_provided:
                base_xp += 20
                bonuses.append({"reason": "Scale Weight Calibration", "xp": 20})

            # Offline sync resilience bonus
            if is_offline_sync:
                base_xp += 35
                bonuses.append({"reason": "Offline PWA Sync Hero", "xp": 35})

            # New card discovery bonus (first time scanning item)
            new_cards = []
            for it in items:
                comp = it.get("component")
                if comp and comp not in known_cards:
                    new_cards.append(comp)
                    known_cards.add(comp)
            if new_cards:
                card_bonus = 100 * len(new_cards)
                base_xp += card_bonus
                bonuses.append({"reason": f"Discovered {len(new_cards)} New E-Waste Card(s)!", "xp": card_bonus})

            # 2. Streak evaluation
            streak_res = update_user_streak(last_scan_date, current_streak, freeze_tokens)
            multiplier = streak_res["multiplier"]
            total_earned_xp = int(base_xp * multiplier)

            if multiplier > 1.0:
                bonuses.append({"reason": f"{streak_res['streak']}-Day Streak Bonus ({multiplier}x)", "xp": total_earned_xp - base_xp})

            # 3. Environmental Impact
            impact = calculate_environmental_impact(items)

            # 4. Check for Lucky Spin trigger (1 in 10 chance or if multiple items)
            lucky_trigger = (random.random() < 0.20) or (len(items) >= 3)

            return _res(200, {
                "base_xp": base_xp,
                "total_xp": total_earned_xp,
                "multiplier": multiplier,
                "bonuses": bonuses,
                "streak": streak_res,
                "environmental_impact": impact,
                "new_cards_unlocked": new_cards,
                "lucky_spin_eligible": lucky_trigger,
            })

        # Route 2: GET /gamification/profile
        elif "/profile" in path:
            return _res(200, {
                "level_tiers": LEVEL_TIERS,
                "all_badges": ALL_BADGES,
                "collectible_cards": COLLECTIBLE_CARDS,
                "story_quests": STORY_QUESTS,
                "challenges": get_current_challenges(),
            })

        # Route 3: GET /gamification/leaderboard
        elif "/leaderboard" in path:
            params = event.get("queryStringParameters") or {}
            city = params.get("city", "delhi")
            user_xp = int(params.get("xp", 1250))
            user_name = params.get("name", "You")
            user_kg = float(params.get("kg", 14.5))

            board = get_mock_leaderboard(city=city, user_name=user_name, user_xp=user_xp, user_diverted_kg=user_kg)
            return _res(200, {
                "city": city,
                "leaderboard": board,
                "total_participants": 2840,
                "city_total_kg": 18450.0,
            })

        # Route 4: POST /gamification/lucky-spin
        elif "/lucky-spin" in path:
            # Random weighted spin rewards
            weights = [(50, 0.35), (100, 0.30), (150, 0.15), (200, 0.10), (300, 0.07), (500, 0.03)]
            r = random.random()
            acc = 0.0
            chosen_xp = 50
            for val, w in weights:
                acc += w
                if r <= acc:
                    chosen_xp = val
                    break

            return _res(200, {
                "won_xp": chosen_xp,
                "message": f"🎉 Lucky Spin Jackpot! You earned +{chosen_xp} bonus XP!",
                "jackpot": chosen_xp >= 300,
            })

        # Default fallback
        return _res(200, {
            "service": "KabadiAI Gamification Engine",
            "version": "1.0.0",
            "active_challenges": get_current_challenges(),
        })

    except Exception as e:
        print("gamification error:", repr(e))
        return _res(500, {"error": "gamification request failed", "details": str(e)})
