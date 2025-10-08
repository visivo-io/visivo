from typing import Set, List
from visivo.models.base.project_dag import ProjectDag
from visivo.models.insight import Insight
from visivo.models.models.model import Model
from visivo.models.sources.source import Source
from visivo.models.dag import all_descendants_of_type
from visivo.query.sqlglot_utils import get_sqlglot_dialect


class InsightQueryBuilder:
    def __init__(self, insight: Insight, dag: ProjectDag):
        self.insight = insight
        self.project = dag.get_project()
        self.dag = dag

        self._objects_referenced_by_interactions = (
            self._find_all_objects_referenced_from_interactions()
        )
        self._referenced_models = self._find_all_referenced_models()
        self._sqlglot_dialect = self._get_sqlglot_dialect()

    def build_query(self):
        models_ctes = self.build_models_ctes()

        pass

    def build_models_ctes(self):

        pass

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
