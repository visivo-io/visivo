import csv
from typing import Any, Optional, Union
from typing_extensions import Annotated
from pydantic import Field, Discriminator, Tag
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.target import DefaultTarget, Target
from .base.base_model import RefString, generate_ref_field


class Model(NamedModel):
    pass


class RunModel(Model):
    run: str = Field(description="The sql used to generate your base data")

    def insert_csv_to_sqlite(self, output_dir):
        from sqlalchemy import create_engine, Table, Column, Integer, String, MetaData
        import subprocess

        csv_file = f"{output_dir}/{self.name}.csv"
        with open(csv_file, "w+") as file:
            subprocess.run(
                self.run.split(" "), stdout=file, stderr=subprocess.STDOUT, text=True
            )

        engine = create_engine(f"sqlite:///{output_dir}/{self.name}.db")
        metadata = MetaData()
        table = Table(
            self.name,
            metadata,
            Column("id", Integer, primary_key=True),
            Column("column1", String),
            Column("column2", String),
        )
        metadata.create_all(engine)

        with open(csv_file, "r") as file:
            csv_reader = csv.reader(file)
            next(csv_reader)  # Skip header row if it exists
            conn = engine.connect()
            for row in csv_reader:
                conn.execute(table.insert().values(column1=row[0], column2=row[1]))


class SqlModel(Model, ParentModel):
    """
    Models are queries that return base data that is used in Traces
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
        if "sql" in value:
            return "Sql"
        if "run" in value:
            return "Run"
    if hasattr(value, "sql"):
        return "Sql"
    if hasattr(value, "run"):
        return "Run"

    return None


ModelField = Annotated[
    Union[
        Annotated[SqlModel, Tag("Sql")],
        Annotated[RunModel, Tag("Run")],
    ],
    Discriminator(get_model_discriminator_value),
]

ModelRefField = Annotated[
    Union[
        RefString,
        Annotated[SqlModel, Tag("Sql")],
        Annotated[RunModel, Tag("Run")],
    ],
    Discriminator(get_model_discriminator_value),
]
