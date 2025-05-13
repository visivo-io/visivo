import os


class Aggregator:
    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        from pandas import read_json

        data_frame = read_json(json_file)
        data_frame = data_frame.rename(columns=lambda x: x.replace("|", "."))
        cls.aggregate_data_frame(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def aggregate_data_frame(cls, data_frame, trace_dir):
        data_frame = data_frame.rename(columns=lambda x: x.replace("|", "."))
        aggregated = data_frame.groupby("cohort_on").aggregate(list).transpose()
        os.makedirs(trace_dir, exist_ok=True)
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.to_json(default_handler=str))
