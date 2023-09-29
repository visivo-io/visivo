from typing import Optional
from pydantic import BaseModel, Field


class Defaults(BaseModel):
    """
    Defaults enable you to set a target and alert that will be used whenever one is not explicitly passed.

    Defaults will be overridden if:

    1. A target / alert is passed to a command. ex: `visivo serve -t target-name`
    2. A target is specified in the trace using the `target_name` attribute. when this attribute is set the trace will always run queries against that target.

    Here's how defaults look in the `project.visivo.yml` file:
    ``` yaml
    defaults:
      target_name: local-sqlite
      alert_name: slack

    alerts:
      - name: slack
        type: slack
        webhook_url: https://hooks.slack.com/services/ap8ub98ssoijbloisojbo8ys8

    targets:
      - name: local-sqlite
        database: target/local.db
        type: sqlite
    ```
    """

    alert_name: Optional[str] = Field(
        None,
        description="The name of an alert defined elsewhere in the Visivo project.",
    )
    target_name: Optional[str] = Field(
        None,
        description="The name of a target defined elsewhere in the Visivo project.",
    )

    def __hash__(self):
        return hash((type(self),) + tuple(self.__dict__.values()))
