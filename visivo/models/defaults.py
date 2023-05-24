from typing import List, Optional
from enum import Enum
from .item import Item
from pydantic import BaseModel, Field


class Defaults(BaseModel):
    """
    Defaults enable you to set a target and alert that will be used whenever one is not explicitly passed.

    Defaults will be overidden if:

    1. A target / alert is passed to a command. ex: `visivo serve -t target-name`
    2. A target is specified in the trace using the `target_name` attribute. when this attribute is set the trace will always run queries against that target.

    Here's how defaults look in the `visivo_project.yml` file:
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
        None, description="The name of an alert defined elswhere in the Visivo project."
    )
    target_name: Optional[str] = Field(
        None, description="The name of a target defined elswhere in the Visivo project."
    )
