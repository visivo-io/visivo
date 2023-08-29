from typing import List, Optional
from sqlalchemy import text
import warnings

from pandas import read_sql, read_json
from visivo.models.project import Project
from visivo.models.trace import Trace
from visivo.commands.utils import find_or_create_target

warnings.filterwarnings("ignore")


class Runner:
    def __init__(
        self,
        traces: List[Trace],
        project: Project,
        output_dir: str,
        default_target: str = None,
    ):
        self.traces = traces
        self.default_target = default_target
        self.project = project
        self.output_dir = output_dir

    def run(self):
        for trace in self.traces:
            target_or_name = trace.target_name
            if not target_or_name:
                target_or_name = self.default_target

            target = find_or_create_target(
                project=self.project, target_or_name=target_or_name
            )
            trace_directory = f"{self.output_dir}/{trace.name}"
            with open(f"{trace_directory}/query.sql", "r") as file:
                query_string = file.read()
                data_frame = target.read_sql(query_string)
                self.__aggregate(data_frame=data_frame, trace_dir=trace_directory)

    @classmethod
    def aggregate(cls, json_file: str, trace_dir: str):
        data_frame = read_json(json_file)
        cls.__aggregate(data_frame=data_frame, trace_dir=trace_dir)

    @classmethod
    def __aggregate(cls, data_frame, trace_dir):
        aggregated = data_frame.groupby("cohort_on").aggregate(list).transpose()
        with open(f"{trace_dir}/data.json", "w") as fp:
            fp.write(aggregated.to_json(default_handler=str))
