"""Common utility functions for jobs."""

from typing import Any, Optional
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.dag import all_descendants_of_type
from visivo.models.sources.source import Source
from visivo.models.base.context_string import ContextString


def get_source_for_model(model: Any, dag: Any, output_dir: str) -> Optional[Source]:
    """
    Get the appropriate source for a model.

    This handles the different ways sources are obtained for different model types:
    - CsvScriptModel: Creates a DuckDB source on the fly
    - LocalMergeModel: Creates a DuckDB source using the DAG
    - SqlModel: Uses the model's source or finds it in the DAG

    Args:
        model: The model to get the source for
        dag: The project DAG
        output_dir: Output directory for temporary files

    Returns:
        The source for the model, or None if not found
    """
    if isinstance(model, CsvScriptModel):
        return model.get_duckdb_source(output_dir=output_dir)
    elif isinstance(model, LocalMergeModel):
        return model.get_duckdb_source(output_dir=output_dir, dag=dag)
    elif isinstance(model, SqlModel):
        # Try model.source first, then look in DAG
        if model.source:
            # Check if source is a ContextString that needs resolution
            if isinstance(model.source, ContextString):
                # Resolve the ContextString to get the actual Source object
                try:
                    return model.source.get_item(dag)
                except (ValueError, Exception):
                    # If resolution fails, try to find source in DAG
                    try:
                        return all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
                    except (IndexError, Exception):
                        return None
            # Check if source is a string reference (like "ref(source_name)")
            elif isinstance(model.source, str):
                # Source is a ref string, need to find it through the DAG
                try:
                    return all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
                except (IndexError, Exception):
                    return None
            else:
                # Source is an actual Source object
                return model.source
        # If no source on model, try to find in DAG
        try:
            return all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
        except (IndexError, Exception):
            return None
    else:
        # For other model types, try to find source in DAG
        try:
            return all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
        except (IndexError, Exception):
            return None
