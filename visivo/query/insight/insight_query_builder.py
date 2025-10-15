from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.base.project_dag import ProjectDag


class InsightQueryBuilder:

    @staticmethod
    def build(insight, dag: ProjectDag):
        dummy_data = {
            "post_query": f"SELECT * from {insight.hash_name()}",
            "props_mapping": {
                "props.x": "x",
                "props.y": "y",
            },
        }
        return InsightQueryInfo(**dummy_data)
