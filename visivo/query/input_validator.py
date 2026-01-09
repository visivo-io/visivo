"""
SQLGlot validation with input sampling for dynamic insights.

Validates insight queries with real input values BEFORE runtime by:
1. Loading input options from JSON files
2. Generating combinations of input values (sampling if >96)
3. Injecting values into SQL queries
4. Validating each query variant with SQLGlot
"""

import json
import re
from pathlib import Path
from typing import Dict, List
from itertools import product
import random

from visivo.logger.logger import Logger
from visivo.query.sqlglot_utils import validate_query
from visivo.query.patterns import (
    INPUT_ACCESSOR_PATTERN,
    INPUT_FRONTEND_PATTERN,
    extract_input_accessors,
    extract_frontend_input_accessors,
    SINGLE_SELECT_ACCESSORS,
    MULTI_SELECT_ACCESSORS,
)
from visivo.query.accessor_validator import get_accessor_sample_value
from visivo.models.inputs.input import Input
from visivo.models.insight import Insight
from visivo.models.base.project_dag import ProjectDag
from visivo.models.dag import all_descendants_of_type

MAX_COMBINATIONS = 96


def get_input_options(input_obj: Input, output_dir: str) -> List[str]:
    """Load input options from JSON file.

    Supports three data sources:
    1. static_props.options - static list-based inputs
    2. static_props.range - range-based inputs (returns start/end as sample values)
    3. files array - query-based inputs (loads from parquet files)
    """
    logger = Logger.instance()
    import polars as pl

    input_dir = Path(output_dir) / "inputs"
    json_path = input_dir / f"{input_obj.name_hash()}.json"

    if not json_path.exists():
        raise FileNotFoundError(
            f"Input JSON file not found: {json_path}. "
            f"Ensure input '{input_obj.name}' was executed before validation."
        )

    logger.debug(f"Loading input options from {json_path}")

    with open(json_path, "r") as f:
        data = json.load(f)

    static_props = data.get("static_props") or {}
    files = data.get("files") or []

    # Handle static list-based options (stored in static_props.options)
    if "options" in static_props:
        options = static_props["options"]
        return [str(opt) for opt in options]

    # Handle range-based inputs (stored in static_props.range)
    if "range" in static_props:
        range_config = static_props["range"]
        start = range_config.get("start", 0)
        end = range_config.get("end", 100)

        try:
            start = float(start)
            end = float(end)
            return [str(start), str(end)]
        except (ValueError, TypeError):
            return ["0", "100"]

    # Handle query-based inputs (stored in parquet files)
    for file_info in files:
        if file_info.get("key") == "options":
            parquet_path = file_info.get("signed_data_file_url")
            if parquet_path and Path(parquet_path).exists():
                df = pl.read_parquet(parquet_path)
                if df.shape[1] > 0:
                    # Get the first column values as strings
                    col_name = df.columns[0]
                    return df[col_name].cast(pl.Utf8).to_list()

    raise ValueError(
        f"Invalid input JSON structure for '{input_obj.name}': "
        f"missing 'options' or 'range' in static_props, and no options parquet file found"
    )


def get_input_type(input_obj: Input) -> str:
    """Get the input type string."""
    return input_obj.type


def inject_input_accessor_values(query: str, input_values: Dict[str, Dict[str, str]]) -> str:
    """
    Inject input accessor values into SQL query.

    Replaces input accessor placeholders with values.
    Handles both formats:
    - ${input_name.accessor} (post-processed frontend format)
    - ${ref(input_name).accessor} (YAML format)

    Args:
        query: SQL query with input accessor placeholders
        input_values: Dict mapping input names to accessor->value dicts
                     e.g., {"region": {"value": "'East'"}, "prices": {"min": "100", "max": "500"}}
    """

    def replace_placeholder(match):
        input_name = match.group(1)
        accessor = match.group(2)
        if input_name in input_values and accessor in input_values[input_name]:
            return input_values[input_name][accessor]
        return match.group(0)

    # Handle both patterns: ${input.accessor} and ${ref(input).accessor}
    pattern_simple = r"\$\{(\w+)\.(\w+)\}"
    pattern_ref = r"\$\{ref\((\w+)\)\.(\w+)\}"

    result = re.sub(pattern_ref, replace_placeholder, query)
    result = re.sub(pattern_simple, replace_placeholder, result)
    return result


def generate_input_combinations(inputs: Dict[str, List[str]]) -> List[Dict[str, str]]:
    """Generate all combinations of input values, sampling if necessary."""
    logger = Logger.instance()

    if not inputs:
        return []

    for input_name, options in inputs.items():
        if not options:
            logger.debug(f"Input '{input_name}' has no options")
            return []

    input_names = list(inputs.keys())
    option_lists = [inputs[name] for name in input_names]

    total_combinations = 1
    for options in option_lists:
        total_combinations *= len(options)

    if total_combinations <= MAX_COMBINATIONS:
        combinations = []
        for combo_values in product(*option_lists):
            combo_dict = {name: value for name, value in zip(input_names, combo_values)}
            combinations.append(combo_dict)
    else:
        logger.debug(f"Sampling {MAX_COMBINATIONS} from {total_combinations} combinations")
        random.seed(42)

        sampled_indices = set()
        while len(sampled_indices) < MAX_COMBINATIONS:
            sampled_indices.add(random.randint(0, total_combinations - 1))

        combinations = []
        for idx in sorted(sampled_indices):
            combo_values = []
            remaining = idx
            for options in option_lists:
                n = len(options)
                combo_values.append(options[remaining % n])
                remaining //= n
            combo_dict = {name: value for name, value in zip(input_names, combo_values)}
            combinations.append(combo_dict)

    logger.debug(f"Generated {len(combinations)} combinations")
    return combinations


def validate_insight_with_inputs(
    insight: Insight, query: str, dag: ProjectDag, output_dir: str, dialect: str = "duckdb"
) -> None:
    """
    Validate insight query with all combinations of input values.

    Finds input accessor placeholders (${input_name.accessor}), loads options,
    generates combinations, and validates each variant with SQLGlot.
    """
    logger = Logger.instance()

    # Extract input accessors from query (frontend format: ${input.accessor})
    accessor_refs = extract_frontend_input_accessors(query)
    if not accessor_refs:
        raise ValueError(
            f"Programming error: validate_insight_with_inputs() called for insight "
            f"'{insight.name}' with query that has no input accessor placeholders."
        )

    # Get unique input names
    input_names = {name for name, _ in accessor_refs}
    logger.debug(f"Validating insight '{insight.name}' with inputs: {input_names}")

    # Get all input descendants from insight
    input_descendants = all_descendants_of_type(type=Input, dag=dag, from_node=insight)
    input_map = {inp.name: inp for inp in input_descendants}

    # Build mapping of input names to their option values
    inputs_dict = {}
    input_types = {}
    for input_name in input_names:
        if input_name not in input_map:
            raise ValueError(
                f"Insight '{insight.name}' references input '{input_name}' "
                f"but it is not a descendant in the DAG."
            )

        input_obj = input_map[input_name]
        try:
            options = get_input_options(input_obj, output_dir)
            inputs_dict[input_name] = options
            input_types[input_name] = get_input_type(input_obj)
        except Exception as e:
            raise ValueError(
                f"Failed to load options for input '{input_name}' "
                f"used in insight '{insight.name}': {e}"
            ) from e

    # Generate combinations of input values
    combinations = generate_input_combinations(inputs_dict)

    if not combinations:
        logger.debug(f"No combinations to validate for insight '{insight.name}'")
        return

    logger.info(f"Validating insight '{insight.name}' with {len(combinations)} combinations...")

    # For each combination, build the accessor values and validate
    for i, combo in enumerate(combinations):
        # Build accessor values for this combination
        accessor_values = {}
        for input_name, value in combo.items():
            input_type = input_types[input_name]
            accessor_values[input_name] = {}

            if input_type == "single-select":
                accessor_values[input_name]["value"] = value
            else:
                # Multi-select - compute realistic accessor values
                options = inputs_dict[input_name]

                # .values is a pre-quoted SQL list for use in IN clauses
                # e.g., ["Category A", "Category B"] => "'Category A','Category B'"
                # Single quotes in values are escaped by doubling (SQL standard)
                sample_options = options[:2] if len(options) >= 2 else options
                quoted_options = ["'" + str(opt).replace("'", "''") + "'" for opt in sample_options]
                accessor_values[input_name]["values"] = ",".join(quoted_options)

                # Use first/last options for .first/.last accessors
                accessor_values[input_name]["first"] = options[0] if options else value
                accessor_values[input_name]["last"] = options[-1] if options else value

                # Use sorted options for .min/.max to get actual min/max values
                # Sorting works for both numeric strings and ISO date strings
                sorted_options = sorted(options)
                accessor_values[input_name]["min"] = sorted_options[0] if sorted_options else value
                accessor_values[input_name]["max"] = sorted_options[-1] if sorted_options else value

        # Inject values into query
        query_with_values = inject_input_accessor_values(query, accessor_values)

        context = {
            "combination_number": f"{i + 1}/{len(combinations)}",
            "input_values": combo,
        }

        try:
            validate_query(
                query_sql=query_with_values,
                dialect=dialect,
                insight_name=insight.name,
                query_type=f"post_query (combination {i + 1}/{len(combinations)})",
                context=context,
                raise_on_error=True,
            )
        except Exception:
            raise

    logger.info(
        f"Validation passed for insight '{insight.name}' ({len(combinations)} combinations)"
    )
