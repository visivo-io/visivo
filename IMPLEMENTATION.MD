# Introducing a Metrics Layer in Visivo

## **Overview and Goals**

Visivo will add a **Metrics Layer (semantic layer)** to centralize business logic for key metrics and model relationships. This enables defining reusable, validated aggregate metrics in one place and reusing them across charts, similar to Looker’s semantic layer[\[1\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=Visivo%E2%80%99s%20semantic%20layer%20will%20introduce,design%20and%20steps%20to%20implement). Key goals include:

* **Reusable Metrics:** Define aggregate calculations (e.g. *Total Revenue*, *User Count*) once and reference them in multiple traces/charts for consistency and easier updates.

* **Cross-Model Analysis:** Support metrics that combine data from multiple models via explicit joins (no more hardcoding joins in each query).

* **Backwards Compatibility:** **Traces** (the current mechanism where queries/aggregations are inline with ?{ } syntax) will continue to work unchanged. The metrics layer is additive – existing Visivo projects remain valid[\[2\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=Backward%20compatibility%3A%20We%20will%20ensure,Users%20can%20gradually%20refactor). Users can gradually adopt metrics without breaking older dashboards.

* **Validation and Trust:** Use SQL parsing (via **SQLGlot**) to ensure metric formulas are valid aggregates (no missing GROUP BY) and joins are logically correct. Catch errors early with clear messages instead of silent wrong results.

* **UI Productivity:** Provide visual tools to manage metrics and model relations. A **Metrics Catalog** with a formula editor (Tableau-inspired “pill” interface) will let users build metrics with autocomplete and syntax checking. A **Relationships Editor** (using React Flow) will let users draw and configure joins between models graphically.

By introducing metrics as first-class objects and a join/relations layer, Visivo will make dashboard creation more semantic (focused on *what* to measure, not *how* to write SQL each time) and reduce duplication of logic across charts.

## **Key Features and Requirements**

### 1\. **Model-Scoped Metrics First, Extensible to Compositions and Joins**

We will initially enable **model-scoped metrics** – each metric belongs to a single model and its formula only references fields of that model. This establishes the foundation for more complex metrics. Future capabilities will build on this:

* **Metric-to-Metric Compositions:** Design metrics so that one metric can reference another by name in its expression (e.g. defining a *Conversion Rate* metric as signups\_metric / visits\_metric). We will avoid circular references and validate such dependencies. Compositions allow reuse of lower-level metrics in higher-level definitions, forming a dependency graph of metrics (which we’ll treat as an acyclic graph for safety).

* **Cross-Model Metrics via Joins:** Lay the groundwork for metrics that involve **multiple models**. These will rely on declared relationships (see point 3\) to join data. For example, a metric on the **Users** model might incorporate data from an **Orders** model (if a relation between users and orders is defined). Initially, we restrict metrics to one model, but the data model and query engine will be built to accommodate multi-model metrics as a next phase.

**Rationale:** By starting with one-model metrics, we simplify validation (each metric is essentially a single-table aggregate) and ensure stability. The schema and code will be structured so that adding metric references and cross-model logic later will not require a redesign – just extensions (e.g. allowing ${ref(other\_model).metric\_name} in expressions later, when relations exist). In short, **Phase 1 focuses on single-model metrics**, while **Phase 2 adds metric compositions and multi-model join support** (detailed in the Implementation Plan section).

### 2\. **Backward Compatibility with Traces (?{} Syntax)**

All current functionality using inline SQL via ?{ } in trace definitions will remain supported. The introduction of metrics will **not break or change** existing props.x, props.y, cohort\_on, or filter syntax inside traces[\[2\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=Backward%20compatibility%3A%20We%20will%20ensure,Users%20can%20gradually%20refactor). We will integrate metrics in a way that **traces can optionally leverage metrics**, but if a trace continues to use raw expressions, it will behave exactly as before. Key compatibility considerations:

* **Using Metrics in Traces:** Traces can be enhanced to reference metrics instead of raw SQL. For example, a trace’s y value could be a metric reference rather than a ?{ sum(column) }. We will likely support a new shorthand in YAML, such as:

* traces:  
    \- name: revenue\_trend  
      model: ${ref(orders)}  
      y: ${ref(total\_revenue)}  
      x: ?{ date\_trunc('month', order\_date) }

* In this example, total\_revenue is a metric defined on the orders model. The trace compiler will detect ${ref(total\_revenue)} and substitute the metric’s SQL expression (e.g. SUM(revenue)), automatically building a correct query. This is backwards-compatible: the ?{ } syntax is still supported, and the new ${ref(metric)} usage is optional and additive.

* **Inferring Trace Model from Metric:** If a trace directly references a metric, the system can infer the model from that metric. For model-scoped metrics, this is straightforward (each metric knows its parent model). This means we could allow traces to be defined by metric alone (with no model: field) – the trace would run on the metric’s model by default. If multiple models are involved (future cross-model metric), the trace would not have a single model, and we would rely on the metric’s internal join logic.

* **Default Y Value from Metric:** As a convenience, when a trace is built directly on a metric, we can use the metric’s value as the Y-axis by default. For instance, if a YAML trace object specifies metric: ${ref(total\_stages)} (instead of y:), the system knows this trace is plotting the *total\_stages* metric. In such cases, if the user omits an explicit props.y, Visivo can automatically set y \= metric\_value (the metric’s aggregated result)[\[3\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=backward%20compatibility%2C%20we%20could%20introduce,value%20as%20the%20y%20output). This reduces boilerplate for simple single-metric charts.

* **Mixing Old and New:** Users can mix raw ?{ } expressions and metric references in the same trace if needed. For example, props.marker.color could use a raw conditional expression even if x and y use metrics. The compiler will handle both by substituting metric references with their SQL and leaving other expressions untouched.

* **No Behavior Changes to Existing YAML:** If a project has no metrics defined, everything works exactly as before. Even if metrics are defined, traces that don’t reference them are unaffected. This ensures a smooth migration path – teams can introduce metrics gradually.

Overall, backward compatibility is ensured by making metric resolution an internal compile step that augments the query generation **without altering the ?{} query semantics** unless a metric reference is intentionally used. We will also maintain all existing test cases for trace queries to confirm that introducing metrics does not alter their results.

### 3\. **YAML Configuration Syntax for Metrics and Relationships**

Visivo’s project YAML will be extended to support **metrics definitions and model relationships**. The syntax will follow the pattern illustrated in the temp.yml example provided by the team. Key configuration changes:

* **Metrics in Models:** Each model can now include a metrics: section defining one or more metrics tied to that model. For example:

* models:  
    \- name: accounts    
      sql: SELECT id, created\_at, account\_name FROM accounts    
      metrics:  
        \- name: total\_accounts    
          aggregate: "COUNT(DISTINCT id)"    
        \- name: accounts\_past\_30\_days    
          aggregate: "COUNT(DISTINCT CASE    
                       WHEN created\_at \> dateadd('day', \-30, current\_date)    
                       THEN id ELSE NULL END)"  

* Here, **aggregate** contains an SQL expression (string) for the metric’s calculation[\[4\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=metrics%3A%20,). The expression must be an **aggregate**, meaning it uses aggregation functions like COUNT, SUM, AVG, etc., and does not reference any raw column outside such functions. We will use SQLGlot to parse and enforce this rule (discussed below). Each metric is uniquely named within the model. The metric implicitly “belongs” to this model – it can only use that model’s fields (or other metrics of that model, if we allow metric composition later). Model-scoped metrics might be thought of as model-specific measures.

* **Global Metrics:** In addition to model-specific metrics, a top-level metrics: section will allow defining **global metrics** that can draw from multiple models. For example:

* relations:  
    \- name: stage\_to\_account  
      join\_type: inner  
      condition: "${ref(accounts).id} \= ${ref(stages).account\_id}"  

  metrics:  
    \- name: stages\_per\_account    
      description: "Average number of stages per account"    
      expression: "${ref(stages).total\_stages} / ${ref(accounts).total\_accounts}"  

    \- name: days\_account\_open\_to\_stage\_creation    
      description: "Avg days from account creation to first stage creation"    
      expression: "AVG(DATEDIFF('day', ${ref(accounts).created\_at}, ${ref(stages).created\_at}))"  

* In this snippet, **stages\_per\_account** is a cross-model metric that references two model-scoped metrics: total\_stages from the stages model and total\_accounts from the accounts model[\[5\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=metrics%3A%20,ref%28stages%29.total_stages%7D%20%2F%20%24%7Bref%28accounts%29.total_accounts). The expression uses a ${ref(model).metric} syntax to pull in those definitions. Visivo will resolve these references by injecting the actual aggregate SQL from each metric. The second metric, days\_account\_open\_to\_stage\_creation, references fields from two models (accounts.created\_at and stages.created\_at), computing an overall average days difference[\[6\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=expression%3A%20). This requires joining the accounts and stages models using a defined relationship (here stage\_to\_account).

We will enforce that any cross-model field reference in a metric’s expression is qualified with a model ref (${ref(model\_name).field}) so it’s clear which model’s field is being used[\[7\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=match%20at%20L161%20globally%20and,For). If a metric references fields from multiple models, the compile process will require an appropriate relation (or chain of relations) to exist to join those models. In the above example, stage\_to\_account relation connects **accounts** and **stages**, so days\_account\_open\_to\_stage\_creation is valid. If a required relationship is missing, the metric can be defined in YAML (the project can still load), but any attempt to *use* that metric in a query will result in a run-time error with a clear message (e.g. “No relationship defined between users and accounts for metric users\_per\_account”)[\[8\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=,ref%28accounts%29.id). This encourages users to declare all needed joins in the relations section.

* **Relations (Declarative Joins):** We introduce a top-level relations: list in YAML to declare how models join to each other. Each relation includes:

* A **name** (unique identifier for the relationship).

* **left\_model** and **right\_model** (the two models being joined). In YAML, we’ll likely use a shorthand like above with ${ref(modelName)} or simply the model name. The order of left/right can define the default join direction if needed (especially for outer joins).

* **join\_type** specifying inner/left/right/full (default to inner if not provided).

* **condition** (or **conditions**) specifying the join key(s). This will typically be a SQL equality between a field of one model and a field of the other, e.g. "${ref(accounts).id} \= ${ref(stages).account\_id}"[\[9\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=relations%3A%20,is%20two%20dimensions%20before%20run). Multiple conditions can be an array of strings for composite keys.

* **is\_default**: optional true false flag that sets this relation as the default join between the two tables that are connected 

For example, from temp.yml:

relations:  
  \- name: stage-to-account-direct    
    join\_type: inner    
    condition: "${ref(accounts).id} \= ${ref(stages).account\_id}"  

This declares that **accounts** and **stages** models can be joined on accounts.id \= stages.account\_id (with an inner join)[\[9\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=relations%3A%20,is%20two%20dimensions%20before%20run). We will parse these conditions with SQLGlot to verify that the referenced fields (id in accounts, account\_id in stages) actually exist and are non-aggregated fields (dimensions). Only raw fields (or perhaps model *dimensions*, see below) can be used in join conditions – metrics or aggregates are not allowed in join definitions.

* **Dimensions (Derived Fields):** *(Note: A typo in the example shows dimentions – we assume it means* *dimensions.)* Models may also declare *derived dimensions* – computed fields that are not aggregates, for use in grouping or filtering. In temp.yml the **stages** model defines:

*     dimensions:  
        \- name: stage\_name\_length  
          expression: "LENGTH(stage\_name)"

* This is a computed column available on the stages model[\[10\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=stages%20dimentions%3A%20%23optionally%20define%20non,count%28distinct%20id). Such dimensions are essentially *computed fields at the row level*, as opposed to metrics which are aggregates. The YAML support for dimensions ensures that if users want to create a calculated field (like the length of a text, or a case expression that classifies a row) to group or filter by, they can do so in the model config rather than in every query. These are optional and for convenience; the system could inline the LENGTH(stage\_name) wherever needed, but having it as a named dimension allows reuse and documentation.

Dimensions will be automatically available as fields of the model (with their own stable name). We will treat them as part of the model’s schema during query building. For instance, SQLGlot can parse the model’s base SQL (or table schema) and we can append these computed dimension expressions so they can be used like any other column in metrics or filters.

**Model and Project Schema Changes:** We will introduce new Pydantic models for **Metric** and **Relation** and update the Project model:

* Project.metrics: a list of global Metric objects (may be empty).

* Model.metrics: a list of Metric objects defined within that model (optional).

* Project.relations: a list of Relation objects (may be empty).

Each **Metric** will have fields: name (unique within project), expression (for global metrics) or aggregate (for model metrics), an optional description, and a reference to its model(s). For model-scoped metrics, we store an implicit pointer to the parent Model (so the metric “knows” which model it belongs to). For global metrics, we might store a list of models involved (or derive it by scanning the expression for ${ref(model)...} usages). Optionally, a Metric might have a relation field if the user explicitly wants to specify which join to use (in cases of ambiguity – see join logic below).

Each **Relation** will have: name, left\_model, right\_model, join\_type, and conditions (with possibly multiple field pairs). We will enforce uniqueness of relation names and ideally uniqueness of the exact model pair (i.e., you shouldn’t define two different relations for the exact same two models unless they truly represent different join paths – if they do, they must have different names so they can be referenced specifically). Relations essentially form an undirected graph of model connections (though join\_type gives directionality when generating SQL).

With these YAML patterns, configuration files remain human-readable. Users can define metrics in-line with their models (for simplicity when metrics are naturally tied to one table) and define global metrics that span models (ensuring those have corresponding relations configured). **SQLGlot** will be integrated at parse time to validate these expressions: on project compilation, Visivo will parse each metric’s SQL to ensure it’s a single valid expression and check each relation’s condition to ensure it references valid fields. Any issues (like a typo in a field name in the join, or a metric expression with a naked column) will produce a clear error pointing to the problematic metric/relation.

### 4\. **Metrics & Relations Catalog in the UI (Full CRUD Support)**

We will extend the Visivo web UI to provide an intuitive **Metrics and Relationships Catalog**, allowing users to **Create, Read, Update, Delete (CRUD)** metrics and relations without editing YAML manually. The UI will have two main components:

* **Metrics Editor (Tableau-Inspired Pill Editor):** For building metric expressions visually.

* The Metrics Catalog page will list all metrics (both model-scoped and global) with their name, description, and formula. Metrics may be grouped by model for clarity (e.g. a section for “accounts metrics” vs “global metrics”).

* **Creating/Editing a Metric:** Opens a form or modal with fields: **Name**, **Description**, **Model** (or multiple models, for advanced metrics), and the **Expression Editor**. The expression editor will resemble Tableau’s calculated field builder:

  * It will provide a text area where the user types the SQL aggregate formula. As the user types, the editor will **autocomplete field names** and **existing metric names**. For example, typing ${ref( or even just a model name or metric name triggers suggestions. The editor is context-aware: if a model is selected, it suggests that model’s fields and metrics first.

  * **“Pills” for fields and metrics:** When the user selects a field or metric from autocomplete, it can be inserted as a colored label (pill) representing that object. For instance, choosing “orders.total\_revenue” could insert ${ref(orders).total\_revenue} but visually show it as a pill labeled *orders.total\_revenue*. This is similar to how Tableau shows fields in a calculation. These pills make it clear which parts of the formula are references to existing objects.

  * **SQL Functions Autocomplete:** Common SQL aggregate functions (SUM, COUNT, AVG, etc.) and SQLGlot-supported expressions should also autocomplete as the user types, to reduce errors.

  * **Validation Feedback:** As soon as the user stops typing or on demand (e.g. a “Validate” button), the backend (or an in-browser SQLGlot if available in JS) will parse the expression. Errors (like syntax errors or usage of a non-aggregate field) will be highlighted. For example, if the user types amount \* 0.5 instead of an aggregate, the editor might underline amount in red and show a tooltip: “Field ‘amount’ must be aggregated (metric expressions cannot contain raw columns)”. If the expression is valid, a green checkmark or similar indicator is shown. For global metrics we will need to validate that a relation exists between the models and that there is a single relation path. If there is no relation, users should be prompted to create one. If there are multiple relation paths, the users should be prompted to choose one for the metric. 

  * **Reference Helpers:** The UI can help insert references. We already support this functionality in the editor. For example, it might show a dropdown of available metrics to include, or if the user types a model name and ., it can list fields. This reduces the need to remember exact syntax like ${ref(model).field}. The editor could allow selecting a model from a dropdown and then picking a field, and it inserts the properly formatted reference.

  * Initially, the UI might **restrict creation to model-scoped metrics for simplicity**[\[11\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=match%20at%20L663%20UI%20might,validation%20in%20the%20backend%20and)[\[12\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=match%20at%20L677%20simplicity%2C%20the,support%20at%20least%20picking%20a). We will likely implement full support for cross-model metrics in the backend first, and then expose it carefully in the UI. In early UI versions, we can allow selecting only one model in the “Model” field for a metric. Advanced users can still create cross-model metrics via YAML or perhaps an “expert mode” toggle in the UI. Once we refine the UX for guiding multi-model metric creation (like helping pick relations), we will enable it fully.

* **Relations Editor (Visual Join Builder with React Flow):** For managing model relationships visually.

* This will be a dedicated section (or tab) in the Metrics/Relations Catalog. The interface will display a **graph of model nodes**. Each model is a box/node, showing the model’s name, and possibly key fields (like primary key or important dimensions). Nodes can be rendered using React Flow so that they are draggable.

* **Existing Relations Visualization:** If relations are already defined in YAML, the graph will display an arrow or line connecting the two model nodes for each relation. The line could be labeled with the relation name and join type (e.g. “inner join orders→users on orders.user\_id \= users.id”). Clicking on a relation line could show its details (join type, conditions) in a side panel or tooltip.

* **Creating a Relation:** The user can create new joins by dragging a line from one model to another. On drop, a dialog would prompt for the join details:

  * Pick **join type** (inner/left/right/full).

  * **Match fields:** The UI can list fields from each model and allow the user to select which pair of fields should be equal. For convenience, we can auto-suggest field matches (e.g. if both models have account\_id, preselect those). The user can add multiple field pairs if needed (for composite keys).

  * Provide a **name** for the relation, or auto-generate one (like ${leftModel}\_${rightModel}\_${field} if unique) which the user can edit.  
    After the user confirms, the new relation appears as a line connecting the two nodes. The relation is stored in the state (not saved to YAML until the user saves changes explicitly).

* **Validations:** The UI should prevent or warn about:

  * Creating duplicate relations using the same join columns between the same two models (if one already exists). It’s ok to have multiple relationships between two models. However, if a new relation is created between two models then we’d need to update all metrics that used the initial relation to choose the join path between those two models. 

  * Creating cycles: If connecting Model A to Model B would introduce a cycle that gets used in metrics in the join graph, the UI should warn that a cyclic joins was created on the relevant metrics and prompt the user to specify a combination of relations that are non-cycic. We should try to solve these by default and only prompt user resolution if ambiguity is created among the remaining non-cyclical paths (Visivo requires an acyclic relationship graph).

  * Mismatched field types: If possible, check that the data types of the two fields match or are compatible (e.g. joining an integer ID to a text field likely is an error). This could be done by looking at profile info (if Visivo knows types from source) or just left for the database to error out; a UI heads-up is nice-to-have.

  * Including more than two models in a relation condition should throw an error. If a user attempts to do that we should throw a good error message explaining that they need to set up multiple relations to connect metrics and dimensions across multiple models. 

* The React Flow view will allow panning/zooming to view large models. Users can click on a model node to see more details (like all fields, metrics on that model, etc., in a side panel). This could integrate with the Metrics Catalog: selecting a model might filter the metrics list to that model, for instance.

* The **Relations list/table:** In addition to the graph, we can also show a list of all relations (name, model A, model B, join type) for quick scanning or editing. Selecting an entry highlights it on the graph and vice-versa. Users can edit or delete a relation from either view. Deleting a relation will prompt confirmation (especially if metrics depend on it).

Both the Metrics and Relations editors will use the same underlying state management as other config editors (see NamedChild store integration below). Changes are applied in-memory so users can experiment freely; a **Save** button will commit the changes to the YAML file on the backend (triggering a recompile of the project). If the user navigates away with unsaved changes, we’ll prompt them to save or discard.

### 5\. **State Management & NamedChild Store Integration**

Visivo’s front-end uses Zustand stores to manage configuration objects (traces, charts, models, etc.) in memory while editing. We will incorporate Metrics and Relations into this system, likely following the existing “NamedChild” pattern used for config editing. Key points:

* **In-Memory Edit and Save:** Just like editing a trace or chart, adding/editing a metric or relation in the UI will update the front-end state but **will not immediately write to the YAML file**. The user must explicitly click “Save” (or a similar action) to persist changes. On save, the updated metrics and relations are merged into the project YAML. This ensures batch updates and avoids partial saves. It also aligns with the current hot-reload behavior: the backend will only recompute and reload the project when the user saves, preventing flicker or inconsistent state during editing.

* **NamedChild Pattern:** In Visivo’s architecture, many config entities are identified by unique name and can be referenced globally (using the ${ref(name)} syntax in YAML). Metrics and Relations will also be first-class named objects. We will extend the global project DAG (directed acyclic graph) to include metrics and relations as nodes, and their connections to models/traces as edges. Under the hood, we might implement metrics similar to how traces are implemented: e.g., a useMetricsStore and useRelationsStore (or integrate them into an existing ProjectStore) that holds arrays of metric and relation objects, keyed by name. Each Metric knows which model(s) it’s attached to (for model metrics, essentially a parent pointer; for global metrics, possibly a list or none). Each Relation knows the two model names it connects.

* **Editing Workflow:**

* To edit a metric, the UI might retrieve it from the MetricsStore by name, allow the user to modify its fields (name/expression/etc.), and then update the store state. Because other parts of the app (like the insight \[formerly trace\] builder) may depend on metric definitions, the store should trigger derived updates – e.g., if a metric’s expression is changed, any open insight (trace) using that metric could refresh (showing new data after recompile). In development (serve mode), Visivo’s hot-reload might detect YAML changes. Since we only write to YAML on save, live preview might not show metric changes until saved; we could consider a “Preview” compile on demand for metrics if needed, but initially we stick to explicit Save.

* Creating a new metric or relation via UI will similarly add an entry to the store (with a temporary unique ID or name). The UI will likely enforce entering a name immediately to avoid placeholder collisions. The NamedChild approach ensures each new metric is registered by name so it can be referenced (e.g., the moment you create “total\_sales”, it could appear in autocomplete for other metrics).

* Deleting a metric or relation will remove it from the store and mark the project as changed. The UI should check for any references before deletion: e.g., if a metric is in use by an insight/trace or another metric, warn the user. We might later add a dependency check for safe deletion.

* **Persisting to YAML:** On save, the front-end will send the updated metrics and relations to the backend. The backend (likely via an API endpoint or by regenerating the YAML text) will insert these under the appropriate sections (metrics: at top-level and per model, relations: at top-level). We need to ensure ordering is preserved or at least deterministic (to avoid unnecessary diff churn in version control). For example, we may list model-scoped metrics directly under their model in the YAML output, and global metrics in a dedicated section. The NamedChild stores should maintain enough info (like whether a metric is model-specific or global) to output it correctly.

* **Integration with Project Compile:** When metrics or relations are added, the compile logic on the backend will need to incorporate them. Likely, the compile phase (which currently reads YAML \-\> Pydantic \-\> JSON) will be updated to include metrics and relations in the generated project.json. The front-end’s state could also come from that JSON on initial load. In other words, when the app loads, the server provides the compiled project structure including metrics and relations, so the stores get populated. Then the UI edits the stores, and on save, we push changes (possibly directly writing YAML or via a high-level API like “addMetric”). For now, we can implement save by writing YAML, but longer-term an API could accept a Metric object and update the project model in memory.

By leveraging the existing architecture, we ensure metrics and relations behave like any other config element: they’re part of the project definition, live-editable in dev, with changes not persisting until saved (which triggers normal compile and reload). Developers will find this pattern familiar, reducing the learning curve for implementing these new features.

### 6\. **Out-of-Scope Features (for Future Research)**

To keep this initial implementation focused and achievable, several advanced features are **out of scope** for now. We explicitly note them here, along with prompts to guide future exploration when the time comes:

* **Metric Lineage Visualization (Metric Trees):** We will not initially provide a UI to visualize dependencies between metrics (i.e. a graph/tree of metric compositions). The system will manage dependencies internally (and prevent cycles), but a user-facing diagram or automatic “impact analysis” of metric changes is future work.  
  **Future Research Prompt:** *How might we implement a visualization of metric dependency trees, so users can see how metrics are composed of other metrics and understand the impact of changes?*

* **Default Time Windows for Metrics:** We won’t yet support defining a “default time filter” on metrics (e.g. a metric that by default is always last 30 days unless overridden). All filters will need to be specified in traces or insights explicitly.  
  **Future Research Prompt:** *What design approach could allow metrics to have default time windows (e.g. rolling 30 days) that can be applied consistently, yet overridden by charts or filters when needed?*

* **Goal/Target Lines on Charts:** While very useful for analytics (e.g. showing a target value or previous year’s value as a reference line), implementing goal lines is separate from the metrics layer. It involves chart rendering logic (likely adding a constant or second trace). This will be addressed later outside the initial metrics feature. It is also likely best served through `chart.layout.shapes` and `chart.layout.annotations` rather than through the metrics system. However being able to clearly define goals for insights is a concept that is worthy of design consideration.   
  **Future Research Prompt:** *How can we incorporate “goal lines” or target benchmarks in Visivo charts, possibly by linking metrics to target values or adding a specialized trace type?*

* **Filtering/Grouping by Joined-Model Attributes in Metrics:** The initial version will not fully support adding arbitrary filters or groupings on fields from related models as part of a metric definition. For example, a metric “Active Premium Users” that counts users filtered by an attribute in the accounts model (assuming user-\>account relation) is complex to handle generically. Similarly, grouping a metric by a related model’s dimension might require exposing that as part of an **explore** concept. Our first implementation will allow **insight-level** grouping by joined fields (as described in insight usage), but not bake that into metric definitions. In other words, metrics focus on aggregate values, not scoped subsets or pre-grouped values (those can be achieved by combining metrics with filters in a trace).  
  **Future Research Prompt:** *How can we extend the semantic layer to allow metrics that are pre-filtered or grouped by attributes from related models (for example, “Conversion Rate by Country” defined as a single object), without complicating the core metric definition?*

* **“Metric Trees” for Automated Drill-down or Sub-metrics:** (Related to metric lineage, but specifically automatically deriving breakdowns like time series or dimensional splits – sometimes tools have hierarchies of metrics for drill down.) This is not included in the initial scope; any drill-down will be handled by creating separate traces or using cohort/grouping on charts.  
  **Future Research Prompt:** *What features could enable defining metric hierarchies (e.g. metrics broken down by category or time) and allow one-click “drill down” into metric components within Visivo?*

*(The above are marked out-of-scope to ensure the first iteration remains focused on core functionality. The research prompts provide starting points for the team to tackle these enhancements later.)*

### 7\. **Performant & Correct Join Strategy**

Handling joins under the hood is critical for accuracy and speed when computing cross-model metrics. Our strategy is to use the **declared relations as an acyclic join graph** to resolve how to combine models, and to do so **at query compile time** with robust error handling for edge cases.

* **Join Graph (No Cycles):** The set of models and relations defined by the user will be treated as a graph, where models are nodes and relations are edges. We will enforce that this graph remains acyclic (no circular references). This can be validated on project compile using graph algorithms (Visivo already has a DAG validation for transformations; we can extend or reuse it for the model join graph)[\[13\]](https://github.com/visivo-io/visivo/blob/65f80739da9eae151e990b6d21751f8d904c80e9/visivo/models/base/project_dag.py#L23-L32)[\[14\]](https://github.com/visivo-io/visivo/blob/65f80739da9eae151e990b6d21751f8d904c80e9/visivo/models/base/project_dag.py#L78-L86). An acyclic graph means there is at most one distinct path between any two models, which simplifies join path resolution. If a user somehow configures a loop (e.g., A-\>B, B-\>C, C-\>A relations), we will throw a compile error and not allow deployment until the cycle is removed.

* **Join Path Resolution:** When a metric involves multiple models (or when a insight/trace uses fields from multiple models via metrics), the system must determine which joins to apply. We will implement a resolution algorithm roughly as follows:

* Identify all models needed for the query. For a given metric (or set of metrics on an insight \[trace\]), collect the unique models involved. For example, if a insight is plotting metric *X* (on model A) by a dimension from model B, we have two models A and B. Or if a metric expression references model C and D, those two are needed.

* Find a **join path** connecting all these models using the relations graph. If there is direct relation between A and B, use that. If not direct, find an intermediate model that links them (a path). Because the graph is acyclic, we can use a breadth-first search from one model to reach the others. If the set of models is more than two, we essentially need a spanning tree covering those models – which will exist if the relations graph is connected enough. For example, if models A, B, C are all needed, we might find A-\>B and B-\>C relations form a path connecting all three.

* **Ambiguity Check:** If there are multiple distinct paths connecting the models (which can happen if there are redundant relationships or multiple ways around a loop, though loops are prevented – so ambiguity is more likely in a case like two different relations between the same A and B for different keys), we will **raise an error** at compile time. For instance, if model A can join to B by user\_id or via an alternate route like A-\>C-\>B, we cannot guess the intended path. The error will explain: “Ambiguous join path between A and B; possible relations: \[list\]. Please specify the relation to use.” This nudges the user to either remove ambiguity or explicitly pick a relation.

  * In the future, we might allow disambiguation by specifying a relation name in the metric definition (e.g., a metric could carry relation: "orders\_to\_users\_by\_id" to force one path)[\[15\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=Require%20the%20metric%20definition%20to,users%20by%20different%20keys), or the UI might prompt the user to choose one when building the metric. But for Phase 1, we will keep it simple and just error out ambiguities[\[16\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=For%20phase%201%2C%20we%20can,the%20user%20to%20choose%20a). We expect most join setups to be straightforward (one relation per pair of models).

* With a clear join path determined (e.g., A join B on A.id=B.a\_id, and B join C on B.x=C.x), the query compiler will generate the appropriate SQL JOIN clauses linking the tables or subqueries for each model. We will use the join\_type specified: e.g., if the relation says left join, we issue LEFT JOIN … ON .... If multiple joins are needed, we will chain them in the order dictated by the path. The ordering can follow the sequence found by BFS, but we should also consider one join as the “primary” base. Typically, we’ll treat the first model in the path (often the one the trace or primary metric is attached to) as the driving table in the FROM clause, then join the others onto it. We must be careful with join type combinations (if mixing inner and outer joins, the order affects results). We might decide that if any outer join is needed, the leftmost model should be the one from which we want to preserve all rows (usually the fact table). This may require some design – possibly we default to inner joins in Phase 1 (simpler) and allow outer as specified without complex reordering logic unless needed.

* **Query Generation with Aggregates:** To maintain correctness, especially with **COUNT DISTINCT** and other aggregates, we will take care in how we join:

* If a metric references aggregates from multiple models (like the stages\_per\_account \= total\_stages / total\_accounts example), one approach is to compute each aggregate in a subquery and then join those subresults. For instance, get total\_stages (count distinct stage IDs) grouped by account (if needed) and total\_accounts (count distinct accounts) grouped by account, then divide. However, if the metric is a simple ratio of two global totals (with no grouping), we could compute each as a single value and then divide, or even combine in one query since they’re independent.

* For simplicity in initial implementation, we will likely generate a single SQL query that selects the needed aggregates with the appropriate joins and GROUP BY. For example, for *stages\_per\_account*, the query might look like:

* SELECT   
    COUNT(DISTINCT stages.id) / COUNT(DISTINCT accounts.id) as stages\_per\_account   
  FROM stages   
  INNER JOIN accounts ON accounts.id \= stages.account\_id;

* This works because the join between accounts and stages will duplicate account rows for each stage, but COUNT(DISTINCT accounts.id) will still count each account once (assuming accounts.id is unique in accounts). Similarly, COUNT(DISTINCT stages.id) gives total distinct stages. The division yields the desired ratio. We rely on the COUNT(DISTINCT ...) to avoid double counting. This is generally efficient if the underlying tables aren’t extremely large, but for performance, it might be better to compute separate sums and join them – we can monitor this.

* If grouping is involved (say, we want *stages\_per\_account by country*), then we’d group by the country field from accounts, and still count distinct in the joined set. That query would be:

* SELECT accounts.country,  
         COUNT(DISTINCT stages.id) / COUNT(DISTINCT accounts.id) as stages\_per\_account  
  FROM accounts   
  LEFT JOIN stages ON accounts.id \= stages.account\_id  
  GROUP BY accounts.country;

* Because of the left join, every account contributes to the denominator in its country group, and only accounts with stages contribute to the numerator – yielding average stages per account by country. We need to ensure the join type aligns with the metric’s intent (here presumably left join, since we want to include accounts with zero stages). The user’s relation definition (join\_type) guides this. In Phase 1, we might keep things simple and abide by the given join\_type. Later we might add smart handling (like defaulting to left join for ratios where one metric is a subset of the other).

* **Performance Considerations:** We will push down all joins and aggregations to the database engine by writing efficient SQL. The relations allow us to write **one SQL query** for a metric or insight rather than multiple round trips. We will be mindful of:

* **Reducing Data Early:** Only select fields needed. If a metric uses only aggregated counts, we won’t select all columns (which could cause unnecessary network load). We’ll use COUNT(DISTINCT ...) or other set-oriented ops.

* **Indexes:** We assume databases have indexes on join keys (like accounts.id). If performance issues arise, the user might need to ensure that (out of scope for our implementation, but documentation can mention it).

* **Testing on Large Data:** We will test the generated SQL for metrics on realistic volumes to ensure it executes reasonably. If we find that certain patterns (like joining very large tables to count distinct across both) are slow, we may document best practices (e.g. encourage materializing intermediate aggregated tables, or at least warn if a metric could be expensive).

* **Clear Error Messages:** When something goes wrong in join resolution, the system will provide actionable errors:

* If no path connects the required models: “No relation defined between users and accounts (or through other models) needed for metric X.” This tells the user to define the missing relationship.

* If multiple paths or relations exist: “Multiple join paths found for models A and B in metric Y: \[relation1\], \[relation2\]. Please specify a relation to use or remove ambiguity.”

* If a field used in a join condition is missing (caught at compile): “Invalid relation orders\_to\_users: field orders.user\_id not found.”

* If a metric expression passes validation but fails at runtime (rare, but e.g. division by zero): the error from the SQL engine will bubble up; we can wrap it to indicate which metric query failed.  
  These messages will appear during visivo compile or in the UI, helping users fix configuration issues quickly.

The join strategy ensures correctness by systematically using the user-declared relationships (no ad-hoc hidden join logic) and by validating the join graph upfront. By structuring the joins as a graph, we ensure an organized approach to multi-model queries, which is easier to reason about and debug than arbitrary SQL in each insight.

### 8\. **Validation and Testing Strategy**

Implementing a metrics layer touches many parts of the system (parsing, query generation, UI). A comprehensive testing plan is crucial:

* **Unit Tests (Backend):**

* *Metric Expression Validation:* Write tests for the function that uses SQLGlot to parse metric expressions. Supply various inputs and assert that:

  * Valid aggregate expressions pass (e.g. "SUM(amount)" or "COUNT(DISTINCT id)" are accepted).

  * Non-aggregate expressions fail (e.g. "amount \+ 5" should raise a validation error about amount not being aggregated[\[17\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=metric%20expression%20would%20require%20grouping,0.5%20or)). Also test mixed cases like "SUM(price) / COUNT(\*)" (valid) vs "SUM(price) \+ price" (invalid)[\[18\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=match%20at%20L134%20metric%20expression,0.5%20or).

  * Expressions referencing multiple models require model qualification. E.g. if a metric expression is "SUM(orders.amount) \+ SUM(payments.fee)" without using ${ref()}, our parser should reject it or at least not allow it in YAML. Only the ${ref(model).field} syntax or ${ref(model).metric} should be allowed for cross-model references to avoid confusion.

* *Join Condition Validation:* Test the SQLGlot parsing of relation conditions. Provide valid cases (matching field exists in both models) and invalid cases:

  * Field name typos (ensure it errors).

  * Use of aggregate or function in condition (e.g. LEFT(date) \= RIGHT(date) should be caught as not simple field comparisons if we restrict that).

  * Possibly test that both sides of condition refer to different models (if someone wrote ${ref(accounts).id} \= ${ref(accounts).other\_id}, it’s a self-join or nonsense; we should catch misuse).

* *Graph Ambiguity/Cycle:* Simulate small model graphs:

  * A-\>B, B-\>C, C-\>A (cycle) and ensure validate\_dag() catches it (if we reuse DAG code)[\[19\]](https://github.com/visivo-io/visivo/blob/65f80739da9eae151e990b6d21751f8d904c80e9/visivo/models/base/project_dag.py#L23-L31).

  * A-\>B, A-\>C, B-\>C (triangle, two paths between A and C) and ensure our join resolver flags ambiguity.

  * Single path scenarios succeed (A-\>B-\>C).

* *Query Generation:* Unit test the SQL compilation given metrics and relations. We can stub models as simple structures with known fields:

  * e.g. Model A(id, value), Model B(a\_id, amount). Relation A-B on id \= a\_id. Metric on A \= SUM(value), Metric on B \= SUM(amount). Then test a composite metric \= ${ref(B).metric} / ${ref(A).metric}. Verify the generated SQL string is correct (perhaps compare ignoring whitespace). Also verify if using direct fields (with join) yields expected SQL.

  * Test grouping: e.g. if trace has cohort\_on or an x field, ensure the query builder includes that in SELECT and GROUP BY.

  * If available, run the generated SQL on a small in-memory database (SQLite via SQLAlchemy, etc.) to ensure it runs and returns expected results given fixture data.

* *Backward Compatibility:* Ensure that if metrics are not used, traces compile exactly as before. We can use existing trace tests and ensure they still pass. Also add a test mixing metric and raw expression: e.g., define a metric, use it in trace.y, use a raw expression in trace.color, and verify the final SQL contains both the metric’s expanded SQL and the raw expression correctly.

* **Integration Tests:**  
  Using the Visivo CLI in a temp project context:

* Create a mini project YAML that includes a model, a relation, and a couple of metrics (some model-scoped, one global referencing them). Then run visivo compile and visivo run to see if:

  * The compiled project JSON includes metrics and relations in the expected structure.

  * The run phase produces correct data for an insight that uses those metrics. For example, define an insight that uses the global metric and see if the output data equals the manual SQL result.

* Test the UI through API endpoints if possible: The Flask app might have endpoints for metrics (depending on implementation). If not, possibly do a higher-level test by simulating a user adding a metric via an API call or directly manipulating the state and saving. This may be done with a headless browser test or a jest/Cypress test on the front-end (see UI tests below).

* Ensure that an intentionally bad configuration triggers the right errors:

  * e.g., define a metric with a naked field and run visivo compile, assert that it fails with the validation error.

  * define two metrics referencing each other (cycle) and expect a compile or run error describing the circular reference.

  * define a metric requiring a missing relation and ensure using it in a trace yields a runtime error advising to add a relation (or compile-time if we decide to check metric usage ahead).

* Integration test on a multi-source scenario (if applicable): ensure metrics still work if models are from different sources. If Visivo supports multi-DB joins (maybe via pandas or not?), we might not fully tackle cross-DB joins now, but at least ensure it doesn’t crash the system if someone tries (error saying cross-database join not supported if so).

* **UI/UX Tests:**  
  We will add tests for the new React components and overall user flow:

* *Component Unit Tests:* Using Jest/React Testing Library for:

  * MetricsEditor component: ensure that given some initial metric, it renders name/description, and the expression editor shows the formula. Simulate typing an invalid expression and assert an error state appears. Simulate selecting a suggestion (autocomplete) and assert the proper insertion. These tests ensure the pill editor logic and validation callbacks work.

  * RelationsEditor component: simulate dragging a connection or calling the handler that adds a relation and verify state updates. Or simpler, provide a sample relations list and ensure it displays properly (two model nodes connected).

* *End-to-End Tests:* Using Cypress (if set up) or manual testing scripts:

  * Create a metric via the UI: fill name, choose model, type expression (both valid and invalid scenarios). Click save and then verify (perhaps by reloading the page or checking compiled YAML via an API) that the metric was saved correctly.

  * Similarly, create a relation via UI: drag model A to B, set join fields, save; then verify a metric can be created that uses that relation (the metric editor might allow it once the relation exists).

  * Test editing: change a metric’s formula in the UI and save; ensure the rendered charts depending on it update (this might require a controlled test environment where we can query the data or check the chart’s JSON).

  * Deletion: try deleting a metric that is in use – the expected behavior might be a warning or prevention (which we might implement in a later iteration), but we should at least ensure no silent failures.

* *Visual Regression:* Since we’re adding significant UI, consider adding screenshots or storybook stories for these components to ensure UI consistency (optional).

* **Performance Testing:**  
  Although not a typical part of unit tests, we should test that adding a reasonable number of metrics and relations does not degrade the compile performance or UI performance:

  * Compile: Creating, say, 100 metrics and 50 relations and running compile should still be quick (seconds). We can simulate that by generating YAML with dummy metrics and measure compile time. SQLGlot parsing 100 expressions is trivial for modern CPUs.

  * UI: Loading the metrics catalog with 100 metrics – ensure the page remains responsive. React virtualization might be used if needed for very long lists.  
    We should note these as things to verify manually or with profiling, to ensure scalability of the feature.

Testing will be iterative alongside development. We will write tests for each new capability as it’s built (TDD where feasible), and ensure that the CI passes all existing tests to not regress on current features. The combination of unit tests for logic, integration tests for end-to-end usage, and UI tests for the front-end will give confidence that the metrics layer works correctly and reliably.

### 9\. **Phased Implementation Plan**

We propose rolling out this metrics layer in **three phases**, gradually increasing capabilities and user exposure:

#### ***Phase 1: Model-Scoped Metrics (Foundational Backend & Minimal UI)***

**Scope:** Implement basic metrics tied to a single model and allow using them in traces, with YAML support and backend query generation. Minimal or no UI changes exposed to end-users yet (perhaps a behind-the-scenes capability).

* **Data Model & Parsing:** Develop the Metric and Relation classes in Pydantic. Update YAML parsing (CoreParser) to recognize metrics: under models and at the top level, and relations: at top level. At this stage, *only allow metrics with a single model* (either defined in that model or a global metric that we ensure only references one model’s fields). If a global metric references multiple models, we can either error at compile or simply not officially support until Phase 2\. Relations can be parsed and stored but may not be fully utilized until cross-model metrics are enabled – still, we implement the structure now.

* **SQLGlot Integration:** Integrate SQLGlot for validating metric expressions. On project compile, for each metric:

* If aggregate: string is present (model metric), parse it to confirm it’s a valid aggregate query fragment (no SELECT needed, just expression). We’ll check that all identifiers correspond to actual fields of the model (since phase1 metrics only use their model) and that they appear inside aggregate functions. Use SQLGlot AST analysis for this rule[\[20\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=UI,Specifically%2C%20we%20will%20verify%20that).

* For relation conditions, parse to ensure proper syntax and field existence.  
  We’ll add errors or warnings accordingly. This gives immediate feedback to users writing YAML.

* **Query Engine – Single Model Metrics:** Modify the trace query compilation logic to handle metrics:

* When building a SELECT clause for a trace, if a props.x, props.y, or filter uses the special ref syntax to a metric (or even implicitly if we add something like trace.metric field), replace that with the metric’s expression. This could be done by resolving the metric in the Project model and injecting its aggregate SQL text in place. We must also ensure the FROM clause uses the metric’s model table, and include any necessary GROUP BY if the trace groups by something.

* Essentially, a trace using a single-model metric should compile to almost the same SQL as if the user had written the aggregate manually, except now it’s coming from a central definition. We confirm that results match.

* **Backward Compatibility Testing:** Run all existing unit tests (which likely cover typical traces) to confirm none break. At this point, because we’ve only added parsing and substitution, the risk of breakage is low. We may also hide metric usage behind a feature flag in the config if needed (e.g. semantic\_layer: true to enable), defaulting to off, to double-ensure no impact. But probably not necessary if non-use means no change.

* **Minimal UI (Phase 1):** We may keep metrics UI mostly hidden in this phase, focusing on backend. However, to allow early adopters to experiment:

* We could expose metrics in the Explorer/Inspector panel in the app (read-only list of metrics), or allow toggling an “experimental metrics” mode where the Metrics Catalog page is visible. This page in Phase 1 could be very basic (list metrics from YAML and their expressions). We likely won’t implement the full pill editor yet, but perhaps a simple JSON/YAML editor view as a stopgap. Alternatively, no UI at all and users add metrics via YAML in their code editor.

* No Insights yet as a new concept. However, we can allow traces to reference metrics as described. We’ll test this internally: for example, define a metric in YAML and modify a trace to use it, ensuring the chart renders.

**Deliverables of Phase 1:** \- Backend support for model metrics and relations (parsing & validation). \- Ability to reference model metrics in trace definitions (the query compiles correctly). \- All CLI commands (serve, compile, run, test) continue to work. Possibly documentation update to mark metrics as beta/coming soon. \- If feasible, a behind-the-scenes UI toggle for metrics (for testers) – but primary focus is backend completeness.

**Timing:** Phase 1 is the foundation and might be completed in one development cycle (e.g. 2-3 weeks) including writing tests and docs.

#### ***Phase 2: Global Metrics & Join Logic (Advanced Backend, Introduce Insights)***

**Scope:** Enable cross-model metrics and metric compositions. Implement the join resolution and allow insights to use metrics spanning multiple models. Also introduce the **Insight** concept to simplify interactivity in Visivo (part of a separated but related effort). Limited UI for creating these (perhaps still mostly YAML-driven in this phase, but backend fully supports it).

* **Global Metrics:** Remove (or relax) the restriction that metrics can only reference one model. Allow metric expression: to include multiple model refs and metric refs. Implement dependency resolution so that if Metric X references Metric Y, we ensure Y is evaluated to sql first before we build the sql statement for X. We could alternatively just evaluate each metric expression to sql independently and de-nest & evaluate all composite metrics for each metric. We might choose to inline metric references by default (text substitution of Y’s expression into X’s), since that’s simplest. We just need to be careful to parenthesize or otherwise maintain SQL correctness. Also, detect any metric reference cycles (e.g. X \-\> Y \-\> Z \-\> X) and throw an error on compile.

* **Join Path Resolution:** Implement the algorithm to find join paths between models. This involves using the relations graph built in Phase 1\. We likely integrate this into the query compiler:

* When compiling a metric that involves multiple models, or an “insight”/trace that has multiple model fields, call a function get\_join\_path(models\_list) which returns either a list of relations to join or an error. Use that to construct the FROM clause with JOINs.

* For Phase 2, if ambiguity arises, we error (no UI to resolve yet). Allow a metric definition to include a relation: hint if absolutely needed by advanced users.

* **Insight Object (Metric-based Trace):** Define a new YAML section or object called **Insight** (as seen in the example) to represent a purely metric-driven visualization. An *Insight* is conceptually similar to a Trace, but it might omit the explicit model and instead specify one or more metrics and optional grouping:  
  For example from temp.yml:

* insights:  
    \- name: stages-per-account-cut-by-account-creation-cohort  
        props: 

*         x: ?{ date\_trunc('month', ${ref(accounts).created\_at}) }  
          y: ${ref(total\_stages)}  
          type: scatter

* In this case, the insight uses the metric total\_stages (from stages model) and groups it by a field from accounts model (account creation month)[\[21\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=insights%3A%20,ref%28total_stages%29). Because it references two models, the system will automatically determine the join (accounts to stages) from relations. The *Insight* object frees the user from having to specify a model or write a full query; they just reference metrics and fields, and the engine handles the rest.  
  We will implement the Insight class in Pydantic and support it in compile/run:

  * Insights can have props similar to traces (type, mode, etc.), but instead of props.y: ?{ sum(...) } they typically have y: ${ref(metric)} or even allow multiple metrics (if we extend insight to show multiple lines? But likely one per insight). In charts, instead of traces: \[ref(trace1)\], we have insights: \[ref(insight1), ref(insight2)\][\[22\]](file://file-T8ujy5dpcGi2rNrrFoRJG3#:~:text=charts%3A%20,stage). Each insight reference would effectively produce one trace in the rendered chart, but using the semantic definitions.

  * For Phase 2, we can treat an Insight as essentially a sugar for a Trace that uses metrics. Internally, when compiling, each Insight could be converted into an equivalent Trace query. The difference is that insights might allow not specifying a model if metrics cover it, or specifying multiple metrics (perhaps to create a calculated series?). We will clarify: likely each insight is one metric \+ optional grouping (like y \= metric, x \= dimension, cohort \= another dimension). This covers most use cases of a single metric series. If a chart needs to show two metrics together, the user will define two insight objects and reference both in the chart (as in the example with combined-chart including two insights).

  * We ensure that charts can either use traces: or insights: but not mix in the same chart definition (for clarity). Charts using insights will know how to render them akin to traces.

* **Trace Enhancements:** For completeness, we also support metrics in normal traces (Phase 1 did that). By Phase 2, a trace could even use a global metric that has joins – in that case, the trace’s model might be left blank and we rely on the metric’s logic. We have to handle that scenario: if trace.model is not given but trace.metric is, we infer models from the metric. If trace.model is given but the metric involves a different model, we might override or error (most likely, you wouldn’t specify model if using a cross-model metric). Documentation will clarify how to use metrics in traces vs using insights. Possibly we steer users toward insights for multi-model metrics as it’s more straightforward.

* **UI in Phase 2:** We may start exposing the UI more:

  * The Metrics Catalog editor can be fully functional for single-model metrics by now. Possibly include a warning if they try to save a metric with multi-model expression (like “This is an advanced metric combining models; ensure relations exist”).

  * The Relations graph UI can be presented (since backend supports relations). Users can begin defining their model joins visually.

  * We might still hide the “Insight” concept in the UI – or possibly introduce it in the chart builder. An initial approach: in the chart editor, when adding a new trace, give an option to choose either a traditional trace (pick a model then fields) or choose a metric (pick from a list of metrics). If the user picks a metric, we essentially create an Insight behind the scenes. The UI would then ask for a grouping dimension if desired. For example, user selects metric “stages\_per\_account”; UI knows this metric involves accounts and stages. It can then show a dropdown of available grouping fields (the union of accounts+stages fields, likely just account fields since stage is aggregated). The user might pick “accounts.created\_at (month)” as X-axis. The UI then creates the insight YAML accordingly. This approach means we don’t force users to learn a new concept name (“insight”) – it’s just creating a trace based on a metric from their perspective.

  * However, to align with YAML structure, we will likely surface “Insight” as a named entity in the config editor portion. Possibly, the UI will have a section similar to traces for insights, or incorporate insights into the chart builder UI without calling them out explicitly. This detail can be refined in Phase 3 when we do full UI.

* **Testing Phase 2:** Expand tests to cover cross-model scenarios, ambiguous join errors, and ensure metrics referencing metrics produce correct results. Also test that if a metric is defined but missing a relation, the project still compiles (with maybe a warning) and only fails when trying to use that metric. We may choose to validate global metrics fully at compile time too, which would error out unknown join paths even if unused; a more lenient approach is to allow them and just error on use (the PDF notes we might let it load as long as not used[\[23\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=done%20eagerly%20on%20project%20load,isn%E2%80%99t%20used%2C%20it%20won%E2%80%99t%20error)). We will implement whichever provides a better UX (likely compile-time error so nothing is silently wrong).

**Deliverables of Phase 2:** \- Full backend support for multi-model metrics (with join resolution) and metric composition. \- Introduction of Insight abstraction in code and YAML, enabling simpler chart config for metrics. \- UI: Beta version of Metrics Catalog and Relations Editor (possibly behind a feature toggle). Chart builder updated to allow choosing metrics for traces (even if a bit basic). \- Documentation: Provide examples of using multi-model metrics and how to define relations. Update Visivo docs with a “Semantic Layer” section (explain metrics, relations, insight usage).

**Phase 2 Duration:** Another few weeks (2-4 weeks). Much of the heavy lifting (parsing, basic UI, etc.) is done in Phase 1; Phase 2 is about adding complexity (join logic) and more UI elements. We anticipate careful testing in this phase due to the complexity of cross-model querying.

#### ***Phase 3: Full UI Integration and Polish (Metrics & Relations GA)***

**Scope:** Complete the UI/UX for metrics and relations, make the feature generally available and user-friendly. This includes refining the Metrics Editor (with pill interface), fully enabling the Relations graph, and integrating metric usage seamlessly into the dashboard creation workflow. Also address any remaining gaps from earlier phases (like ambiguity resolution UI, etc.).

* **Metrics Catalog UI Completion:** Finish and refine the tableau-like editor:

* Ensure the autocomplete and pill insertion are smooth. Possibly integrate a library or custom code for SQL editing with highlighting.

* Add conveniences like being able to duplicate a metric, quickly filter the metrics list by model or search by name. This helps manage projects with many metrics.

* Implement the guardrails: e.g., if user tries to save a metric with an error (validation failed), the UI should prevent it and highlight the error.

* Support multi-model metric creation with guidance: If we feel confident, allow the user to select multiple models or at least mention in the UI that they can reference other model fields by using ${ref()}. We might even implement a small helper: if a metric expression includes another model’s field, the UI could show a dropdown “Join via relation:” listing possible relations to use, to preempt ambiguity. For example, if the user types ${ref(stages)....} in a metric on accounts, the UI knows a relation (if exists) between accounts and stages and could store that choice (this would set the relation field of Metric if we have one, or just assume the first relation).

* Internationalization / polish text, since this is user-facing (but presumably English is fine for now given docs).

* **Relations Editor UI Completion:**

* Polish the React Flow graph: better styling, maybe mini-map if many models, clear labels for join lines.

* Add the ability to edit existing relations by clicking a line: open a form to change join type or fields.

* Possibly allow naming the relations more flexibly (perhaps default names on creation and user can change in a properties panel).

* Ensure that deleting a model in YAML or removing a relation updates the graph (the graph view should update when the project is recompiled or when the state store changes).

* If time, implement a small validation in UI: highlight the relation line in red if the join fields types are mismatched or if relation is not used by any metric (maybe a hint that it’s unused, though not necessarily an error).

* Also, integrate this graph into the overall user onboarding—some users might prefer defining relationships here before creating metrics, so it should be approachable (maybe add a help tooltip “Use this to connect models for cross-model metrics.”).

* **Chart Builder Integration:**

* By now, the chart editing UI should fully embrace metrics. This means when adding a new trace/insight to a chart, the user can pick either:

  * **Data Model** (then pick fields as traditionally done), OR

  * **Metric** (then pick optional grouping fields).  
    Perhaps the UI starts with a choice: “Build trace from: (o) Model, (o) Metric”. If Metric is chosen, a dropdown of metrics appears (searchable if many). Once a metric is picked, the UI can auto-fill things:

  * Set the trace’s name to the metric name plus any grouping elements by default (user can override). We need names to be unique across the project so we should be careful to ensure that we are not duplicating names. 

  * Because the metric has an inherent aggregation, we set that as the Y value internally. The user then can choose an X value (typically a time or category) to group by. The UI would present available dimensions from the metric’s model(s). We’ll implement logic to fetch the list of fields: basically all non-aggregated fields from involved models that are reachable via the join. For multi-model metrics, as per design[\[24\]](file://file-GZbse5HsbwC43Dmq3vtYf2#:~:text=%E2%80%A2%20%E2%80%A2), we show the union of fields. We will identify which model each field comes from, perhaps by prefixing with model name or showing a tag (so the user knows e.g. “accounts.created\_at” vs “stages.created\_at”).

  * If a user picks a grouping field from a model that isn’t directly the metric’s base, that’s fine as long as the relation exists (which it does). The UI might enforce one grouping at a time for simplicity (multiple groupings is more advanced, but eventually should allow multi-dimension group-by just like multiple cohort layers – not in initial scope explicitly, but traces do support e.g. cohort\_on \+ x).

  * The UI should also allow filtering the metric on the chart (e.g. “only include accounts where region \= EMEA”). Filtering by a field from a related model should also be supported, given our engine can handle it by adding a WHERE on that field. We need to ensure UI has a way to pick filter on, say, accounts.country if the metric is stages\_per\_account. This might be handled by the existing filter UI but extended to metrics context. Possibly out-of-scope for initial, but something to note for polish.

* If the user chooses multiple metrics to overlay on a chart (e.g. two different metrics as two lines), the UI would just add two series (insights) one for each metric. The chart already supports multiple traces; with insights it's similar – each metric is one trace line. We should ensure the legend and labeling reflect the metric names nicely.

* Cohort (split by) functionality: In current traces, cohort\_on allows splitting a series by a dimension. We should support a similar concept for metric-based traces. For instance, an insight could have cohort\_on: accounts.plan\_type to plot separate lines for each plan type. The engine would then group by plan\_type and produce multiple series. We have to incorporate that in the query (group by plan\_type, select plan\_type in result, and let front-end separate series). In YAML, we may allow cohort\_on in insights the same way as in traces. The UI should expose it when a metric is chosen: a “Split by” field picker, limited to categorical fields from one of the models. We likely restrict to one cohort for now (like one additional dimension).

* **Edge cases UI**: If a metric involves multiple models and the join path has ambiguity, currently we error at compile. By Phase 3, we might use the UI to resolve it: the metric editor could have a dropdown “Relation:” if needed to pick which join to use. If not selected, saving the metric would error, prompting the user. Alternatively, we avoid this by requiring unique join paths as a best practice.

* **Documentation & Examples:** By end of Phase 3, update all official documentation to showcase the new semantic layer. Provide example projects (maybe in test-projects/ or docs) demonstrating: creating a metric, using it in a trace, combining metrics in one chart, etc. Possibly update the CLI init template to include a simple metric example. Also clearly mark any limitations (like those out-of-scope features) so users know what to expect.

* **Stabilization:** Phase 3 will involve bug fixing from Phase 2 feedback. For instance, if certain complex queries fail, we handle them, or optimize as needed. We aim for this phase to conclude with the Metrics Layer as a robust, user-friendly feature, ready for broad use.

**Deliverables of Phase 3:** \- Fully functional Metric and Relation management in the UI (no YAML editing needed for common tasks). \- Chart builder fully supports metric-based insights. \- Deprecation or reduction of ?{ } usage in tutorials in favor of metric references, to drive new users toward the semantic layer (though ?{ } remains for advanced one-off calcs). \- All test suites passing, including new tests for the UI flows. \- A polished documentation and possibly a blog post announcing the semantic layer capability.

**Phase 3 Duration:** Likely another 3-4 weeks, as it involves front-end complexity and user testing/feedback iteration.

---

By following this phased plan, the Visivo team can incrementally deliver the Metrics Layer: first laying the groundwork with backend support for metrics, then tackling the complexity of multi-model logic, and finally delivering the complete user experience. Each phase provides value (Phase 1 already allows cleaning up repeated aggregations within a model), and we mitigate risk by not exposing half-baked UI to users until the underlying mechanics are proven.

In summary, this PRD and technical design equips Visivo with a **metrics layer**: empowering users to define business metrics once with confidence, relate their data models declaratively, and build charts faster with drag-and-drop metrics. We’ve outlined how to implement it safely (with validation, testing, and phased rollout) and how to extend it in the future with even more powerful analytic features. Visivo’s engineering team can proceed with this blueprint to make the metrics layer a reality.

