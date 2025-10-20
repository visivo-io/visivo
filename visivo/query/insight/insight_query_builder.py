from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.base.project_dag import ProjectDag

from visivo.query.resolvers.field_resolver import FieldResolver
from visivo.query.resolvers.relation_resolver import RelationResolver


class InsightQueryBuilder:
    """
    1. If the insight is NOT dynamic
      - need to return pre_query as the "main query"
      - Fully express query to run on a single source backend meanning full table references in model CTEs
      - Use native source dialect for the main query
      - mappings
    2. If the insight IS dynamic
      - Need to return post_query as the "main query" in "duckdb" dialect transpiling from native dialect
      - Resolve inputs with their place holder & ref comment in sql. No recursion needed since inputs cannot
        be in metrics/dimension they are always at the top level

    3. In all cases:
      - Need to express model CTEs named after the model hash name as the FieldResolver & ModelSchema expect
      - Have to collect all of the query statements from insight.props & insight.interactions
    """

    @staticmethod
    def build(insight, dag: ProjectDag, output_dir):
        dummy_data = {
            "post_query": f"SELECT * from {insight.hash_name()}",
            "props_mapping": {
                "props.x": "x",
                "props.y": "y",
            },
        }
        return InsightQueryInfo(**dummy_data)
