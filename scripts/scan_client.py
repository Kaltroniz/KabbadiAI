"""Usage: python scripts/scan_client.py <api-url> <photo.jpg>"""
import base64, json, sys, urllib.request, urllib.error

api, path = sys.argv[1].rstrip("/"), sys.argv[2]
mt = "image/png" if path.lower().endswith(".png") else "image/jpeg"
payload = json.dumps({"image_b64": base64.b64encode(open(path, "rb").read()).decode(), "media_type": mt}).encode()
req = urllib.request.Request(api + "/scan", payload, {"content-type": "application/json"})
try:
    print(json.dumps(json.load(urllib.request.urlopen(req, timeout=90)), indent=2))
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode())
