from typing import List
from visivo.models.models.model import Model, TableModelName
from pydantic import Field
from visivo.models.sources.sqlite_source import SqliteSource
import io
import click


class CsvScriptModel(Model):
    """
    CSV Script Models are a type of model that executes a command with a given set of args.
    This command needs to return a well formatted :fontawesome-solid-file-csv: with a header row to stdout.

    Visivo will be able to access the generate file as a model by storing a sqlite file in the source directory.

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

    table_name: TableModelName = Field(
        "model", description="The name to give the resulting models table"
    )

    args: List[str] = Field(
        description="An array of the variables that build your command to run."
    )

    @property
    def sql(self):
        return f"select * from {self.table_name}"

    def get_sqlite_source(self, output_dir) -> SqliteSource:
        return SqliteSource(
            name=f"model_{self.name}_generated_source",
            database=f"{output_dir}/{self.name}.sqlite",
            type="sqlite",
        )

    def insert_csv_to_sqlite(self, output_dir):
        import pandas
        import subprocess

        process = subprocess.Popen(self.args, stdout=subprocess.PIPE)
        engine = self.get_sqlite_source(output_dir).get_engine()
        try:
            csv = io.StringIO(process.stdout.read().decode())
            data_frame = pandas.read_csv(csv)
        except:
            raise click.ClickException(
                f"Error parsing csv output of {self.name} model's command. Verify command's output and try again."
            )
        data_frame.to_sql(self.table_name, engine, if_exists="replace", index=False)
