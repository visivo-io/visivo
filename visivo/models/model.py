from typing import List, Optional, Union
from pydantic import Field, validator
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.target import DefaultTarget, Target
from .base.base_model import generate_ref_field
from abc import ABC


class Model(ABC):
    """
    Models return base data that is used in Traces
    """


class ScriptModel(Model, NamedModel):
    """
    Model that executes a script that returns csv data
    """

    run: str = Field(
        None,
        description="The command to run that returns CSV data",
    )


class SqlModel(Model, ParentModel, NamedModel):
    """
    Model that executes sql against a given database target
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


Models = Union[SqlModel, ScriptModel]


class JoinModel(Model, NamedModel, ParentModel):
    """
    Model that makes sub_models available to join.  The target is a temporary sqlite database containing the sub-models.
    """

    sql: str = Field(
        None,
        description="The sql used to generate your base data",
    )
    sub_models: List[Models] = []

    def child_items(self):
        return self.sub_models
