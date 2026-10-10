"""Seed DynamoDB: prices, authorized recyclers (kind=recycler) and drop-off points (kind=collection_point).
Usage: python scripts/seed_db.py --stack kabadiai --region us-east-1   (add --dry-run to preview)
Recyclers and drop-off points share RecyclersTable; the `kind` field tells them apart."""
import argparse, json, pathlib, sys
from decimal import Decimal
import boto3

ROOT = pathlib.Path(__file__).parent.parent

def load(name, default_kind=None):
    items = json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))
    if default_kind:
        for i in items: i.setdefault("kind", default_kind)
    return items

def to_ddb(o):
    if isinstance(o, float): return Decimal(str(o))
    if isinstance(o, dict): return {k: to_ddb(v) for k, v in o.items()}
    if isinstance(o, list): return [to_ddb(v) for v in o]
    return o

def table_names(stack, region):
    out = {o["OutputKey"]: o["OutputValue"] for o in boto3.client("cloudformation", region_name=region).describe_stacks(StackName=stack)["Stacks"][0].get("Outputs", [])}
    if "PricesTableName" not in out or "RecyclersTableName" not in out: sys.exit(f"Outputs missing; found {list(out)}")
    return out["PricesTableName"], out["RecyclersTableName"]

def seed(table, items, key, dry):
    print(f"{table if dry else table.name}: {len(items)} items")
    if dry: return
    with table.batch_writer() as b:
        for it in items: b.put_item(Item=to_ddb(it))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--stack", default="kabadiai"); ap.add_argument("--region", default="us-east-1"); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    prices = load("prices.json")
    places = load("recyclers.json", "recycler") + load("recyclers_cpcb.json", "recycler") + load("collection_points.json", "collection_point")
    if len({p["id"] for p in places}) != len(places): sys.exit("Duplicate ids in recyclers.json / collection_points.json")
    if a.dry_run:
        seed("prices", prices, "component", True); seed("places", places, "id", True); return
    pt, rt = table_names(a.stack, a.region); ddb = boto3.resource("dynamodb", region_name=a.region)
    seed(ddb.Table(pt), prices, "component", False); seed(ddb.Table(rt), places, "id", False); print("Seed complete.")

if __name__ == "__main__":
    main()
