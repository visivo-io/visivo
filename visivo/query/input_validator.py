"""
SQLGlot validation with input sampling for dynamic insights.

This module validates insight queries with real input values BEFORE runtime by:
1. Loading input options from parquet files
2. Generating combinations of input values (sampling if >96)
3. Injecting values AS-IS into SQL queries (no quoting)
4. Validating each query variant with SQLGlot

Phase 3 of Input Interaction Implementation.
"""

import re
import polars as pl
from pathlib import Path
from typing import Dict, List, Any
from itertools import product
import random

from visivo.logger.logger import Logger
from visivo.query.sqlglot_utils import validate_query
from visivo.models.inputs.input import Input
from visivo.models.insight import Insight
from visivo.models.base.project_dag import ProjectDag
from visivo.models.dag import all_descendants_of_type

# Maximum number of combinations to test (to prevent excessive validation time)
MAX_COMBINATIONS = 96

# Pattern to find input placeholders: ${input_name}
INPUT_PLACEHOLDER_PATTERN = r"\$\{(\w+)\}"


def get_input_options(input_obj: Input, output_dir: str) -> List[str]:
    """
    Load input options from parquet file.

    Reads the parquet file generated during input execution to get
    all available option values for this input.

    Args:
        input_obj: Input object to load options for
        output_dir: Output directory containing inputs/ folder

    Returns:
        List of option values as strings (e.g., ["electronics", "books"])

    Example:
        >>> input_obj = InputFactory(name="category_input")
        >>> options = get_input_options(input_obj, "/tmp/visivo")
        >>> print(options)
        ["electronics", "books", "toys"]
    """
    logger = Logger.instance()

    # Construct path to input parquet file
    input_dir = Path(output_dir) / "inputs"
    parquet_path = input_dir / f"{input_obj.name_hash()}.parquet"

    if not parquet_path.exists():
        raise FileNotFoundError(
            f"Input parquet file not found: {parquet_path}. "
            f"Ensure input '{input_obj.name}' was executed before validation."
        )

    # Read parquet file
    logger.debug(f"Loading input options from {parquet_path}")
    df = pl.read_parquet(parquet_path)

    # Extract values from 'option' column
    if "option" not in df.columns:
        raise ValueError(
            f"Invalid input parquet structure for '{input_obj.name}': "
            f"missing 'option' column. Found columns: {df.columns}"
        )

    # Convert to list of strings
    options = df["option"].to_list()

    # Convert to strings (handling various types)
    options = [str(opt) for opt in options]

    logger.debug(f"Loaded {len(options)} options for input '{input_obj.name}'")

    return options


def inject_input_values(query: str, input_values: Dict[str, str]) -> str:
    """
    Inject input values into SQL query AS-IS (no quoting or formatting).

    Replaces ${input_name} placeholders with the corresponding values
    from input_values dict. Values are injected exactly as provided,
    preserving any quotes or formatting.

    Args:
        query: SQL query with ${input_name} placeholders
        input_values: Dict mapping input names to values

    Returns:
        Query with placeholders replaced by values

    Example:
        >>> query = "SELECT * FROM products WHERE category = ${category}"
        >>> values = {"category": "electronics"}
        >>> inject_input_values(query, values)
        "SELECT * FROM products WHERE category = electronics"

    Note:
        Values are injected AS-IS to match frontend behavior exactly.
        If a value is "electronics" (no quotes), it's injected without quotes.
        If a value is "'electronics'" (with quotes), it's injected with quotes.
    """

    def replace_placeholder(match):
        input_name = match.group(1)
        # Return the value if present, otherwise keep placeholder
        return input_values.get(input_name, match.group(0))

    return re.sub(INPUT_PLACEHOLDER_PATTERN, replace_placeholder, query)


def generate_input_combinations(inputs: Dict[str, List[str]]) -> List[Dict[str, str]]:
    """
    Generate all combinations of input values, sampling if necessary.

    Creates the Cartesian product of all input options. If the total
    number of combinations exceeds MAX_COMBINATIONS (96), randomly
    samples exactly MAX_COMBINATIONS combinations.

    Args:
        inputs: Dict mapping input names to lists of possible values

    Returns:
        List of dicts, each representing one combination of input values

    Example:
        >>> inputs = {
        ...     "category": ["electronics", "books"],
        ...     "region": ["east", "west"]
        ... }
        >>> combos = generate_input_combinations(inputs)
        >>> len(combos)
        4
        >>> combos[0]
        {'category': "electronics", 'region': "east"}

    Note:
        - If any input has no options, returns empty list
        - Sampling is deterministic with fixed seed for reproducibility
    """
    logger = Logger.instance()

    # Handle empty inputs
    if not inputs:
        return []

    # Check if any input has no options
    for input_name, options in inputs.items():
        if not options:
            logger.debug(f"Input '{input_name}' has no options, returning empty combinations")
            return []

    # Get input names and their option lists
    input_names = list(inputs.keys())
    option_lists = [inputs[name] for name in input_names]

    # Calculate total combinations
    total_combinations = 1
    for options in option_lists:
        total_combinations *= len(options)

    logger.debug(f"Total possible combinations: {total_combinations}")

    # Generate all combinations
    if total_combinations <= MAX_COMBINATIONS:
        # Generate all combinations
        logger.debug("Generating all combinations")
        combinations = []
        for combo_values in product(*option_lists):
            combo_dict = {name: value for name, value in zip(input_names, combo_values)}
            combinations.append(combo_dict)
    else:
        # Large space: sample without materializing all combinations
        # This avoids OOM for very large combination spaces
        logger.debug(f"Sampling {MAX_COMBINATIONS} combinations from {total_combinations}")

        # Use fixed seed for reproducibility
        random.seed(42)

        # Generate MAX_COMBINATIONS unique random indices in the product space
        sampled_indices = set()
        while len(sampled_indices) < MAX_COMBINATIONS:
            sampled_indices.add(random.randint(0, total_combinations - 1))

        # Convert indices to combinations using modular arithmetic
        # This avoids materializing the full Cartesian product
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

    logger.debug(f"Generated {len(combinations)} combinations for validation")
    return combinations


def validate_insight_with_inputs(
    insight: Insight, query: str, dag: ProjectDag, output_dir: str, dialect: str = "duckdb"
) -> None:
    """
    Validate insight query with all combinations of input values.

    This is the main validation function that:
    1. Finds all input placeholders in the query
    2. Loads options for each input from parquet files
    3. Generates combinations of input values (sampling if >96)
    4. Validates each query variant with SQLGlot
    5. Raises SqlValidationError if any variant fails

    Args:
        insight: Insight object being validated
        query: SQL query with ${input_name} placeholders
        dag: Project DAG for looking up inputs
        output_dir: Output directory containing inputs/ folder
        dialect: SQLGlot dialect (default: "duckdb")

    Raises:
        ValueError: If called with query that has no input placeholders (programming error)
        SqlValidationError: If any query variant fails SQLGlot validation
        FileNotFoundError: If input parquet files are missing

    Example:
        >>> validate_insight_with_inputs(
        ...     insight=insight_obj,
        ...     query="SELECT * FROM products WHERE category = ${category_input}",
        ...     dag=project.dag(),
        ...     output_dir="/tmp/visivo",
        ...     dialect="duckdb"
        ... )
        # If validation passes, returns None
        # If validation fails, raises SqlValidationError with details
    """
    logger = Logger.instance()

    # CRITICAL: Check if query has input placeholders
    # This function should only be called when placeholders exist
    placeholders = re.findall(INPUT_PLACEHOLDER_PATTERN, query)
    if not placeholders:
        raise ValueError(
            f"Programming error: validate_insight_with_inputs() called for insight "
            f"'{insight.name}' with query that has NO input placeholders. "
            f"This function should only be called when input placeholders exist in the query."
        )

    logger.debug(
        f"Validating insight '{insight.name}' with {len(placeholders)} input placeholders: {placeholders}"
    )

    # Get all input descendants from insight
    input_descendants = all_descendants_of_type(type=Input, dag=dag, from_node=insight)

    # Build mapping of input names to their option values
    inputs_dict = {}
    for input_obj in input_descendants:
        # Only load options for inputs that are actually used in this query
        if input_obj.name in placeholders:
            try:
                options = get_input_options(input_obj, output_dir)
                inputs_dict[input_obj.name] = options
                logger.debug(
                    f"Loaded {len(options)} options for input '{input_obj.name}' "
                    f"(first 3: {options[:3]})"
                )
            except Exception as e:
                raise ValueError(
                    f"Failed to load options for input '{input_obj.name}' "
                    f"used in insight '{insight.name}': {e}"
                ) from e

    # Verify we found all referenced inputs
    missing_inputs = set(placeholders) - set(inputs_dict.keys())
    if missing_inputs:
        raise ValueError(
            f"Insight '{insight.name}' references inputs {missing_inputs} "
            f"but they are not descendants in the DAG. "
            f"Available inputs: {[i.name for i in input_descendants]}"
        )

    # Generate combinations of input values
    combinations = generate_input_combinations(inputs_dict)

    if not combinations:
        logger.debug(
            f"No combinations to validate for insight '{insight.name}' "
            f"(one or more inputs has no options)"
        )
        return

    logger.info(
        f"Validating insight '{insight.name}' with {len(combinations)} input combinations..."
    )

    # Validate each combination
    errors = []
    for i, combo in enumerate(combinations):
        # Inject values into query
        query_with_values = inject_input_values(query, combo)

        # Create context for error messages
        context = {
            "combination_number": f"{i + 1}/{len(combinations)}",
            "input_values": combo,
        }

        try:
            # Validate with SQLGlot (raises SqlValidationError if invalid)
            validate_query(
                query_sql=query_with_values,
                dialect=dialect,
                insight_name=insight.name,
                query_type=f"post_query (combination {i + 1}/{len(combinations)})",
                context=context,
                raise_on_error=True,
            )
        except Exception as e:
            # Collect errors but continue checking other combinations
            errors.append(
                {
                    "combination": combo,
                    "query": query_with_values,
                    "error": str(e),
                }
            )

            # For now, fail fast on first error
            # (could be changed to collect all errors if needed)
            raise

    if errors:
        # Format error message with details
        error_msg = (
            f"SQL validation failed for insight '{insight.name}' with {len(errors)} "
            f"input combination(s):\n\n"
        )
        for err in errors[:3]:  # Show first 3 errors
            error_msg += f"Input values: {err['combination']}\n"
            error_msg += f"Error: {err['error']}\n\n"

        if len(errors) > 3:
            error_msg += f"... and {len(errors) - 3} more errors"

        raise ValueError(error_msg)

    logger.info(
        f"✓ Validation passed for insight '{insight.name}' "
        f"({len(combinations)} combinations tested)"
    )
