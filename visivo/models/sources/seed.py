import csv
import glob
import io
import os
import re
from typing import List, Literal, Optional

import click
from pydantic import Field, model_validator

from visivo.models.base.base_model import BaseModel
from visivo.models.models.model import TableModelName

SeedFormat = Literal["csv", "parquet", "json", "xlsx"]

_FORMAT_BY_EXTENSION = {
    "csv": "csv",
    "tsv": "csv",
    "tab": "csv",
    "txt": "csv",
    "parquet": "parquet",
    "pq": "parquet",
    "json": "json",
    "jsonl": "json",
    "ndjson": "json",
    "xlsx": "xlsx",
}


def sql_string_literal(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def table_name_for_file(file: str) -> Optional[str]:
    stem = os.path.basename(file).split(".")[0]
    slug = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_")
    if not slug:
        return None
    return f"t_{slug}" if slug[0].isdigit() else slug


class Seed(BaseModel):
    """
    Seeds load a data file, or the output of a command, into a table on their source before
    any model queries it.

    A `file` seed reads a CSV, TSV, Parquet, JSON or Excel (`.xlsx`) file from the project
    with DuckDB's native readers, so column types come from the file. The path may be a glob
    such as `data/sales_*.csv`; matching files load into one table, so a glob needs a
    `table_name`. Otherwise `table_name` defaults to the file name without its extension.

    A command seed runs with a given set of args and needs to return a well formatted
    :fontawesome-solid-file-csv: with a header row to stdout. Visivo writes that CSV into
    `table_name` on the source, so every model pointed at the source can query it like any
    other table.

    Seeds run once per source, ahead of the models that depend on it, so several models can
    share one seeded table without loading it more than once.

    !!! example {% raw %}

        === "Data Files"

            Keep data files in the project and load each into a table. Seeds on the same source
            land in the same database, so a single model can join across them.
            ``` yaml
            sources:
              - name: local
                type: duckdb
                database: target/local.duckdb
                seeds:
                  - table_name: gl
                    file: data/gl_*.csv
                  - table_name: budget
                    file: data/budget.xlsx
                    sheet: FY26
                  - table_name: ev
                    file: data/*.parquet

            models:
              - name: spend_vs_budget
                source: ${ref(local)}
                sql: |
                  select account, sum(amount) as spent, any_value(budget) as budget
                  from gl join budget using (account)
                  group by account
            ```

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

        === "Joining Two Seeds"

            A command seed and a file seed on the same source can be joined like any two tables.
            ``` yaml
            sources:
              - name: local
                type: duckdb
                database: target/local.duckdb
                seeds:
                  - table_name: raw_orders
                    args: [python, export_orders.py]
                  - table_name: raw_items
                    file: data/items.csv

            models:
              - name: orders_with_items
                source: ${ref(local)}
                sql: |
                  select * from raw_orders o join raw_items i on o.id = i.order_id
            ```

    The args are python subprocess list args and you can read their source [documentation here](https://docs.python.org/3/library/subprocess.html#subprocess.CompletedProcess.args).
    """

    args: Optional[List[str]] = Field(
        None,
        description="An array of the variables that build your command to run. Use either `args` or `file`.",
    )

    file: Optional[str] = Field(
        None,
        description=(
            "Path to a data file, relative to the project directory. Globs such as "
            "`data/*.csv` load every matching file into one table. Use either `args` or `file`."
        ),
    )

    table_name: TableModelName = Field(
        None,
        description=(
            "The name of the table to load into on the source. Required for `args` seeds. "
            "For `file` seeds it defaults to the file name without its extension, except "
            "when the path has a `*`."
        ),
    )

    format: Optional[SeedFormat] = Field(
        None,
        description="The file's format. Inferred from the file extension when not set.",
    )

    delimiter: Optional[str] = Field(
        None,
        description="CSV only: the character between values. Detected when not set; `.tsv` files use a tab.",
    )

    has_header: Optional[bool] = Field(
        None,
        description="CSV and Excel only: whether the first row holds column names. Detected when not set.",
    )

    sheet: Optional[str] = Field(
        None, description="Excel only: the worksheet to load. Defaults to the first sheet."
    )

    union_by_name: Optional[bool] = Field(
        None,
        description=(
            "When a glob matches several files, match their columns by name instead of by "
            "position. Not available for Excel."
        ),
    )

    allow_empty: bool = Field(
        default=False, description="Whether to allow the command to return an empty csv."
    )

    existing_table: Literal["skip", "append", "overwrite"] = Field(
        default="skip",
        description=(
            "What to do when the seed's `table_name` already exists on the source. "
            "`skip` (default) leaves the existing table untouched and does not run the command; "
            "`append` runs the command and inserts its rows into the existing table; "
            "`overwrite` runs the command and replaces the table. When the table is absent the "
            "seed always runs and creates it."
        ),
    )

    @model_validator(mode="before")
    @classmethod
    def default_table_name_from_file(cls, data):
        if (
            isinstance(data, dict)
            and data.get("file")
            and "*" not in data["file"]
            and not data.get("table_name")
        ):
            name = table_name_for_file(data["file"])
            if name:
                data = {**data, "table_name": name}
        return data

    @model_validator(mode="after")
    def check_command_or_file(self):
        if bool(self.args) == bool(self.file):
            raise ValueError("A seed needs exactly one of `args` or `file`.")
        if not self.table_name and self.file and "*" in self.file:
            raise ValueError("A seed with a `*` in `file` needs a `table_name`.")
        if not self.table_name:
            raise ValueError(
                "A seed needs a `table_name`."
                if self.args
                else f"Cannot make a table name from '{self.file}'. Set `table_name`."
            )
        if self.file:
            file_format = self.file_format()
            if file_format is None:
                raise ValueError(
                    f"Cannot tell the format of '{self.file}'. Set `format` to one of "
                    "csv, parquet, json or xlsx."
                )
            if self.delimiter is not None and file_format != "csv":
                raise ValueError("`delimiter` applies only to CSV files.")
            if self.has_header is not None and file_format not in ("csv", "xlsx"):
                raise ValueError("`has_header` applies only to CSV and Excel files.")
            if self.sheet is not None and file_format != "xlsx":
                raise ValueError("`sheet` applies only to Excel files.")
            if self.union_by_name is not None and file_format == "xlsx":
                raise ValueError("`union_by_name` does not apply to Excel files.")
        else:
            hints = ["format", "delimiter", "has_header", "sheet", "union_by_name"]
            used = [hint for hint in hints if getattr(self, hint) is not None]
            if used:
                raise ValueError(f"{', '.join(used)} applies only to `file` seeds.")
        return self

    def file_format(self) -> Optional[str]:
        if self.format:
            return self.format
        extension = os.path.splitext(self.file or "")[1].lstrip(".").lower()
        if extension == "xls":
            return None
        return _FORMAT_BY_EXTENSION.get(extension)

    def resolve_file(self, working_dir: Optional[str] = None) -> str:
        if os.path.isabs(self.file):
            return self.file
        return os.path.join(working_dir or os.getcwd(), self.file)

    def matching_files(self, working_dir: Optional[str] = None) -> List[str]:
        path = self.resolve_file(working_dir)
        if glob.has_magic(path):
            return sorted(match for match in glob.glob(path) if os.path.isfile(match))
        return [path] if os.path.isfile(path) else []

    def reader_sql(self, path: str) -> str:
        """The DuckDB table function that reads this seed's file at ``path``."""
        file_format = self.file_format()
        options = [sql_string_literal(path)]
        if file_format == "csv":
            delimiter = self.delimiter
            if delimiter is None and os.path.splitext(self.file)[1].lower() in (".tsv", ".tab"):
                delimiter = "\t"
            if delimiter is not None:
                options.append(f"delim = {sql_string_literal(delimiter)}")
            if self.has_header is not None:
                options.append(f"header = {str(self.has_header).lower()}")
        if file_format == "xlsx":
            if self.sheet is not None:
                options.append(f"sheet = {sql_string_literal(self.sheet)}")
            if self.has_header is not None:
                options.append(f"header = {str(self.has_header).lower()}")
        if self.union_by_name is not None:
            options.append(f"union_by_name = {str(self.union_by_name).lower()}")
        function = {
            "csv": "read_csv",
            "parquet": "read_parquet",
            "json": "read_json",
            "xlsx": "read_xlsx",
        }[file_format]
        return f"{function}({', '.join(options)})"

    def prepare_connection(self, connection):
        """Load the DuckDB extension this seed's reader needs."""
        if self.file_format() != "xlsx":
            return
        try:
            connection.execute("INSTALL excel")
            connection.execute("LOAD excel")
        except Exception as err:
            raise click.ClickException(
                f"Seed {self.table_name} reads an Excel file, which needs DuckDB's excel "
                f"extension. It could not be installed: {err}"
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
