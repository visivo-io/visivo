import csv
from typing import Any, List, Optional, Union
from typing_extensions import Annotated
from pydantic import Field, Discriminator, Tag
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.target import DefaultTarget, Target
from .base.base_model import RefString, generate_ref_field
import pandas


class Model(NamedModel):
    pass


class RunModel(Model):
    cmds: List[str] = Field(description="The sql used to generate your base data")

    def insert_csv_to_sqlite(self, output_dir):
        from sqlalchemy import create_engine
        import subprocess

        csv_file = f"{output_dir}/{self.name}.csv"
        with open(csv_file, "w+") as file:
            subprocess.run(self.cmds, stdout=file, stderr=subprocess.STDOUT, text=True)

        engine = create_engine(f"sqlite:///{output_dir}/{self.name}.sqlite")
        data_frame = pandas.read_csv(csv_file)
        data_frame.to_sql(self.name, engine, if_exists="replace", index=True)


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
