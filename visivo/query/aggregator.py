import os
import polars as pl


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
        os.makedirs(trace_dir, exist_ok=True)
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.write_json())
