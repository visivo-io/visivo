from typing import Set, List, Dict
from visivo.models.base.project_dag import ProjectDag
from visivo.models.insight import Insight
from visivo.models.models.model import Model
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.source import Source
from visivo.models.dag import all_descendants_of_type
from visivo.query.sqlglot_utils import get_sqlglot_dialect
import sqlglot
import hashlib


class InsightQueryBuilder:
    def __init__(self, insight: Insight, dag: ProjectDag):
        self.insight = insight
        self.project = dag.get_project()
        self.dag = dag

        self.pre_queries = None
        self.post_query = None

        self._name_to_hash_map = {}

        self._objects_referenced_by_interactions = (
            self._find_all_objects_referenced_from_interactions()
        )
        self._has_interactions = len(self._objects_referenced_by_interactions) > 0
        self._referenced_models = self._find_all_referenced_models()
        self._sqlglot_dialect = self._get_sqlglot_dialect()


    def build_queries(self):
        models_ctes = self.build_models_ctes()
        if self._has_interactions:
            # In this case the pre query will be all the models used in the query
            # the post query will be the pre query from the else case
            self.post_query = 'select * from "hash of the insight name"'
            pass
        else:
            pass

    def build_models_ctes(self) -> Dict[str, str]:
        ctes = {}

        for model in self._referenced_models:
            if model.dimensions:
                parsed_sql = sqlglot.parse_one(model.sql, dialect=self._sqlglot_dialect)

                for dimension in model.dimensions:
                    dim_expr = sqlglot.parse_one(dimension.expression, dialect=self._sqlglot_dialect)

                    aliased_column = sqlglot.expressions.Alias(
                        this=dim_expr,
                        alias=self._get_hashed_name(dimension.name)
                    )

                    parsed_sql.select(aliased_column, append=True, copy=False)

                cte_sql = parsed_sql.sql(dialect=self._sqlglot_dialect)
            else:
                cte_sql = model.sql

            ctes[model.name] = cte_sql

        return ctes

    def _find_all_objects_referenced_from_interactions(self) -> Set:
        referenced_names = self.insight.get_interaction_references()

        referenced_objects = set()
        for name in referenced_names:
            obj = self.dag.get_descendant_by_name(name, from_node=self.insight)
            referenced_objects.add(obj)

        return referenced_objects

    def _find_all_referenced_models(self) -> List[Model]:
        return all_descendants_of_type(type=Model, dag=self.dag, from_node=self.insight)

    def _get_sqlglot_dialect(self) -> str:
        source = all_descendants_of_type(type=Source, dag=self.dag, from_node=self.insight)[0]

        return get_sqlglot_dialect(source.get_dialect())

    def _get_hashed_name(self, name: str) -> str:
        if name in self._name_to_hash_map:
            return self._name_to_hash_map[name]

        hashed_name = hashlib.md5(name.encode()).hexdigest()
        self._name_to_hash_map[name] = hashed_name
        return hashed_name
