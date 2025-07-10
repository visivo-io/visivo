from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.logger.logger import Logger


def get_sources_list(sources):
    """Return basic info for all sources without introspection."""
    data = {"sources": []}
    for src in sources:
        if isinstance(src, SqlalchemySource):
            source_info = {
                "name": src.name,
                "type": src.type,
                "database": getattr(src, 'database', None),
                "status": "available"  # We'll update this when they try to connect
            }
            data["sources"].append(source_info)
    return data


def get_source_databases(sources, source_name):
    """Return list of databases for a specific source."""
    for src in sources:
        if isinstance(src, SqlalchemySource) and src.name == source_name:
            try:
                Logger.instance().info(f"Fetching databases for source: {source_name}")
                databases = src.list_databases()
                return {
                    "source": source_name,
                    "databases": [{"name": db} for db in databases],
                    "status": "connected"
                }
            except Exception as e:
                Logger.instance().debug(f"Error fetching databases for {source_name}: {e}")
                return {
                    "source": source_name,
                    "databases": [],
                    "status": "connection_failed",
                    "error": str(e)
                }
    
    return {"error": f"Source '{source_name}' not found"}, 404


def get_database_schemas(sources, source_name, database_name):
    """Return list of schemas for a specific database."""
    for src in sources:
        if isinstance(src, SqlalchemySource) and src.name == source_name:
            try:
                Logger.instance().info(f"Fetching schemas for {source_name}.{database_name}")
                
                # Get engine and inspector
                engine = None
                if hasattr(src, "get_engine") and "read_only" in src.get_engine.__code__.co_varnames:
                    engine = src.get_engine(read_only=True)
                else:
                    engine = src.get_engine()
                
                from sqlalchemy import inspect
                inspector = inspect(engine)
                
                # Switch database context if needed
                dialect = engine.dialect.name
                with engine.connect() as conn:
                    if dialect.startswith(("mysql", "snowflake")) and database_name != src.database:
                        from sqlalchemy import text
                        conn.execute(text(f"USE {database_name}"))
                        inspector = inspect(engine)
                    
                    # Get schemas
                    try:
                        schemas = inspector.get_schema_names()
                        return {
                            "source": source_name,
                            "database": database_name,
                            "schemas": [{"name": s} for s in schemas] if schemas else None,
                            "has_schemas": bool(schemas)
                        }
                    except Exception:
                        # Database doesn't support schemas
                        return {
                            "source": source_name,
                            "database": database_name,
                            "schemas": None,
                            "has_schemas": False
                        }
                        
            except Exception as e:
                Logger.instance().debug(f"Error fetching schemas for {source_name}.{database_name}: {e}")
                return {
                    "source": source_name,
                    "database": database_name,
                    "error": str(e)
                }, 500
    
    return {"error": f"Source '{source_name}' not found"}, 404


def get_schema_tables(sources, source_name, database_name, schema_name=None):
    """Return list of tables for a specific database/schema."""
    for src in sources:
        if isinstance(src, SqlalchemySource) and src.name == source_name:
            try:
                Logger.instance().info(f"Fetching tables for {source_name}.{database_name}.{schema_name or 'default'}")
                
                # Get engine and inspector
                engine = None
                if hasattr(src, "get_engine") and "read_only" in src.get_engine.__code__.co_varnames:
                    engine = src.get_engine(read_only=True)
                else:
                    engine = src.get_engine()
                
                from sqlalchemy import inspect
                inspector = inspect(engine)
                
                # Switch database context if needed
                dialect = engine.dialect.name
                with engine.connect() as conn:
                    if dialect.startswith(("mysql", "snowflake")) and database_name != src.database:
                        from sqlalchemy import text
                        conn.execute(text(f"USE {database_name}"))
                        inspector = inspect(engine)
                    
                    # Get tables
                    tables = inspector.get_table_names(schema=schema_name)
                    return {
                        "source": source_name,
                        "database": database_name,
                        "schema": schema_name,
                        "tables": [{"name": t} for t in tables]
                    }
                        
            except Exception as e:
                Logger.instance().debug(f"Error fetching tables: {e}")
                return {
                    "source": source_name,
                    "database": database_name,
                    "schema": schema_name,
                    "error": str(e)
                }, 500
    
    return {"error": f"Source '{source_name}' not found"}, 404


def get_table_columns(sources, source_name, database_name, table_name, schema_name=None):
    """Return list of columns for a specific table."""
    for src in sources:
        if isinstance(src, SqlalchemySource) and src.name == source_name:
            try:
                Logger.instance().info(f"Fetching columns for {source_name}.{database_name}.{schema_name or 'default'}.{table_name}")
                
                # Get engine and inspector
                engine = None
                if hasattr(src, "get_engine") and "read_only" in src.get_engine.__code__.co_varnames:
                    engine = src.get_engine(read_only=True)
                else:
                    engine = src.get_engine()
                
                from sqlalchemy import inspect
                inspector = inspect(engine)
                
                # Switch database context if needed
                dialect = engine.dialect.name
                with engine.connect() as conn:
                    if dialect.startswith(("mysql", "snowflake")) and database_name != src.database:
                        from sqlalchemy import text
                        conn.execute(text(f"USE {database_name}"))
                        inspector = inspect(engine)
                    
                    # Get columns
                    columns = inspector.get_columns(table_name, schema=schema_name)
                    return {
                        "source": source_name,
                        "database": database_name,
                        "schema": schema_name,
                        "table": table_name,
                        "columns": [{"name": c["name"], "type": str(c["type"])} for c in columns]
                    }
                        
            except Exception as e:
                Logger.instance().debug(f"Error fetching columns: {e}")
                return {
                    "source": source_name,
                    "database": database_name,
                    "schema": schema_name,
                    "table": table_name,
                    "error": str(e)
                }, 500
    
    return {"error": f"Source '{source_name}' not found"}, 404


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
                    Logger.instance().debug(f"Error during introspection for {src.name}: {metadata['error']}")
                    failed_metadata = {
                        "name": src.name,
                        "type": src.type,
                        "status": "connection_failed",
                        "error": metadata["error"],
                        "databases": []
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
                    "databases": []
                }
                data["sources"].append(failed_metadata)
    return data
