from typing import Optional, Literal, List
from pydantic import BaseModel, ConfigDict, Field


class Level(BaseModel):
    """Represents a dashboard level with title and description"""

    title: str = Field(..., description="Display title for this level")
    description: str = Field(..., description="Description of this level's purpose")


class Defaults(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    """
    Defaults enable you to set a source and alert that will be used whenever one is not explicitly passed.

    Defaults will be overridden if:

    1. A source / alert is passed to a command. ex: `visivo serve -t source-name`
    2. A source is specified in the trace using the `source_name` attribute. when this attribute is set the trace will always run queries against that source.

    Here's how defaults look in the `project.visivo.yml` file:
    ``` yaml
    defaults:
      source_name: local-sqlite
      alert_name: slack

    alerts:
      - name: slack
        type: slack
        webhook_url: https://hooks.slack.com/services/ap8ub98ssoijbloisojbo8ys8

    sources:
      - name: local-sqlite
        database: source/local.db
        type: sqlite
    ```
    """

    alert_name: Optional[str] = Field(
        None,
        description="The name of an alert defined elsewhere in the Visivo project.",
    )
    source_name: Optional[str] = Field(
        None,
        description="The name of a source defined elsewhere in the Visivo project.",
        alias="target_name",
    )
    threads: Optional[int] = Field(
        8,
        description="The number of threads to use when running queries.",
    )
    levels: List[Level] = Field(
        default_factory=list,
        description="Enables you to customize the project level view of your dashboards. Ordered list of dashboard levels with titles and descriptions",
        json_schema_extra={
            "examples": [
                {
                    "title": "Overview",
                    "description": "The most important dashboards and metrics for the organization",
                },
                {
                    "title": "Department",
                    "description": "The most important dashboards & metrics for a department",
                },
            ]
        },
    )

    def __hash__(self):
        return hash((type(self),) + tuple(self.__dict__.values()))
