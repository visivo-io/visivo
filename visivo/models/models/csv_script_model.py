from typing import List

import pydantic
from visivo.models.models.model import Model, TableModelName
from pydantic import Field
from visivo.models.sources.duckdb_source import DuckdbSource
import io
import click
import os
import polars as pl
import csv


class CsvScriptModel(Model):
    """
    CSV Script Models are a type of model that executes a command with a given set of args.
    This command needs to return a well formatted :fontawesome-solid-file-csv: with a header row to stdout.

    Visivo will be able to access the generate file as a model by storing a duckdb file in the source directory.

    !!! example {% raw %}

        === "Echo"

            Echoing all of your data is probably not a very practical example, but it does nicely demonstrate how the feature works!
            ``` yaml
            models:
              - name: csv
                table_name: csv
                args:
                    - echo
                    - |
                      x,y
                      1,9
                      2,1
                      3,2
                      4,3
                      5,5
                      6,8
            ```

        === "Python Script"

            In this example we'll use python to generate a csv of processes running on your machine and make that csv available to Visivo as
            a model for analysis.
            ``` python title="created_processes_csv.py"
            import subprocess
            import csv
            import sys

            # Define the CSV file to write
            csv_file = "data/processes.csv"

            # Execute the 'ps aux' command
            result = subprocess.run(["ps", "aux"], stdout=subprocess.PIPE, text=True)

            # Split the output into lines
            lines = result.stdout.strip().split("/n")

            # Write CSV to stdout
            writer = csv.writer(sys.stdout)
            writer.writerow(
                ["USER","PID","%CPU","%MEM","VSZ","RSS","TTY","STAT","START","TIME","COMMAND"]
            )  # Header

            for line in lines[1:]:  # Skip the header line from the ps output
                row = line.split(None, 10)  # Split on whitespace, but only for the first 10 columns
                writer.writerow(row)
            ```
            With your script ready to go, all you have to do is convert `python create_processes_csv.py` into the args list format in a model.
            ``` yaml
            models:
              - name: processes
                table_name: processes
                args:
                  - python
                  - create_processes_csv.py
            ```{% endraw %}

        === "CSV File"

            One of the best use cases for this type of model is to store a static csv in your project and cat it into a model.
            This great because it's simple and allows you to version control your csv data.
            ``` csv title="file.csv"
            columns,go,up,here
            1,text,more text,6
            2,stuff,more stuff,7
            ```
            Then just `cat` the csv file in a model.
            ``` yaml
            models:
              - name: file_model
                table_name: file_model
                args:
                  - cat
                  - file.csv
            ```

    The args are python subprocess list args and you can read their source [documentation here](https://docs.python.org/3/library/subprocess.html#subprocess.CompletedProcess.args).
    """

    name: str = pydantic.Field(
        ..., description="The unique name of the object across the entire project."
    )

    table_name: TableModelName = Field(
        "model", description="The name to give the resulting models table"
    )

    args: List[str] = Field(description="An array of the variables that build your command to run.")

    allow_empty: bool = Field(
        default=False, description="Whether to allow the command to return an empty csv."
    )

    @property
    def sql(self):
        return f"select * from {self.table_name}"

    def get_duckdb_source(self, output_dir) -> DuckdbSource:
        os.makedirs(f"{output_dir}/models", exist_ok=True)
        return DuckdbSource(
            name=f"model_{self.name}_generated_source",
            database=f"{output_dir}/models/{self.name}.duckdb",
            type="duckdb",
        )

    def validate_stream_is_csv(self, stream: io.StringIO):
        try:
            # First check if the stream is empty
            content = stream.read()
            stream.seek(0)  # Reset stream position

            if not content.strip():
                if self.allow_empty:
                    return
                raise click.ClickException(
                    f"The command {self.name} did not return any data. Verify command's output and try again."
                )

            # Now try to parse the CSV
            reader = csv.reader(io.StringIO(content))
            rows = list(reader)

            if not rows:
                if self.allow_empty:
                    return
                raise click.ClickException(
                    f"The command {self.name} did not return any data. Verify command's output and try again."
                )

            expected = len(rows[0])
            for number, row in enumerate(rows, start=1):
                if len(row) == 0:
                    continue
                if len(row) != expected:
                    raise click.ClickException(
                        f"CSV parsing error for node:{self.name} model's command. Row {number} has {len(row)} columns but expected {expected}. Verify command's output and try again."
                    )
        except csv.Error as e:
            if os.environ.get("STACKTRACE"):
                raise e
            raise click.ClickException(
                f"CSV parsing error for {self.name} model's command. Verify command's output is a valid csv and try again. Full error: {repr(e)}"
            )
        finally:
            stream.seek(0)

    def insert_csv_to_duckdb(self, output_dir):
        import subprocess

        try:
            process = subprocess.Popen(self.args, stdout=subprocess.PIPE)
            source = self.get_duckdb_source(output_dir)
            with source.connect() as connection:
                csv = io.StringIO(process.stdout.read().decode())

                self.validate_stream_is_csv(csv)

                data_frame = pl.read_csv(csv)

                # Register the Polars DataFrame as a DuckDB view
                duckdb_conn = connection
                duckdb_conn.register("data_frame", data_frame)
                duckdb_conn.execute(
                    f"CREATE TABLE IF NOT EXISTS {self.table_name} AS SELECT * FROM data_frame"
                )
                duckdb_conn.execute(f"DELETE FROM {self.table_name}")
                duckdb_conn.execute(f"INSERT INTO {self.table_name} SELECT * FROM data_frame")
        except Exception as e:
            raise click.ClickException(
                f"Error parsing or generating the csv output of node:{self.name} model's command. Verify command's output and try again. Full error: {repr(e)}"
            )
