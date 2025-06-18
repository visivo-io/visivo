import os
import polars as pl
import json
import io


class Aggregator:
    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        data_frame = pl.read_json(json_file)
        data_frame = data_frame.rename({col: col.replace("|", ".") for col in data_frame.columns})
        cls.aggregate_data_frame(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def aggregate_data_frame(cls, data_frame: pl.DataFrame, trace_dir: str):
        data_frame = data_frame.rename({col: col.replace("|", ".") for col in data_frame.columns})
        agg_exprs = [
            pl.col(col).implode().alias(col) for col in data_frame.columns if col != "cohort_on"
        ]
        aggregated = data_frame.group_by("cohort_on").agg(agg_exprs)
        # Write JSON to a string buffer
        buf = io.StringIO()
        aggregated.write_json(buf)
        buf.seek(0)
        rows = json.load(buf)
        # Transform to pandas-style dict
        result = {}
        for row in rows:
            cohort = row["cohort_on"]
            value = {}
            for k, v in row.items():
                if k == "cohort_on":
                    continue
                # Unwrap single-item lists if the item is itself a list
                if isinstance(v, list) and len(v) == 1 and isinstance(v[0], list):
                    value[k] = v[0]
                else:
                    value[k] = v
            result[cohort] = value
        os.makedirs(trace_dir, exist_ok=True)
        with open(f"{trace_dir}/data.json", "w") as fp:
            json.dump(result, fp, indent=4)
