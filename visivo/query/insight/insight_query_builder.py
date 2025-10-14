from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.base.project_dag import ProjectDag


class InsightQueryBuilder:

    @staticmethod
    def build(insight, dag: ProjectDag):
        return InsightQueryInfo()
