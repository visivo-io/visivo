"""Common utility functions for jobs."""

from typing import Any, Optional
from visivo.models.models.sql_model import SqlModel
from visivo.models.dag import all_descendants_of_type
from visivo.models.sources.source import Source
from visivo.models.base.context_string import ContextString


def get_source_for_model(model: Any, dag: Any, output_dir: str) -> Optional[Source]:
    """
    Get the appropriate source for a model.

    Uses the model's own source when it has one, resolving ref and context strings
    through the DAG, and otherwise falls back to the source the DAG ties it to.

    Args:
        model: The model to get the source for
        dag: The project DAG
        output_dir: Output directory for temporary files

    Returns:
        The source for the model, or None if not found
    """
    if isinstance(model, SqlModel):
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
