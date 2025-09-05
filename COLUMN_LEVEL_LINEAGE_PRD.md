PRD: Column-Level Lineage for Visivo's Semantic Layer (Revised)

  Executive Summary

  This document outlines the implementation of comprehensive column-level lineage tracking in Visivo, extending from source table columns through models, dimensions, metrics, and ultimately to visualization properties. This enhancement will transform Visivo from a visualization tool into
   a complete data lineage platform, providing impact analysis, data governance, and optimization capabilities while creating the foundation for a truly unified semantic layer. **All changes will be 100% backward compatible with no breaking changes to existing functionality.**

  Problem Statement

  Current Limitations

  1. No Source-to-Visualization Tracking: We cannot trace a value in a chart back to its source columns
  2. Blind Impact Analysis: Changes to source schemas require manual investigation of downstream effects
  3. Redundant Resolution Logic: Separate resolvers for metrics and dimensions with duplicated code
  4. Missing Validation: Broken column references only discovered at query runtime
  5. No Usage Optimization: Cannot identify unused source columns for query optimization
  6. Limited Governance: No ability to track sensitive data through transformations

  User Pain Points

  - "What breaks if I rename this column?" - No automated impact analysis
  - "Where does this metric's data come from?" - No lineage visualization
  - "Which columns are actually used?" - No usage tracking for optimization
  - "Is PII data exposed in any dashboards?" - No governance tracking

  Vision & Goals

  Vision

  Create a unified field-level lineage system that tracks every data transformation from source to visualization, enabling Visivo to provide enterprise-grade data governance, impact analysis, and semantic layer capabilities.

  Primary Goals

  1. Complete Lineage Tracking: Track column flow from warehouse.table.column → model.field → dimension → metric → trace.property
  2. Unified Expression Resolution: Single resolver for all expression types (fields, dimensions, metrics)
  3. Smart Introspection: Only inspect tables actually referenced in the project
  4. Performance: Sub-second lineage queries with intelligent caching
  5. 100% Backward Compatibility: All changes are additive, existing projects continue working unchanged

  Success Metrics

  - Lineage query response time < 100ms
  - Source introspection time reduced by 80% (only inspecting used tables)
  - Zero regression in existing test suite
  - Complete lineage for 100% of expressions
  - Zero breaking changes to existing projects

  Proposed Architecture

  Core Components

  1. Extended ProjectDag with Field-Level Tracking

  class FieldNode:
      """Represents a field/column in the lineage graph."""
      id: str  # e.g., "warehouse.orders.amount", "model.orders.total"
      type: FieldType  # source_column, model_field, dimension, metric, trace_property
      expression: Optional[str]  # SQL/calculation if derived
      data_type: Optional[str]  # INTEGER, VARCHAR, etc.
      source_nodes: Set[str]  # IDs of upstream fields

  class ExtendedProjectDag(ProjectDag):
      """Enhanced DAG with field-level tracking alongside object-level."""

      def __init__(self):
          super().__init__()
          self.field_graph = DiGraph()  # Separate graph for fields
          self.field_nodes: Dict[str, FieldNode] = {}

      def add_field_node(self, field: FieldNode):
          """Add a field to the lineage graph."""
          self.field_nodes[field.id] = field
          self.field_graph.add_node(field.id)

      def add_field_edge(self, source_id: str, target_id: str):
          """Add dependency edge between fields."""
          self.field_graph.add_edge(source_id, target_id)

      def get_field_lineage(self, field_id: str) -> Dict[str, List[str]]:
          """Get complete upstream and downstream lineage for a field."""
          return {
              "upstream": list(ancestors(self.field_graph, field_id)),
              "downstream": list(descendants(self.field_graph, field_id))
          }

      def get_impact_analysis(self, field_id: str) -> List[ImpactItem]:
          """Analyze impact of changing a field."""
          downstream = self.get_field_lineage(field_id)["downstream"]
          impacts = []
          for node_id in downstream:
              node = self.field_nodes[node_id]
              if node.type == FieldType.TRACE_PROPERTY:
                  # This affects a visualization
                  impacts.append(ImpactItem(
                      type="visualization",
                      name=node_id.split(".")[1],  # Extract trace name
                      severity="high"
                  ))
          return impacts

  2. Smart Source Introspection with Project-Scoped Caching

  class SmartIntrospector:
      """Introspect only tables actually used in the project."""

      def __init__(self, project: Project, output_dir: str):
          self.project = project
          # Cache is project-scoped, stored in output directory
          self.cache_dir = Path(output_dir) / ".visivo" / "schema_cache"
          self.cache_ttl = 3600  # 1 hour default

      def get_required_tables(self) -> Dict[str, Set[str]]:
          """Extract table references from all model SQL."""
          required = defaultdict(set)

          for model in self.project.models:
              # Parse SQL with sqlglot
              ast = sqlglot.parse_one(model.sql)

              # Extract table references
              for table in ast.find_all(exp.Table):
                  if table.catalog:  # database.schema.table format
                      source_name = table.catalog
                      table_name = f"{table.db}.{table.name}"
                  else:  # schema.table format
                      source_name = self._infer_source(model)
                      table_name = f"{table.db}.{table.name}" if table.db else table.name

                  required[source_name].add(table_name)

          return required

      def introspect_required_only(self) -> Dict[str, SourceSchema]:
          """Introspect only the required tables from each source."""
          schemas = {}
          required_tables = self.get_required_tables()

          for source_name, tables in required_tables.items():
              source = self.project.get_source(source_name)

              # Check project-scoped cache first
              cached = self._get_cached_schema(source_name, tables)
              if cached:
                  schemas[source_name] = cached
                  continue

              # Introspect only required tables
              schema = source.introspect_tables(tables)
              self._cache_schema(source_name, schema)
              schemas[source_name] = schema

          return schemas

      def _get_cached_schema(self, source_name: str, tables: Set[str]) -> Optional[SourceSchema]:
          """Get cached schema from project-specific cache directory."""
          cache_file = self.cache_dir / f"{source_name}_schema.json"
          if not cache_file.exists():
              return None

          # Check cache age
          if time.time() - cache_file.stat().st_mtime > self.cache_ttl:
              return None

          with open(cache_file, 'r') as f:
              cached_data = json.load(f)

          # Verify all required tables are in cache
          cached_tables = set(cached_data.get("tables", {}).keys())
          if not tables.issubset(cached_tables):
              return None

          return SourceSchema.from_dict(cached_data)

  3. SQL Lineage Parser

  class SqlLineageParser:
      """Parse model SQL to extract column-level lineage."""

      def parse_model_lineage(self, model: Model, source_schemas: Dict) -> ModelLineage:
          """Extract input and output columns from model SQL."""
          ast = sqlglot.parse_one(model.sql)

          lineage = ModelLineage(
              model_name=model.name,
              input_columns=[],
              output_columns=[]
          )

          # Handle different SQL patterns
          if isinstance(ast, exp.Select):
              lineage.output_columns = self._extract_select_columns(ast)
              lineage.input_columns = self._extract_source_columns(ast, source_schemas)
          elif isinstance(ast, exp.Union):
              # Handle UNION queries
              for query in ast.expressions:
                  lineage.merge(self.parse_model_lineage(query))

          # Handle CTEs
          for cte in ast.find_all(exp.CTE):
              cte_lineage = self._parse_cte_lineage(cte)
              lineage.ctes[cte.alias] = cte_lineage

          return lineage

      def _extract_select_columns(self, select: exp.Select) -> List[OutputColumn]:
          """Extract output columns from SELECT clause."""
          columns = []

          for expr in select.expressions:
              if isinstance(expr, exp.Alias):
                  columns.append(OutputColumn(
                      name=expr.alias,
                      expression=expr.this.sql(),
                      source_columns=self._extract_column_refs(expr.this)
                  ))
              elif isinstance(expr, exp.Column):
                  columns.append(OutputColumn(
                      name=expr.name,
                      expression=expr.sql(),
                      source_columns=[self._column_to_ref(expr)]
                  ))
              elif isinstance(expr, exp.Star):
                  # Expand * to actual columns from schema
                  columns.extend(self._expand_star(select))

          return columns

  4. Unified Expression Resolver

  class UnifiedExpressionResolver:
      """Single resolver for all expression types (fields, dimensions, metrics)."""

      def __init__(self, project: Project, output_dir: str):
          self.project = project
          self.output_dir = output_dir
          self.dag = project.dag()  # ExtendedProjectDag
          self.expressions = {}  # All expressions indexed by ID
          self._build_expression_index()

      def _build_expression_index(self):
          """Build unified index of all expressions."""

          # 1. Source columns (from introspection)
          introspector = SmartIntrospector(self.project, self.output_dir)
          self.source_schemas = introspector.introspect_required_only()

          for source_name, schema in self.source_schemas.items():
              for table_name, table_schema in schema.tables.items():
                  for column_name, column_info in table_schema.columns.items():
                      expr_id = f"{source_name}.{table_name}.{column_name}"
                      self.expressions[expr_id] = Expression(
                          id=expr_id,
                          type=ExpressionType.SOURCE_COLUMN,
                          expression=column_name,
                          data_type=column_info.data_type,
                          dependencies=set()
                      )

          # 2. Model fields (from SQL parsing)
          for model in self.project.models:
              lineage = SqlLineageParser().parse_model_lineage(model, self.source_schemas)
              for col in lineage.output_columns:
                  expr_id = f"model.{model.name}.{col.name}"
                  self.expressions[expr_id] = Expression(
                      id=expr_id,
                      type=ExpressionType.MODEL_FIELD,
                      expression=col.expression,
                      dependencies=set(col.source_columns)
                  )

          # 3. Dimensions (explicit and implicit)
          for dimension in self._get_all_dimensions():
              expr_id = self._dimension_to_id(dimension)
              self.expressions[expr_id] = Expression(
                  id=expr_id,
                  type=ExpressionType.DIMENSION,
                  expression=dimension.expression,
                  dependencies=self._resolve_expression_deps(dimension.expression)
              )

          # 4. Metrics
          for metric in self._get_all_metrics():
              expr_id = self._metric_to_id(metric)
              self.expressions[expr_id] = Expression(
                  id=expr_id,
                  type=ExpressionType.METRIC,
                  expression=metric.expression,
                  dependencies=self._resolve_expression_deps(metric.expression),
                  is_aggregate=True
              )

      def resolve(self, reference: str, context: Optional[str] = None) -> ResolvedExpression:
          """Resolve any expression reference - backward compatible."""
          # Handle ${ref()} patterns
          if "${ref(" in reference:
              reference = self._resolve_ref_pattern(reference, context)

          # Look up in unified index
          if reference in self.expressions:
              expr = self.expressions[reference]
              return ResolvedExpression(
                  sql=self._expand_expression(expr),
                  type=expr.type,
                  dependencies=self._get_all_dependencies(expr),
                  models_involved=self._get_involved_models(expr)
              )

          raise ExpressionNotFoundError(f"Expression '{reference}' not found")

      def validate_expression_type(self, expr_id: str, expected_type: ExpressionType):
          """Validate expression is appropriate type."""
          expr = self.expressions.get(expr_id)
          if not expr:
              raise ExpressionNotFoundError(f"Expression '{expr_id}' not found")

          if expected_type == ExpressionType.DIMENSION and expr.is_aggregate:
              raise ValidationError(f"Dimension '{expr_id}' cannot contain aggregate functions")

          if expected_type == ExpressionType.METRIC and not expr.is_aggregate:
              # Unless it references other metrics
              if not any(self.expressions[dep].is_aggregate for dep in expr.dependencies):
                  raise ValidationError(f"Metric '{expr_id}' must contain aggregate functions")

  Integration with Existing Systems

  1. Compile Phase Enhancement (Backward Compatible)

  def compile_with_lineage(project: Project, output_dir: str) -> CompiledProject:
      """Enhanced compile that builds field-level lineage - fully backward compatible."""

      # Original compilation continues to work
      compiled = original_compile(project)

      # Add new lineage information (additive only)
      try:
          # 1. Smart introspection of required tables only
          introspector = SmartIntrospector(project, output_dir)
          source_schemas = introspector.introspect_required_only()

          # 2. Parse SQL to extract column lineage
          for model in project.models:
              lineage = SqlLineageParser().parse_model_lineage(model, source_schemas)
              model._lineage = lineage  # Private attribute, doesn't affect serialization

              # Add to field graph (new feature, doesn't affect existing)
              for col in lineage.output_columns:
                  field_id = f"model.{model.name}.{col.name}"
                  project.dag().add_field_node(FieldNode(
                      id=field_id,
                      type=FieldType.MODEL_FIELD,
                      expression=col.expression,
                      source_nodes=set(col.source_columns)
                  ))

                  # Add edges from source columns
                  for source_col in col.source_columns:
                      project.dag().add_field_edge(source_col, field_id)

          # 3. Build unified expression resolver
          resolver = UnifiedExpressionResolver(project, output_dir)
          project._resolver = resolver  # Private attribute

      except Exception as e:
          # If lineage fails, log warning but continue
          Logger.instance().warning(f"Field lineage extraction failed: {e}")
          # Project still compiles successfully without lineage

      return compiled

  2. Run Phase Enhancement (Backward Compatible)

  def run_with_lineage_tracking(trace: Trace, project: Project):
      """Enhanced run that tracks field usage - fully backward compatible."""

      # Check if new resolver exists, otherwise use legacy
      if hasattr(project, '_resolver'):
          resolver = project._resolver
      else:
          # Fall back to legacy resolvers
          resolver = LegacyResolver(project)

      # Resolve trace properties and track lineage
      for prop, value in trace.props.items():
          if is_expression(value):
              resolved = resolver.resolve(value)

              # Only add lineage if new system is available
              if hasattr(project.dag(), 'add_field_node'):
                  # Add trace property to field graph
                  prop_id = f"trace.{trace.name}.{prop}"
                  project.dag().add_field_node(FieldNode(
                      id=prop_id,
                      type=FieldType.TRACE_PROPERTY,
                      expression=resolved.sql,
                      source_nodes=resolved.dependencies
                  ))

                  # Connect to dependencies
                  for dep in resolved.dependencies:
                      project.dag().add_field_edge(dep, prop_id)

      # Continue with normal execution
      return original_run(trace, project)

  Implementation Plan

  Phase 1: Foundation (Week 1-2)

  Objectives

  - Extend ProjectDag with field-level tracking
  - Implement smart introspection for required tables only
  - Create project-scoped schema caching

  Deliverables

  1. ExtendedProjectDag class with field graph (additive to existing DAG)
  2. SmartIntrospector with table extraction from SQL
  3. Project-scoped cache in output_dir/.visivo/schema_cache
  4. Unit tests for new components
  5. Backward compatibility tests ensuring existing projects work unchanged

  Phase 2: SQL Lineage Parsing (Week 3-4)

  Objectives

  - Parse model SQL to extract column lineage
  - Handle CTEs, JOINs, UNIONs, subqueries
  - Support all SQL dialects via SQLGlot

  Deliverables

  1. SqlLineageParser with comprehensive SQL support
  2. ModelLineage data structures
  3. Integration with compile phase (additive only)
  4. Tests for complex SQL patterns
  5. Validation that parsing failures don't break compilation

  Phase 3: Unified Resolution (Week 5-6)

  Objectives

  - Create single resolver for all expression types
  - Maintain backward compatibility with existing resolvers
  - Implement validation by expression type

  Deliverables

  1. UnifiedExpressionResolver class
  2. Adapter layer for legacy resolution methods
  3. Type-specific validation
  4. Performance benchmarks
  5. Tests confirming existing resolution still works

  Phase 4: Integration & UI (Week 7-8)

  Objectives

  - Integrate with existing compile/run phases
  - Create lineage visualization UI
  - Add CLI commands for lineage queries

  Deliverables

  1. Enhanced compile and run phases (fully backward compatible)
  2. Lineage visualization in web UI (new feature)
  3. CLI commands: visivo lineage, visivo impact (new commands)
  4. Documentation and examples
  5. End-to-end tests with existing projects

  Phase 5: Advanced Features (OUT OF SCOPE - Future Enhancement)

  These features are documented for future consideration but are not part of the initial implementation:

  Potential Future Objectives

  - Impact analysis tooling
  - Data governance features
  - Performance optimization using lineage

  Potential Future Deliverables

  1. Impact analysis API and UI
  2. PII tracking and reporting
  3. Query optimization using lineage
  4. Column usage analytics

  Technical Decisions

  1. Dual Graph Approach

  Decision: Maintain separate object-level and field-level graphs
  Rationale:
  - Ensures 100% backward compatibility
  - Allows different traversal algorithms
  - Cleaner separation of concerns
  - Existing object graph unchanged

  2. SQL Parsing with SQLGlot

  Decision: Use SQLGlot exclusively for SQL parsing
  Rationale:
  - Consistent with recent refactoring
  - Multi-dialect support
  - Robust AST manipulation

  3. Smart Introspection

  Decision: Only introspect tables referenced in SQL
  Rationale:
  - 80%+ reduction in introspection time
  - Lower memory footprint
  - Better user experience

  4. Project-Scoped Caching

  Decision: Store cache in project's output_dir/.visivo/schema_cache
  Rationale:
  - Cache isolation per project
  - Follows existing Visivo patterns
  - Easy cache management

  5. Unified Expression Resolution

  Decision: Single resolver for all expression types with backward compatibility
  Rationale:
  - Eliminates code duplication
  - Consistent resolution logic
  - Maintains compatibility through adapters

  Risk Analysis & Mitigation

  Risk 1: SQL Parsing Complexity

  Impact: High - Core functionality depends on accurate parsing
  Mitigation:
  - Start with common SQL patterns, expand gradually
  - Graceful degradation if parsing fails
  - Log warnings but don't break compilation

  Risk 2: Performance Degradation

  Impact: Medium - Could affect user experience
  Mitigation:
  - Comprehensive caching strategy
  - Lazy evaluation where possible
  - Performance benchmarks in CI/CD
  - Feature can be disabled via environment variable if needed

  Risk 3: Schema Changes

  Impact: Medium - Source schemas can change
  Mitigation:
  - Cache invalidation on schema change detection
  - Graceful degradation if schema unavailable
  - Manual cache clear command: visivo cache clear

  Risk 4: Complex SQL Patterns

  Impact: Low - Some SQL might not parse correctly although sqlglot is very robust and should handle most cases but we will need to test and verify.
  Mitigation:
  - Best-effort parsing
  - Clear documentation of supported patterns
  - Gradual improvement over time

  Success Metrics

  Performance

  - Source introspection: <5 seconds for 100 table warehouse (only inspecting 10 used tables)
  - Lineage query: <100ms for full upstream/downstream traversal
  - Resolution: <10ms per expression with caching

  Quality

  - 100% of parseable expressions have complete lineage
  - Zero false positives in impact analysis
  - All existing tests pass without modification
  - Zero breaking changes to existing projects

  User Experience

  - 90% reduction in debugging time for data issues
  - 50% reduction in time to create new metrics
  - Seamless upgrade path for existing projects

  Deployment Strategy

  Single PR Deployment

  - All changes in one comprehensive PR
  - Feature is immediately available to all users
  - No migration needed - fully backward compatible
  - Documentation updated simultaneously

  Testing Strategy

  1. Run full existing test suite - must pass unchanged
  2. Add new tests for lineage features
  3. Test with real-world projects from test-projects/
  4. Performance benchmarks before/after

  Rollback Plan

  - If issues discovered post-deployment:
    - Lineage features can be disabled via environment variable
    - Core functionality continues working
    - Hotfix deployed within hours

  Conclusion

  This column-level lineage system will transform Visivo into a comprehensive data platform that not only visualizes data but understands its complete journey from source to screen. By building on the existing ProjectDag infrastructure and leveraging SQLGlot for parsing, we can deliver
  this enhancement with zero breaking changes while providing massive value to users through impact analysis, governance, and optimization capabilities.

  The unified architecture simplifies the codebase, improves performance through smart introspection and project-scoped caching, and provides the foundation for future innovations in the semantic layer. Most importantly, this implementation is 100% backward compatible - existing projects
   continue to work exactly as before, with new lineage capabilities available as an additive enhancement.