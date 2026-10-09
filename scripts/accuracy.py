import os
import sys
import csv
import base64
import time
import json
import urllib.request
from collections import defaultdict

API_URL = os.environ.get("NEXT_PUBLIC_API_URL", "")

def get_api_url():
    if API_URL:
        return API_URL
    # Try to read from frontend/.env.local
    env_path = os.path.join("frontend", ".env.local")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("NEXT_PUBLIC_API_URL="):
                    return line.split("=", 1)[1].strip()
    return None

def run_accuracy(photos_dir, labels_csv):
    api = get_api_url()
    if not api:
        print("Error: Could not find NEXT_PUBLIC_API_URL.")
        sys.exit(1)
        
    api = api.rstrip("/") + "/agent"

    if not os.path.exists(labels_csv):
        print(f"Error: {labels_csv} not found.")
        sys.exit(1)

    labels = {}
    with open(labels_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        # Expected columns: filename, components (comma sep), hazards (comma sep)
        for row in reader:
            comps = [c.strip() for c in row.get("components", "").split(",") if c.strip()]
            hazards = [h.strip() for h in row.get("hazards", "").split(",") if h.strip()]
            labels[row["filename"]] = {"components": set(comps), "hazards": set(hazards)}

    results = []
    
    print(f"Testing against API: {api}")
    print("-" * 50)
    for filename, true_labels in labels.items():
        filepath = os.path.join(photos_dir, filename)
        if not os.path.exists(filepath):
            print(f"Warning: Photo {filename} not found, skipping.")
            continue
            
        with open(filepath, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
        
        ext = filename.split(".")[-1].lower()
        mime = f"image/{ext}" if ext in ["jpeg", "png", "webp"] else "image/jpeg"
        
        payload = {
            "image_b64": img_b64,
            "media_type": mime,
            "language": "en"
        }
        
        req = urllib.request.Request(api, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
        
        start_time = time.time()
        try:
            with urllib.request.urlopen(req, timeout=40) as response:
                latency = time.time() - start_time
                data = json.loads(response.read().decode("utf-8"))
        except Exception as e:
            latency = time.time() - start_time
            print(f"[{filename}] Failed ({latency:.1f}s): {e}")
            results.append({"filename": filename, "error": str(e), "latency": latency})
            continue

        if data.get("type") == "error":
            print(f"[{filename}] Scan Failed ({latency:.1f}s)")
            results.append({"filename": filename, "error": "Scan failed", "latency": latency})
            continue
            
        if data.get("type") == "clarify":
            conf = data.get("scan", {}).get("confidence", 0)
            print(f"[{filename}] Clarify Requested ({latency:.1f}s) - Confidence: {conf}")
            results.append({"filename": filename, "clarify": True, "confidence": conf, "latency": latency})
            continue
            
        scan = data.get("scan", {})
        pred_comps = {item["component"] for item in scan.get("items", [])}
        pred_hazards = set(scan.get("hazards", []))
        conf = scan.get("confidence", 0)
        provider = data.get("provider", "unknown")
        
        comp_match = len(pred_comps.intersection(true_labels["components"])) / max(1, len(true_labels["components"]))
        haz_match = len(pred_hazards.intersection(true_labels["hazards"])) / max(1, len(true_labels["hazards"])) if true_labels["hazards"] else 1.0
        
        print(f"[{filename}] Success ({latency:.1f}s) via {provider} | Conf: {conf} | Comp Recall: {comp_match:.0%} | Haz Recall: {haz_match:.0%}")
        
        results.append({
            "filename": filename,
            "error": None,
            "clarify": False,
            "latency": latency,
            "provider": provider,
            "confidence": conf,
            "comp_match": comp_match,
            "haz_match": haz_match
        })

    # Summary
    print("-" * 50)
    print("SUMMARY")
    valid = [r for r in results if not r.get("error") and not r.get("clarify")]
    errors = [r for r in results if r.get("error")]
    clarifies = [r for r in results if r.get("clarify")]
    
    print(f"Total processed: {len(results)}")
    print(f"Valid results: {len(valid)}")
    print(f"Clarifications requested: {len(clarifies)}")
    print(f"Errors: {len(errors)}")
    
    if valid:
        avg_latency = sum(r["latency"] for r in valid) / len(valid)
        avg_conf = sum(r["confidence"] for r in valid) / len(valid)
        avg_comp = sum(r["comp_match"] for r in valid) / len(valid)
        avg_haz = sum(r["haz_match"] for r in valid) / len(valid)
        print(f"Average Latency: {avg_latency:.2f}s")
        print(f"Average Confidence: {avg_conf:.1f}")
        print(f"Component Accuracy/Recall: {avg_comp:.1%}")
        print(f"Hazard Recall: {avg_haz:.1%}")
    else:
        print("No valid results to summarize.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/accuracy.py <photos_dir> <labels_csv>")
        sys.exit(1)
    run_accuracy(sys.argv[1], sys.argv[2])
