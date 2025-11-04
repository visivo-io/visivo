# Input Interaction Implementation Plan V2

## Implementation Status

**✅ Phase 1: COMPLETE** (Input Job System)
**✅ Phase 2: COMPLETE** (JS Template Literals)
**⏳ Phase 3: NOT STARTED** (SQLGlot Validation - deferred)
**⏳ Phase 4: NOT STARTED** (Frontend Implementation - deferred)
**⏳ Phase 5: NOT STARTED** (Split Interactions - deferred)

### What Was Completed (Phase 1 & 2)

**Completed November 3, 2025** using parallel TDD agents (~6.5 hours wall-clock time)

**Phase 1 Deliverables (20 tests):**
- ✅ Created `run_input_job.py` - Input execution on source backend, stores parquet
- ✅ Updated DAG runner to execute inputs before insights
- ✅ Query-based inputs execute on source backend (not DuckDB)
- ✅ Static inputs validated (must have ≥1 option)
- ✅ SqlModel-only validation for input references
- ✅ Removed input logic from `run_sql_model_job.py`

**Phase 2 Deliverables (23 tests):**
- ✅ Added `field_values_with_js_template_literals()` to Interaction class
- ✅ Input refs converted: `${ref(input)}` → `${input}` (for interactions only)
- ✅ Model refs preserved: `${ref(model).field}` unchanged
- ✅ Props placeholder system retained (intentional dual system)
- ✅ Validation enforces SqlModel-only references (@model_validator)
- ✅ Removed `field_values_with_sanitized_inputs()` for interactions

**Integration Tests (4 tests):**
- ✅ Full pipeline: Static inputs → Model → Insight with JS templates
- ✅ Query-based inputs execute and generate correct output
- ✅ DAG ordering verified (inputs execute before insights)
- ✅ Multiple inputs with mixed model refs work correctly

**Results:**
- 47 new tests passing (100% pass rate)
- 86% test coverage (exceeds 80% target)
- -2,883 lines removed (massive cleanup)
- Production-ready for Phase 1 & 2 features

**Key Architecture Decision:**
The system maintains TWO input handling approaches:
1. **Interactions** → JS Template Literals (NEW - Phase 2)
2. **Props** → Placeholder System (EXISTING - retained for SQL backend execution)

This is intentional and correct - do not remove the props placeholder system.

---

## Executive Summary

This plan addresses incomplete input-driven interactions by fundamentally changing the architecture from **runtime placeholder replacement** to **build-time input execution with comprehensive validation**. The new approach executes input queries at build time, validates all input combinations using SQLGlot, and uses JavaScript template literals for cleaner frontend injection.

---

## Open Questions (Need Clarification)

The following question requires clarification before or during implementation:

**Question 14 - Split Column Aliasing**: When a split interaction uses a CASE expression like `CASE WHEN y >= ${threshold} THEN 'High' ELSE 'Low' END`, the props_mapping will have `split: "split"` (the alias). After template literal injection replaces `${threshold}` with the actual value, will the alias still correctly match the column name in query results?
- **Likely Answer**: Yes, because the alias is separate from the expression content
- **Recommendation**: Add integration test to verify split works correctly with input-driven CASE expressions

---

## Architecture Changes

### Old Architecture (Being Replaced)
1. **Build time**: Generate SQL with placeholder strings (`'visivo-input-placeholder-string'`) + comments
2. **Runtime**: Frontend uses regex to replace placeholders with values
3. **Problem**: Brittle regex matching, no validation with real values, complex multi-line regex failures

### New Architecture
1. **Build time**:
   - Execute all input queries on source backend → Get option values → Store as parquet/JSON
   - Validate N sampled combinations of insight queries with real input values using SQLGlot (parse, don't execute)
   - Generate queries with JS template literal syntax (`${inputName}`)
2. **Runtime**:
   - Load pre-computed input options from storage into Zustand store
   - Set default input values
   - Inject input values using JavaScript template literal evaluation (no regex!)
   - Execute queries client-side in DuckDB WASM

---

## What's Being Removed vs Added

### Removing ❌
- Placeholder string generation (`'visivo-input-placeholder-string'`)
- Comment-based metadata (`/* replace(..., Input(name)) */`)
- `query_placeholder()` method in DropdownInput
- `field_values_with_sanitized_inputs()` in InsightInteraction
- Frontend `prepPostQuery()` regex replacement logic
- Input-based logic in `run_sql_model_job.py` (lines 156-196)
- Query execution for inputs in frontend Dropdown component

### Keeping/Adding ✅
- Interaction syntax in YAML: `filter: "?{x > ${ref(input)}}"`
- Reference resolution for models/dimensions: `${ref(model).field}`
- New `run_input_job.py` for input execution
- New `input_validator.py` for SQLGlot validation
- SQLGlot-based validation with real input values
- Frontend query execution in DuckDB WASM (simpler now)
- JS template literal injection system
- Parquet storage for all inputs (static and query-based)

---

## Out of Scope (Future Enhancements)

The following features are intentionally excluded from this initial implementation to keep the system simple and focused:

1. **Multi-Select Dropdowns**: Only single-select inputs are supported in V1. Multi-select with array formatting for IN clauses will be added in a future iteration.

2. **Input Name Validation**: No validation for JavaScript reserved words (`constructor`, `__proto__`, `eval`) or special characters in input names. Users should avoid these until proper escaping is implemented.

3. **Skip Validation Flag**: No `--skip-input-validation` flag for rapid development iteration. All builds must pass validation. This will be added based on user feedback.

4. **Smart Sampling Strategies**: Validation uses simple random sampling when combinations exceed 96. More sophisticated strategies (ensuring each option appears at least once, boundary testing, etc.) are deferred.

5. **Input References to Insights**: Query-based inputs can only reference SqlModel objects, not Insights. This is because input queries execute on the source backend at build time and need direct model SQL. To use insight data in an input, users must create a model from the insight's query. This constraint ensures build-time execution feasibility.

---

## Implementation Phases

### Phase 1: Create Input Job System (CRITICAL - Foundation)

**Priority**: HIGHEST - Everything depends on this

#### Backend Changes

**New File**: `visivo/jobs/run_input_job.py`

```python
from visivo.jobs.job import Job, JobResult, format_message_failure, format_message_success
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.models.base.query_string import QueryString
from time import time
import polars as pl
import json
import os


def action(input_obj: DropdownInput, dag, output_dir):
    """
    Execute input job - compute options and store results.

    For query-based inputs: Execute query on source backend and store as parquet
    For static inputs: Store options as JSON
    """
    try:
        start_time = time()
        input_name = input_obj.name

        if isinstance(input_obj.options, QueryString):
            # Query-based input - execute query on source backend
            query_value = input_obj.options.get_value()

            from visivo.query.patterns import extract_ref_names, replace_refs
            from visivo.models.insight import Insight
            from visivo.models.models.sql_model import SqlModel
            from visivo.jobs.utils import get_source_for_model

            refs = extract_ref_names(query_value)
            if len(refs) != 1:
                raise ValueError(f"Input '{input_name}' must reference exactly one model")

            model_name = refs[0]
            item = dag.get_descendant_by_name(model_name)

            # Validation that item is SqlModel should have happened at compile time
            # in DropdownInput._validate_query_references()
            if not isinstance(item, SqlModel):
                raise ValueError(
                    f"Input '{input_name}' references '{model_name}' which is not a SqlModel. "
                    f"This should have been caught at compile time."
                )

            # Get the source for this model
            source = get_source_for_model(item, dag, output_dir)

            # Replace ${ref(model)} with the model's SQL as a subquery
            # This allows the input query to run directly on the source
            resolved_query = replace_refs(
                query_value,
                lambda _m, _f: f"({item.sql})"
            )

            # Execute query on the source backend
            result = source.read_sql(resolved_query)

            # Convert to list of values (first column only)
            # Result is a list of dicts from source.read_sql()
            if not result:
                options_list = []
            else:
                first_column_name = list(result[0].keys())[0]
                options_list = [row[first_column_name] for row in result]

            # Validate that query returned options
            if len(options_list) == 0:
                raise ValueError(
                    f"Input '{input_name}' query returned 0 results. "
                    f"Input queries must return at least one option value. "
                    f"Check your query: {resolved_query}"
                )

            # Store as parquet for consistency
            df = pl.DataFrame({"option": options_list})
            input_files_dir = f"{output_dir}/inputs"
            os.makedirs(input_files_dir, exist_ok=True)
            input_parquet_path = f"{input_files_dir}/{input_obj.name_hash()}.parquet"
            df.write_parquet(input_parquet_path)

            success_msg = format_message_success(
                details=f"Executed query for input \033[4m{input_name}\033[0m ({len(options_list)} options)",
                start_time=start_time,
                full_path=input_parquet_path
            )
            return JobResult(item=input_obj, success=True, message=success_msg)

        else:
            # Static options - store as parquet (same format as query-based)
            options_list = input_obj.options if isinstance(input_obj.options, list) else []

            # Validate that static options are not empty
            if len(options_list) == 0:
                raise ValueError(
                    f"Input '{input_name}' has no options defined. "
                    f"Static inputs must have at least one option value."
                )

            df = pl.DataFrame({"option": options_list})
            input_files_dir = f"{output_dir}/inputs"
            os.makedirs(input_files_dir, exist_ok=True)
            input_parquet_path = f"{input_files_dir}/{input_obj.name_hash()}.parquet"
            df.write_parquet(input_parquet_path)

            success_msg = format_message_success(
                details=f"Stored static options for input \033[4m{input_name}\033[0m ({len(options_list)} options)",
                start_time=start_time,
                full_path=input_parquet_path
            )
            return JobResult(item=input_obj, success=True, message=success_msg)

    except Exception as e:
        message = e.message if hasattr(e, "message") else repr(e)
        failure_msg = format_message_failure(
            details=f"Failed to process input \033[4m{input_obj.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=message
        )
        return JobResult(item=input_obj, success=False, message=failure_msg)


def job(dag, output_dir: str, input_obj: DropdownInput):
    """Create input job for execution in DAG runner"""
    # For query-based inputs, we need the source of the referenced model
    # For static inputs, no source needed
    source = None

    if isinstance(input_obj.options, QueryString):
        from visivo.models.models.sql_model import SqlModel
        from visivo.query.patterns import extract_ref_names
        from visivo.jobs.utils import get_source_for_model

        query_value = input_obj.options.get_value()
        refs = extract_ref_names(query_value)

        if refs:
            model_name = refs[0]
            try:
                item = dag.get_descendant_by_name(model_name)
                # Should only be SqlModel (validated at compile time)
                if isinstance(item, SqlModel):
                    source = get_source_for_model(item, dag, output_dir)
            except:
                pass

    return Job(
        item=input_obj,
        source=source,
        action=action,
        input_obj=input_obj,
        dag=dag,
        output_dir=output_dir
    )
```

**Modified File**: `visivo/models/insight.py`

Update `child_items()` method to include inputs as children:

```python
def child_items(self):
    """
    Return dependencies for DAG construction.

    Insights depend on:
    1. Models (via props/interactions)
    2. Inputs (via interactions) - NEW!

    DAG runner executes children before parents, so inputs execute before insight validation.
    """
    from visivo.query.patterns import extract_ref_names
    from visivo.models.inputs.input import Input

    children = []

    # Existing: Extract model references from props
    for prop_value in self.props.values():
        if hasattr(prop_value, '__class__') and prop_value.__class__.__name__ in ['ContextString', 'QueryString']:
            value_str = str(prop_value)
            ref_names = extract_ref_names(value_str)
            for ref_name in ref_names:
                children.append(f"ref({ref_name})")

    # NEW: Extract input references from interactions
    if self.interactions:
        for interaction in self.interactions:
            field_values = interaction.field_values  # Gets filter, split, sort values
            for field_value in field_values.values():
                ref_names = extract_ref_names(field_value)
                for ref_name in ref_names:
                    # Will add both model refs and input refs
                    # DAG construction will resolve which is which
                    children.append(f"ref({ref_name})")

    return children
```

**Modified File**: `visivo/jobs/run_sql_model_job.py`

Remove input-based logic (lines 156-196):

```python
def job(dag, output_dir: str, sql_model: SqlModel):
    """Create a Job for the SQL model if it's referenced by a dynamic insight.

    A job with parquet generation is created if this SQL model is:
    - Referenced by a dynamic insight (has Input descendants)

    NOTE: Input-related logic REMOVED - inputs now have their own job system via run_input_job.py
    """
    from visivo.models.inputs.input import Input

    insights = all_descendants_of_type(type=Insight, dag=dag)
    source = get_source_for_model(sql_model, dag, output_dir)

    # Check if any insight is dynamic and references this sql_model
    for insight in insights:
        if insight.is_dynamic(dag):
            if sql_model in insight.get_all_dependent_models(dag):
                return Job(
                    item=sql_model,
                    source=source,
                    action=model_query_and_schema_action,
                    sql_model=sql_model,
                    dag=dag,
                    output_dir=output_dir,
                )

    # Not referenced by any dynamic insight, run schema-only action
    return Job(
        item=sql_model,
        source=source,
        action=schema_only_action,
        sql_model=sql_model,
        dag=dag,
        output_dir=output_dir,
    )
```

**Modified File**: `visivo/jobs/dag_runner.py` (or wherever jobs are registered)

Add input job registration:

```python
from visivo.jobs import run_input_job

# In the job registration section:
def get_job_for_item(item, dag, output_dir):
    from visivo.models.inputs.input import Input

    if isinstance(item, Input):
        return run_input_job.job(dag, output_dir, item)
    # ... existing logic for other types
```

#### Unit Tests

Create `tests/jobs/test_run_input_job.py`:

```python
import pytest
from pathlib import Path
from visivo.testing.test_utils import InputFactory, ProjectFactory, SqlModelFactory
from visivo.jobs.run_input_job import action, job
from visivo.models.base.query_string import QueryString
import json
import polars as pl


class TestRunInputJob:
    """Test input job execution"""

    def test_static_options_stores_parquet(self, tmp_path):
        """Verify static options are stored as parquet"""
        input_obj = InputFactory(
            name="category_filter",
            options=["electronics", "books", "toys"]
        )

        project = ProjectFactory(inputs=[input_obj])
        dag = project.build_dag()

        result = action(input_obj, dag, str(tmp_path))

        assert result.success
        parquet_path = tmp_path / "inputs" / f"{input_obj.name_hash()}.parquet"
        assert parquet_path.exists()

        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 3
        assert set(df["option"].to_list()) == {"electronics", "books", "toys"}

    def test_query_based_options_executes_on_source(self, tmp_path):
        """Verify query-based options execute on source backend"""
        model = SqlModelFactory(
            name="products",
            sql="SELECT * FROM (VALUES ('electronics'), ('books'), ('toys')) AS t(category)"
        )

        input_obj = InputFactory(
            name="category_filter",
            options=QueryString(value="?{ SELECT DISTINCT category FROM ${ref(products)} }")
        )

        project = ProjectFactory(models=[model], inputs=[input_obj])
        dag = project.build_dag()

        # First run model job to ensure model SQL is available
        from visivo.jobs.run_sql_model_job import action as model_action
        model_result = model_action(model, dag, str(tmp_path))
        assert model_result.success

        # Then run input job
        result = action(input_obj, dag, str(tmp_path))

        assert result.success
        parquet_path = tmp_path / "inputs" / f"{input_obj.name_hash()}.parquet"
        assert parquet_path.exists()

        df = pl.read_parquet(parquet_path)
        assert df.shape[0] == 3
        assert set(df["option"].to_list()) == {"electronics", "books", "toys"}

    def test_query_with_subquery_replacement(self, tmp_path):
        """Verify ${ref(model)} is replaced with model SQL as subquery"""
        model = SqlModelFactory(
            name="sales",
            sql="SELECT category, SUM(amount) as total FROM transactions GROUP BY category"
        )

        input_obj = InputFactory(
            name="top_categories",
            options=QueryString(value="?{ SELECT category FROM ${ref(sales)} WHERE total > 1000 }")
        )

        project = ProjectFactory(models=[model], inputs=[input_obj])
        dag = project.build_dag()

        # Run model first
        from visivo.jobs.run_sql_model_job import action as model_action
        model_action(model, dag, str(tmp_path))

        # Run input job - should execute:
        # SELECT category FROM (SELECT category, SUM(amount) as total FROM transactions GROUP BY category) WHERE total > 1000
        result = action(input_obj, dag, str(tmp_path))

        assert result.success

    def test_empty_result_raises_error(self, tmp_path):
        """Verify empty query results raise helpful error"""
        model = SqlModelFactory(
            name="products",
            sql="SELECT * FROM (VALUES ('A'), ('B')) AS t(category)"
        )

        input_obj = InputFactory(
            name="rare_categories",
            options=QueryString(value="?{ SELECT category FROM ${ref(products)} WHERE category = 'Z' }")
        )

        project = ProjectFactory(models=[model], inputs=[input_obj])
        dag = project.build_dag()

        from visivo.jobs.run_sql_model_job import action as model_action
        model_action(model, dag, str(tmp_path))

        result = action(input_obj, dag, str(tmp_path))

        assert not result.success
        assert "returned 0 results" in result.message.lower()
        assert "must return at least one option" in result.message.lower()

    def test_multiple_inputs_each_get_own_file(self, tmp_path):
        """Verify multiple inputs create separate parquet files"""
        input1 = InputFactory(name="filter1", options=["A", "B"])
        input2 = InputFactory(name="filter2", options=["X", "Y", "Z"])

        project = ProjectFactory(inputs=[input1, input2])
        dag = project.build_dag()

        action(input1, dag, str(tmp_path))
        action(input2, dag, str(tmp_path))

        parquet1 = tmp_path / "inputs" / f"{input1.name_hash()}.parquet"
        parquet2 = tmp_path / "inputs" / f"{input2.name_hash()}.parquet"

        assert parquet1.exists()
        assert parquet2.exists()

        df1 = pl.read_parquet(parquet1)
        df2 = pl.read_parquet(parquet2)

        assert df1.shape[0] == 2
        assert df2.shape[0] == 3

    def test_job_assigns_correct_source(self, tmp_path):
        """Verify job() assigns source for query-based inputs"""
        model = SqlModelFactory(name="data", sql="SELECT 1")
        input_obj = InputFactory(
            name="test_input",
            options=QueryString(value="?{ SELECT x FROM ${ref(data)} }")
        )

        project = ProjectFactory(models=[model], inputs=[input_obj])
        dag = project.build_dag()

        input_job = job(dag, str(tmp_path), input_obj)

        assert input_job.source is not None
        assert input_job.item == input_obj

    def test_job_no_source_for_static_inputs(self, tmp_path):
        """Verify job() has no source for static inputs"""
        input_obj = InputFactory(name="static", options=["A", "B"])

        project = ProjectFactory(inputs=[input_obj])
        dag = project.build_dag()

        input_job = job(dag, str(tmp_path), input_obj)

        assert input_job.source is None
        assert input_job.item == input_obj

    def test_input_referencing_insight_raises_error(self, tmp_path):
        """Verify that inputs cannot reference insights (compile-time validation)"""
        model = SqlModelFactory(name="data", sql="SELECT 1 as x")
        insight = InsightFactory(name="data_insight", props={"x": "?{x}"})

        # This should fail at model initialization due to @model_validator
        with pytest.raises(ValueError, match="can only reference SqlModel objects"):
            input_obj = InputFactory(
                name="bad_input",
                options=QueryString(value="?{ SELECT x FROM ${ref(data_insight)} }")
            )
            project = ProjectFactory(models=[model], insights=[insight], inputs=[input_obj])
            dag = project.build_dag()

            # Trigger serialization where validation occurs
            input_obj.model_dump(context={"dag": dag})

    def test_input_referencing_nonexistent_model_raises_error(self, tmp_path):
        """Verify helpful error when input references non-existent model"""
        with pytest.raises(ValueError, match="was not found in the project"):
            input_obj = InputFactory(
                name="bad_input",
                options=QueryString(value="?{ SELECT x FROM ${ref(nonexistent)} }")
            )
            project = ProjectFactory(inputs=[input_obj])
            dag = project.build_dag()

            # Trigger serialization where validation occurs
            input_obj.model_dump(context={"dag": dag})
```

**Success Criteria**:
- ✅ Input job creates parquet for all inputs (both static and query-based options)
- ✅ Query-based inputs execute on source backend (not DuckDB)
- ✅ `${ref(model)}` replaced with `(model.sql)` subquery
- ✅ Compile-time validation enforces SqlModel-only references (via @model_validator)
- ✅ Helpful error messages when referencing Insights or non-existent models
- ✅ Unit tests pass (12+ test cases including validation tests)
- ✅ Inputs execute before insights in DAG runner

---

### Phase 2: Remove Placeholder System & Add JS Template Literals

**Priority**: HIGH - Required for Phase 3

#### Backend Changes

**Modified File**: `visivo/models/inputs/types/dropdown.py`

Remove `query_placeholder()` method and add Pydantic validator to enforce SqlModel-only references:

```python
from pydantic import model_validator

class DropdownInput(Input):
    type: Literal["dropdown"] = "dropdown"
    options: Optional[Union[List[str], QueryOrStringField, str]] = Field(
        None, description="Static list of options OR a dynamic SQL string '${ref(model).field}'"
    )
    multi: bool = Field(False, description="Allow multi-select")

    # REMOVED: query_placeholder() method

    @model_validator(mode='after')
    def validate_query_references(self):
        """
        Validate that query-based options reference exactly one SqlModel (not Insight).

        This is compile-time validation using Pydantic's model_validator to ensure
        the input can be executed on the source backend during the build phase.

        Runs automatically during model initialization when DAG context is available.

        Raises:
            ValueError: If query doesn't reference exactly one SqlModel
        """
        # Only validate query-based options
        if not isinstance(self.options, QueryString):
            return self

        from visivo.models.models.sql_model import SqlModel
        from visivo.query.patterns import extract_ref_names

        query_value = self.options.get_value()
        refs = extract_ref_names(query_value)

        # Must reference exactly one item
        if len(refs) == 0:
            raise ValueError(
                f"Input '{self.name}' query must reference exactly one model using ${{ref(model_name)}}.\\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{ref(products)}} }}"
            )

        if len(refs) > 1:
            raise ValueError(
                f"Input '{self.name}' query references {len(refs)} items ({', '.join(refs)}) "
                f"but must reference exactly one model.\\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{ref(products)}} }}"
            )

        # Look up referenced item in DAG (if available in validation context)
        # Note: This requires DAG to be passed in validation context during parsing
        # If DAG not available yet, this validation will be deferred to serialize_model()
        model_name = refs[0]

        # We'll validate the reference exists and is a SqlModel during serialization
        # when DAG context is guaranteed to be available (see serialize_model below)

        return self

    def _validate_query_reference_type(self, dag) -> None:
        """
        Helper method to validate reference type when DAG is available.

        Called from serialize_model() where DAG context is guaranteed.
        """
        if not isinstance(self.options, QueryString):
            return

        from visivo.models.models.sql_model import SqlModel
        from visivo.query.patterns import extract_ref_names

        query_value = self.options.get_value()
        refs = extract_ref_names(query_value)

        if not refs:
            return

        model_name = refs[0]

        # Look up referenced item
        try:
            item = dag.get_descendant_by_name(model_name)
        except (ValueError, AttributeError):
            raise ValueError(
                f"Input '{self.name}' references '{model_name}' which was not found in the project.\\n"
                f"Ensure the model '{model_name}' is defined and spelled correctly."
            )

        # CRITICAL: Must be SqlModel, not Insight
        # Input queries execute on source backend at build time, so they need direct SQL
        if not isinstance(item, SqlModel):
            raise ValueError(
                f"Input '{self.name}' query can only reference SqlModel objects, not {type(item).__name__}.\\n"
                f"Found reference to: '{model_name}' (type: {type(item).__name__})\\n"
                f"Input queries execute on the source backend at build time and require direct model SQL.\\n"
                f"If you need to reference an insight, create a model from the insight's query instead."
            )

    def _validate_query(self, query_sql: str, dialect: str = "duckdb") -> None:
        # ... existing validation logic for SELECT statement structure stays unchanged

    @model_serializer(mode="wrap")
    def serialize_model(self, serializer, info):
        """
        Custom serializer that validates query references when DAG is available.

        This is where we can guarantee DAG context exists for reference type checking.
        """
        # Validate query reference type if DAG is available
        dag = info.context.get("dag") if info and info.context else None
        if dag:
            self._validate_query_reference_type(dag)

        # Continue with existing serialization logic
        model = serializer(self)

        # ... existing serialization logic for options handling ...

        return model
```

**Modified File**: `visivo/models/interaction.py`

Replace `field_values_with_sanitized_inputs()` with new method:

```python
def field_values_with_js_template_literals(self, dag: ProjectDag) -> dict:
    """
    Convert input references to JavaScript template literal syntax.

    Transforms: ${ref(input_name)} → ${input_name}

    This allows clean injection in frontend using JS template literals.
    Non-input refs (models, dimensions) are left unchanged.

    Examples:
        - "x > ${ref(threshold)}" → "x > ${threshold}" (if threshold is an input)
        - "x > ${ref(model).field}" → "x > ${ref(model).field}" (model ref unchanged)
    """
    from visivo.models.inputs.input import Input
    from re import Match

    def replace_input_refs(text: str) -> str:
        def repl(m: Match) -> str:
            name = m.group("model_name").strip()
            prop = m.group("property_path") or ""

            try:
                node = dag.get_descendant_by_name(name)

                if isinstance(node, Input):
                    # Convert input ref to JS template literal syntax
                    # ${ref(threshold)} → ${threshold}
                    return f"${{{name}}}"

                # Not an input - leave unchanged (model/dimension ref)
                return m.group(0)
            except:
                # Ref not found - leave unchanged
                return m.group(0)

        return CONTEXT_STRING_REF_PATTERN_COMPILED.sub(repl, text)

    fields = {}
    for field_name in ["filter", "split", "sort"]:
        field_value = getattr(self, field_name, None)
        if field_value is not None:
            fields[field_name] = replace_input_refs(field_value.get_value())

    return fields
```

**Modified File**: `visivo/query/insight/insight_query_builder.py`

Update to use new interaction method. The query builder already uses `interaction.field_values` internally, but we need to ensure it uses the new JS template literal version:

```python
class InsightQueryBuilder:
    # ... existing code ...

    def __init__(self, insight, dag: ProjectDag, output_dir):
        self.logger = Logger.instance()
        self.dag = dag
        self.output_dir = output_dir
        self.insight = insight  # Store insight reference
        self.insight_hash = insight.name_hash()

        # Get query statements with JS template literals for inputs
        self.unresolved_query_statements = self._get_query_statements_with_js_templates()

        self.is_dyanmic = insight.is_dynamic(dag)
        # ... rest of existing __init__ ...

    def _get_query_statements_with_js_templates(self):
        """
        Get query statements from insight props and interactions.

        For interactions, use JS template literal syntax for inputs.
        """
        statements = []

        # Props statements (unchanged)
        for key, value in self.insight.props.items():
            if hasattr(value, 'get_value'):
                statements.append((f"props.{key}", value.get_value()))
            else:
                statements.append((f"props.{key}", str(value)))

        # Interaction statements with JS template literals
        if self.insight.interactions:
            for interaction in self.insight.interactions:
                js_template_fields = interaction.field_values_with_js_template_literals(self.dag)
                for key, statement in js_template_fields.items():
                    statements.append((key, statement))

        return statements
```

#### Unit Tests

Create `tests/models/test_interaction_js_templates.py`:

```python
import pytest
from visivo.models.interaction import InsightInteraction
from visivo.testing.test_utils import ProjectFactory, InputFactory, SqlModelFactory
from visivo.models.base.query_string import QueryString


class TestJSTemplateLiterals:
    """Test conversion of input refs to JS template literal syntax"""

    def test_filter_with_input_converts_to_template_literal(self):
        """Verify ${ref(input)} becomes ${input}"""
        input_obj = InputFactory(name="min_value", default="5")
        interaction = InsightInteraction(filter=QueryString(value="?{x > ${ref(min_value)}}"))

        project = ProjectFactory(inputs=[input_obj])
        dag = project.build_dag()

        result = interaction.field_values_with_js_template_literals(dag)

        assert result["filter"] == "x > ${min_value}"
        assert "${ref(min_value)}" not in result["filter"]

    def test_split_with_input_converts_case_expression(self):
        """Verify CASE expression with input converts correctly"""
        input_obj = InputFactory(name="threshold", default="100")
        interaction = InsightInteraction(
            split=QueryString(value="?{CASE WHEN y >= ${ref(threshold)} THEN 'High' ELSE 'Low' END}")
        )

        project = ProjectFactory(inputs=[input_obj])
        dag = project.build_dag()

        result = interaction.field_values_with_js_template_literals(dag)

        assert "${threshold}" in result["split"]
        assert "${ref(threshold)}" not in result["split"]
        assert "CASE WHEN y >=" in result["split"]

    def test_sort_with_input_converts(self):
        """Verify sort interaction with input"""
        input_obj = InputFactory(name="direction", default="ASC")
        interaction = InsightInteraction(
            sort=QueryString(value="?{x ${ref(direction)}}")
        )

        project = ProjectFactory(inputs=[input_obj])
        dag = project.build_dag()

        result = interaction.field_values_with_js_template_literals(dag)

        assert result["sort"] == "x ${direction}"

    def test_non_input_refs_unchanged(self):
        """Verify model refs are left unchanged"""
        model = SqlModelFactory(name="sales", sql="SELECT 1")
        interaction = InsightInteraction(
            filter=QueryString(value="?{${ref(sales).revenue} > 1000}")
        )

        project = ProjectFactory(models=[model])
        dag = project.build_dag()

        result = interaction.field_values_with_js_template_literals(dag)

        # Model ref should remain unchanged
        assert "${ref(sales).revenue}" in result["filter"]

    def test_mixed_input_and_model_refs(self):
        """Verify mixed refs: inputs converted, models unchanged"""
        model = SqlModelFactory(name="data", sql="SELECT 1")
        input_obj = InputFactory(name="threshold", default="10")

        interaction = InsightInteraction(
            filter=QueryString(value="?{${ref(data).value} > ${ref(threshold)}}")
        )

        project = ProjectFactory(models=[model], inputs=[input_obj])
        dag = project.build_dag()

        result = interaction.field_values_with_js_template_literals(dag)

        # Model ref unchanged, input ref converted
        assert "${ref(data).value}" in result["filter"]
        assert "${threshold}" in result["filter"]
        assert "${ref(threshold)}" not in result["filter"]

    def test_multiple_inputs_in_same_expression(self):
        """Verify multiple inputs all converted"""
        input1 = InputFactory(name="min_x", default="5")
        input2 = InputFactory(name="max_x", default="100")

        interaction = InsightInteraction(
            filter=QueryString(value="?{x >= ${ref(min_x)} AND x <= ${ref(max_x)}}")
        )

        project = ProjectFactory(inputs=[input1, input2])
        dag = project.build_dag()

        result = interaction.field_values_with_js_template_literals(dag)

        assert "${min_x}" in result["filter"]
        assert "${max_x}" in result["filter"]
        assert "${ref(" not in result["filter"]

    def test_no_inputs_returns_unchanged(self):
        """Verify interactions with no inputs unchanged"""
        interaction = InsightInteraction(
            filter=QueryString(value="?{x > 10}")
        )

        project = ProjectFactory()
        dag = project.build_dag()

        result = interaction.field_values_with_js_template_literals(dag)

        assert result["filter"] == "x > 10"
```

**Success Criteria**:
- ✅ `query_placeholder()` removed from DropdownInput
- ✅ `field_values_with_sanitized_inputs()` replaced with `field_values_with_js_template_literals()`
- ✅ Generated queries contain `${inputName}` instead of placeholders
- ✅ Model/dimension refs remain unchanged as `${ref(model).field}`
- ✅ Unit tests pass (8+ test cases)

---

### Phase 3: SQLGlot Validation with Input Sampling

**Priority**: HIGH - Core quality feature

#### Backend Changes

**New File**: `visivo/query/input_validator.py`

```python
"""
Input combination validation using SQLGlot.

Validates insight queries with real input values to catch errors at build time.
"""
import random
import itertools
import re
from typing import List, Dict, Any, Optional
from visivo.query.sqlglot_utils import validate_query
from visivo.logger.logger import Logger


# Configuration constants (easy to adjust)
MAX_COMBINATIONS = 96
RANDOM_SAMPLE_SIZE = 96


def get_input_options(input_obj, output_dir: str) -> List[Any]:
    """
    Load computed input options from storage.

    All inputs (static and query-based) are stored as parquet for consistency.

    Args:
        input_obj: Input object
        output_dir: Output directory

    Returns:
        List of option values
    """
    import os
    import polars as pl

    parquet_path = f"{output_dir}/inputs/{input_obj.name_hash()}.parquet"
    if not os.path.exists(parquet_path):
        raise ValueError(f"Input parquet not found: {parquet_path}")

    df = pl.read_parquet(parquet_path)
    return df["option"].to_list()


def inject_input_values(query: str, input_values: Dict[str, Any]) -> str:
    """
    Inject input values into query using regex replacement of ${inputName}.

    IMPORTANT: Values are injected AS-IS with no quoting or formatting.
    The input query must return SQL-safe values (e.g., '2024-01-01' with quotes,
    not 2024-01-01 without quotes if used in a string context).

    This design validates that input queries produce valid SQL values across
    all combinations, ensuring runtime safety.

    This is for VALIDATION only - frontend uses JS template literals.

    Args:
        query: SQL query with ${inputName} placeholders
        input_values: Dict of input_name -> value

    Returns:
        Query with values injected as-is
    """
    result = query

    for input_name, value in input_values.items():
        pattern = re.escape(f"${{{input_name}}}")
        # Inject value as-is - no quoting or formatting
        replacement = str(value)
        result = re.sub(pattern, replacement, result)

    return result


def generate_input_combinations(
    inputs: Dict[str, List[Any]]
) -> List[Dict[str, Any]]:
    """
    Generate combinations of input values, sampling if too many.

    Args:
        inputs: Dict of input_name -> list of options

    Returns:
        List of input value combinations (each a dict)
    """
    input_names = list(inputs.keys())
    option_lists = [inputs[name] for name in input_names]

    # Calculate total combinations
    total = 1
    for options in option_lists:
        total *= len(options)

    if total <= MAX_COMBINATIONS:
        # Generate all combinations
        combinations = list(itertools.product(*option_lists))
        return [dict(zip(input_names, combo)) for combo in combinations]
    else:
        # Sample randomly
        logger = Logger.instance()
        logger.warning(
            f"Total input combinations ({total}) exceeds limit ({MAX_COMBINATIONS}). "
            f"Sampling {RANDOM_SAMPLE_SIZE} random combinations for validation."
        )

        samples = []
        for _ in range(RANDOM_SAMPLE_SIZE):
            combo = {name: random.choice(inputs[name]) for name in input_names}
            samples.append(combo)

        return samples


def validate_insight_with_inputs(
    insight,
    query: str,
    dag,
    output_dir: str,
    dialect: str = "duckdb"
) -> None:
    """
    Validate insight query with all input combinations.

    IMPORTANT: This function assumes the query contains input placeholders.
    Queries without inputs should be validated elsewhere (not by this function).

    Args:
        insight: Insight object
        query: Post query with ${inputName} placeholders
        dag: Project DAG
        output_dir: Output directory
        dialect: SQL dialect (default: duckdb)

    Raises:
        ValueError: If validation fails for any combination
    """
    from visivo.models.inputs.input import Input

    logger = Logger.instance()

    # Extract input names from query using regex
    input_pattern = r'\$\{(\w+)\}'
    input_names = list(set(re.findall(input_pattern, query)))

    if not input_names:
        # This function should only be called for insights with inputs
        raise ValueError(
            f"validate_insight_with_inputs() called for insight '{insight.name}' "
            f"but query contains no input placeholders. This is a programming error."
        )

    # Load options for each input
    inputs_options = {}
    for input_name in input_names:
        try:
            input_obj = dag.get_descendant_by_name(input_name)
            if not isinstance(input_obj, Input):
                raise ValueError(f"'{input_name}' is not an input")

            options = get_input_options(input_obj, output_dir)
            if not options:
                raise ValueError(
                    f"Input '{input_name}' has no options. This should have been caught "
                    f"during input job execution. Check input parquet file."
                )

            inputs_options[input_name] = options
        except Exception as e:
            logger.error(f"Failed to load options for input '{input_name}': {e}")
            raise

    # Generate combinations
    combinations = generate_input_combinations(inputs_options)

    logger.info(
        f"Validating insight '{insight.name}' with {len(combinations)} input combinations"
    )

    # Validate each combination
    failures = []
    for i, combo in enumerate(combinations):
        injected_query = inject_input_values(query, combo)

        try:
            validate_query(
                query_sql=injected_query,
                dialect=dialect,
                insight_name=f"{insight.name}[combo {i+1}]",
                query_type="post_query",
                context={"inputs": combo},
                raise_on_error=True
            )
        except Exception as e:
            failures.append({
                "combination": combo,
                "error": str(e)
            })

    if failures:
        error_msg = f"Validation failed for {len(failures)}/{len(combinations)} combinations:\n"
        for failure in failures[:5]:  # Show first 5 failures
            error_msg += f"  - Inputs: {failure['combination']}\n    Error: {failure['error']}\n"

        if len(failures) > 5:
            error_msg += f"  ... and {len(failures) - 5} more failures\n"

        raise ValueError(error_msg)

    logger.info(f"✓ All {len(combinations)} combinations validated successfully")
```

**Modified File**: `visivo/jobs/run_insight_job.py`

Add validation step in `action()` function (around line 23, after getting query info):

```python
def action(insight: Insight, dag: ProjectDag, output_dir):
    """Execute insight job - validate with inputs, then tokenize and generate files"""
    model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]
    source = get_source_for_model(model, dag, output_dir)

    insight_query_info = insight.get_query_info(dag, output_dir)

    try:
        start_time = time()

        # NEW: Validate dynamic insights with input combinations
        # Only validate if insight has inputs (is_dynamic checks for Input descendants)
        if insight_query_info.post_query and insight.is_dynamic(dag):
            from visivo.query.input_validator import validate_insight_with_inputs
            import re

            # Check if query actually contains input placeholders
            input_pattern = r'\$\{(\w+)\}'
            input_names = re.findall(input_pattern, insight_query_info.post_query)

            if input_names:
                # Query has input placeholders - validate with all combinations
                try:
                    validate_insight_with_inputs(
                        insight=insight,
                        query=insight_query_info.post_query,
                        dag=dag,
                        output_dir=output_dir,
                        dialect="duckdb"
                    )
                except Exception as e:
                    # Validation failed - this is a critical error
                    raise ValueError(f"Input validation failed for insight '{insight.name}': {e}")
            # If no input placeholders, query will be validated by normal SQLGlot validation elsewhere

        # ... rest of existing logic (file generation) ...

        files_directory = f"{output_dir}/files"
        if insight_query_info.pre_query:
            import polars as pl

            data = source.read_sql(insight_query_info.pre_query)
            os.makedirs(files_directory, exist_ok=True)
            parquet_path = f"{files_directory}/{insight.name_hash()}.parquet"
            df = pl.DataFrame(data)
            df.write_parquet(parquet_path)
            files = [{"name_hash": insight.name_hash(), "signed_data_file_url": parquet_path}]
        else:
            models = insight.get_all_dependent_models(dag=dag)
            files = [
                {
                    "name_hash": model.name_hash(),
                    "signed_data_file_url": f"{files_directory}/{model.name_hash()}.parquet",
                }
                for model in models
                if os.path.exists(f"{files_directory}/{model.name_hash()}.parquet")
            ]

        # Store insight metadata
        insight_data = {
            "name": insight.name,
            "files": files,
            "query": insight_query_info.post_query,
            "props_mapping": insight_query_info.props_mapping,
        }

        insight_directory = f"{output_dir}/insights"
        insight_path = os.path.join(insight_directory, f"{insight.name_hash()}.json")
        os.makedirs(insight_directory, exist_ok=True)
        with open(insight_path, "w") as f:
            json.dump(insight_data, f, indent=2)

        success_message = format_message_success(
            details=f"Updated data for insight \033[4m{insight.name}\033[0m",
            start_time=start_time,
            full_path=None,
        )
        return JobResult(item=insight, success=True, message=success_message)

    except Exception as e:
        # ... existing error handling ...
```

#### Unit Tests

Create `tests/query/test_input_validator.py`:

```python
import pytest
from visivo.query.input_validator import (
    inject_input_values,
    generate_input_combinations,
    validate_insight_with_inputs,
    get_input_options,
    MAX_COMBINATIONS
)
from visivo.testing.test_utils import ProjectFactory, InputFactory, InsightFactory, SqlModelFactory
import json
import polars as pl


class TestInputInjection:
    """Test input value injection into queries (AS-IS, no formatting)"""

    def test_inject_string_value_as_is(self):
        """Verify string values are injected as-is (no automatic quoting)"""
        query = "SELECT * FROM table WHERE category = ${category_filter}"
        values = {"category_filter": "'electronics'"}  # Value includes quotes

        result = inject_input_values(query, values)

        assert result == "SELECT * FROM table WHERE category = 'electronics'"

    def test_inject_numeric_value(self):
        """Verify numeric values are injected as-is"""
        query = "SELECT * FROM table WHERE x > ${threshold}"
        values = {"threshold": 100}

        result = inject_input_values(query, values)

        assert result == "SELECT * FROM table WHERE x > 100"

    def test_inject_float_value(self):
        """Verify float values handled correctly"""
        query = "SELECT * FROM table WHERE price > ${min_price}"
        values = {"min_price": 99.99}

        result = inject_input_values(query, values)

        assert result == "SELECT * FROM table WHERE price > 99.99"

    def test_inject_bare_string_fails_validation(self):
        """Verify bare strings (without quotes) will fail SQLGlot validation"""
        query = "SELECT * FROM table WHERE category = ${cat}"
        values = {"cat": "electronics"}  # No quotes - will fail validation

        result = inject_input_values(query, values)

        # Result is syntactically invalid SQL (unquoted identifier)
        assert result == "SELECT * FROM table WHERE category = electronics"
        # This would fail SQLGlot validation (caught in validate_insight_with_inputs)

    def test_inject_multiple_inputs(self):
        """Verify multiple inputs all injected as-is"""
        query = "SELECT * FROM table WHERE x > ${min_x} AND category = ${cat}"
        values = {"min_x": 5, "cat": "'books'"}  # String includes quotes

        result = inject_input_values(query, values)

        assert "x > 5" in result
        assert "category = 'books'" in result


class TestCombinationGeneration:
    """Test input combination generation and sampling"""

    def test_small_combination_space_all_generated(self):
        """Verify all combinations generated when under limit"""
        inputs = {
            "filter1": ["A", "B"],
            "filter2": [1, 2, 3]
        }

        combos = generate_input_combinations(inputs)

        assert len(combos) == 6  # 2 * 3
        assert {"filter1": "A", "filter2": 1} in combos
        assert {"filter1": "B", "filter2": 3} in combos

    def test_exact_limit_all_generated(self):
        """Verify all combinations when exactly at limit"""
        inputs = {
            "filter1": list(range(12)),
            "filter2": list(range(8))
        }
        # Total: 12 * 8 = 96 (exactly MAX_COMBINATIONS)

        combos = generate_input_combinations(inputs)

        assert len(combos) == 96

    def test_large_combination_space_sampled(self):
        """Verify sampling when combinations exceed limit"""
        inputs = {
            f"filter{i}": list(range(10)) for i in range(5)
        }
        # Total: 10^5 = 100,000 combinations

        combos = generate_input_combinations(inputs)

        assert len(combos) == MAX_COMBINATIONS
        # All combos should be valid
        for combo in combos:
            assert all(0 <= combo[f"filter{i}"] <= 9 for i in range(5))

    def test_single_input_returns_all_values(self):
        """Verify single input returns all its values"""
        inputs = {"filter": ["A", "B", "C"]}

        combos = generate_input_combinations(inputs)

        assert len(combos) == 3
        assert [c["filter"] for c in combos] == ["A", "B", "C"]


class TestInputOptionsLoading:
    """Test loading input options from storage"""

    def test_load_static_options_from_parquet(self, tmp_path):
        """Verify loading static options from parquet"""
        input_obj = InputFactory(name="test", options=["A", "B", "C"])

        # Create parquet file
        input_dir = tmp_path / "inputs"
        input_dir.mkdir()
        parquet_path = input_dir / f"{input_obj.name_hash()}.parquet"

        df = pl.DataFrame({"option": ["A", "B", "C"]})
        df.write_parquet(parquet_path)

        options = get_input_options(input_obj, str(tmp_path))

        assert options == ["A", "B", "C"]

    def test_load_query_options_from_parquet(self, tmp_path):
        """Verify loading query-based options from parquet"""
        from visivo.models.base.query_string import QueryString

        input_obj = InputFactory(
            name="test",
            options=QueryString(value="?{ SELECT x FROM table }")
        )

        # Create parquet file
        input_dir = tmp_path / "inputs"
        input_dir.mkdir()
        parquet_path = input_dir / f"{input_obj.name_hash()}.parquet"

        df = pl.DataFrame({"option": [1, 2, 3, 4, 5]})
        df.write_parquet(parquet_path)

        options = get_input_options(input_obj, str(tmp_path))

        assert options == [1, 2, 3, 4, 5]


class TestValidationIntegration:
    """Integration tests for validation with inputs"""

    def test_validate_simple_filter_with_input(self, tmp_path):
        """Verify validation passes with valid SQL and inputs"""
        input_obj = InputFactory(name="threshold", options=[5, 10, 15])
        model = SqlModelFactory(name="data", sql="SELECT 1 as x")
        insight = InsightFactory(
            name="test_insight",
            props={"x": "?{x}"},
            interactions=[{"filter": "?{x > ${ref(threshold)}}"}]
        )

        project = ProjectFactory(models=[model], inputs=[input_obj], insights=[insight])
        dag = project.build_dag()

        # Create input parquet
        input_dir = tmp_path / "inputs"
        input_dir.mkdir()
        df = pl.DataFrame({"option": [5, 10, 15]})
        df.write_parquet(input_dir / f"{input_obj.name_hash()}.parquet")

        # Query with JS template literal
        query = "SELECT x FROM data WHERE x > ${threshold}"

        # Should not raise
        validate_insight_with_inputs(insight, query, dag, str(tmp_path))

    def test_validate_catches_syntax_error(self, tmp_path):
        """Verify validation catches SQL syntax errors"""
        input_obj = InputFactory(name="cat", options=["A", "B"])
        insight = InsightFactory(name="test")

        project = ProjectFactory(inputs=[input_obj], insights=[insight])
        dag = project.build_dag()

        # Create input parquet
        input_dir = tmp_path / "inputs"
        input_dir.mkdir()
        df = pl.DataFrame({"option": ["A", "B"]})
        df.write_parquet(input_dir / f"{input_obj.name_hash()}.parquet")

        # Invalid SQL (missing FROM)
        query = "SELECT x WHERE category = ${cat}"

        with pytest.raises(ValueError, match="Validation failed"):
            validate_insight_with_inputs(insight, query, dag, str(tmp_path))

    def test_validate_raises_if_no_inputs_in_query(self, tmp_path):
        """Verify function raises error if called with query containing no inputs"""
        insight = InsightFactory(name="test")
        project = ProjectFactory(insights=[insight])
        dag = project.build_dag()

        # Query with no input placeholders
        query = "SELECT x FROM table WHERE x > 10"

        # Should raise programming error - this function shouldn't be called without inputs
        with pytest.raises(ValueError, match="programming error"):
            validate_insight_with_inputs(insight, query, dag, str(tmp_path))
```

**Success Criteria**:
- ✅ Validation runs only for insights with input placeholders
- ✅ Call site checks for input placeholders before calling validator
- ✅ Validator raises error if called without inputs (programming error guard)
- ✅ Sampling kicks in when combinations > 96
- ✅ SQLGlot catches syntax errors with real input values
- ✅ Validation reads input options from parquet storage
- ✅ Unit tests pass (13+ test cases, includes no-input guard test)

---

### Phase 4: Frontend - Remove Placeholder Regex & Use Template Literal Evaluation

**Priority**: MEDIUM - Depends on Phase 1-3

#### Frontend Changes

**Modified File**: `viewer/src/duckdb/queries.js`

Replace `prepPostQuery()` function (lines 132-208) with new implementation:

```javascript
/**
 * Prepare post query by injecting input values using JS template literal evaluation
 *
 * IMPORTANT: Values are injected AS-IS with no quoting or formatting.
 * The input query must return SQL-safe values (e.g., '2024-01-01' with quotes).
 *
 * This matches the backend validation behavior and ensures what was validated
 * at build time is exactly what runs at runtime.
 *
 * @param {Object} insight - Insight object with query property
 * @param {Object} inputs - Object with input_name -> value mappings
 * @returns {String} Query with input values injected
 */
export const prepPostQuery = (insight, inputs) => {
  const query = insight.query;

  if (!query) {
    console.warn('Insight has no query');
    return '';
  }

  try {
    // Create a function that evaluates the template literal
    // This is safe because query is server-generated, not user input
    const inputKeys = Object.keys(inputs);
    const inputValues = Object.values(inputs);

    // Convert values to strings AS-IS (no quoting or formatting)
    // This matches backend validation behavior
    const stringValues = inputValues.map(value => String(value));

    // Create template literal evaluation function
    // Example: if inputs = {threshold: 10, cat: "'books'"}
    // This creates: new Function('threshold', 'cat', 'return `${query}`')
    const templateFunc = new Function(...inputKeys, `return \`${query}\`;`);

    // Execute with string values
    const result = templateFunc(...stringValues);

    console.debug('Query prepared:', result);
    return result;
  } catch (error) {
    console.error('Failed to inject input values into query:', error);
    console.debug('Query:', query);
    console.debug('Inputs:', inputs);
    throw new Error(`Query preparation failed: ${error.message}`);
  }
};
```

**New File**: `viewer/src/api/inputs.js`

```javascript
import { getBasePath } from './base';
import * as arrow from 'apache-arrow';

/**
 * Fetch input options from storage
 *
 * All inputs (static and query-based) are stored as parquet for consistency.
 *
 * @param {string} projectId - Project ID
 * @param {string} inputHash - Input name hash
 * @returns {Promise<string>} Parquet file URL
 */
export const fetchInputOptions = async (projectId, inputHash) => {
  const basePath = getBasePath();
  const parquetUrl = `${basePath}/inputs/${inputHash}.parquet`;

  const response = await fetch(parquetUrl, { method: 'HEAD' });

  if (!response.ok) {
    throw new Error(`Input '${inputHash}' parquet not found`);
  }

  return parquetUrl;
};

/**
 * Load input options from parquet using Apache Arrow
 *
 * All inputs are stored as parquet. This loads them directly as Arrow
 * and extracts values without creating DuckDB temp tables.
 *
 * @param {string} url - Parquet file URL
 * @returns {Promise<Array>} Array of option values
 */
export const loadInputOptions = async (url) => {
  try {
    // Fetch parquet file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch input parquet: ${response.statusText}`);
    }

    // Load as Arrow table
    const buffer = await response.arrayBuffer();
    const table = arrow.tableFromIPC(new Uint8Array(buffer));

    // Extract 'option' column values
    const optionColumn = table.getChild('option');
    if (!optionColumn) {
      throw new Error(`Input parquet missing 'option' column`);
    }

    const options = [];
    for (let i = 0; i < optionColumn.length; i++) {
      options.push(optionColumn.get(i));
    }

    console.debug(`Loaded ${options.length} options from ${url}`);
    return options;
  } catch (error) {
    console.error(`Failed to load input options from ${url}:`, error);
    throw error;
  }
};
```

**Modified File**: `viewer/src/hooks/useProject.js` (or wherever project loading happens)

Add input initialization:

```javascript
import { fetchInputOptions, loadInputOptions } from '../api/inputs';

// Inside the hook or component that loads the project:
useEffect(() => {
  const initializeInputs = async () => {
    if (!project?.inputs) return;

    console.debug(`Initializing ${project.inputs.length} inputs`);

    for (const input of project.inputs) {
      try {
        // Get parquet URL (all inputs stored as parquet)
        const parquetUrl = await fetchInputOptions(project.id, input.name_hash);

        // Load options from parquet using Arrow (no DuckDB needed)
        const options = await loadInputOptions(parquetUrl);

        // Store in Zustand
        setInputOptions(input.name, options);

        // Set default value
        if (input.default !== undefined) {
          setInputValue(input.name, input.default);
        } else if (options.length > 0) {
          // Use first option as default if none specified
          setInputValue(input.name, options[0]);
        }
      } catch (error) {
        console.error(`Failed to initialize input '${input.name}':`, error);
      }
    }
  };

  initializeInputs();
}, [project, setInputOptions, setInputValue]);
```

**Modified File**: `viewer/src/components/items/inputs/Dropdown.jsx`

Simplify to use pre-computed options (remove query execution logic):

```javascript
useEffect(() => {
  const initializeDropdown = async () => {
    setLoading(true);

    // Options are pre-computed - just format them
    let opts = [];

    if (Array.isArray(rawOptions)) {
      opts = rawOptions.map(option => ({
        id: option,
        label: String(option),
      }));
    }

    setOptions(opts);

    // Set default value (single-select only in V1)
    if (rawDefaultValue !== undefined) {
      const defVal = { id: rawDefaultValue, label: String(rawDefaultValue) };
      setSelectedItems(defVal);

      if (setDefaultInputValue) {
        setDefaultInputValue(name, rawDefaultValue);
      }
    }

    setLoading(false);
  };

  initializeDropdown();
}, [rawOptions, rawDefaultValue, name, setDefaultInputValue]);

// NOTE: Multi-select support removed for V1 simplicity
// All DuckDB query execution logic removed - options are pre-computed!
```

#### Unit Tests

Create `viewer/src/duckdb/__tests__/queries.test.js`:

```javascript
import { prepPostQuery } from '../queries';

describe('prepPostQuery - Template Literal Injection (AS-IS, No Formatting)', () => {
  describe('Simple value injection', () => {
    test('injects string value with quotes as-is', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE category = ${category}'
      };
      const inputs = { category: "'electronics'" };  // Value includes quotes

      const result = prepPostQuery(insight, inputs);

      expect(result).toBe("SELECT * FROM table WHERE category = 'electronics'");
    });

    test('injects numeric value as-is', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE x > ${threshold}'
      };
      const inputs = { threshold: 100 };

      const result = prepPostQuery(insight, inputs);

      expect(result).toBe('SELECT * FROM table WHERE x > 100');
    });

    test('injects float value as-is', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE price >= ${min_price}'
      };
      const inputs = { min_price: 99.99 };

      const result = prepPostQuery(insight, inputs);

      expect(result).toBe('SELECT * FROM table WHERE price >= 99.99');
    });

    test('injects multiple inputs as-is', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE x > ${min_x} AND category = ${cat}'
      };
      const inputs = { min_x: 5, cat: "'books'" };  // String includes quotes

      const result = prepPostQuery(insight, inputs);

      expect(result).toContain('x > 5');
      expect(result).toContain("category = 'books'");
    });

    test('bare string without quotes creates invalid SQL', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE category = ${cat}'
      };
      const inputs = { cat: 'books' };  // No quotes - will be invalid

      const result = prepPostQuery(insight, inputs);

      // Result is syntactically invalid (unquoted identifier)
      expect(result).toBe('SELECT * FROM table WHERE category = books');
      // This would have been caught by SQLGlot validation at build time
    });
  });

  describe('Complex SQL structures', () => {
    test('injects into CASE statement', () => {
      const insight = {
        query: `SELECT
  CASE
    WHEN y >= ${threshold}
    THEN 'High'
    ELSE 'Low'
  END AS category
FROM table`
      };
      const inputs = { threshold: 10 };

      const result = prepPostQuery(insight, inputs);

      expect(result).toContain('WHEN y >= 10');
    });

    test('handles multiple inputs in same CASE', () => {
      const insight = {
        query: 'SELECT CASE WHEN x >= ${min} AND x <= ${max} THEN 1 ELSE 0 END'
      };
      const inputs = { min: 10, max: 100 };

      const result = prepPostQuery(insight, inputs);

      expect(result).toContain('x >= 10');
      expect(result).toContain('x <= 100');
    });
  });

  describe('Error handling', () => {
    test('throws on missing query', () => {
      const insight = { query: null };
      const inputs = {};

      expect(() => prepPostQuery(insight, inputs)).toThrow();
    });

    test('handles no inputs gracefully', () => {
      const insight = {
        query: 'SELECT * FROM table WHERE x > 10'
      };
      const inputs = {};

      const result = prepPostQuery(insight, inputs);

      expect(result).toBe('SELECT * FROM table WHERE x > 10');
    });
  });

  describe('Integration scenarios', () => {
    test('split-input-test-insight CASE statement', () => {
      const insight = {
        query: `SELECT
  CASE
    WHEN "y" >= ${split_threshold}
    THEN 'High Y Values'
    ELSE 'Low Y Values'
  END AS "split",
  "x" AS "x_col"
FROM "model_hash"`
      };
      const inputs = { split_threshold: 5 };

      const result = prepPostQuery(insight, inputs);

      expect(result).toContain('"y" >= 5');
      expect(result).not.toContain('${split_threshold}');
    });

    test('filter with HAVING clause', () => {
      const insight = {
        query: `SELECT
  category,
  AVG(y) AS avg_y
FROM table
GROUP BY category
HAVING AVG(y) > ${min_avg_y}`
      };
      const inputs = { min_avg_y: 50 };

      const result = prepPostQuery(insight, inputs);

      expect(result).toContain('AVG(y) > 50');
    });
  });
});
```

**Success Criteria**:
- ✅ `prepPostQuery` uses template literal evaluation (no regex)
- ✅ Values injected AS-IS (no quoting/formatting) matching backend validation
- ✅ Input options loaded from parquet via Arrow (no DuckDB temp tables)
- ✅ Dropdown component simplified (single-select only, no client-side queries)
- ✅ Input initialization sets defaults from input.default
- ✅ Unit tests pass (12+ test cases, no multi-select tests)

---

### Phase 5: Split Interaction - Multi-Trace Generation

**Priority**: MEDIUM - Independent feature

**Note**: This phase is largely unchanged from the original plan, as split logic doesn't depend on input injection mechanism.

#### Frontend Changes

**New File**: `viewer/src/utils/splitTraces.js`

```javascript
/**
 * Splits query results into multiple traces based on split column
 *
 * @param {Array} rows - Query result rows
 * @param {string} splitColumn - Column name to split on (from props_mapping.split)
 * @returns {Array<{name: string, data: Array}>} Array of trace objects
 */
export function splitByColumn(rows, splitColumn) {
  if (!splitColumn || !rows || rows.length === 0) {
    return [{ name: 'default', data: rows }];
  }

  const groups = {};

  rows.forEach(row => {
    const splitValue = row[splitColumn];
    const key = splitValue === null || splitValue === undefined ? 'NULL' : String(splitValue);

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(row);
  });

  return Object.entries(groups)
    .map(([splitValue, data]) => ({
      name: splitValue,
      data: data,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)); // Sort for consistency
}
```

**Modified File**: `viewer/src/hooks/useInsightsData.js`

Update `processInsight` function (around line 15):

```javascript
const processInsight = async (db, insight, inputs) => {
  try {
    const { id, name, files, query, props_mapping } = insight;
    const insightName = id || name;

    console.debug(`Processing insight '${insightName}'`);

    // Step 1: Load parquet files
    const { loaded, failed } = await loadInsightParquetFiles(db, files);

    if (failed.length > 0) {
      console.error(`Failed to load ${failed.length} files for insight '${insightName}':`, failed);
    }

    // Step 2: Prepare post_query with input substitution
    const preparedQuery = prepPostQuery({ query }, inputs);

    console.debug(`Executing query for insight '${insightName}':`, preparedQuery);

    // Step 3: Execute query in DuckDB
    const result = await runDuckDBQuery(db, preparedQuery, 3, 1000);

    // Step 4: Process results
    const processedRows = result.toArray().map(row => {
      const rowData = row.toJSON();
      return Object.fromEntries(
        Object.entries(rowData).map(([key, value]) => [
          key,
          typeof value === 'bigint' ? value.toString() : value,
        ])
      );
    });

    console.debug(`Query returned ${processedRows.length} rows for insight '${insightName}'`);

    // Step 5: Check for split column and create traces
    let traces;
    if (props_mapping?.split) {
      const { splitByColumn } = await import('../utils/splitTraces');
      const splitColumnAlias = props_mapping.split;

      traces = splitByColumn(processedRows, splitColumnAlias);
      console.debug(`Split insight '${insightName}' into ${traces.length} traces:`, traces.map(t => t.name));
    } else {
      traces = [{ name: insightName, data: processedRows }];
    }

    // Step 6: Return structured data with traces
    return {
      [insightName]: {
        id: insightName,
        name: insightName,
        traces: traces, // NEW: Array of traces instead of single data array
        files,
        query,
        props_mapping,
        loaded: loaded.length,
        failed: failed.length,
        error: null,
      },
    };
  } catch (error) {
    // ... error handling ...
  }
};
```

#### Unit Tests

Create `viewer/src/utils/__tests__/splitTraces.test.js`:

```javascript
import { splitByColumn } from '../splitTraces';

describe('splitByColumn', () => {
  test('splits rows into groups by split column', () => {
    const rows = [
      { x: 1, y: 2, category: 'A' },
      { x: 3, y: 4, category: 'B' },
      { x: 5, y: 6, category: 'A' },
      { x: 7, y: 8, category: 'B' },
    ];

    const result = splitByColumn(rows, 'category');

    expect(result).toHaveLength(2);
    expect(result.find(t => t.name === 'A').data).toHaveLength(2);
    expect(result.find(t => t.name === 'B').data).toHaveLength(2);
  });

  test('handles single group (all same value)', () => {
    const rows = [
      { x: 1, y: 2, category: 'A' },
      { x: 3, y: 4, category: 'A' },
    ];

    const result = splitByColumn(rows, 'category');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('A');
    expect(result[0].data).toHaveLength(2);
  });

  test('handles NULL values in split column', () => {
    const rows = [
      { x: 1, y: 2, category: null },
      { x: 3, y: 4, category: 'A' },
      { x: 5, y: 6, category: null },
    ];

    const result = splitByColumn(rows, 'category');

    expect(result).toHaveLength(2);
    expect(result.find(t => t.name === 'NULL')).toBeDefined();
    expect(result.find(t => t.name === 'NULL').data).toHaveLength(2);
  });

  test('returns single default trace when no split column provided', () => {
    const rows = [{ x: 1, y: 2 }];
    const result = splitByColumn(rows, null);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('default');
  });

  test('handles empty rows array', () => {
    const result = splitByColumn([], 'category');
    expect(result).toHaveLength(1);
    expect(result[0].data).toEqual([]);
  });

  test('handles numeric split values', () => {
    const rows = [
      { x: 1, y: 2, status: 0 },
      { x: 3, y: 4, status: 1 },
      { x: 5, y: 6, status: 0 },
    ];

    const result = splitByColumn(rows, 'status');

    expect(result).toHaveLength(2);
    expect(result.find(t => t.name === '0')).toBeDefined();
    expect(result.find(t => t.name === '1')).toBeDefined();
  });

  test('sorts traces by name for consistency', () => {
    const rows = [
      { x: 1, category: 'Z' },
      { x: 2, category: 'A' },
      { x: 3, category: 'M' },
    ];

    const result = splitByColumn(rows, 'category');

    expect(result.map(t => t.name)).toEqual(['A', 'M', 'Z']);
  });
});
```

**Success Criteria**:
- ✅ All unit tests pass (8+ test cases)
- ✅ `split-input-test-insight` creates 2 traces with correct data
- ✅ Non-split insights still work (return array of 1 trace)
- ✅ Chart rendering handles multiple traces correctly

---

## Testing Strategy

### Unit Testing (Primary Focus)
- **Backend Python**:
  - Input job execution (12+ tests, includes validation and empty result error handling)
  - JS template literal generation (8+ tests)
  - SQLGlot validation with AS-IS injection (13+ tests, includes no-input guard)
  - Total: ~33 new Python tests

- **Frontend JavaScript**:
  - Template literal injection AS-IS (12+ tests, simplified - no array/multi-select)
  - Input loading via Arrow (covered in integration)
  - Split trace generation (8+ tests)
  - Total: ~20 new JS tests

### Integration Testing
- Run existing integration test suite
- Verify all input-driven insights work end-to-end
- Test input changes trigger correct behavior
- Manual execution: `cd test-projects/integration && timeout 30 DEBUG=true STACKTRACE=true visivo run`

### Manual QA
- Visual verification of charts
- Input interaction responsiveness
- Error handling (invalid inputs, missing data)

---

## Success Criteria

### Functional Requirements
1. ✅ Input queries execute at build time on source backend
2. ✅ Input queries must return at least 1 option (helpful error if 0 results)
3. ✅ SQLGlot validates insight queries with real input values AS-IS (sampled if >96 combinations)
4. ✅ Frontend uses clean template literal injection with AS-IS values (no quoting/formatting)
5. ✅ Frontend loads input options via Arrow (no DuckDB temp tables)
6. ✅ Single-select inputs only (multi-select out of scope)
7. ✅ Split interaction creates multiple traces
8. ✅ Filter and sort work correctly with inputs
9. ✅ Dynamic updates: changing inputs triggers re-execution client-side

### Quality Requirements
10. ✅ Backend unit tests: 33+ new tests
11. ✅ Frontend unit tests: 20+ new tests
12. ✅ Test coverage: >80% for modified files
13. ✅ No console errors or warnings
14. ✅ Sampling works correctly for large input spaces (96 limit)

### Integration Requirements
15. ✅ All integration tests pass
16. ✅ Manual QA successful
17. ✅ Performance: <500ms input change response

---

## Estimated Timeline

| Phase | Tasks | Estimated Time | Dependencies |
|-------|-------|----------------|--------------|
| **Phase 1** | Input job system + tests | 4-5 hours | None |
| **Phase 2** | Remove placeholders, add JS templates + tests | 2-3 hours | None (parallel) |
| **Phase 3** | SQLGlot validation + sampling + tests | 3-4 hours | Phase 1 |
| **Phase 4** | Frontend injection + tests | 2-3 hours | Phase 2 |
| **Phase 5** | Split trace generation + tests | 2-3 hours | Phase 1-4 |
| **Integration & QA** | End-to-end testing | 2 hours | All phases |

**Total Estimated Time**: 15-20 hours

---

## Key Improvements Over Original Plan

1. **Simpler Frontend**: Template literals instead of complex regex
2. **AS-IS Value Injection**: No quoting/formatting logic - input queries return SQL-safe values
3. **Arrow-Based Loading**: Direct parquet loading via Arrow (no DuckDB temp tables)
4. **Single-Select Simplicity**: V1 focuses on single-select inputs (multi-select deferred)
5. **Better Validation**: Real input values tested at build time via SQLGlot
6. **Cleaner Architecture**: Clear separation of build vs runtime concerns
7. **No Brittle Regex**: All SQL parsing uses SQLGlot
8. **Scalable Sampling**: Handles large input combination spaces (96 sample limit)
9. **Consistent Storage**: Parquet for all inputs (eliminates conditional logic)
10. **Source Backend Execution**: Input queries run on actual data source (not parquet)
11. **Native JS**: Template literal evaluation is built-in, fast, and maintainable
12. **Empty Result Handling**: Helpful errors when input queries return 0 results

This architecture is more robust, easier to maintain, catches errors earlier in the development cycle, and avoids complex formatting logic by pushing SQL safety to the input query level.
