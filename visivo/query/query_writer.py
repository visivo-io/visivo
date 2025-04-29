from visivo.models.trace import Trace
import os
from pathlib import Path


class QueryWriter:
    def __init__(self, output_dir: str, trace: Trace, query_string: str):
        self.output_dir = output_dir
        self.trace = trace
        self.query_string = query_string

    def write(self):
        trace_directory = f"{self.output_dir}/traces/{self.trace.name}"
        os.makedirs(trace_directory, exist_ok=True)
        query_file = f"{trace_directory}/query.sql"
        with open(query_file, "w") as fp:
            fp.write(self.query_string)
