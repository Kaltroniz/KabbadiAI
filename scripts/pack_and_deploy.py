import os
import zipfile
import subprocess
import json
import urllib.request
import time
import sys

APP_ID = "d33iyw8b7i40jw"
BRANCH = "main"
REGION = "us-east-1"
OUT_DIR = os.path.join("frontend", "out")
ZIP_NAME = "frontend-build.zip"

print(f"Creating {ZIP_NAME} from {OUT_DIR} with Unix permissions (0755 dirs, 0644 files)...")

if os.path.exists(ZIP_NAME):
    os.remove(ZIP_NAME)

with zipfile.ZipFile(ZIP_NAME, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(OUT_DIR):
        for d in dirs:
            dir_full = os.path.join(root, d)
            rel = os.path.relpath(dir_full, OUT_DIR).replace("\\", "/") + "/"
            zinfo = zipfile.ZipInfo(rel)
            zinfo.create_system = 3  # Unix
            zinfo.external_attr = (0o755 | 0o040000) << 16  # S_IFDIR | 0755
            zf.writestr(zinfo, "")

        for f in files:
            file_full = os.path.join(root, f)
            rel = os.path.relpath(file_full, OUT_DIR).replace("\\", "/")
            zinfo = zipfile.ZipInfo(rel)
            zinfo.create_system = 3  # Unix
            zinfo.external_attr = (0o644 | 0o100000) << 16  # S_IFREG | 0644
            with open(file_full, "rb") as fp:
                data = fp.read()
            zf.writestr(zinfo, data)

zip_size = os.path.getsize(ZIP_NAME)
print(f"Archive created: {zip_size} bytes ({ZIP_NAME})")

# Verify sample permission
with zipfile.ZipFile(ZIP_NAME, "r") as zf:
    sample = [i for i in zf.infolist() if "webpack" in i.filename][0]
    perm = oct(sample.external_attr >> 16)
    print(f"Sample file {sample.filename} mode: {perm} (create_system={sample.create_system})")

print(f"\nCreating Amplify deployment for app {APP_ID} branch {BRANCH}...")
create_cmd = f"aws amplify create-deployment --app-id {APP_ID} --branch-name {BRANCH} --region {REGION}"
raw = subprocess.check_output(create_cmd, shell=True).decode()
deploy_data = json.loads(raw)
job_id = deploy_data["jobId"]
upload_url = deploy_data["zipUploadUrl"]
print(f"Job ID: {job_id}")

print(f"Uploading {zip_size} bytes to S3 pre-signed URL...")
with open(ZIP_NAME, "rb") as f:
    zip_bytes = f.read()

req = urllib.request.Request(
    upload_url,
    data=zip_bytes,
    method="PUT",
    headers={"Content-Type": "application/zip"}
)
with urllib.request.urlopen(req) as resp:
    print(f"Upload completed with HTTP status: {resp.status}")

print("Starting Amplify deployment...")
start_cmd = f"aws amplify start-deployment --app-id {APP_ID} --branch-name {BRANCH} --job-id {job_id} --region {REGION}"
subprocess.check_output(start_cmd, shell=True)

print("Monitoring deployment progress...")
for _ in range(60):
    time.sleep(5)
    get_job = f"aws amplify get-job --app-id {APP_ID} --branch-name {BRANCH} --job-id {job_id} --region {REGION}"
    job_info = json.loads(subprocess.check_output(get_job, shell=True).decode())
    status = job_info["job"]["summary"]["status"]
    print(f"  Current status: {status}")
    if status == "SUCCEED":
        print("\nDeployment SUCCEEDED!")
        print(f"Live URL: https://{BRANCH}.{APP_ID}.amplifyapp.com")
        sys.exit(0)
    elif status in ("FAILED", "CANCELLED"):
        print(f"\nDeployment {status}")
        sys.exit(1)
