import csv
import io
import os
from typing import List

import click
from pydantic import Field

from visivo.models.base.base_model import BaseModel
from visivo.models.models.model import TableModelName


class Seed(BaseModel):
    """
    Seeds load the output of a command into a table on their source before any model queries it.

    The command is run with a given set of args and needs to return a well formatted
    :fontawesome-solid-file-csv: with a header row to stdout. Visivo writes that CSV into
    `table_name` on the source, so every model pointed at the source can query it like any
    other table.

    Seeds run once per source, ahead of the models that depend on it, so several models can
    share one seeded table without loading it more than once.

    !!! example {% raw %}

        === "Echo"

            Echoing all of your data is probably not a very practical example, but it does nicely demonstrate how the feature works!
            ``` yaml
            sources:
              - name: local
                type: duckdb
                database: target/local.duckdb
                seeds:
                  - table_name: csv
                    args:
                      - echo
                      - |
                        x,y
                        1,9
                        2,1
                        3,2

            models:
              - name: csv
                source: ${ref(local)}
                sql: select * from csv
            ```

        === "Python Script"

            In this example we'll use python to generate a csv of processes running on your machine and make that csv available to Visivo as
            a table for analysis.
            ``` python title="created_processes_csv.py"
            import subprocess
            import csv
            import sys

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
            With your script ready to go, all you have to do is convert `python create_processes_csv.py` into the args list format in a seed.
            ``` yaml
            sources:
              - name: local
                type: duckdb
                database: target/local.duckdb
                seeds:
                  - table_name: processes
                    args:
                      - python
                      - create_processes_csv.py
            ```{% endraw %}

        === "CSV File"

            One of the best use cases for a seed is to store a static csv in your project and cat it into a table.
            This is great because it's simple and allows you to version control your csv data.
            ``` csv title="file.csv"
            columns,go,up,here
            1,text,more text,6
            2,stuff,more stuff,7
            ```
            Then just `cat` the csv file in a seed.
            ``` yaml
            sources:
              - name: local
                type: duckdb
                database: target/local.duckdb
                seeds:
                  - table_name: file_data
                    args:
                      - cat
                      - file.csv
            ```

        === "Joining Two Seeds"

            Seeds on the same source land in the same database, so a single model can join across them.
            ``` yaml
            sources:
              - name: local
                type: duckdb
                database: target/local.duckdb
                seeds:
                  - table_name: raw_orders
                    args: [cat, data/orders.csv]
                  - table_name: raw_items
                    args: [cat, data/items.csv]

            models:
              - name: orders_with_items
                source: ${ref(local)}
                sql: |
                  select * from raw_orders o join raw_items i on o.id = i.order_id
            ```

    The args are python subprocess list args and you can read their source [documentation here](https://docs.python.org/3/library/subprocess.html#subprocess.CompletedProcess.args).
    """

    args: List[str] = Field(
        ..., description="An array of the variables that build your command to run."
    )

    table_name: TableModelName = Field(
        ..., description="The name of the table to write the resulting csv to on the source."
    )

    allow_empty: bool = Field(
        default=False, description="Whether to allow the command to return an empty csv."
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
                    f"The command for seed {self.table_name} did not return any data. Verify command's output and try again."
                )

            # Now try to parse the CSV
            reader = csv.reader(io.StringIO(content))
            rows = list(reader)

            if not rows:
                if self.allow_empty:
                    return
                raise click.ClickException(
                    f"The command for seed {self.table_name} did not return any data. Verify command's output and try again."
                )

            expected = len(rows[0])
            for number, row in enumerate(rows, start=1):
                if len(row) == 0:
                    continue
                if len(row) != expected:
                    raise click.ClickException(
                        f"CSV parsing error for seed {self.table_name}. Row {number} has {len(row)} columns but expected {expected}. Verify command's output and try again."
                    )
        except csv.Error as e:
            if os.environ.get("STACKTRACE"):
                raise e
            raise click.ClickException(
                f"CSV parsing error for seed {self.table_name}. Verify command's output is a valid csv and try again. Full error: {repr(e)}"
            )
        finally:
            stream.seek(0)
