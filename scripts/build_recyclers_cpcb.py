"""Builds data/recyclers_cpcb.json: AUTHORISED dismantlers/recyclers for Punjab, Himachal, Haryana and one more Delhi unit,
typed from the CPCB list 'List of Dismantlers/Recyclers as per the authorisation issued by SPCBs/PCCs' (as on 08-06-2023, hosted by NDMC).
Coordinates are approximate town centres (coord_quality=city)."""
import json, pathlib

ROOT = pathlib.Path(__file__).parent.parent
C = {"dera bassi": (30.587, 76.843), "raikot": (30.65, 75.6), "jalandhar": (31.326, 75.5762), "jagraon": (30.7878, 75.473), "ludhiana": (30.901, 75.8573),
     "nabha": (30.375, 76.15), "machhiwara": (30.917, 76.2), "nalagarh": (31.05, 76.72), "baddi": (30.9578, 76.7914), "ambala": (30.3782, 76.7767),
     "panchkula": (30.6942, 76.8606), "samalkha": (29.237, 77.016), "panipat": (29.3909, 76.9635), "rohtak": (28.8955, 76.6066),
     "bahadurgarh": (28.692, 76.923), "faridabad": (28.4089, 77.3178), "sonipat": (28.9931, 77.0151), "ganaur": (29.125, 77.015),
     "manesar": (28.35, 76.934), "gurugram": (28.4595, 77.0266), "nuh": (28.1, 77.0), "shahabad": (30.17, 76.87), "sampla": (28.783, 76.766)}
TXT = """Punjab|Dera Bassi|Ramky Enviro Engineer Ltd.|Vill. Nimbuan, Tehsil Dera Bassi, District SAS Nagar|1200
Punjab|Raikot|Spreco Recycling|D-45, Industrial Area, Focal Point, Raikot, District Ludhiana|240
Punjab|Jalandhar|K.J. Recycler|C-38, Sanjay Gandhi Nagar, Industrial Area, Jalandhar|600
Punjab|Dera Bassi|Black Diamond Cements Pvt. Ltd. (E-Waste Dismantling and Recycling Facility)|Village Humayunpur, Nariangarh Road, Tehsil Dera Bassi, District SAS Nagar|2400
Punjab|Jagraon|Cosmos Recycling|Grewal Nagar, Street No. 2, VPO Hambran, Jagraon, Ludhiana|450
Punjab|Ludhiana|Stellar Recycling LLP|Village Lakhowal (H.B. No. 190), Tehsil and District Ludhiana|3600
Punjab|Nabha|Kumar Enterprises|Malerkotla Road, Village Dulladi, Tehsil Nabha, District Patiala|1002
Punjab|Machhiwara|Green Bird Recycling|223 Hadbast, Vill. Magarh, Kohara Macchiwara Road, Ludhiana|600
Himachal Pradesh|Nalagarh|Shivalik Solid Waste Management Ltd. (Unit-II)|Village Shabowal, Tehsil Nalagarh, District Solan|1000
Himachal Pradesh|Baddi|Ortech India Corporations|Plot No. 67-B, Industrial Estate, Lodhi Majra, Baddi|500
Haryana|Ambala|Honey Disposal Store|Plot No. 67-68, Jarrout Road, Village Mandour Industrial Area, Ambala City|300
Haryana|Ambala|Thapar Disposal Industries|902A/5/6, Chara Mandi Road, Ambala City|1825
Haryana|Panchkula|Mittal Battery|Plot No. 349, Industrial Area, Phase 1, Panchkula|3600
Haryana|Samalkha|Exigo Recycling Pvt. Ltd.|G.T. Road, Samalkha, Panipat|6000
Haryana|Panipat|Exigo Recycling (P) Ltd.|Barsat Road, Panipat|18000
Haryana|Panipat|Adinath Recyclotronix (P) Ltd.|Plot No. 361, Industrial Estate, HSIIDC, Panipat|1080
Haryana|Rohtak|Earth Waste Management Pvt. Ltd.|Village Ismaila, District Rohtak|600
Haryana|Rohtak|Giriraj Metal|Plot No. 39, HSIIDC IE, Kutana, Rohtak|300
Haryana|Bahadurgarh|Green World International Pvt. Ltd.|GR 60-61, Ganpati Industrial Dham Industrial Area, Bahadurgarh|5000
Haryana|Bahadurgarh|Renu Recycling Company|Plot No. 1257, MIE-B, Bahadurgarh|1800
Haryana|Faridabad|AMN E-Waste Management Pvt Ltd|Plot No. 171, Sector-59, Industrial Area, Faridabad|290
Haryana|Faridabad|Endeavor Re-processor and Recyclers India|Plot No. 323, Sector-24, Industrial Area, Faridabad|365
Haryana|Faridabad|E-waste Solutions|Industrial Shed 1A, Industrial Estate, Sector-6, Faridabad|1000
Haryana|Faridabad|V S Enterprises|Plot No. 9, Pragati Vihar, Sector-59, Faridabad|300
Haryana|Sonipat|Dotline Informatics Pvt. Ltd.|Plot No. 302, Ph-V, HSIIDC Indl. Estate, Rai, Sonipat|350
Haryana|Sonipat|RBH E-Waste Recycle Hub Pvt. Ltd.|Plot No. 130, HSIIDC, Rai, Sonipat|912.5
Haryana|Ganaur|Global Waste Solution|Village Ram Nagar, Tehsil Ganaur, Sonipat|9490
Haryana|Ganaur|Global Waste Solution Unit-II|Village Dhaturi, Tehsil Ganaur, Sonipat|8249
Haryana|Sonipat|Tes Amm (India) Pvt. Ltd.|Village Wazidpur Saboli, Sonipat|12000
Haryana|Sonipat|Bluenvir|81, HSIIDC, Rai, Sonipat|435
Haryana|Manesar|Earth Sense Recycle Pvt Ltd|Plot No. 100, Sector-5, IMT Manesar, Gurgaon|2160
Haryana|Gurugram|Nirvana Recycling Pvt. Ltd.|Plot No. D-6, Udyog Vihar Phase-VI, Sector-37, Gurugram|6030
Haryana|Manesar|Green Vortex Waste Management Pvt Ltd|Plot No. 177, Sector 7, IMT Manesar|1500
Haryana|Gurugram|SMS Enterprises|Plot No. 544-D, First Floor, Sector-37, Pace City-II, Gurgaon|360
Haryana|Manesar|Apicem Recyclers Pvt. Ltd.|Plot No. 359, Sector-8, IMT Manesar, Gurugram|510
Haryana|Manesar|KM Global E-Waste Private Limited|Ground Floor, Plot No. 359, Sector-8, IMT Manesar, Gurugram|510
Haryana|Manesar|3 R Recycler|Plot No. 392, Sector-8, IMT Manesar, Gurgaon|2994
Haryana|Manesar|Deshwal Waste Management Pvt Ltd|Plot No. 292, Sec-7, IMT Manesar, Gurgaon|10000
Haryana|Manesar|Deshwal Waste Management Pvt Ltd|Plot No. 116, Sec-8, IMT Manesar, Gurgaon|4652.1
Haryana|Faridabad|Namo E-Waste Management Ltd.|14/1, Mathura Road, Faridabad|5796
Haryana|Nuh|E Waste Recyclers India|Shed No. 15, Roz Ka Meo Industrial Area, Nuh|667
Haryana|Shahabad|Radhey Steel Traders|Vill. Patvi, Barara Road, Shahabad, Kurukshetra|600
Haryana|Gurugram|Pegasus Waste Management Pvt. Ltd.|Village Bhora Kalan, Gurugram|13134
Haryana|Manesar|3 R Zero Waste Pvt. Ltd.|Plot No. 62, Sector-8, IMT Manesar|500
Haryana|Gurugram|Ecoverva Waste Recycling Private Limited|Plot No. 350, Block C, Village Pathreri, Ansal Pioneer Industrial Park, Gurgaon|353.07
Haryana|Faridabad|Naturevolt Recyclers India Pvt Ltd|Plot No. 323, Part-IV, Sector-24, Faridabad|5400
Haryana|Faridabad|AV Green Solutions Pvt Ltd|Plot No. 274, Sector-24, Industrial Area, Faridabad|381
Haryana|Faridabad|Re Chakra Waste Management LLP|Plot No. 18, Sector-6, Faridabad|8931
Haryana|Faridabad|CLG Projects LLP|Plot No. 75-76, Sector 59, Pragati Vihar, Ballabgarh, Faridabad|450
Haryana|Faridabad|SSL E Waste Management LLP|Plot No. 410, Sector-68, IMT, Faridabad|423
Haryana|Ambala|Shunty Disposal Store|Manmohan Nagar, G.T. Road, Ambala City|900
Haryana|Rohtak|Green Wealth Solutions Pvt. Ltd.|Plot No. 109, IE, Kutana, HSIIDC, Hissar Road, Rohtak|690
Haryana|Sampla|Endeavor Recyclers India Private Limited|Village Hassangarh, Tehsil Sampla, District Rohtak 124404|28350
Delhi|Delhi|Shree Raman E-Waste|Plot No. 7, Khasra No. 487, Peeragarhi Industrial Area, Peeragarhi Village, Delhi 110087|300"""
out = []
for i, line in enumerate(TXT.splitlines(), 1):
    st, city, name, addr, cap = [x.strip() for x in line.split("|")]
    c = C.get(city.lower()) if st != "Delhi" else (28.679, 77.091)
    out.append({"id": f"RC{i:03d}", "kind": "recycler", "state": st, "city": city, "name": name, "address": addr,
                "lat": c[0] if c else None, "lon": c[1] if c else None, "coord_quality": "locality" if st == "Delhi" else "city",
                "capacity_mta": float(cap), "verification": "cpcb_authorised_list_2023-06-08",
                "source": "CPCB list of authorised dismantlers/recyclers (SPCB/PCC authorisations), as on 08-06-2023, hosted by NDMC"})
(ROOT / "data").mkdir(exist_ok=True)
json.dump(out, open(ROOT / "data" / "recyclers_cpcb.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
for st in ("Punjab", "Himachal Pradesh", "Haryana", "Delhi"): print(st, sum(1 for x in out if x["state"] == st), "recyclers")
print("without coordinates:", [x["name"] for x in out if x["lat"] is None])
