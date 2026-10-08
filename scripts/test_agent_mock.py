import json, os, sys, pathlib
import boto3

ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src" / "agent"))

def get_table_names(stack_name, region):
    cf = boto3.client("cloudformation", region_name=region)
    resp = cf.describe_stacks(StackName=stack_name)
    outputs = {o["OutputKey"]: o["OutputValue"] for o in resp["Stacks"][0].get("Outputs", [])}
    return outputs.get("PricesTableName"), outputs.get("RecyclersTableName")

prices, recyclers = get_table_names("kabadiai", "us-east-1")
os.environ["PRICES_TABLE"] = prices
os.environ["RECYCLERS_TABLE"] = recyclers
os.environ["MOCK_ANALYSIS"] = "1"
os.environ["BEDROCK_MODEL_ID"] = "us.amazon.nova-2-lite-v1:0"

import app
event = {
    "body": json.dumps({
        "lat": 28.6315, 
        "lon": 77.2167, 
        "dealer_offer_inr": 500
    })
}

res = app.handler(event, None)
print("Status:", res["statusCode"])
body = json.loads(res["body"])
print(json.dumps(body, indent=2))
