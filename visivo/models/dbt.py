from typing import Optional
from pydantic import BaseModel, Field


class Dbt(BaseModel):
    """
    Configuration for pulling models and sources from a dbt project.

    ``` yaml
    dbt:
      output_file: includes/dbt.yml
      dbt_project_yml_location: dbt
      profiles_yml_location: dbt
    ```
    """

    output_file: Optional[str] = Field(
        None,
        description="The file to store the dbt models and sources relative to the working directory.  Defaults to the '$output_directory/dbt.yml'. It is useful to store the file in a different location so it can be checked into source control.",
    )
    dbt_project_yml_location: Optional[str] = Field(
        None,
        description="Location for the dbt_project.yml file relative to the working directory.  Defaults to the current working directory.",
    )
    profiles_yml_location: Optional[str] = Field(
        None,
        description="Location for the profiles.yml file relative to the working directory.  Defaults to the current working directory.",
    )
