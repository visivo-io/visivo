from typing import Optional
from pydantic import BaseModel, Field


class Dbt(BaseModel):
    """
    Configuration for pulling models and sources from a dbt project.

    The integration will create models and sources from the dbt project and store them in the output directory.

    It will pull all the "targets" defined in the profiles.yml file as sources.
    Each of these sources will be named in the format "prefix + dbt_profile + dbt_target".

    Then it will create each of the dbt models as Visivo models pointing to the default profile and target.
    These models will be named in the format "prefix + dbt_model".

    Using all the default values:
    ``` yaml
    dbt:
      enabled: true
    ```

    Or specify the input and/or output file and locations:

    ``` yaml
    dbt:
      output_file: includes/dbt.yml
      dbt_project_yml_location: dbt
      profiles_yml_location: dbt
    ```
    """

    enabled: Optional[bool] = Field(
        True,
        description="Whether to enable the dbt phase.  Defaults to true.",
    )
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
    prefix: str = Field(
        "",
        description="Prefix for the dbt models and sources. Defaults to no prefix. You may want to add one if the dbt model names are in conflict with other models in your project.",
    )

    def get_output_file(self, output_dir: str, working_dir: str):
        if self.output_file:
            return f"{working_dir}/{self.output_file}"
        return f"{output_dir}/dbt.yml"
