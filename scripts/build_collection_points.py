"""Builds data/collection_points.json from (1) the Delhi EPR collection-centre PDF, (2) the Rajasthan CPCB/EPR PDF and
(3) a hand-typed Punjab/Haryana/Himachal list from third-party directories (2021, unverified).
Usage: python scripts/build_collection_points.py <delhi.pdf> <rajasthan.pdf>
Privacy: contact names and personal mobile numbers are NOT kept; only 1800 toll-free numbers.
Coordinates are APPROXIMATE locality/city centres (coord_quality) or null when unknown; null entries are skipped by distance search."""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).parent.parent

DELHI = {  # keyword -> (lat, lon), locality level
 "mahipalpur": (28.544, 77.123), "shakurpur": (28.685, 77.145), "nehru place": (28.5494, 77.2517), "burari": (28.754, 77.199),
 "mahavir nagar": (28.643, 77.087), "tilak nagar": (28.640, 77.087), "jhilmil": (28.675, 77.312), "daryaganj": (28.643, 77.240),
 "darya ganj": (28.643, 77.240), "ansari market": (28.643, 77.240), "paharganj": (28.644, 77.214), "bhalaswa": (28.735, 77.165),
 "jahangir puri": (28.735, 77.165), "bhagirathi vihar": (28.715, 77.285), "kalkaji": (28.540, 77.260), "subhash park": (28.674, 77.293),
 "naveen shahdara": (28.674, 77.293), "alipur": (28.800, 77.133), "nagloi": (28.680, 77.060), "rohini": (28.711, 77.113),
 "ashok vihar": (28.696, 77.183), "kirti nagar": (28.651, 77.143), "shakarpur": (28.631, 77.279), "ganesh nagar": (28.631, 77.279),
 "madhuban road": (28.631, 77.279)}
RAJ = {"jaipur": (26.9124, 75.7873), "kota": (25.2138, 75.8648), "udaipur": (24.5854, 73.7125), "jodhpur": (26.2389, 73.0243),
 "ajmer": (26.4499, 74.6399), "alwar": (27.553, 76.6346), "bhilwara": (25.3407, 74.6313), "barmer": (25.7532, 71.3967),
 "bharatpur": (27.2152, 77.503), "sawaimadhopur": (26.0173, 76.3494), "tonk": (26.1664, 75.7885), "chittorgarh": (24.8887, 74.6269),
 "nagaur": (27.202, 73.7339), "pali": (25.7711, 73.3234), "banswara": (23.5461, 74.4503), "karauli": (26.4986, 77.02),
 "rajsamand": (25.0714, 73.88), "churu": (28.297, 74.965), "sirohi": (24.8856, 72.8588), "jalore": (24.9972, 72.2678),
 "pratapgarh": (24.03, 74.78)}
NORTH = {"amritsar": (31.634, 74.8723), "ludhiana": (30.901, 75.8573), "jalandhar": (31.326, 75.5762), "batala": (31.8186, 75.2028),
 "hoshiarpur": (31.5143, 75.9115), "gurdaspur": (32.0414, 75.4031), "bathinda": (30.211, 74.9455), "abohar": (30.1453, 74.1993),
 "ferozepur": (30.9331, 74.6225), "moga": (30.816, 75.1717), "jagraon": (30.7878, 75.473), "pathankot": (32.2643, 75.6421),
 "tarn taran": (31.4519, 74.9275), "zirakpur": (30.6425, 76.8173), "samana": (30.15, 76.19), "mukerian": (31.954, 75.613),
 "nakodar": (31.126, 75.474), "dinanagar": (32.126, 75.472), "sonipat": (28.9931, 77.0151), "gurugram": (28.4595, 77.0266),
 "hansi": (29.102, 75.964), "manesar": (28.35, 76.934), "karnal": (29.6857, 76.9905), "ladwa": (29.995, 77.045), "hisar": (29.1492, 75.7217),
 "panipat": (29.3909, 76.9635), "jind": (29.316, 76.315), "yamunanagar": (30.129, 77.2674), "sampla": (28.783, 76.766),
 "jagadhri": (30.167, 77.303), "narwana": (29.6, 76.12), "kaithal": (29.801, 76.399), "bhiwani": (28.7975, 76.1322), "tohana": (29.711, 75.906),
 "rewari": (28.199, 76.619), "fatehabad": (29.515, 75.454), "panchkula": (30.6942, 76.8606), "kundli": (28.88, 77.12),
 "chandigarh": (30.7333, 76.7794), "palampur": (32.1109, 76.5363), "nurpur": (32.3, 75.883), "sundernagar": (31.534, 76.886), "baddi": (30.9578, 76.7914),
 "shimla": (31.1048, 77.1734), "dharamshala": (32.219, 76.3234)}
NORTH_TXT = """Punjab|Amritsar|Cellpoint|Shop 201, Sunrise Plaza, Cooper Road, near Bakewell Bakery, 143001
Punjab|Ludhiana|Himanshu Telecom|Shop 1, Guru Angad Dev Market, Link Road, near Canara Bank SME Branch, 141003
Punjab|Jalandhar|Ravitelecom|Sehgal Market, Shop 11, first floor, Phagwara Gate, 144001
Punjab|Batala|Vishal Mobile Repair|Opposite Maharaja Market, near bus stand, Jalandhar Road, 143505
Punjab|Hoshiarpur|Satnam Mobile and Computer World|Government College Chowk, Phagwara Road, 146001
Punjab|Gurdaspur|Udhay Enterprises|Batala Road, near Obroal Hospital, Hari Darbar Colony
Punjab|Ludhiana|AAR Mobile Gallery|Shop 20, Janj Ghar, Main Road, Janakpuri, 141003
Punjab|Khanauri|Om Mobile Repair|Janta Market, near Singla Flex, Khanauri Mandi, 148027
Punjab|Patran|Popli Communication|Bhagat Singh Chowk, Jakhal Road, 147105
Punjab|Moonak|Mobile Palaza|Sale Tax Barrier, Patran Road, near wine shop, 148033
Punjab|Bathinda|Smart Service|Street 0/B, Bibi Wala Road, near Krishna Continental, 151001
Punjab|Amritsar|Solutions Mobile Services|Shop 8, Amritsar Plaza, near Subash Park, Hall Bazar
Punjab|Samana|Sidhu Telecom|Opposite PSEB Grid Officer Colony, 147101
Punjab|Bathinda|Unitech|MCB Z1-11363, Mehna Marg, near Fauji Chowk, 151001
Punjab|Abohar|Shree Ram Mobile Players|Behind bus stand, near Old Nirankari Bhawan Road, 152116
Punjab|Hoshiarpur|Bagga Teletron|Khara Khu Chowk, near Partap Chowk, 146001
Punjab|Mukerian|RS Mobile|Badal Market, near Truck Union, 144211
Punjab|Ferozepur|Chopra Telecom|Palika Bazar, Old Post Office Street, 152002
Punjab|Amritsar|AS Mobile Service|Shop 27, second floor, Pandit Deen Dayal Upadhyaya Complex, Bhandari Bridge
Punjab|Moga|Arun Mobile Care|Main Bazar, Kotkapura Road, Sherawali Building
Punjab|Mukerian|Mukesh Telecom|Railway Road, near Punjab National Bank, 144211
Punjab|Jagraon|Royal Telecom|Raikot Road, opposite Ajitsar Gurudwara, 142026
Punjab|Pathankot|Deepak Mobile|Dhangu Road, Subhash Market, 145001
Punjab|Jalandhar|Bunty Mobile World|First floor, 10, Basti Adda Road, near Football Chowk, 144001
Punjab|Dinanagar|RK Communication|Main Railway Road, 143531
Punjab|Nakodar|SL Telecom|112, Sohi Complex, Dakhni Gate, 144040
Punjab|Pathankot|ACT Services|381, Guru Nanak Nagar, behind BSNL Exchange, Dalhousie Road
Punjab|Tarn Taran|Radha Swami Trading Co.|Amritsar Road, near IDBI Bank
Punjab|Ludhiana|A to Z Mobile Care|Shop S8, second floor, Mata Rani Complex, Mata Rani Chowk, 141005
Punjab|Ferozepur|Deepak Telecom|Malwal Road, near More Store, Ferozepur City, 152002
Punjab|Zirakpur|Mini Telecom|Street address not confirmed in the source listing
Haryana|Sonipat|Global Waste Solution|Rajiv Colony, Main Murthal Road, opposite Kajariya Tiles, 131001
Haryana|Gurugram|Professional Logistics|J-171, New Palam Vihar Phase 1, Gurugram 122017
Haryana|Hansi|NRV Logistics|160/6, Hanuman Colony, Hansi, Hisar 125033
Haryana|Manesar|NRV Logistics|Plot 124, Pioneer Industrial Park, Gurugram 122413
Haryana|Kundli|Blackzone Technologies|Plot 351, Sector 56, Phase V EHTP, Kundli, Sonipat 131028
Haryana|Karnal|Luxmi Telecom|Behind SCO 270, Mughal Canal Market, near Gandhi Juice Corner, 132001
Haryana|Sonipat|Luxmi Enterprises|Near Tulip Mall, Gandhi Chowk, Sonipat
Haryana|Ladwa|Saini Computer Care|Shop 9, Raj Mahal Complex, opposite SBI, Railway Road
Haryana|Hisar|A R Mobile Gallery|C.L.G. 8 & 19, Pushpa Complex, Hisar 125001
Haryana|Panipat|Sainath Telecom|Shop 4, Devi Mandir Road, near Desraj Colony, 132103
Haryana|Jind|Santosh Associates|Shop 61, opposite DRDA, near Punjab National Bank
Haryana|Yamunanagar|Saini Enterprises|Nathanpur, 135101
Haryana|Sampla|Jamdagani Enterprises|Rambhag, 124501
Haryana|Jagadhri|Darsh Shopping Expert|Buria Chowk, near Hanuman Gate, 135003
Haryana|Narwana|Vikas Mobile Service Centre|Shop 1, Patram Nagar, Litani Road, 126116
Haryana|Ladwa|Mobile Care Center|Near Saini Children Hospital, Indri Chowk, 136132
Haryana|Indri|Star Mobile Point|Matak Majri, near Axis Bank, 132041
Haryana|Kalayat|Computer Zone|Near Kaichi Chowk, 136117
Haryana|Bhiwani|Nandani Enterprises|Shop 4, first floor, City Mall, Hansi Gate, 127021
Haryana|Panipat|Gaurav Communication|NHBC Road, near Sai Baba Chowk, 132103
Haryana|Tohana|Bhateja Telecom Mobile Care Centre|Near Bakshi Gali, Railway Road, 125120
Haryana|Julana|Heema Enterprises|Old bus stand, near Bharat Cinema, 126102
Haryana|Rewari|New Bhardwaj Communication|Nai Wali Chowk, Shop 366, Rewari 123401
Haryana|Garhi|S K Mobile Solution|Near bus stand, Garhi, Jind
Haryana|Kaithal|Chauhan Communication|Karnal Road, near Krishan Misthan Bhandar, opposite Nehar Colony
Haryana|Uchana Kalan|Deep Mobile|Litani Road, near Hanuman Mandir
Haryana|Karnal|Sanvi Enterprises|Shop 97, Mughal Canal, above Madrasi Dosa
Haryana|Yamunanagar|Cellpoint|Behind Mahindra Petrol Pump, near Madhu Chowk, 135001
Haryana|Fatehabad|Kahlon Mobile Repair|Palika Bazar, Fatehabad, 125050
Haryana|Cheeka|Sach Mobile Care|Haffed Road, near Dr. Bhardwaj Dental Clinic, 136034
Haryana|Barwala|Saluja Mobile Centre|Palika Bazar, Old Bus Stand, Barwala, Hisar 125121
Haryana|Panchkula|CTIS|DSS-305, Sector 20, Panchkula 134109
Haryana|Uchana Kalan|MP Mobile Zone|Near railway station, Lal Chowk, Litani Road
Haryana|Nangal Choudhary|Archana Mobile and Electronic|Shree Shyam Complex, bus stand, 123023
Haryana|Barwala|Mobile City|Bhagat Singh Chowk, Barwala, Hisar 125121
Haryana|Hisar|MS Mobile|Shop 3, Sunder Dass Gurudwara, Teliyan Pull, 125001
Himachal Pradesh|Palampur|Friends Electronics|Gurudwara Road, Palampur 176061
Himachal Pradesh|Bhawarna|Aditya Communication|Feta Bazar, Bhawarna Post Office, 176083
Himachal Pradesh|Nurpur|Global Waste Solution|Village Barot, Banal Adda, Tehsil Nurpur, Kangra 176022
Himachal Pradesh|Sundernagar|NRV Logistics|Sharma Hotel, Ner Chowk, Didouar, Mandi 175008
Himachal Pradesh|Baddi|Gati collection point|Khasra Nos. 380/81/84/744, opposite Cadila Healthcare, Labana Swaraj, Mazara, Baddi 173205
Himachal Pradesh|Shimla|Karo Sambhav|Mahasu Villa, Village Bharatpur, Kainchi Mod, Taradevi Bypass, P.P. Badheri, Shimla 171011
Himachal Pradesh|Dharamshala|Professional Logistics|Kangra district, Dharamshala 176215
Punjab|Amritsar|Zebronics ZEB CARE service centre|78, 2nd Floor, Nehru Shopping Complex, Amritsar 143001||Zebronics e-waste collection centres page
Punjab|Amritsar|Mahi Systems collection centre|100 Feet Road, Preet Randhwa Complex, Amritsar 143001||Mahi Systems / Jinco e-waste collection centre list
Punjab|Ludhiana|Zebronics ZEB CARE zonal hub|ZEB CARE 88, Office No. 1, 1st Floor, Green Field, Kochar Market Road, Ludhiana 141003||Zebronics e-waste collection centres page
Punjab|Ludhiana|Mahi Systems collection centre|Shop No. 45, Aman House Building, Link Road, Samrala Chowk, Ludhiana 141008||Mahi Systems / Jinco e-waste collection centre list
Punjab|Ludhiana|Gambhir Enterprises|B24/4447, St No 7, New Madhopuri Main Road, Ludhiana 141008||Blackzone e-waste centres directory
Punjab|Ludhiana|LG warehouse collection point (Global Waste Solutions network)|Extension Bhadowal, LG warehouse, near Bhadowal Railway Station, Ludhiana|1800-2700-038|XP-Pen e-waste collection list
Punjab|Jalandhar|Zebronics ZEB CARE service centre|ZEB CARE 51, 2nd Floor, Central Market, near Narender Cinema, Jalandhar 144001||Zebronics e-waste collection centres page
Punjab|Jalandhar|Mahi Systems collection centre|184 Transport Area, near OBC Bank, Jalandhar 144004||Mahi Systems / Jinco e-waste collection centre list
Punjab|Jalandhar|Karo Sambhav collection centre|76, Transport Nagar, Jalandhar 144012||Karo Sambhav collection centres page
Punjab|Samana|Dhillon Telecom|House No. 21, Village Bhedpura, Samana, Patiala 147001||Blackzone e-waste centres directory
Punjab|Rayya|Arora Mobile House|Pherumaan Road, Rayya, Amritsar 143112||Blackzone e-waste centres directory
Punjab|Tarn Taran|GS Telecom|Opp. Civil Hospital, near Rohb Collection, Amritsar Road, Tarn Taran 143304||Blackzone e-waste centres directory
Chandigarh|Chandigarh|HFCL collection point|Plot 398, 1st Floor, Industrial Area, Chandigarh||HFCL e-waste collection centre list (2021)
Chandigarh|Chandigarh|Zebronics ZEB CARE service centre|Shop No 1703, Sandhu Bazaar, Sector 45, Burail, opp. Gate No 2 Dev Samaj College, Chandigarh 160047||Zebronics e-waste collection centres page"""

def clean(s): return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()
def toll(s):
    m = re.search(r"1800[\s-]*\d{3}[\s-]*\d{4}", (s or "").replace("\n", ""))
    return re.sub(r"[\s]", "", m.group(0)) if m else None
LEGAL = re.compile(r"^(.*?\b(?:Pvt\.?\s*Ltd\.?|Private Limited|Ltd\.?|Limited|logistics))\s*[,.]?\s*(\S.*)$", re.I)
def strip_person(a):  # contact people's names are personal data: drop them from addresses
    a = re.sub(r"\bMr\.?\s+[A-Za-z]+(\s+[A-Za-z]+)?\s*", "", a)
    return re.sub(r"\bPushpender Bansal C/O\s*", "", a).strip()
def split_name(text):
    n, a = _split_name(text)
    if n is None:
        m = LEGAL.match(a)
        if m and len(m.group(1)) > 8: n, a = clean(m.group(1)), m.group(2)
    elif "," in n:  # wrapped first line like "Karo Sambhav, Shop"
        head, rest = n.split(",", 1); n, a = head.strip(), (rest.strip() + " " + a).strip()
    return n, strip_person(a)
def _split_name(text):
    lines = [l.strip() for l in (text or "").split("\n") if l.strip()]
    if len(lines) >= 2 and not re.search(r"\d", lines[0]): return clean(lines[0]), clean(" ".join(lines[1:]))
    one = clean(text); head = one.split(",")[0].strip()
    if "," in one and head and not re.search(r"\d", head): return head, one[len(head) + 1:].strip(" ,")
    return None, one

def north_rows():
    out = []
    for line in NORTH_TXT.splitlines():
        parts = [x.strip() for x in line.split("|")]
        state, city, name, addr = parts[:4]
        tf = parts[4] if len(parts) > 4 and parts[4] else None
        src = parts[5] if len(parts) > 5 and parts[5] else None
        coord = NORTH.get(city.lower())
        out.append({"state": state, "city": city, "name": name, "address": addr, "lat": coord[0] if coord else None,
                    "lon": coord[1] if coord else None, "coord_quality": "city" if coord else "none", "toll_free": tf,
                    "source": src or "Third-party directories (Blackzone, Minosha, JaviSystems, HPPCB list) as compiled by the team, about 2021",
                    "verification": "third_party_directory_2021_unverified"})
    return out

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        import pdfplumber
        d, r = sys.argv[1], sys.argv[2]
        with pdfplumber.open(d) as p1: delhi = delhi_rows(p1)
        with pdfplumber.open(r) as p2: raj = raj_rows(p2)
        allrows = delhi + raj + north_rows()
        for i, row in enumerate(allrows, 1):
            row["id"] = f"CP{i:03d}"; row["kind"] = "collection_point"
            row["notes"] = "Small drop-off point. May accept only some brands or consumer drop-offs, not bulk lots. Call first."
        json.dump(allrows, open(ROOT / "data" / "collection_points.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        for st in ("Delhi", "Rajasthan", "Punjab", "Chandigarh", "Haryana", "Himachal Pradesh"):
            rs = [x for x in allrows if x["state"] == st]; print(st, len(rs), "records,", sum(1 for x in rs if x["lat"] is not None), "with coordinates")
        print("total", len(allrows))
