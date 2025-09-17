from typing import List
from pydantic import Field
from visivo.models.base.base_model import generate_ref_field
from visivo.models.base.parent_model import ParentModel
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.model import Model
from visivo.models.sources.duckdb_source import DuckdbAttachment, DuckdbSource
from visivo.logger.logger import Logger
import click
import os
import polars as pl

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
        Logger.instance().debug(f"Local merge model {self.name}: Creating DuckDB source")
        os.makedirs(f"{output_dir}/models", exist_ok=True)

        dereferenced_models = self._get_dereferenced_models(dag)
        Logger.instance().debug(
            f"Local merge model {self.name}: Found {len(dereferenced_models)} dependent models"
        )

        attach = list(
            map(
                lambda model: DuckdbAttachment(
                    schema_name=model.name,
                    source=self._get_duckdb_from_model(model, output_dir, dag),
                ),
                dereferenced_models,
            )
        )

        db_path = f"{output_dir}/models/{self.name}.duckdb"
        Logger.instance().debug(f"Local merge model {self.name}: Database path: {db_path}")

        return DuckdbSource(
            name=f"model_{self.name}_generated_source",
            database=db_path,
            type="duckdb",
            attach=attach,
        )

    def _insert_dependent_models_to_duckdb(self, output_dir, dag):
        for model in self._get_dereferenced_models(dag):
            if isinstance(model, CsvScriptModel):
                Logger.instance().debug(
                    f"Local merge model {self.name}: Skipping CsvScriptModel {model.name} (will be attached)"
                )
                continue  # CsvScriptModels are attached from their existing duckdb file.
            elif isinstance(model, LocalMergeModel):
                Logger.instance().debug(
                    f"Local merge model {self.name}: Skipping LocalMergeModel {model.name} (will be attached)"
                )
                continue  # LocalMergeModels are attached from their existing duckdb file.
            else:
                Logger.instance().debug(
                    f"Local merge model {self.name}: Processing model {model.name}"
                )
                duckdb_source = self._get_duckdb_from_model(model, output_dir, dag)
                source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]

                Logger.instance().debug(
                    f"Local merge model {self.name}: Reading data from source for model {model.name}"
                )
                data = source.read_sql(model.sql)

                # Convert list of dictionaries to Polars DataFrame for DuckDB insertion
                data_frame = pl.DataFrame(data)
                Logger.instance().debug(
                    f"Local merge model {self.name}: Loaded {len(data_frame)} rows for model {model.name}"
                )

                with duckdb_source.connect(read_only=False) as connection:
                    connection.execute("DROP TABLE IF EXISTS model")
                    connection.execute("CREATE TABLE model AS SELECT * FROM data_frame")
                    Logger.instance().debug(
                        f"Local merge model {self.name}: Inserted data for model {model.name}"
                    )

                Logger.instance().debug(
                    f"Local merge model {self.name}: Completed processing for model {model.name}"
                )

    def insert_duckdb_data(self, output_dir, dag):
        Logger.instance().debug(f"Local merge model {self.name}: Starting data insertion")
        try:
            self._insert_dependent_models_to_duckdb(output_dir, dag)
        except Exception as e:
            Logger.instance().error(
                f"Local merge model {self.name}: Failed to insert dependent models - {str(e)}"
            )
            raise click.ClickException(
                f"Failed to insert dependent models to duckdb for model {self.name}. Error: {str(e)}"
            )

        duckdb_source = self.get_duckdb_source(output_dir=output_dir, dag=dag)
        try:
            Logger.instance().debug(f"Local merge model {self.name}: Executing merge SQL")
            with duckdb_source.connect(read_only=False) as connection:
                data_frame = connection.execute(self.sql).pl()
                row_count = len(data_frame)
                Logger.instance().debug(
                    f"Local merge model {self.name}: Query returned {row_count} rows"
                )

                connection.execute("DROP TABLE IF EXISTS model")
                connection.execute("CREATE TABLE model AS SELECT * FROM data_frame")
                Logger.instance().debug(
                    f"Local merge model {self.name}: Created model table with {row_count} rows"
                )
        except Exception as e:
            Logger.instance().error(
                f"Local merge model {self.name}: Failed to execute merge SQL - {str(e)}"
            )
            raise
        finally:
            Logger.instance().debug(f"Local merge model {self.name}: Completed successfully")

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
