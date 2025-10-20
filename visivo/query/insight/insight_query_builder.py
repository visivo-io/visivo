from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.base.project_dag import ProjectDag
from visivo.models.insight import Insight
from visivo.query.sqlglot_utils import field_alias_hasher

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
    def __init__(self, insight: Insight,  dag: ProjectDag, output_dir):
      self.dag = dag 
      self.output_dir = output_dir
      self.insight = insight
      self.field_resolver = FieldResolver(
         dag=dag, 
         output_dir=output_dir, 
         native_dialect= insight.get_native_dialect()
         )
      
      self.resolved_query_statements = None
      self.is_resolved = False
      

    def resolve(self):
      """Sets the resolved_query_statements"""
      unresolved_query_statements = self.insight.get_all_query_statements(self.dag)
      resolved_query_statements = []
      for key, statement in unresolved_query_statements:
         resolved_statement = self.field_resolver.resolve(expression=statement)
         resolved_query_statements.append((key, resolved_statement))
      self.resolved_query_statements = resolved_query_statements
      self.is_resolved = True
      
    
    def _props_mapping(self):
      props_statements = [(key, statement) for key, statement in self.resolved_query_statements if 'props.' in key ]
      props_map = {}
      for key, statement in props_statements:
         props_map[key] = field_alias_hasher(statement)
      return  props_map
        
       

    def build(self):
        if not self.is_resolved:
           raise Exception("Need to resolve before running build")
        data = {
            "post_query": f"SELECT * from {self.insight.hash_name()}",
            "props_mapping": self._props_mapping,
        }
        return InsightQueryInfo(**data)
