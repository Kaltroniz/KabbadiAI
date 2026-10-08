"""Seed DynamoDB tables with initial prices and recycler data.

Usage (PowerShell):
    python scripts/seed_db.py --stack kabadiai --region us-east-1

The table names are read from the CloudFormation stack outputs, so the stack
must already be deployed before running this script.  Pass --dry-run to print
what would be written without touching DynamoDB.
"""
import argparse, json, pathlib, sys
import boto3
from decimal import Decimal

ROOT = pathlib.Path(__file__).parent.parent


def get_table_names(stack_name, region):
    cf = boto3.client("cloudformation", region_name=region)
    resp = cf.describe_stacks(StackName=stack_name)
    outputs = {o["OutputKey"]: o["OutputValue"] for o in resp["Stacks"][0].get("Outputs", [])}
    prices_table    = outputs.get("PricesTableName")
    recyclers_table = outputs.get("RecyclersTableName")
    if not prices_table or not recyclers_table:
        sys.exit(
            f"ERROR: Could not find PricesTableName or RecyclersTableName in stack "
            f"'{stack_name}' outputs.\nOutputs found: {list(outputs.keys())}"
        )
    return prices_table, recyclers_table


def to_dynamodb(obj):
    """Convert floats to Decimal (DynamoDB requirement)."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: to_dynamodb(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_dynamodb(v) for v in obj]
    return obj


def seed_table(table, items, key_attr, dry_run):
    print(f"\nSeeding table: {table.name}  ({len(items)} items)")
    with table.batch_writer() as batch:
        for item in items:
            dynamo_item = to_dynamodb(item)
            if dry_run:
                print("  DRY-RUN would write:", json.dumps(item))
            else:
                batch.put_item(Item=dynamo_item)
                print(f"  ✓ {item[key_attr]}")


def main():
    parser = argparse.ArgumentParser(description="Seed KabadiAI DynamoDB tables")
    parser.add_argument("--stack",   default="kabadiai",  help="CloudFormation stack name")
    parser.add_argument("--region",  default="us-east-1", help="AWS region")
    parser.add_argument("--dry-run", action="store_true", help="Print items without writing")
    args = parser.parse_args()

    prices_data    = json.loads((ROOT / "data" / "prices.json").read_text())
    recyclers_data = json.loads((ROOT / "data" / "recyclers.json").read_text())

    if args.dry_run:
        print("=== DRY RUN – no data will be written ===")
        for item in prices_data:
            print("  PRICE:", json.dumps(item))
        for item in recyclers_data:
            print("  RECYCLER:", json.dumps(item))
        return

    prices_table_name, recyclers_table_name = get_table_names(args.stack, args.region)

    ddb = boto3.resource("dynamodb", region_name=args.region)
    seed_table(ddb.Table(prices_table_name),    prices_data,    "component", args.dry_run)
    seed_table(ddb.Table(recyclers_table_name), recyclers_data, "id",        args.dry_run)

    print("\nSeed complete.")


if __name__ == "__main__":
    main()
