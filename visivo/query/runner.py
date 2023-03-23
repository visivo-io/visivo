from sqlalchemy import create_engine, text
from visivo.models.target import Target
from visivo.models.trace import Trace
from typing import List
from pandas import read_sql, read_json


class Runner:
    def __init__(self, traces: List[Trace], target: Target, output_dir: str):
        self.traces = traces
        self.target = target
        self.output_dir = output_dir

    def run(self):
        for trace in self.traces:
            trace_directory = f"{self.output_dir}/{trace.name}"
            with open(f"{trace_directory}/query.sql", "r") as file:
                query_string = file.read()

                engine = create_engine(self.target.url())

                with engine.connect() as connection:
                    data_frame = read_sql(text(query_string), connection)
                    self.__aggregate(data_frame=data_frame, trace_dir=trace_directory)

    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        data_frame = read_json(json_file)
        cls.__aggregate(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def __aggregate(cls, data_frame, trace_dir):
        aggregated = data_frame.groupby("cohort_on").aggregate(list).transpose()
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.to_json())
