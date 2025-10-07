from visivo.models.base.project_dag import ProjectDag
from visivo.models.insight import Insight


class InsightQueryBuilder:
    def __init__(self, insight: Insight, dag: ProjectDag):
        self.insight = insight
        self.project = dag.get_project()
        self.dag = dag

    def build_query(self):
        
        pass
