from typing import Optional, List, Set
from pydantic import Field
from visivo.models.interaction import InsightInteraction
from visivo.models.models.sql_model import SqlModel
from visivo.models.props.insight_props import InsightProps
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel


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
        None, description="Client-side interactions that can be applied to the insight data."
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
                    for model_name in model_names:
                        ref_str = f"ref({model_name})"
                        if ref_str not in children:
                            children.append(ref_str)

        return children

    def get_all_dependent_models(self, dag) -> Set[SqlModel]:
        """Find all SQL models that are descendants of this insight in the DAG.

        Args:
            dag: The project DAG

        Returns:
            Set of SqlModel objects that are descendants of this insight
        """
        from visivo.models.dag import all_descendants_of_type

        models = all_descendants_of_type(type=SqlModel, dag=dag, from_node=self)
        return set(models)

    def is_dynamic(self, dag) -> bool:
        """Check if any descendants of this insight are Input items.

        An insight is considered dynamic if it has any Input descendants,
        meaning it can change based on user interaction.

        Args:
            dag: The project DAG

        Returns:
            True if this insight has Input descendants, False otherwise
        """
        from visivo.models.dag import all_descendants_of_type
        from visivo.models.inputs.input import Input

        input_descendants = all_descendants_of_type(type=Input, dag=dag, from_node=self)
        return len(input_descendants) > 0

    def get_interaction_references(self) -> Set[str]:
        """Get all model/dimension/metric names referenced in interactions.

        Extracts references from filter, split, and sort fields in all interactions.

        Returns:
            Set of referenced object names from interactions
        """
        from visivo.query.patterns import extract_ref_names

        referenced_names = set()

        if not self.interactions:
            return referenced_names

        # Extract references from each interaction's filter, split, and sort
        for interaction in self.interactions:
            for field_value in interaction.field_values.values():
                # Convert to string to extract references
                field_str = str(field_value)
                model_names = extract_ref_names(field_str)
                referenced_names.update(model_names)

        return referenced_names
