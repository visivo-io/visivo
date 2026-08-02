from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.source import Source
from visivo.logger.logger import Logger
from sqlalchemy import text
from typing import Optional, Tuple, Any, List, Dict
from visivo.models.sources.fields import SourceField
from pydantic import ValidationError, TypeAdapter
import json


def _test_source_connection(source: Source, source_name: str) -> Dict[str, Any]:
    """Common logic for testing a source connection."""
    try:
        Logger.instance().info(f"Testing connection for source: {source_name}")

        try:
            source.read_sql("SELECT 1 as test_column LIMIT 1")
        except AttributeError:
            with source.connect() as conn:
                pass

        Logger.instance().info(f"Connection test successful for {source_name}")
        return {"source": source_name, "status": "connected"}

    except Exception as e:
        Logger.instance().debug(f"Connection test failed for {source_name}: {e}")
        return {"source": source_name, "status": "connection_failed", "error": str(e)}


def validate_source_from_config(source_config: Dict[str, Any]) -> Dict[str, Any]:
    """Test a source connection from configuration using Pydantic models."""
    try:
        source_name = source_config.get("name", "test_source")

        # Use Pydantic discriminated union to create the correct source model
        Logger.instance().info(f"Creating source from config for connection test: {source_name}")

        # Parse the config using the discriminated union with TypeAdapter
        source_adapter = TypeAdapter(SourceField)
        source = source_adapter.validate_python(source_config)

        if not isinstance(source, Source):
            return {
                "status": "connection_failed",
                "error": "Source type does not support connection testing",
            }

        # Use common connection testing logic
        result = _test_source_connection(source, source_name)
        return result

    except ValidationError as e:
        Logger.instance().debug(f"Source configuration validation failed: {e}")
        first_error = e.errors()[0]
        return {
            "status": "connection_failed",
            "error": f"Invalid source configuration: {str(first_error['loc'])}: {str(first_error['msg'])}",
        }
    except Exception as e:
        Logger.instance().debug(f"Connection test failed: {e}")
        return {"status": "connection_failed", "error": str(e)}
