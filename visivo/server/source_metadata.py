from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.logger.logger import Logger
from sqlalchemy import text
from typing import Optional, Tuple, Any, List


# Helper functions to reduce duplication


def _find_source(sources: List[Any], source_name: str) -> Optional[SqlalchemySource]:
    """Find a SqlalchemySource by name."""
    for src in sources:
        if isinstance(src, SqlalchemySource) and src.name == source_name:
            return src
    return None


def _get_engine_with_read_only(src: SqlalchemySource):
    """Get engine with read_only parameter if supported."""
    if hasattr(src, "get_engine") and "read_only" in src.get_engine.__code__.co_varnames:
        return src.get_engine(read_only=True)
    else:
        return src.get_engine()


def _switch_database_context(conn, engine, database_name: str, src_database: str):
    """Switch database context if needed for MySQL/Snowflake."""
    from sqlalchemy import inspect

    dialect = engine.dialect.name
    if dialect.startswith(("mysql", "snowflake")) and database_name != src_database:
        conn.execute(text(f"USE {database_name}"))
        return inspect(engine)  # Return new inspector after context switch
    return None


def _build_error_response(source_name: str, error: Exception, **kwargs) -> dict:
    """Build standardized error response."""
    response = {
        "source": source_name,
        "error": str(error),
    }
    response.update(kwargs)
    return response


def _source_not_found_error(source_name: str) -> Tuple[dict, int]:
    """Standard response for source not found."""
    return {"error": f"Source '{source_name}' not found"}, 404


# Main functions refactored


def check_source_connection(sources, source_name):
    """Test connection to a specific source."""
    src = _find_source(sources, source_name)
    if not src:
        return _source_not_found_error(source_name)

    try:
        Logger.instance().info(f"Testing connection for source: {source_name}")
        engine = _get_engine_with_read_only(src)

        # Test connection with a simple query - all dialects support SELECT 1
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        return {"source": source_name, "status": "connected"}

    except Exception as e:
        Logger.instance().debug(f"Connection test failed for {source_name}: {e}")
        return {"source": source_name, "status": "connection_failed", "error": str(e)}


def get_source_databases(sources, source_name):
    """Return list of databases for a specific source."""
    src = _find_source(sources, source_name)
    if not src:
        return _source_not_found_error(source_name)

    try:
        Logger.instance().info(f"Fetching databases for source: {source_name}")
        databases = src.list_databases()
        return {
            "source": source_name,
            "databases": [{"name": db} for db in databases],
            "status": "connected",
        }
    except Exception as e:
        Logger.instance().debug(f"Error fetching databases for {source_name}: {e}")
        return {
            "source": source_name,
            "databases": [],
            "status": "connection_failed",
            "error": str(e),
        }


def get_database_schemas(sources, source_name, database_name):
    """Return list of schemas for a specific database."""
    src = _find_source(sources, source_name)
    if not src:
        return _source_not_found_error(source_name)

    try:
        Logger.instance().info(f"Fetching schemas for {source_name}.{database_name}")
        from sqlalchemy import inspect

        engine = _get_engine_with_read_only(src)
        inspector = inspect(engine)

        # Switch database context if needed
        with engine.connect() as conn:
            new_inspector = _switch_database_context(conn, engine, database_name, src.database)
            if new_inspector:
                inspector = new_inspector

            # Get schemas
            try:
                schemas = inspector.get_schema_names()
                return {
                    "source": source_name,
                    "database": database_name,
                    "schemas": [{"name": s} for s in schemas] if schemas else None,
                    "has_schemas": bool(schemas),
                }
            except Exception:
                # Database doesn't support schemas
                return {
                    "source": source_name,
                    "database": database_name,
                    "schemas": None,
                    "has_schemas": False,
                }

    except Exception as e:
        Logger.instance().debug(f"Error fetching schemas for {source_name}.{database_name}: {e}")
        return _build_error_response(source_name, e, database=database_name), 500


def get_schema_tables(sources, source_name, database_name, schema_name=None):
    """Return list of tables for a specific database/schema."""
    src = _find_source(sources, source_name)
    if not src:
        return _source_not_found_error(source_name)

    try:
        Logger.instance().info(
            f"Fetching tables for {source_name}.{database_name}.{schema_name or 'default'}"
        )
        from sqlalchemy import inspect

        engine = _get_engine_with_read_only(src)
        inspector = inspect(engine)

        # Switch database context if needed
        with engine.connect() as conn:
            new_inspector = _switch_database_context(conn, engine, database_name, src.database)
            if new_inspector:
                inspector = new_inspector

            # Get tables
            tables = inspector.get_table_names(schema=schema_name)
            return {
                "source": source_name,
                "database": database_name,
                "schema": schema_name,
                "tables": [{"name": t} for t in tables],
            }

    except Exception as e:
        Logger.instance().debug(f"Error fetching tables: {e}")
        return (
            _build_error_response(source_name, e, database=database_name, schema=schema_name),
            500,
        )


def get_table_columns(sources, source_name, database_name, table_name, schema_name=None):
    """Return list of columns for a specific table."""
    src = _find_source(sources, source_name)
    if not src:
        return _source_not_found_error(source_name)

    try:
        Logger.instance().info(
            f"Fetching columns for {source_name}.{database_name}.{schema_name or 'default'}.{table_name}"
        )
        from sqlalchemy import inspect

        engine = _get_engine_with_read_only(src)
        inspector = inspect(engine)

        # Switch database context if needed
        with engine.connect() as conn:
            new_inspector = _switch_database_context(conn, engine, database_name, src.database)
            if new_inspector:
                inspector = new_inspector

            # Get columns
            columns = inspector.get_columns(table_name, schema=schema_name)
            return {
                "source": source_name,
                "database": database_name,
                "schema": schema_name,
                "table": table_name,
                "columns": [{"name": c["name"], "type": str(c["type"])} for c in columns],
            }

    except Exception as e:
        Logger.instance().debug(f"Error fetching columns: {e}")
        return (
            _build_error_response(
                source_name, e, database=database_name, schema=schema_name, table=table_name
            ),
            500,
        )


def gather_source_metadata(sources):
    """Return metadata for all provided sources."""
    data = {"sources": []}
    for src in sources:
        if isinstance(src, SqlalchemySource):
            try:
                Logger.instance().info(f"Attempting introspection for source: {src.name}")
                metadata = src.introspect()

                # Check if introspection returned an error result
                if "error" in metadata:
                    Logger.instance().debug(
                        f"Error during introspection for {src.name}: {metadata['error']}"
                    )
                    failed_metadata = {
                        "name": src.name,
                        "type": src.type,
                        "status": "connection_failed",
                        "error": metadata["error"],
                        "databases": [],
                    }
                    data["sources"].append(failed_metadata)
                else:
                    metadata["status"] = "connected"
                    data["sources"].append(metadata)
                    Logger.instance().info(f"Successfully introspected source: {src.name}")

            except Exception as e:
                Logger.instance().debug(f"Error during introspection for {src.name}: {e}")
                # Include failed source with error status
                failed_metadata = {
                    "name": src.name,
                    "type": src.type,
                    "status": "connection_failed",
                    "error": str(e),
                    "databases": [],
                }
                data["sources"].append(failed_metadata)
    return data
