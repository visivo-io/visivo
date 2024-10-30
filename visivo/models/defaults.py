from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


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
        None,
        description="The number of threads to use when running queries.",
    )

    def __hash__(self):
        return hash((type(self),) + tuple(self.__dict__.values()))
