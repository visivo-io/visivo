"""Model data service for retrieving and executing model data."""

import os
import time
from typing import Dict, List, Any, Optional

import duckdb
import polars as pl
from visivo.logger.logger import Logger
from visivo.server.managers.model_manager import ModelManager
from visivo.server.managers.source_manager import SourceManager


class ModelDataService:
    """
    Service for retrieving and executing model data.

    Provides functionality to:
    - Get model data from parquet cache or execute on-demand
    - Run model queries and cache results as parquet
    - Get model execution status
    """

    def __init__(self, output_dir: str, model_manager: ModelManager, source_manager: SourceManager):
        """
        Initialize the ModelDataService.

        Args:
            output_dir: Directory for storing parquet cache files
            model_manager: Manager for accessing model objects
            source_manager: Manager for accessing source objects
        """
        self.output_dir = output_dir
        self.model_manager = model_manager
        self.source_manager = source_manager

    def get_parquet_path(self, model_name: str) -> str:
        """
        Get the parquet file path for a model.

        Args:
            model_name: Name of the model

        Returns:
            Full path to the parquet file
        """
        return os.path.join(self.output_dir, f"{model_name}.parquet")

    def parquet_exists(self, model_name: str) -> bool:
        """
        Check if parquet file exists for model.

        Args:
            model_name: Name of the model

        Returns:
            True if parquet file exists
        """
        return os.path.exists(self.get_parquet_path(model_name))

    def _resolve_source(self, model) -> Any:
        """
        Resolve the source for a model.

        Handles both direct source objects and ref() references.

        Args:
            model: The model object

        Returns:
            The resolved source object

        Raises:
            ValueError: If source cannot be resolved
        """
        if not hasattr(model, "source") or model.source is None:
            raise ValueError(f"Model '{model.name}' has no source configured")

        source_ref = model.source

        # If source has read_sql method, it's an actual source object - use directly
        if hasattr(source_ref, "read_sql") and callable(getattr(source_ref, "read_sql")):
            return source_ref

        # If source is a string reference like "ref(source_name)"
        if isinstance(source_ref, str):
            # Extract source name from ref() pattern
            import re

            match = re.match(r"ref\(([^)]+)\)", source_ref)
            if match:
                source_name = match.group(1)
            else:
                source_name = source_ref

            source = self.source_manager.get(source_name)
            if source is None:
                raise ValueError(f"Source '{source_name}' not found for model '{model.name}'")
            return source

        # If source has a name attribute (e.g., it's a ContextString ref object)
        if hasattr(source_ref, "name") and isinstance(source_ref.name, str):
            source_name = source_ref.name
            source = self.source_manager.get(source_name)
            if source is None:
                raise ValueError(f"Source '{source_name}' not found for model '{model.name}'")
            return source

        # Source is an inline source object without read_sql (unlikely but fallback)
        return source_ref

    def get_model_data(self, model_name: str, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """
        Get model data from parquet or execute on-demand.

        If parquet exists, reads directly. Otherwise executes model
        query against source and caches result as parquet.

        Args:
            model_name: Name of the model
            limit: Number of rows to return (default: 100)
            offset: Row offset for pagination (default: 0)

        Returns:
            Dictionary with columns, rows, metadata

        Raises:
            ValueError: If model not found or execution fails
        """
        parquet_path = self.get_parquet_path(model_name)

        if os.path.exists(parquet_path):
            return self._read_from_parquet(model_name, limit, offset)
        else:
            return self._execute_and_cache(model_name, limit, offset)

    def _read_from_parquet(self, model_name: str, limit: int, offset: int) -> Dict[str, Any]:
        """
        Read data from existing parquet file.

        Args:
            model_name: Name of the model
            limit: Number of rows to return
            offset: Row offset for pagination

        Returns:
            Dictionary with columns, rows, and metadata
        """
        parquet_path = self.get_parquet_path(model_name)

        conn = duckdb.connect()

        try:
            # Get total count
            count_result = conn.execute(
                f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
            ).fetchone()
            total_count = count_result[0]

            # Get paginated data
            data_result = conn.execute(
                f"SELECT * FROM read_parquet('{parquet_path}') LIMIT {limit} OFFSET {offset}"
            )

            columns = [desc[0] for desc in data_result.description]
            rows = [dict(zip(columns, row)) for row in data_result.fetchall()]

        finally:
            conn.close()

        return {
            "model_name": model_name,
            "source": "parquet",
            "cached": True,
            "columns": columns,
            "rows": rows,
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
        }

    def _execute_and_cache(self, model_name: str, limit: int, offset: int) -> Dict[str, Any]:
        """
        Execute model query and cache as parquet.

        Args:
            model_name: Name of the model
            limit: Number of rows to return
            offset: Row offset for pagination

        Returns:
            Dictionary with columns, rows, and metadata

        Raises:
            ValueError: If model or source not found
        """
        model = self.model_manager.get(model_name)
        if model is None:
            raise ValueError(f"Model '{model_name}' not found")

        source = self._resolve_source(model)

        # Execute the model SQL
        Logger.instance().info(f"Executing model '{model_name}' on-demand")

        start_time = time.time()

        try:
            result = source.read_sql(model.sql)
        except Exception as e:
            Logger.instance().error(f"Error executing model {model_name}: {e}")
            raise

        execution_time = (time.time() - start_time) * 1000

        # Handle empty result
        if result is None:
            result = []

        # Convert to polars DataFrame and save to parquet
        if result:
            df = pl.DataFrame(result)
        else:
            df = pl.DataFrame()

        parquet_path = self.get_parquet_path(model_name)
        df.write_parquet(parquet_path)

        Logger.instance().info(
            f"Model '{model_name}' executed in {execution_time:.0f}ms, "
            f"{len(result)} rows cached to {parquet_path}"
        )

        # Return paginated result
        total_count = len(result)
        paginated_result = result[offset : offset + limit]

        columns = list(result[0].keys()) if result else []

        return {
            "model_name": model_name,
            "source": "query",
            "cached": True,
            "columns": columns,
            "rows": paginated_result,
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
            "execution_time_ms": execution_time,
        }

    def run_model(self, model_name: str, sql: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute model SQL (possibly modified) and cache result.

        Args:
            model_name: Name of the model
            sql: Optional custom SQL (uses model's SQL if not provided)

        Returns:
            Execution result metadata

        Raises:
            ValueError: If model or source not found
        """
        model = self.model_manager.get(model_name)
        if model is None:
            raise ValueError(f"Model '{model_name}' not found")

        # Use custom SQL or model's SQL
        query_sql = sql if sql is not None else model.sql

        source = self._resolve_source(model)

        # Execute query
        Logger.instance().info(f"Running model '{model_name}'")
        start_time = time.time()

        try:
            result = source.read_sql(query_sql)
        except Exception as e:
            Logger.instance().error(f"Error running model {model_name}: {e}")
            raise

        execution_time = (time.time() - start_time) * 1000

        # Handle empty result
        if result is None:
            result = []

        # Convert to polars DataFrame and save to parquet
        if result:
            df = pl.DataFrame(result)
        else:
            df = pl.DataFrame()

        parquet_path = self.get_parquet_path(model_name)
        df.write_parquet(parquet_path)

        columns = list(result[0].keys()) if result else []
        row_count = len(result)

        Logger.instance().info(
            f"Model '{model_name}' executed in {execution_time:.0f}ms, "
            f"{row_count} rows saved to {parquet_path}"
        )

        # If custom SQL was provided and differs, save to model cache
        sql_modified = sql is not None and sql != model.sql
        if sql_modified:
            try:
                model_config = model.model_dump()
                model_config["sql"] = sql
                self.model_manager.save_from_config(model_config)
                Logger.instance().info(f"Model '{model_name}' SQL updated in cache")
            except Exception as e:
                Logger.instance().warning(f"Could not update model SQL in cache: {e}")

        return {
            "model_name": model_name,
            "status": "success",
            "row_count": row_count,
            "columns": columns,
            "execution_time_ms": execution_time,
            "parquet_path": parquet_path,
            "profile_invalidated": True,
            "sql_modified": sql_modified,
        }

    def get_model_status(self, model_name: str) -> Dict[str, Any]:
        """
        Get the current status of a model.

        Args:
            model_name: Name of the model

        Returns:
            Dictionary with model status information
        """
        model = self.model_manager.get(model_name)
        if model is None:
            return {"exists": False}

        parquet_path = self.get_parquet_path(model_name)
        parquet_exists = os.path.exists(parquet_path)

        status = {
            "exists": True,
            "name": model_name,
            "has_data": parquet_exists,
            "status": "ready" if parquet_exists else "not_run",
        }

        if parquet_exists:
            # Get file modification time
            mtime = os.path.getmtime(parquet_path)
            status["data_updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(mtime))

            # Get row count from parquet metadata using DuckDB
            try:
                conn = duckdb.connect()
                count_result = conn.execute(
                    f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
                ).fetchone()
                status["row_count"] = count_result[0]
                conn.close()
            except Exception as e:
                Logger.instance().warning(f"Could not read parquet row count: {e}")

        return status
