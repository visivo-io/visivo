import os
import json
import base64
from collections import defaultdict
from decimal import Decimal
from datetime import datetime, date, time
from visivo.logger.logger import Logger


class Aggregator:
    @staticmethod
    def _make_json_serializable(obj):
        """Convert objects to JSON-serializable format"""
        if isinstance(obj, bytes):
            return base64.b64encode(obj).decode("utf-8")
        elif isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, (datetime, date)):
            return obj.isoformat()
        elif isinstance(obj, time):
            return obj.isoformat()
        elif isinstance(obj, list):
            return [Aggregator._make_json_serializable(item) for item in obj]
        elif isinstance(obj, dict):
            return {key: Aggregator._make_json_serializable(value) for key, value in obj.items()}
        elif (
            isinstance(obj, bool)
            or isinstance(obj, int)
            or isinstance(obj, float)
            or isinstance(obj, str)
            or obj is None
        ):
            return obj
        else:
            return str(obj)

    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        # Read JSON file directly with Python instead of Polars
        with open(json_file, "r") as f:
            data = json.load(f)

        # Convert column names (replace | with .)
        for row in data:
            renamed_row = {}
            for key, value in row.items():
                new_key = key.replace("|", ".")
                renamed_row[new_key] = value
            row.clear()
            row.update(renamed_row)

        cls.aggregate_data(data=data, trace_dir=trace_dir)

    @classmethod
    def aggregate_data_frame(cls, data, trace_dir: str):
        for row in data:
            renamed_row = {}
            for key, value in row.items():
                new_key = key.replace("|", ".")
                renamed_row[new_key] = value
            row.clear()
            row.update(renamed_row)

        cls.aggregate_data(data=data, trace_dir=trace_dir)

    @classmethod
    def aggregate_data(cls, data: list, trace_dir: str):
        """
        Pure Python aggregation that groups by cohort_on and aggregates other columns into lists
        """
        # Group data by cohort_on
        grouped = defaultdict(list)
        for row in data:
            cohort_on = row.get("cohort_on")
            if cohort_on is not None:
                grouped[cohort_on].append(row)

        # Aggregate each group
        result = {}
        for cohort, rows in grouped.items():
            aggregated_row = {}

            # Get all column names except cohort_on
            all_columns = set()
            for row in rows:
                all_columns.update(row.keys())
            all_columns.discard("cohort_on")

            # Aggregate each column
            for col in all_columns:
                values = []
                for row in rows:
                    if col in row:
                        values.append(row[col])

                # Only process columns that have values
                if values:
                    # If there's only one value and it is a list, unwrap it from the list
                    if len(values) == 1 and isinstance(values[0], list):
                        aggregated_row[col] = values[0]
                    else:
                        aggregated_row[col] = values

            result[cohort] = aggregated_row

        # Make result JSON-serializable (handles bytes, etc.)
        json_safe_result = cls._make_json_serializable(result)

        # Write result to JSON file
        os.makedirs(trace_dir, exist_ok=True)
        with open(f"{trace_dir}/data.json", "w") as fp:
            json.dump(json_safe_result, fp, indent=4)
