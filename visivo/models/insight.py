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
from visivo.query.patterns import extract_ref_components


def _insight_ref_name(value) -> Optional[str]:
    """The ``<name>`` of a bare ``${ref(<name>)}`` (no property path, so not an
    input/model accessor like ``${ref(x).value}``); ``None`` for anything else."""
    if not isinstance(value, str):
        return None
    components = extract_ref_components(value)
    if len(components) != 1 or components[0][1] is not None:
        return None
    return components[0][0]


class Insight(NamedModel, ParentModel):
    """
    The **Insight** is the central visualization object in Visivo. Insights
    cleanly separate **server-side data preparation** from **client-side
    interactivity** and produce flat JSON structures the viewer can
    manipulate in the browser for responsive dashboards.

    ## Why Insights?
    * **Simple mental model** — declare what you want on the chart, with no
      ad-hoc cohort or naming rules.
    * **Interactive by default** — client-side filtering, splitting, and
      sorting run instantly.
    * **Reusable** — the same insight can appear in multiple charts and
      tables; the underlying query runs once.
    * **Fast** — pre-computed data is cached server-side, and interactions
      execute locally in the viewer.

    ## Core Components
    - **props**: Visualization config (chart type, axes, encodings) with
      `?{ ... }` slot bindings to model columns.
    - **interactions**: Client-side transformations (`filter`, `split`,
      `sort`) layered on the resolved data.

    ## Example
    ```yaml
    insights:
      - name: revenue-by-month
        description: "Monthly revenue trends"

        props:
          type: scatter
          mode: lines+markers
          x: ?{ date_trunc('month', ${ref(orders).created_at}) }
          y: ?{ sum(${ref(orders).amount}) }

        interactions:
          - filter: ?{ ${ref(orders).month} >= ${ref(date-range).start} }
          - split: ?{ ${ref(orders).region} }
          - sort: ?{ ${ref(orders).month} ASC }
    ```

    In the example above:
    - **Server-side**: revenue is aggregated by month.
    - **Client-side**: a date-range filter and region split are applied
      instantly in the browser.

    ## Interactions
    Interactions define how the viewer manipulates the data locally:
    - **filter**: Subset rows by a boolean expression.
    - **split**: Break a single insight into multiple plotly series, one
      per distinct value of the split expression.
    - **sort**: Order rows dynamically.
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
        """Get all models this insight depends on.

        Excludes models only reachable through Input nodes, since inputs resolve
        their model dependencies independently (for options/defaults). The insight
        query only needs the input's runtime value, not its source models.

        Likewise excludes models only reachable through a sibling Insight (a
        trace-id link such as ``carpet: ${ref(carpet-plot)}``): that edge orders
        the jobs, but the sibling's data is the sibling's own query.

        Models are treated as leaves — we do not recurse into their own
        dependencies. A model encapsulates its joins inside its own SQL, so an
        insight that references ``${ref(joined)}`` only needs ``joined`` itself,
        not the underlying tables it reads. Walking past the model would produce
        a bogus multi-model query that the relation graph can't join.
        """
        from visivo.models.models.model import Model
        from visivo.models.inputs.input import Input

        models = set()
        visited = set()
        queue = list(dag.successors(self))

        while queue:
            node = queue.pop()
            if node in visited:
                continue
            visited.add(node)

            if isinstance(node, (Input, Insight)):
                continue

            if isinstance(node, Model):
                models.add(node)
                continue

            for child in dag.successors(node):
                if child not in visited:
                    queue.append(child)

        return models

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

    def _convert_input_refs_in_obj(self, obj, dag: ProjectDag):
        """Apply :py:meth:`_convert_input_refs_to_js_templates` to every string
        inside a nested props structure (dicts / lists / primitives)."""
        if isinstance(obj, str):
            return self._convert_input_refs_to_js_templates(obj, dag)
        if isinstance(obj, dict):
            return {k: self._convert_input_refs_in_obj(v, dag) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._convert_input_refs_in_obj(item, dag) for item in obj]
        return obj

    def trace_id(self, prop: str) -> str:
        """The identifier another insight binds to through ``prop`` (e.g. the
        ``carpet`` id a contourcarpet lies on): this insight's own literal
        value for ``prop`` when set, otherwise its name."""
        if not self.props:
            return self.name
        if self._is_query_bound(prop):
            raise ValueError(
                f"Insight '{self.name}' binds '{prop}' to a query (?{{...}}), so a sibling "
                f"cannot reference it by ${{ref({self.name})}}; set '{prop}' to a literal id."
            )
        value = self.props.extract_static_props().get(prop)
        if isinstance(value, str) and _insight_ref_name(value) is None:
            return value
        return self.name

    def _is_query_bound(self, prop: str) -> bool:
        return any(path == f"props.{prop}" for path, _ in self.props.extract_query_strings())

    def resolve_insight_refs(self, static_props: dict, dag: ProjectDag) -> dict:
        """Resolve insight-to-insight bindings in this insight's static props.

        Two schema-driven rules (see ``InsightProps.insight_ref_props`` /
        ``trace_id_props``, both read from the generated trace schema):

        * a *link* prop holding ``${ref(<insight>)}`` is replaced with that
          insight's :py:meth:`trace_id`, so Plotly binds the traces by the id
          it understands (``carpet: ${ref(carpet-plot)}`` -> ``carpet:
          carpet-plot``);
        * this insight's own *identifier* prop defaults to its name when the
          author left it unset, so the id a sibling resolves to actually
          exists on the rendered trace.

        Raises ``ValueError`` when the ref names something that is not an
        insight in the project.
        """
        if not self.props:
            return static_props
        type_value = self.props.type.value
        resolved = dict(static_props)

        for prop in InsightProps.trace_id_props(type_value):
            if prop not in resolved and not self._is_query_bound(prop):
                resolved[prop] = self.name

        for prop in InsightProps.insight_ref_props(type_value):
            name = _insight_ref_name(resolved.get(prop))
            if name is None:
                continue
            context = f"Insight '{self.name}' sets '{prop}' to ${{ref({name})}}, but"
            try:
                node = dag.get_descendant_by_name(name)
            except ValueError as e:
                raise ValueError(
                    f"{context} no insight named '{name}' could be resolved: {e}"
                ) from e
            if not isinstance(node, Insight):
                raise ValueError(
                    f"{context} '{name}' is a {type(node).__name__}; "
                    f"'{prop}' must reference an insight."
                )
            target_type = node.props.type.value if node.props else None
            if target_type is None or prop not in InsightProps.trace_id_props(target_type):
                raise ValueError(
                    f"{context} '{prop}' must reference a '{prop}' insight "
                    f"(one whose trace owns that id); '{name}' is a {target_type or 'props-less'} insight."
                )
            resolved[prop] = node.trace_id(prop)

        return resolved

    def resolved_static_props(self, dag: ProjectDag) -> dict:
        """Static (non-``?{}``) props as the viewer receives them: input refs
        rewritten to ``${input.accessor}`` and insight refs resolved to trace
        ids (:py:meth:`resolve_insight_refs`)."""
        raw = self.props.extract_static_props() if self.props else {}
        return self.resolve_insight_refs(self._convert_input_refs_in_obj(raw, dag), dag)

    def is_static(self) -> bool:
        """True when nothing on this insight is bound to a query: no ``?{...}``
        prop and no interactions. Such an insight has no data job to run — its
        trace is rendered from its static props alone (e.g. an inlined image
        ``z`` grid or a reference line)."""
        if self.interactions or not self.props:
            return False
        return not self.props.extract_query_strings()

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

    def get_props_slices(self):
        """Return a mapping of prop paths to literal slice suffix (``"[0]"``,
        ``"[-1]"``, ``"[1:5]"`` etc.) for any prop whose ``?{...}`` value
        carries a slicing suffix. Used by the insight query builder to
        attach slice metadata to props_mapping so the viewer can apply the
        slice after binding query results."""
        if not self.props:
            return {}
        return self.props.extract_query_slices()

    def is_dynamic(self, dag) -> bool:
        from visivo.models.dag import all_descendants_of_type
        from visivo.models.inputs.input import Input

        input_descendants = all_descendants_of_type(type=Input, dag=dag, from_node=self)
        return len(input_descendants) > 0

    def get_query_info(
        self, dag: ProjectDag, output_dir, schema_overrides=None, force_dynamic=False
    ) -> InsightQueryInfo:
        """Resolve this insight's props/interactions into query text.

        Args:
            dag: Project DAG containing this insight's dependencies.
            output_dir: Run output dir schemas/queries are read from.
            schema_overrides: Optional ``{model_name: schema_dict}`` passed
                straight through to ``FieldResolver`` (see its docstring) —
                lets a caller resolving a never-run scratch model's raw-column
                refs supply columns learned some other way (client-side
                introspection) instead of hitting the normal
                ``schemas/<model>.json`` disk read. ``None`` (every
                real run-pipeline caller) is unaffected.
            force_dynamic: Build the DuckDB/model-hash-qualified `post_query`
                form regardless of whether this insight actually depends on
                an Input (the Explore 2.0 compile-draft endpoint's need —
                see `InsightQueryBuilder`'s docstring for why). ``False``
                (every real run-pipeline caller) is unaffected.
        """
        builder = InsightQueryBuilder(
            self, dag, output_dir, schema_overrides=schema_overrides, force_dynamic=force_dynamic
        )
        builder.resolve()
        return builder.build()
