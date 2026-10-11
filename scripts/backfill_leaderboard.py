#!/usr/bin/env python3
"""KabadiAI - Backfill Script for LeaderboardIndex GSI
Scans UsersTable and sets:
  - leaderboard_key: "national" (for global leaderboard partition)
  - xp: integer (default 0 if missing)
  - city: lowercase city name (default "delhi")

Usage:
  python3 scripts/backfill_leaderboard.py --table UsersTable --dry-run
  python3 scripts/backfill_leaderboard.py --table UsersTable --region us-east-1
"""
import argparse
import sys
import boto3
from decimal import Decimal

def backfill_leaderboard(table_name: str, region: str = "us-east-1", dry_run: bool = True):
    print(f"--- Starting Leaderboard Backfill on table '{table_name}' (dry_run={dry_run}) ---")
    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)

    scanned = 0
    updated = 0
    errors = 0

    scan_kwargs = {
        "ProjectionExpression": "email, #name, xp, leaderboard_key, city",
        "ExpressionAttributeNames": {"#name": "name"}
    }

    done = False
    while not done:
        response = table.scan(**scan_kwargs)
        items = response.get("Items", [])
        scanned += len(items)

        for item in items:
            email = item.get("email")
            if not email:
                continue

            current_key = item.get("leaderboard_key")
            current_xp = item.get("xp")
            current_city = item.get("city")

            needs_update = False
            target_key = current_key or "national"
            target_xp = current_xp if current_xp is not None else Decimal("0")
            target_city = current_city or "delhi"

            if current_key != target_key or current_xp is None or current_city is None:
                needs_update = True

            if needs_update:
                if dry_run:
                    print(f"[DRY-RUN] Would update {email}: leaderboard_key={target_key}, xp={target_xp}, city={target_city}")
                    updated += 1
                else:
                    try:
                        table.update_item(
                            Key={"email": email},
                            UpdateExpression="SET leaderboard_key = :lk, xp = :xp, city = :ct",
                            ExpressionAttributeValues={
                                ":lk": target_key,
                                ":xp": target_xp,
                                ":ct": target_city
                            }
                        )
                        print(f"[UPDATED] {email}")
                        updated += 1
                    except Exception as exc:
                        print(f"[ERROR] Failed to update {email}: {exc}", file=sys.stderr)
                        errors += 1

        start_key = response.get("LastEvaluatedKey")
        if start_key:
            scan_kwargs["ExclusiveStartKey"] = start_key
        else:
            done = True

    print(f"\n--- Backfill Summary ---")
    print(f"Total scanned items : {scanned}")
    print(f"Total updated items : {updated}")
    print(f"Total errors        : {errors}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill UsersTable for LeaderboardIndex")
    parser.add_argument("--table", required=True, help="DynamoDB UsersTable name")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--dry-run", action="store_true", help="Print updates without mutating DynamoDB")
    args = parser.parse_args()

    backfill_leaderboard(args.table, args.region, args.dry_run)
