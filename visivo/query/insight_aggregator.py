import os
import json
import base64
from decimal import Decimal
from datetime import datetime, date, time
from typing import List, Dict, Any

from visivo.models.tokenized_insight import TokenizedInsight
from visivo.logger.logger import Logger


class InsightAggregator:
    """
    Aggregates insight data into flat JSON structures for client-side processing.

    Unlike the traditional Aggregator which creates cohort-based nested structures,
    InsightAggregator creates flat arrays that are optimized for DuckDB WASM queries
    and client-side interactivity.
    """

    @staticmethod
    def _make_json_serializable(obj):
        """Convert objects to JSON-serializable format (shared with Aggregator)"""
        if isinstance(obj, bytes):
            return base64.b64encode(obj).decode("utf-8")
        elif isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, (datetime, date)):
            return obj.isoformat()
        elif isinstance(obj, time):
            return obj.isoformat()
        elif isinstance(obj, list):
            return [InsightAggregator._make_json_serializable(item) for item in obj]
        elif isinstance(obj, dict):
            return {
                key: InsightAggregator._make_json_serializable(value) for key, value in obj.items()
            }
        elif (
            isinstance(obj, bool)
            or isinstance(obj, int)
            or isinstance(obj, float)
            or isinstance(obj, str)
            or obj is None
        ):
            return obj
        else:
            return str(obj)

    @classmethod
    def aggregate_insight_data(
        cls, data: List[dict], insight_dir: str, tokenized_insight: TokenizedInsight
    ):
        """
        Main entry point for insight data aggregation.

        Args:
            data: Raw SQL query results (list of dictionaries)
            insight_dir: Directory to write insight.json file
            tokenized_insight: Tokenized insight with metadata
        """
        try:
            # Create complete insight JSON with query template and metadata
            insight_json = cls.generate_insight_json(
                flat_data=data, tokenized_insight=tokenized_insight
            )

            # Make result JSON-serializable
            json_safe_result = cls._make_json_serializable(insight_json)

            # Write result to insight.json file
            os.makedirs(insight_dir, exist_ok=True)
            with open(f"{insight_dir}/insight.json", "w") as fp:
                json.dump(json_safe_result, fp, indent=4)

            Logger.instance().debug(f"Generated insight.json for {tokenized_insight.name}")

        except Exception as e:
            Logger.instance().error(f"Failed to aggregate insight data: {e}")
            raise

    @classmethod
    def _normalize_column_names(cls, data: List[dict]) -> List[dict]:
        """Normalize column names by replacing | with . for BigQuery compatibility"""
        normalized_data = []
        for row in data:
            normalized_row = {}
            for key, value in row.items():
                new_key = key.replace("|", ".")
                normalized_row[new_key] = value
            normalized_data.append(normalized_row)
        return normalized_data

    @classmethod
    def generate_flat_structure(
        cls, data: List[dict], tokenized_insight: TokenizedInsight
    ) -> Dict[str, List[Any]]:
        """
        Convert raw query results to flat JSON structure.

        Args:
            data: Normalized query results
            tokenized_insight: Tokenized insight with column metadata

        Returns:
            Dictionary with column names as keys and arrays as values
        """
        if not data:
            return {}

        # Get all unique column names across all rows
        all_columns = set()
        for row in data:
            all_columns.update(row.keys())

        # Initialize flat structure with empty arrays
        flat_data = {col: [] for col in all_columns}

        # Fill arrays with data, using null for missing values
        for row in data:
            for col in all_columns:
                value = row.get(col)
                flat_data[col].append(value)

        # Add split column if we have a split interaction
        if tokenized_insight.split_column:
            cls._add_split_column_data(flat_data, tokenized_insight.split_column, data)

        return flat_data

    @classmethod
    def _add_split_column_data(
        cls, flat_data: Dict[str, List], split_column: str, original_data: List[dict]
    ):
        """
        Add split column information to flat data structure.

        The split column contains the values that would be used to create
        multiple traces on the client side.
        """
        # If split column is already in the data, we're good
        if split_column in flat_data:
            return

        # Otherwise, try to derive it from the original data
        # This handles cases where the split column wasn't explicitly selected
        split_values = []
        for row in original_data:
            # Try to get the split value from the row
            split_value = row.get(split_column, "default")
            split_values.append(split_value)

        flat_data[f"_split_{split_column}"] = split_values

    @classmethod
    def generate_insight_json(
        cls, flat_data: List, tokenized_insight: TokenizedInsight
    ) -> Dict[str, Any]:
        """
        Generate complete insight.json structure with data and metadata.

        Args:
            flat_data: Flat data structure (column -> array)
            tokenized_insight: Tokenized insight with query templates and metadata

        Returns:
            Complete insight JSON structure ready for serialization
        """
        insight_json = {
            "data": flat_data,
            "pre_query": tokenized_insight.pre_query,
            "post_query": tokenized_insight.post_query,
            "interactions": tokenized_insight.interactions,
            "metadata": {
                "name": tokenized_insight.name,
                "source": tokenized_insight.source,
                "source_type": tokenized_insight.source_type,
                "split_column": tokenized_insight.split_column,
                "input_dependencies": tokenized_insight.input_dependencies,
                "requires_groupby": tokenized_insight.requires_groupby,
                "sort_expressions": tokenized_insight.sort_expressions,
                "dynamic_interactions": tokenized_insight.is_dynamic_interactions,
            },
        }

        # Add select and column item mappings for reference
        if tokenized_insight.select_items:
            insight_json["metadata"]["select_items"] = tokenized_insight.select_items

        if tokenized_insight.selects:
            insight_json["metadata"]["selects"] = tokenized_insight.selects

        insight_json["metadata"]["props"] = tokenized_insight.props

        return insight_json

    @classmethod
    def aggregate_from_json_file(
        cls, json_file: str, insight_dir: str, tokenized_insight: TokenizedInsight
    ):
        """
        Aggregate insight data from a JSON file (for compatibility with existing patterns).

        Args:
            json_file: Path to JSON file containing query results
            insight_dir: Directory to write insight.json
            tokenized_insight: Tokenized insight with metadata
        """
        with open(json_file, "r") as f:
            data = json.load(f)

        cls.aggregate_insight_data(data, insight_dir, tokenized_insight)

    @classmethod
    def get_flat_data_summary(cls, flat_data: Dict[str, List]) -> Dict[str, Any]:
        """
        Generate summary statistics for flat data structure (useful for debugging).

        Args:
            flat_data: Flat data structure

        Returns:
            Summary with row count, column info, and data types
        """
        if not flat_data:
            return {"rows": 0, "columns": 0, "column_info": {}}

        # Get row count from first column
        row_count = len(next(iter(flat_data.values())))

        column_info = {}
        for col, values in flat_data.items():
            # Basic stats about each column
            non_null_values = [v for v in values if v is not None]
            column_info[col] = {
                "length": len(values),
                "non_null_count": len(non_null_values),
                "null_count": len(values) - len(non_null_values),
                "data_type": type(non_null_values[0]).__name__ if non_null_values else "unknown",
            }

        return {"rows": row_count, "columns": len(flat_data), "column_info": column_info}
