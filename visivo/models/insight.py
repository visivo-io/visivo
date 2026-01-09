from typing import Optional, List, Set
from pydantic import Field
from visivo.models.base.project_dag import ProjectDag
from visivo.models.interaction import InsightInteraction
from visivo.models.props.insight_props import InsightProps
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.sources.source import Source
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from visivo.query.insight.insight_query_info import InsightQueryInfo
from visivo.models.dag import all_descendants_of_type
from visivo.jobs.utils import get_source_for_model
from visivo.logger.logger import Logger


class Insight(NamedModel, ParentModel):
    """
    The **Insight** is the central visualization object in Visivo Interactivity 2.0.

    Insights replace **Traces**, providing a cleaner separation between
    **server-side data preparation** and **client-side interactivity**.
    Unlike traces, insights generate flat JSON structures that can be manipulated
    in the browser for responsive dashboards.

    ## Why Insights?
    * **Simpler Mental Model** – No more mixing cohort logic or trace naming rules
    * **Interactive by Default** – Client-side filtering, splitting, and sorting
    * **Reusable** – Insights can appear in multiple charts & tables
    * **Fast** – Pre-computed data cached server-side, interactions run locally

    ## Core Components
    - **model**: The SQL model or reference that defines the server-side dataset
    - **props**: Visualization config (chart type, axes, encodings)
    - **interactions**: Client-side transformations (filter, split, sort)

    ## Example
    ```yaml
    insights:
      - name: revenue-by-month
        description: "Monthly revenue trends"

        props:
          type: scatter
          mode: lines+markers
          x: ?{ date_trunc('month', created_at) }
          y: ?{ sum(amount) }

        interactions:
          - filter: ?{ month >= ${ref(date-range).start} }
          - split: ?{ region }
          - sort: ?{ month ASC }
    ```

    In the example above:
    - **Server-side**: Revenue is aggregated by month.
    - **Client-side**: A date-range filter and region split are applied instantly in the browser.

    ## Interactions
    Interactions define how users can manipulate data locally:
    - **Filter**: Subset rows by conditions (`WHERE` logic)
    - **Split**: Break a single insight into multiple series (replaces `cohort_on`)
    - **Sort**: Order data dynamically

    Example:
    ```yaml
    interactions:
      - filter: ?{ sales_amount > 1000 AND region = ${ref(sales-region).value} }
      - split: ?{ product_category }
      - sort: ?{ date DESC, amount ASC }
    ```

    ## Migration from Traces
    - `cohort_on` → `split` interaction
    """

    name: str = Field(description="The unique name of the insight across the entire project.")

    description: Optional[str] = Field(
        None, description="Optional description of what this insight represents."
    )

    props: InsightProps = Field(
        None,
        description="Visualization properties that define how the insight should be displayed.",
    )

    interactions: Optional[List[InsightInteraction]] = Field(
        None,
        description="Leverage Inputs to create client-side interactions that will be applied to the insight data.",
    )

    def child_items(self):
        """Return child items for DAG construction.

        Extracts model references from props and interactions using ${ref(model).field} syntax.
        """
        from visivo.query.patterns import extract_ref_names

        children = []

        # Extract all ${ref(model_name).field} references from props
        if self.props:
            props_str = str(self.props.model_dump())
            model_names = extract_ref_names(props_str)

            # Convert model names to ref() format for DAG
            for model_name in model_names:
                children.append(f"ref({model_name})")

        # Extract all ${ref(model_name).field} references from interactions
        if self.interactions:
            for interaction in self.interactions:
                for field_value in interaction.field_values.values():
                    field_str = str(field_value)
                    model_names = extract_ref_names(field_str)
                    # TODO: I think this will skip model scoped children and needs refactored
                    for model_name in model_names:
                        ref_str = f"ref({model_name})"
                        if ref_str not in children:
                            children.append(ref_str)

        return children

    def get_all_dependent_models(self, dag):
        """Get all dependent models (SqlModel, CsvScriptModel, LocalMergeModel, etc.)"""
        from visivo.models.models.model import Model

        models = all_descendants_of_type(type=Model, dag=dag, from_node=self)
        return set(models)

    def get_dependent_source(self, dag, output_dir) -> Source:
        """Currently an insight can only reference models from the same source"""
        # Get source through models (similar to how run_insight_job does it)
        models = self.get_all_dependent_models(dag)
        if not models:
            raise ValueError(f"Insight '{self.name}' has no dependent models")

        # Get source from the first model
        first_model = list(models)[0]
        source = get_source_for_model(first_model, dag, output_dir)
        if not source:
            raise ValueError(
                f"No source found for model '{first_model.name}' in insight '{self.name}'"
            )

        return source

    def _get_all_interaction_query_statements(self, dag):
        interactions = []
        if not self.interactions:
            return interactions
        for interaction in self.interactions:
            for field_type, field_value in interaction.field_values_with_js_template_literals(
                dag=dag
            ).items():
                interactions.append((field_type, field_value))
        return interactions

    def _convert_input_refs_to_js_templates(self, text: str, dag: ProjectDag) -> str:
        """Convert ${ref(input).accessor} to ${input.accessor}, leave model/metric/dimension refs intact.

        This method converts input references to JavaScript template literal syntax for
        client-side interpolation. Model, metric, and dimension references are left
        unchanged for the FieldResolver to handle.

        Transforms: ${ref(input_name).accessor} → ${input_name.accessor}

        Args:
            text: SQL expression that may contain ${ref(...)} patterns
            dag: Project DAG for looking up nodes

        Returns:
            SQL expression with input refs converted to JS template literals, model refs unchanged

        Examples:
            - "x > ${ref(threshold).value}" → "x > ${threshold.value}" (if threshold is an input)
            - "x > ${ref(model).field}" → "x > ${ref(model).field}" (model ref unchanged)
        """
        from visivo.models.inputs import Input
        from visivo.query.patterns import (
            CONTEXT_STRING_REF_PATTERN_COMPILED,
            get_model_name_from_match,
        )
        from re import Match

        def repl(m: Match) -> str:
            name = get_model_name_from_match(m)
            # Get property_path (accessor like .value, .min, .max, etc.)
            property_path = m.group("property_path") or ""
            try:
                node = dag.get_descendant_by_name(name)
                if isinstance(node, Input):
                    # Convert input ref to JS template literal syntax with accessor
                    # ${ref(threshold).value} → ${threshold.value}
                    return f"${{{name}{property_path}}}"
            except (ValueError, AttributeError):
                # Node not found or error - leave the ref as-is for FieldResolver
                pass
            return m.group(0)  # Keep non-input refs unchanged

        return CONTEXT_STRING_REF_PATTERN_COMPILED.sub(repl, text)

    def get_all_query_statements(self, dag):
        query_statements = []
        interaction_query_statements = self._get_all_interaction_query_statements(dag)
        query_statements += interaction_query_statements
        if self.props:
            props_statements = self.props.extract_query_strings()
            # Convert input refs to JS template literals in each props statement
            converted_props = []
            for key, value in props_statements:
                converted_value = self._convert_input_refs_to_js_templates(value, dag)
                converted_props.append((key, converted_value))
            query_statements += converted_props
        return query_statements

    def is_dynamic(self, dag) -> bool:
        from visivo.models.dag import all_descendants_of_type
        from visivo.models.inputs.input import Input

        input_descendants = all_descendants_of_type(type=Input, dag=dag, from_node=self)
        return len(input_descendants) > 0

    def get_query_info(self, dag: ProjectDag, output_dir) -> InsightQueryInfo:
        builder = InsightQueryBuilder(self, dag, output_dir)
        builder.resolve()
        return builder.build()
