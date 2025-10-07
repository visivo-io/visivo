from typing import Annotated, List
from visivo.models.base.named_model import NamedModel
from pydantic import Field, model_validator


class Model(NamedModel):
    """
    Base class for all model types in Visivo.

    Models can have metrics and dimensions defined on them regardless of model type.
    """

    metrics: List["Metric"] = Field(
        [], description="A list of model-scoped metrics that aggregate data from this model."
    )

    dimensions: List["Dimension"] = Field(
        [], description="A list of computed dimensions (row-level calculations) for this model."
    )

    @model_validator(mode="after")
    def set_parent_names_on_nested_objects(self):
        """Set parent names on nested metrics and dimensions, and validate no ref() in expressions."""
        from visivo.query.patterns import has_CONTEXT_STRING_REF_PATTERN

        # Process both metrics and dimensions
        for obj_type, objects in [("metric", self.metrics), ("dimension", self.dimensions)]:
            for obj in objects:
                obj.set_parent_name(self.name)
                # Validate no ref() in nested object expressions
                if has_CONTEXT_STRING_REF_PATTERN(obj.expression):
                    raise ValueError(
                        f"Nested {obj_type} '{obj.name}' in model '{self.name}' cannot use ref() syntax in expression. "
                        f"Nested {obj_type}s can only reference fields from their parent model directly."
                    )

        return self


# Forward references
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension

Model.model_rebuild()


TableModelName = Annotated[str, Field(pattern="[a-zA-Z0-9_]")]
