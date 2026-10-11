import subprocess
import json
import urllib.request
import time

APP_ID = "d33iyw8b7i40jw"
BRANCH = "main"
REGION = "us-east-1"

print(f"Creating Amplify deployment for app {APP_ID} branch {BRANCH}...")
create_cmd = f"aws amplify create-deployment --app-id {APP_ID} --branch-name {BRANCH} --region {REGION}"
raw = subprocess.check_output(create_cmd, shell=True).decode()
data = json.loads(raw)
job_id = data["jobId"]
upload_url = data["zipUploadUrl"]
print(f"Job ID: {job_id}")

print("Reading frontend-build.zip...")
with open("frontend-build.zip", "rb") as f:
    zip_bytes = f.read()

print(f"Uploading {len(zip_bytes)} bytes to S3 pre-signed URL...")
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
        print("\n🎉 Deployment SUCCEEDED!")
        print(f"Live URL: https://{BRANCH}.{APP_ID}.amplifyapp.com")
        break
    elif status in ("FAILED", "CANCELLED"):
        print(f"\n❌ Deployment {status}")
        break
