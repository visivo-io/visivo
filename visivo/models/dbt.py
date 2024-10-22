from typing import Optional
from pydantic import BaseModel, Field


class Dbt(BaseModel):
    """
    Configuration for pulling models and sources from a dbt project.

    ``` yaml
    dbt:
      dbt_project_yml_location: ./dbt
    ```
    """

    dbt_project_yml_location: Optional[str] = Field(
        None,
        description="Location for the dbt_project.yml file.  Defaults to the current working directory.",
    )
