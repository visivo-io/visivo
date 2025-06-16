import os
import polars as pl


class Aggregator:
    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        data_frame = pl.read_json(json_file)
        data_frame = data_frame.rename({col: col.replace("|", ".") for col in data_frame.columns})
        cls.aggregate_data_frame(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def aggregate_data_frame(cls, data_frame, trace_dir):
        data_frame = data_frame.rename({col: col.replace("|", ".") for col in data_frame.columns})
        aggregated = data_frame.group_by("cohort_on").agg(pl.col("*")).transpose()
        os.makedirs(trace_dir, exist_ok=True)
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.write_json())
