from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.base.project_dag import ProjectDag
from visivo.query.sqlglot_utils import field_alias_hasher

from visivo.query.resolvers.field_resolver import FieldResolver
from visivo.query.relation_graph import RelationGraph
from visivo.query.sqlglot_utils import find_non_aggregated_expressions, has_window_function, has_aggregate_function


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

    def __init__(self, insight, dag: ProjectDag, output_dir):
        self.dag = dag
        self.output_dir = output_dir
        self.insight_hash = insight.name_hash()
        self.unresolved_query_statements = insight.get_all_query_statements(dag)
        self.is_dyanmic = insight.is_dynamic(dag)
        self.models = insight.get_all_dependent_models(dag)
        source = insight.get_dependent_source(dag)
        self.default_schema = source.db_schema
        self.default_database = source.database
        field_resolver =  FieldResolver(
            dag=dag, output_dir=output_dir, native_dialect=insight.get_native_dialect()
        )
        self.field_resolver = field_resolver
        self.relation_graph = RelationGraph(dag, field_resolver)

        self.main_query = None
        self.resolved_query_statements = None
        self.is_resolved = False

    @property
    def props_mapping(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing props_mapping")
        props_statements = [
            (key, statement) for key, statement in self.resolved_query_statements if "props." in key
        ]
        props_map = {}
        for key, statement in props_statements:
            props_map[key] = field_alias_hasher(statement)
        return props_map

    @property
    def pre_query(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing pre_query")
        if self.is_dyanmic:
            return None
        else:
            return self._build_main_query()

    @property
    def post_query(self):
        if not self.is_resolved:
            raise Exception("Need to resolve before accessing pre_query")
        if self.is_dyanmic:
            return self._build_main_query()
        else:
            # Should be able to execute this in JS as long as we do the following-
            # await db.registerFileURL("insight_hash.parquet", "https://signed.file/call.parquet");
            return f"SELECT * FROM '{self.insight_hash}.parquet'"

    def resolve(self):
        """Sets the resolved_query_statements"""

        resolved_query_statements = []
        for key, statement in self.unresolved_query_statements:
            resolved_statement = self.field_resolver.resolve(expression=statement)
            resolved_query_statements.append((key, resolved_statement))
        self.resolved_query_statements = resolved_query_statements
        self.is_resolved = True

    def _build_main_query(self):
        """
        Pull all of the _build methods together adding them to a single sqlglot AST. This method should format the query
        and it should transpile it to duckdb if the query is dynamic because that's where the main query will run in that
        case. The _build methods should be writing sql in the native source dialect of the insight up till this point. 
        """
        pass 
    def _build_ctes(self):
        """
        Loop through self.models insight building the CTE SQLglot expressions. Dynamic vs. non dynamic insights will 
        function differently:

        1. **Dyanmic Insights**: The select within each cte runs a "select * from f'{model.name.name_hash()}.parquet'" 
        2. **Non-Dynamic Insights**: The select within each cte will pass through the model.sql directly.
        
        In both cases we could use the SchemaAggregator to fully express the columns within each cte. Also the cte
        will always be aliased with the model.name_hash() value. This is the value that the fields are expecting. 
        """
        pass  
        
    def _build_main_select(self):
        """
        Create the final select after the CTEs. Loop through resolved_query_statements filtering for props, split 
        and filter statements striped of "ASC, DESC".
        """
        pass 
    
    def _build_from_and_joins(self):
        """
        Use RelationGraph to determine join path between all of the dependent models. RelationGraph should determine
        which model is used in the from clause and order of the joins between models. We will need to update 
        @visivo/query/relaion_graph.py and create a method that is able to do this. The current ones only work with
        two models, but the foundation is there. 
        
        """
        pass 
    
    def _build_where_clause(self):
        """
        Find filter statements that have non-aggregates in the resolved sql via sqlglot utils function 
        has_aggregate_function() and add those statments to this clause.
        """
        pass 
    
    def _build_group_by(self):
        """
        Leverage the sqlglot_utils function find_non_aggregated_expressions() to pull out top level 
        non aggregate expressions into the group by statement. The function does all of the hard work. 
        It will pull out a list of expressions that need to be added to the groupby. 
        """
        pass 
    def _build_having(self):
        """
        Find filter statements that have aggregates in the resolved 
        sql via sqlglot utils function using has_aggregate_function() and add 
        those entire statments to this clause. 
        """
        pass 
     
    def _build_qualify(self):
        """
        Works for REDSHIFT SNOWFLAKE, BIGQUERY & DUCKDB NATIVE DIALECT ONLY in V1. We should use 
        sqlglot to determine if the native dialect supports qualify. I think addeding a new function in
        sqlglot_utils.py would make sense for this purpose. 

        Find filter statements that have have windows in the resolved sql via sqlglot utils 
        has_window_function() and add those statments to this clause. 
        """
        pass
    
    def _build_order_by(self):
        """
        Find order_by statements that have aggregates in the resolved sql via  
        functions and add those statments to this clause. 
        """
        pass
    

    def build(self):

        if not self.is_resolved:
            raise Exception("Need to resolve before running build")
        data = {
            "pre_query": self.pre_query,
            "post_query": self.post_query,
            "props_mapping": self.props_mapping,
        }
        return InsightQueryInfo(**data)
