from typing import Any, List, Optional, Union
from typing_extensions import Annotated
from pydantic import Field, Discriminator, Tag
from visivo.logging.logger import Logger
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.target import DefaultTarget, Target, TypeEnum
from .base.base_model import RefString, generate_ref_field
import pandas
import click


class Model(NamedModel):
    pass


CsvScriptModelName = Annotated[str, Field(pattern="[a-zA-Z0-9_]")]


class CsvScriptModel(Model):
    """
    # CSV Script Models
    CSV Script Models are a type of model that executes a command with a given set of args.
    This command needs to return a well formatted csv :fontawesome-solid-file-csv: with a header row.

    The header row will be used to create a table in a sqlite file that traces are able to reference.

    The args are python subprocess list args. You can read their source
    [documented here](https://docs.python.org/3/library/subprocess.html#subprocess.CompletedProcess.args).

    ``` yaml
    something: somethingelse
    ```

    """

    name: CsvScriptModelName = Field(
        None, description="The unique name of the object across the entire project."
    )

    args: List[str] = Field(
        description="An array of the variables that build your command to run."
    )

    @property
    def sql(self):
        return f"select * from {self.name}"

    def get_target(self, output_dir):
        return Target(
            name=f"model_{self.name}_generated_target",
            type=TypeEnum.sqlite,
            database=self.get_database(output_dir),
        )

    def get_database(self, output_dir):
        return f"{output_dir}/{self.name}.sqlite"

    def insert_csv_to_sqlite(self, output_dir):
        from sqlalchemy import create_engine
        import subprocess

        csv_file = f"{output_dir}/{self.name}.csv"
        with open(csv_file, "w+") as file:
            subprocess.run(self.args, stdout=file, stderr=subprocess.STDOUT, text=True)

        # TODO warn about table name and catch error about malformed CSV
        engine = create_engine(f"sqlite:///{self.get_database(output_dir)}")
        try:
            data_frame = pandas.read_csv(csv_file)
        except:
            raise click.ClickException(
                f"Error parsing csv output of {self.name} model's command. Output stored in {csv_file}. Verify contents and try again."
            )
        Logger.instance().info(self.get_database(output_dir))
        data_frame.to_sql(self.name, engine, if_exists="replace", index=True)


class SqlModel(Model, ParentModel):
    """
    SQL Models are queries that return base data from a SQL target. These data are then
     used in Traces
    """

    sql: str = Field(
        None,
        description="The sql used to generate your base data",
    )

    target: Optional[generate_ref_field(Target)] = Field(
        None,
        description="A target object defined inline or a ref() to a chart. Override the defaults.target_name",
    )

    def child_items(self):
        if self.target:
            return [self.target]
        else:
            return [DefaultTarget()]


def get_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str):
        return "Ref"
    if isinstance(value, dict):
        if "args" in value:
            return "CsvScript"
        if "sql" in value:
            return "Sql"
    if hasattr(value, "args"):
        return "CsvScript"
    if hasattr(value, "sql"):
        return "Sql"

    return None


ModelField = Annotated[
    Union[
        Annotated[SqlModel, Tag("Sql")],
        Annotated[CsvScriptModel, Tag("CsvScript")],
    ],
    Discriminator(get_model_discriminator_value),
]

ModelRefField = Annotated[
    Union[
        RefString,
        Annotated[SqlModel, Tag("Sql")],
        Annotated[CsvScriptModel, Tag("CsvScript")],
    ],
    Discriminator(get_model_discriminator_value),
]
