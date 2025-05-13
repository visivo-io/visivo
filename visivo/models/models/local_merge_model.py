from typing import List
from pydantic import Field
from visivo.models.base.base_model import generate_ref_field
from visivo.models.base.parent_model import ParentModel
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.model import Model
from visivo.models.sources.duckdb_source import DuckdbAttachment, DuckdbSource
import click
import os

from visivo.models.sources.source import Source


class LocalMergeModel(Model, ParentModel):
    """
    Local Merge Models are models that allow you to merge data from multiple other models locally.

    !!! note

        Any joining is done in a local DuckDB database. While more efficient than SQLite,
        it's still primarily designed for medium-sized datasets.

    !!! example {% raw %}

        === "Internal join External"

            Here is an example of merging two models that are defined in your project. One that is external and one that is internal.
            ``` yaml
            models:
              - name: local_merge
                models:
                    - ref(first_domain_model)
                    - ref(external_data_model)
                sql: SELECT * FROM first_domain_model.model AS fdm JOIN external_data_model.model AS edm ON fdm.external_id = edm.id
            ```

    {% endraw %}
    """

    sql: str = Field(
        description="The sql used to generate your base data",
    )
    models: List[generate_ref_field(Model)] = Field(
        description="A model object defined inline or a ref() to a model."
    )

    def get_duckdb_source(self, output_dir, dag) -> DuckdbSource:
        os.makedirs(f"{output_dir}/models", exist_ok=True)
        attach = list(
            map(
                lambda model: DuckdbAttachment(
                    schema_name=model.name,
                    source=self._get_duckdb_from_model(model, output_dir, dag),
                ),
                self._get_dereferenced_models(dag),
            )
        )

        return DuckdbSource(
            name=f"model_{self.name}_generated_source",
            database=f"{output_dir}/models/{self.name}.duckdb",
            type="duckdb",
            attach=attach,
        )

    def _insert_dependent_models_to_duckdb(self, output_dir, dag):
        for model in self._get_dereferenced_models(dag):
            if isinstance(model, CsvScriptModel):
                continue  # CsvScriptModels are attached from their existing duckdb file.
            elif isinstance(model, LocalMergeModel):
                continue  # LocalMergeModels are attached from their existing duckdb file.
            else:
                duckdb_source = self._get_duckdb_from_model(model, output_dir, dag)
                source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
                data_frame = source.read_sql(model.sql)
                with duckdb_source.connect() as connection:
                    connection.execute("DROP TABLE IF EXISTS model")
                    connection.execute("CREATE TABLE model AS SELECT * FROM data_frame")

    def insert_duckdb_data(self, output_dir, dag):
        try:
            self._insert_dependent_models_to_duckdb(output_dir, dag)
        except Exception as e:
            raise click.ClickException(
                f"Failed to insert dependent models to duckdb for model {self.name}. Error: {str(e)}"
            )

        duckdb_source = self.get_duckdb_source(output_dir=output_dir, dag=dag)
        with duckdb_source.connect() as connection:
            data_frame = connection.execute(self.sql).fetchdf()
            connection.execute("DROP TABLE IF EXISTS model")
            connection.execute("CREATE TABLE model AS SELECT * FROM data_frame")

    def _get_duckdb_from_model(self, model, output_dir, dag) -> DuckdbSource:
        if isinstance(model, CsvScriptModel):
            return model.get_duckdb_source(output_dir=output_dir)
        elif isinstance(model, LocalMergeModel):
            return model.get_duckdb_source(output_dir=output_dir, dag=dag)
        else:
            os.makedirs(f"{output_dir}/models", exist_ok=True)
            return DuckdbSource(
                name=f"model_{model.name}_generated_source",
                database=f"{output_dir}/models/{model.name}.duckdb",
                type="duckdb",
            )

    def _get_dereferenced_models(self, dag):
        models = all_descendants_of_type(type=Model, dag=dag, from_node=self)
        return list(filter(lambda model: model is not self, models))

    def child_items(self):
        return self.models
