from typing import List
from pydantic import Field
from visivo.logging.logger import Logger
from visivo.models.base.base_model import generate_ref_field
from visivo.models.base.parent_model import ParentModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.model import Model
from visivo.models.models.sql_model import SqlModel
from visivo.models.targets.sqlite_target import Attachment, SqliteTarget
import os

from visivo.models.targets.target import Target


class LocalMergeModel(Model, ParentModel):
    """
    Local Merge Models are models that allow you to merge data from multiple other models locally.

    !!! note

        Any joining is done in a local SQLite database. It is not designed for large datasets.

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

    def get_sqlite_target(self, output_dir, dag) -> SqliteTarget:
        attach = list(
            map(
                lambda model: Attachment(
                    schema_name=model.name,
                    target=self._get_sqlite_from_model(model, output_dir, dag),
                ),
                self._get_dereferenced_models(dag),
            )
        )

        return SqliteTarget(
            name=f"model_{self.name}_generated_target",
            database="",
            type="sqlite",
            attach=attach,
        )

    def insert_dependent_models_to_sqlite(self, output_dir, dag):
        import pandas

        for model in self._get_dereferenced_models(dag):
            if isinstance(model, CsvScriptModel):
                continue
            sqlite_target = self._get_sqlite_from_model(model, output_dir, dag)
            target = ParentModel.all_descendants_of_type(
                type=Target, dag=dag, from_node=model
            )[0]
            data_frame = target.read_sql(model.sql)
            engine = sqlite_target.get_engine()
            data_frame.to_sql("model", engine, if_exists="replace", index=False)

    def _get_sqlite_from_model(self, model, output_dir, dag) -> SqliteTarget:
        if isinstance(model, CsvScriptModel):
            return model.get_sqlite_target(output_dir=output_dir)
        elif isinstance(model, LocalMergeModel):
            return model.get_sqlite_target(output_dir=output_dir, dag=dag)
        else:
            return SqliteTarget(
                name=f"model_{model.name}_generated_target",
                database=f"{output_dir}/{model.name}.sqlite",
                type="sqlite",
            )

    def _get_dereferenced_models(self, dag):
        models = ParentModel.all_descendants_of_type(
            type=Model, dag=dag, from_node=self
        )
        return list(filter(lambda model: model is not self, models))

    def child_items(self):
        return self.models
