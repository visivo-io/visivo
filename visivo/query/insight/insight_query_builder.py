from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.base.project_dag import ProjectDag


class InsightQueryBuilder:
    """
    1. If the insight is NOT dynamic need to return pre_query and mappings
      - Fully express query to run on a single source backend meanning full table references in model CTEs 
      -  
    2. If the insight is dynamic 
      - Need to return post_query and mappings 
      - Need to express models in the CTEs as references and include that in the mappings or have a standard file ref
      - Need to replace expressions that contain inputs with the input type place holder

    3. 
    """
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
