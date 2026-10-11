export type BadgeRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type BadgeCategory = "environmental" | "safety" | "community" | "exploration" | "streak" | "special";

export interface Badge {
  id: string;
  category: BadgeCategory;
  name: string;
  hindiName: string;
  description: string;
  rarity: BadgeRarity;
  icon: string;
  xp: number;
}

export interface CollectibleCard {
  id: string;
  name: string;
  hindiName: string;
  category: string;
  rarity: BadgeRarity;
  icon: string;
  value_range: string;
  fact: string;
  ecoTip: string;
}

export interface LevelTier {
  level: number;
  name: string;
  hindiName: string;
  min_xp: number;
  badge: string;
  perk: string;
}

export interface QuestStep {
  id: string;
  text: string;
  reward_xp: number;
  completed?: boolean;
}

export interface StoryQuest {
  id: string;
  title: string;
  description: string;
  icon: string;
  total_xp: number;
  steps: QuestStep[];
}

export interface Challenge {
  id: string;
  title: string;
  text: string;
  xp: number;
  target: number;
  current: number;
  type: "daily" | "weekly";
  icon: string;
  completed: boolean;
  claimed: boolean;
}

export const LEVEL_TIERS: LevelTier[] = [
  { level: 1, name: "Kabaadi Novice", hindiName: "कबाड़ी नौसिखिया", min_xp: 0, badge: "🌱", perk: "Basic app access & eco tracking" },
  { level: 2, name: "Scrap Scout", hindiName: "स्क्रैप स्काउट", min_xp: 200, badge: "🔍", perk: "Profile badge & title unlocked" },
  { level: 3, name: "Recycler Rookie", hindiName: "रीसायकलर रूकी", min_xp: 600, badge: "⚡", perk: "City leaderboard qualification" },
  { level: 4, name: "Circuit Saver", hindiName: "सर्किट रक्षक", min_xp: 1200, badge: "🔌", perk: "Streak challenge multipliers" },
  { level: 5, name: "Green Guardian", hindiName: "हरित संरक्षक", min_xp: 2500, badge: "🛡️", perk: "Early access to verified recyclers" },
  { level: 6, name: "Eco Warrior", hindiName: "पर्यावरण योद्धा", min_xp: 5000, badge: "⚔️", perk: "Custom avatar frame & glow" },
  { level: 7, name: "E-Waste Expert", hindiName: "ई-कचरा विशेषज्ञ", min_xp: 10000, badge: "🔬", perk: "AI Waste Analyst full access" },
  { level: 8, name: "Bharat's Best Recycler", hindiName: "भारत का श्रेष्ठ रीसायकलर", min_xp: 20000, badge: "🇮🇳", perk: "Verified Green Recycler badge" },
  { level: 9, name: "Environmental Champion", hindiName: "पर्यावरण चैंपियन", min_xp: 40000, badge: "🏆", perk: "Monthly official impact report" },
  { level: 10, name: "Prakriti Rakshak 🌿", hindiName: "प्रकृति रक्षक 🌿", min_xp: 80000, badge: "👑", perk: "Permanent National Hall of Fame entry" },
];

export const ALL_BADGES: Badge[] = [
  // Environmental (11)
  { id: "first_scan", category: "environmental", name: "First Responder", hindiName: "प्रथम प्रतिक्रिया", description: "Complete your very first e-waste scan", rarity: "common", icon: "📸", xp: 100 },
  { id: "detective_10", category: "environmental", name: "E-Waste Detective", hindiName: "ई-कचरा जासूस", description: "Scan 10 distinct item categories", rarity: "common", icon: "🕵️", xp: 250 },
  { id: "copper_king", category: "environmental", name: "Copper King", hindiName: "तांबा सम्राट", description: "Scan or divert over 5 kg of copper wire/scrap", rarity: "uncommon", icon: "➰", xp: 350 },
  { id: "battery_buster", category: "environmental", name: "Battery Buster", hindiName: "बैटरी रक्षक", description: "Safely flag swollen or leaking lithium batteries", rarity: "uncommon", icon: "🔋", xp: 300 },
  { id: "mercury_guard", category: "environmental", name: "Mercury Guardian", hindiName: "पारा संरक्षक", description: "Safely isolate mercury CFLs or fluorescent tubes", rarity: "uncommon", icon: "💡", xp: 300 },
  { id: "zero_landfill", category: "environmental", name: "Zero Landfill Hero", hindiName: "शून्य लैंडफिल नायक", description: "Route 5 lots to registered recyclers", rarity: "rare", icon: "♻️", xp: 600 },
  { id: "century_scans", category: "environmental", name: "Century Recycler", hindiName: "शतक रीसायकलर", description: "Track 100 e-waste units safely", rarity: "rare", icon: "💯", xp: 750 },
  { id: "cpcb_champion", category: "environmental", name: "CPCB Champion", hindiName: "CPCB चैंपियन", description: "Visit or route to official CPCB registered facilities", rarity: "rare", icon: "🏢", xp: 800 },
  { id: "carbon_crusher", category: "environmental", name: "Carbon Crusher", hindiName: "कार्बन रक्षक", description: "Prevent over 50 kg of greenhouse CO2 emissions", rarity: "epic", icon: "☁️", xp: 1200 },
  { id: "green_heart", category: "environmental", name: "City's Green Heart", hindiName: "शहर का हरित दिल", description: "Achieve top 10 rank in your city leaderboard", rarity: "epic", icon: "💚", xp: 1500 },
  { id: "prakriti_mitra", category: "environmental", name: "Prakriti Mitra", hindiName: "प्रकृति मित्र", description: "Scan 500+ items and save 100+ trees equivalent", rarity: "legendary", icon: "🌳", xp: 3000 },

  // Knowledge & Safety (4)
  { id: "safety_first", category: "safety", name: "Safety First", hindiName: "सुरक्षा सर्वोपरि", description: "Review and acknowledge deterministic hazard guardrails", rarity: "common", icon: "⚠️", xp: 150 },
  { id: "quiz_master", category: "safety", name: "Quiz Master", hindiName: "क्विज़ मास्टर", description: "Pass the interactive e-waste hazard safety quiz", rarity: "uncommon", icon: "🎓", xp: 350 },
  { id: "hazard_sentinel", category: "safety", name: "Hazard Sentinel", hindiName: "खतरा संतरी", description: "Identify 4 different types of environmental hazards", rarity: "rare", icon: "🛡️", xp: 700 },
  { id: "toxin_terminator", category: "safety", name: "Toxin Terminator", hindiName: "विषनाशक", description: "Prevent lead, acid, and mercury contamination", rarity: "epic", icon: "☣️", xp: 1200 },

  // Community & Social (5)
  { id: "neighborhood_hero", category: "community", name: "Neighborhood Hero", hindiName: "मोहल्ला नायक", description: "Post or accept a bulk pickup alert on community board", rarity: "common", icon: "🚛", xp: 250 },
  { id: "whatsapp_warrior", category: "community", name: "WhatsApp Warrior", hindiName: "व्हाट्सएप योद्धा", description: "Share 5 verified appraisals with local kabadiwalas", rarity: "uncommon", icon: "💬", xp: 350 },
  { id: "recruiter", category: "community", name: "Green Ambassador", hindiName: "हरित राजदूत", description: "Invite friends who complete their first scan", rarity: "rare", icon: "🤝", xp: 600 },
  { id: "society_captain", category: "community", name: "Society Captain", hindiName: "सोसायटी कप्तान", description: "Organize society-level electronic cleanup drive", rarity: "epic", icon: "🏘️", xp: 1200 },
  { id: "city_legend", category: "community", name: "City Legend", hindiName: "नगर लीजेंड", description: "Hold #1 position on a metropolitan leaderboard", rarity: "legendary", icon: "👑", xp: 3500 },

  // Exploration (6)
  { id: "map_maker", category: "exploration", name: "Map Maker", hindiName: "मानचित्र निर्माता", description: "Scan items across 3 different postal pincodes", rarity: "uncommon", icon: "🗺️", xp: 400 },
  { id: "hotspot_hunter", category: "exploration", name: "Hotspot Hunter", hindiName: "हॉटस्पॉट शिकारी", description: "Locate e-waste accumulation in an active map cell", rarity: "uncommon", icon: "📍", xp: 350 },
  { id: "night_owl", category: "exploration", name: "Midnight Recycler", hindiName: "रात्रि रीसायकलर", description: "Perform an audit scan after 9 PM", rarity: "common", icon: "🌙", xp: 200 },
  { id: "weekend_warrior", category: "exploration", name: "Weekend Warrior", hindiName: "सप्ताहांत योद्धा", description: "Complete cleanup scans over 3 consecutive weekends", rarity: "uncommon", icon: "📅", xp: 450 },
  { id: "offline_hero", category: "exploration", name: "Offline Pioneer", hindiName: "ऑफलाइन पायनियर", description: "Scan offline and sync successfully when back online", rarity: "rare", icon: "📡", xp: 500 },
  { id: "globe_trotter", category: "exploration", name: "Bharat Explorer", hindiName: "भारत खोजी", description: "Audit e-waste across multiple Indian cities", rarity: "epic", icon: "🚂", xp: 1000 },

  // Streaks & Special (4)
  { id: "streak_3", category: "streak", name: "Consistent Collector", hindiName: "नियमित संग्रहकर्ता", description: "Maintain a 3-day active scanning streak", rarity: "common", icon: "🔥", xp: 200 },
  { id: "streak_7", category: "streak", name: "Weekly Warrior", hindiName: "साप्ताहिक योद्धा", description: "Maintain a 7-day active scanning streak", rarity: "uncommon", icon: "⚡", xp: 500 },
  { id: "streak_30", category: "streak", name: "Month of Green", hindiName: "हरित माह", description: "Maintain a 30-day active scanning streak", rarity: "rare", icon: "💎", xp: 2000 },
  { id: "lucky_spinner", category: "special", name: "Lucky Recycler", hindiName: "भाग्यशाली रीसायकलर", description: "Hit a jackpot on the Lucky Spin wheel", rarity: "epic", icon: "🎰", xp: 777 },
];

export const COLLECTIBLE_CARDS: CollectibleCard[] = [
  { id: "motherboard", name: "Motherboard", hindiName: "मदरबोर्ड", category: "Computing", rarity: "uncommon", icon: "🧩", value_range: "₹150–₹400/kg", fact: "Contains up to 40x more gold per ton than raw mined gold ore!", ecoTip: "Never burn PCBs; acid smoke destroys lungs and groundwater." },
  { id: "ram_stick", name: "RAM Stick", hindiName: "रैम स्टिक", category: "Computing", rarity: "uncommon", icon: "💾", value_range: "₹400–₹800/kg", fact: "Pure gold-plated finger pins ensure fast electrical conductivity.", ecoTip: "Keep contacts clean and dry for maximum scrap value." },
  { id: "mobile_pcb", name: "Mobile PCB", hindiName: "मोबाइल बोर्ड", category: "Telecom", rarity: "rare", icon: "📱", value_range: "₹250–₹450/kg", fact: "High concentrations of palladium, silver, and copper in micro-circuits.", ecoTip: "Small footprint, massive circular recovery value." },
  { id: "copper_wire", name: "Copper Wire", hindiName: "तांबे का तार", category: "Metals", rarity: "rare", icon: "➰", value_range: "₹170–₹480/kg", fact: "100% recyclable with zero degradation of physical performance.", ecoTip: "Stripping plastic mechanically is safe; burning wire is illegal." },
  { id: "copper_scrap", name: "Heavy Copper", hindiName: "शुद्ध तांबा", category: "Metals", rarity: "rare", icon: "🟠", value_range: "₹850–₹1,000/kg", fact: "Recycled copper saves 85% of energy versus primary mining smelting.", ecoTip: "One of the most valuable circular commodities in India." },
  { id: "aluminium_heatsink", name: "Aluminium Heatsink", hindiName: "एल्युमिनियम हीटसिंक", category: "Metals", rarity: "uncommon", icon: "🔩", value_range: "₹180–₹350/kg", fact: "Recycled aluminium saves 95% of greenhouse emissions versus bauxite.", ecoTip: "Easily separated from motherboards with simple screwdriver." },
  { id: "charger_adapter", name: "Charger Adapter", hindiName: "चार्जर / अडैप्टर", category: "Accessories", rarity: "common", icon: "🔌", value_range: "₹40–₹100/kg", fact: "Over 50,000 tons of phone chargers are discarded globally every year.", ecoTip: "Copper transformer coils inside are fully recyclable." },
  { id: "hard_drive", name: "Hard Drive (HDD)", hindiName: "हार्ड ड्राइव", category: "Computing", rarity: "uncommon", icon: "💽", value_range: "₹50–₹100/pc", fact: "Contains powerful rare earth neodymium magnets in the head arm.", ecoTip: "Ensure data is wiped before handing over for recycling." },
  { id: "power_supply", name: "Computer SMPS", hindiName: "कंप्यूटर एसएमपीएस", category: "Computing", rarity: "common", icon: "⚡", value_range: "₹30–₹70/pc", fact: "Contains high-mass copper windings and solid aluminium cooling fins.", ecoTip: "Capacitors hold charge; handle casing with care." },
  { id: "printer", name: "Office Printer", hindiName: "प्रिंटर / स्कैनर", category: "Office", rarity: "common", icon: "🖨️", value_range: "₹30–₹60/kg", fact: "Stepper motors and power supplies contain rich recyclable copper.", ecoTip: "Remove leftover ink toner cartridges before recycling." },
  { id: "crt_monitor_or_tv", name: "CRT Monitor / TV", hindiName: "CRT टीवी / मॉनिटर", category: "Displays", rarity: "epic", icon: "📺", value_range: "₹100–₹300/pc", fact: "Contains up to 3 kg of toxic lead glass in the vacuum picture tube.", ecoTip: "NEVER smash open! Vacuum implosion spreads toxic lead dust." },
  { id: "lcd_led_monitor_or_tv", name: "LCD / LED Monitor", hindiName: "एलसीडी मॉनिटर", category: "Displays", rarity: "rare", icon: "🖥️", value_range: "₹50–₹250/pc", fact: "Older CCFL-backlit LCD panels contain delicate mercury lamps.", ecoTip: "Keep glass panel intact to prevent phosphor leakage." },
  { id: "router_or_modem", name: "Wi-Fi Router", hindiName: "वाई-फाई रूटर", category: "Telecom", rarity: "common", icon: "📡", value_range: "₹20–₹60/kg", fact: "Plastic housings are high-grade flame-retardant ABS polymers.", ecoTip: "Route to authorized recyclers for plastic regranulation." },
  { id: "remote", name: "Remote Control", hindiName: "रिमोट कंट्रोल", category: "Accessories", rarity: "common", icon: "🎛️", value_range: "₹5–₹30/kg", fact: "Carbon pill keys and FR-2 boards can be separated effortlessly.", ecoTip: "Always remove dead alkaline batteries before disposing." },
  { id: "laptop", name: "Laptop Computer", hindiName: "लैपटॉप", category: "Computing", rarity: "rare", icon: "💻", value_range: "₹150–₹600/pc", fact: "A single laptop embodies up to 1,200 kWh of manufacturing energy.", ecoTip: "Refurbishing parts saves 80% more energy than raw shredding." },
  { id: "desktop_cpu", name: "Desktop CPU", hindiName: "डेस्कटॉप सीपीयू", category: "Computing", rarity: "rare", icon: "🗄️", value_range: "₹120–₹600/pc", fact: "Modular internal components provide multiple high-yield scrap streams.", ecoTip: "Steel chassis, copper cables, and gold processors." },
  { id: "mobile_phone", name: "Mobile Phone", hindiName: "मोबाइल फोन", category: "Telecom", rarity: "rare", icon: "📱", value_range: "₹50–₹350/pc", fact: "1 million recycled phones yield 16,000 kg of copper and 350 kg of silver!", ecoTip: "Check for battery swelling before storing in scrap piles." },
  { id: "li_ion_battery", name: "Lithium Battery", hindiName: "लिथियम बैटरी", category: "Hazards", rarity: "epic", icon: "🔋", value_range: "Hazardous (₹0)", fact: "High thermal runaway fire hazard when punctured or crushed.", ecoTip: "Isolate in non-conductive sand or tape terminals." },
  { id: "alkaline_battery", name: "Alkaline Battery", hindiName: "अल्कलाइन सेल", category: "Hazards", rarity: "common", icon: "🪫", value_range: "Hazardous (₹0)", fact: "Contains zinc, manganese dioxide, and steel casing.", ecoTip: "Never throw in household wet waste; toxic to soil." },
  { id: "cfl_or_tube_light", name: "CFL / Tube Light", hindiName: "CFL / ट्यूबलाइट", category: "Hazards", rarity: "legendary", icon: "💡", value_range: "Hazardous (₹0)", fact: "Contains toxic mercury vapor. 1 broken bulb can taint 20,000L of water.", ecoTip: "Do not break tube. Deliver intact to take-back centers." },
  { id: "lead_acid_battery", name: "Inverter Battery", hindiName: "लेड-एसिड बैटरी", category: "Hazards", rarity: "epic", icon: "🔋", value_range: "₹85–₹130/kg", fact: "Contains 60% lead and sulfuric acid electrolyte.", ecoTip: "CPCB authorized smelters recover over 97% of lead safely." },
  { id: "ups_unit", name: "UPS Unit", hindiName: "यूपीएस यूनिट", category: "Power", rarity: "uncommon", icon: "🔌", value_range: "₹200–₹800/pc", fact: "Heavy iron-core transformer contains thick copper windings.", ecoTip: "Contains internal sealed lead battery; keep upright." },
  { id: "split_ac", name: "Split AC Unit", hindiName: "स्प्लिट एसी", category: "Appliances", rarity: "legendary", icon: "❄️", value_range: "₹2,000–₹5,500/pc", fact: "Refrigerant gas must be recovered with vacuum pumps.", ecoTip: "Cutting compressor lines releases powerful greenhouse gases." },
  { id: "window_ac", name: "Window AC Unit", hindiName: "विंडो एसी", category: "Appliances", rarity: "legendary", icon: "❄️", value_range: "₹1,500–₹5,000/pc", fact: "Heavy copper condenser coil and high-capacity rotary motor.", ecoTip: "Professional degassing required prior to scrap chopping." },
  { id: "refrigerator", name: "Refrigerator", hindiName: "फ्रिज / रेफ्रिजरेटर", category: "Appliances", rarity: "legendary", icon: "🧊", value_range: "₹500–₹9,000/pc", fact: "Insulation foam and cooling loop contain cyclopentane or fluorocarbons.", ecoTip: "Must be decommissioned by registered formal recyclers." },
  { id: "washing_machine", name: "Washing Machine", hindiName: "वॉशिंग मशीन", category: "Appliances", rarity: "legendary", icon: "🧺", value_range: "₹700–₹800/pc", fact: "Stainless steel drum and heavy induction electric motor.", ecoTip: "High metal recovery ratio of 75% by total weight." },
  { id: "microwave", name: "Microwave Oven", hindiName: "माइक्रोवेव ओवन", category: "Appliances", rarity: "rare", icon: "🍲", value_range: "₹150–₹1,000/pc", fact: "Magnetron and high-voltage transformer hold dense copper.", ecoTip: "Contains heavy ceramic magnet blocks and copper coils." },
  { id: "other", name: "Mixed Electronics", hindiName: "मिश्रित ई-कचरा", category: "Mixed", rarity: "common", icon: "📦", value_range: "Varies by item", fact: "Every electronic device contains recoverable precious metals.", ecoTip: "Never dump in open landfill; route to recycling network." },
];

export const STORY_QUESTS: StoryQuest[] = [
  {
    id: "quest_apprentice",
    title: "The Kabaadi's Apprentice",
    description: "Master the fundamentals of AI-powered e-waste identification and safety.",
    icon: "🎓",
    total_xp: 500,
    steps: [
      { id: "step_scan", text: "Scan your first e-waste item", reward_xp: 100 },
      { id: "step_hazard", text: "Identify any hazardous component (battery, lamp, or CRT)", reward_xp: 150 },
      { id: "step_recycler", text: "Find and view a registered CPCB recycler", reward_xp: 100 },
      { id: "step_share", text: "Generate a fair WhatsApp appraisal card", reward_xp: 150 },
    ],
  },
  {
    id: "quest_copper",
    title: "The Copper Trail",
    description: "Trace and divert valuable conductive copper from informal burn yards.",
    icon: "➰",
    total_xp: 900,
    steps: [
      { id: "step_find_wire", text: "Scan insulated wire or copper scrap", reward_xp: 200 },
      { id: "step_weigh", text: "Provide calibrated lot weight on your scan", reward_xp: 300 },
      { id: "step_route_cpcb", text: "Route copper to an authorized metal recovery center", reward_xp: 400 },
    ],
  },
  {
    id: "quest_safety",
    title: "Safety Sentinel",
    description: "Safeguard health by preventing open battery burning and mercury poisoning.",
    icon: "🛡️",
    total_xp: 1200,
    steps: [
      { id: "step_listen_tts", text: "Listen to bilingual voice safety instructions", reward_xp: 200 },
      { id: "step_flag_hazards", text: "Scan and safely isolate 2 hazardous components", reward_xp: 400 },
      { id: "step_quiz", text: "Complete the hazard awareness safety check", reward_xp: 600 },
    ],
  },
  {
    id: "quest_community",
    title: "Community Champion",
    description: "Mobilize your apartment society or neighborhood for clean e-waste collection.",
    icon: "🏘️",
    total_xp: 1500,
    steps: [
      { id: "step_pickup", text: "Post or review a bulk pickup alert on the board", reward_xp: 300 },
      { id: "step_hotspot", text: "Explore neighborhood hotzones on the Leaflet map", reward_xp: 400 },
      { id: "step_refer", text: "Share your referral link with a neighbor or colleague", reward_xp: 800 },
    ],
  },
  {
    id: "quest_legend",
    title: "The Great Indian Recycler",
    description: "Achieve legendary status by diverting over 25 kg of e-waste responsibly.",
    icon: "👑",
    total_xp: 3000,
    steps: [
      { id: "step_level_5", text: "Reach Level 5 (Green Guardian)", reward_xp: 500 },
      { id: "step_streak_7", text: "Build a 7-day scanning streak", reward_xp: 1000 },
      { id: "step_divert_25kg", text: "Divert 25+ kg of electronic scrap from landfills", reward_xp: 1500 },
    ],
  },
];

export const INITIAL_CHALLENGES: Challenge[] = [
  { id: "daily_eco_scan", title: "Daily Eco Scan", text: "Scan at least 1 e-waste item today", xp: 150, target: 1, current: 0, type: "daily", icon: "📸", completed: false, claimed: false },
  { id: "daily_hazard_check", title: "Hazard Safety Check", text: "Audit an item's condition or hazard guardrails", xp: 200, target: 1, current: 0, type: "daily", icon: "⚠️", completed: false, claimed: false },
  { id: "daily_location_tag", title: "Location Contributor", text: "Scan with GPS enabled to map hotspots", xp: 120, target: 1, current: 0, type: "daily", icon: "📍", completed: false, claimed: false },
  { id: "weekly_triple_scan", title: "Weekly Habit", text: "Complete 3 distinct scans this week", xp: 600, target: 3, current: 0, type: "weekly", icon: "⚡", completed: false, claimed: false },
  { id: "weekly_route_recycler", title: "Recycler Route", text: "Navigate to an authorized recycler or drop-off point", xp: 800, target: 1, current: 0, type: "weekly", icon: "🏢", completed: false, claimed: false },
];
