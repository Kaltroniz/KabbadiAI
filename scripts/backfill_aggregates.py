#!/usr/bin/env python3
"""KabadiAI - Backfill Script for AggregatesTable
Scans LotsTable (excluding mock lots) and writes pre-computed aggregates to AggregatesTable:
  1. id: "summary#all" (aggregate_type: "summary")
  2. id: "cell#<lat>#<lon>" (aggregate_type: "cell")

Usage:
  python3 scripts/backfill_aggregates.py --lots-table LotsTable --aggregates-table AggregatesTable --dry-run
  python3 scripts/backfill_aggregates.py --lots-table LotsTable --aggregates-table AggregatesTable --region us-east-1
"""
import argparse
import sys
import boto3
from decimal import Decimal

def backfill_aggregates(lots_table_name: str, aggregates_table_name: str, region: str = "us-east-1", dry_run: bool = True):
    print(f"--- Starting Aggregates Backfill (dry_run={dry_run}) ---")
    print(f"Source LotsTable        : {lots_table_name}")
    print(f"Target AggregatesTable  : {aggregates_table_name}")

    dynamodb = boto3.resource("dynamodb", region_name=region)
    lots_tbl = dynamodb.Table(lots_table_name)
    agg_tbl = dynamodb.Table(aggregates_table_name)

    scanned_lots = 0
    valid_lots = 0

    # Summary accumulator
    total_items = 0
    total_weight_g = 0.0
    hazard_lots = 0
    val_min = 0
    val_max = 0
    weight_by_component = {}
    hazard_counts = {}

    # Cell accumulator: (lat, lon) -> dict
    cells = {}

    scan_kwargs = {
        "ProjectionExpression": "cell_lat, cell_lon, items, hazards, total_min_inr, total_max_inr, mock"
    }

    done = False
    while not done:
        res = lots_tbl.scan(**scan_kwargs)
        items = res.get("Items", [])
        scanned_lots += len(items)

        for lot in items:
            if lot.get("mock"):
                continue
            valid_lots += 1

            l_items = lot.get("items", [])
            l_hazards = lot.get("hazards", [])
            l_val_min = int(lot.get("total_min_inr", 0))
            l_val_max = int(lot.get("total_max_inr", 0))

            item_cnt = sum(int(it.get("count", 1)) for it in l_items)
            weight_g = sum(float(it.get("est_weight_g", 0)) for it in l_items)
            hz_cnt = len(l_hazards)

            total_items += item_cnt
            total_weight_g += weight_g
            if hz_cnt > 0:
                hazard_lots += 1
            val_min += l_val_min
            val_max += l_val_max

            for it in l_items:
                c_name = it.get("component", "other")
                weight_by_component[c_name] = weight_by_component.get(c_name, 0.0) + float(it.get("est_weight_g", 0)) / 1000.0

            for h in l_hazards:
                hazard_counts[h] = hazard_counts.get(h, 0) + 1

            c_lat = lot.get("cell_lat")
            c_lon = lot.get("cell_lon")
            if c_lat is not None and c_lon is not None:
                ckey = (float(c_lat), float(c_lon))
                cell = cells.setdefault(ckey, {
                    "lat": Decimal(str(ckey[0])),
                    "lon": Decimal(str(ckey[1])),
                    "lot_count": 0,
                    "item_count": 0,
                    "hazard_count": 0
                })
                cell["lot_count"] += 1
                cell["item_count"] += item_cnt
                cell["hazard_count"] += hz_cnt

        start_key = res.get("LastEvaluatedKey")
        if start_key:
            scan_kwargs["ExclusiveStartKey"] = start_key
        else:
            done = True

    print(f"\nAggregated {valid_lots} valid lots across {len(cells)} geographic cells.")

    # 1. Summary record
    summary_item = {
        "id": "summary#all",
        "aggregate_type": "summary",
        "total_lots": valid_lots,
        "total_items": total_items,
        "total_weight_g": Decimal(str(round(total_weight_g, 2))),
        "hazard_lots": hazard_lots,
        "value_min_inr": val_min,
        "value_max_inr": val_max,
        "weight_kg_by_component": {k: Decimal(str(round(v, 2))) for k, v in weight_by_component.items()},
        "hazard_counts": hazard_counts,
    }

    if dry_run:
        print("[DRY-RUN] Would write summary#all:", summary_item)
        print(f"[DRY-RUN] Would write {len(cells)} cell records.")
    else:
        print("Writing summary#all to AggregatesTable...")
        agg_tbl.put_item(Item=summary_item)

        print(f"Writing {len(cells)} cell records...")
        with agg_tbl.batch_writer() as batch:
            for (lat, lon), cdata in cells.items():
                batch.put_item(Item={
                    "id": f"cell#{lat}#{lon}",
                    "aggregate_type": "cell",
                    "lat": cdata["lat"],
                    "lon": cdata["lon"],
                    "lot_count": cdata["lot_count"],
                    "item_count": cdata["item_count"],
                    "hazard_count": cdata["hazard_count"],
                })
        print("Successfully written all aggregate records.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill AggregatesTable from LotsTable")
    parser.add_argument("--lots-table", required=True, help="DynamoDB LotsTable name")
    parser.add_argument("--aggregates-table", required=True, help="DynamoDB AggregatesTable name")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--dry-run", action="store_true", help="Print updates without mutating DynamoDB")
    args = parser.parse_args()

    backfill_aggregates(args.lots_table, args.aggregates_table, args.region, args.dry_run)
