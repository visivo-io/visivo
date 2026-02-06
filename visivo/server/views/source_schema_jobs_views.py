"""
Source schema jobs views - endpoints for reading cached source schemas
with on-demand generation fallback.

API Design follows the pattern from insight_views.py:
- POST /api/source-schema-jobs/ with body {"config": {"source_name": "..."}, "run": true}
- GET /api/source-schema-jobs/<job_id>/ for job status
- GET /api/source-schema-jobs/ for listing sources
- GET /api/source-schema-jobs/<source_name>/schema/ for reading cached schema
"""

import threading
from flask import jsonify, request

from visivo.constants import DEFAULT_RUN_ID
from visivo.logger.logger import Logger
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.server.managers.preview_run_manager import PreviewRunManager, RunStatus
from visivo.server.jobs.source_schema_job_executor import execute_source_schema_job


def _load_schema_with_fallback(source_name: str, output_dir: str):
    """
    Load schema data, trying main run_id first, then preview.

    Args:
        source_name: Name of the source
        output_dir: Output directory where schemas are stored

    Returns:
        Tuple of (schema_data, run_id) or (None, None) if not found
    """
    schema_data = SchemaAggregator.load_source_schema(
        source_name, output_dir, run_id=DEFAULT_RUN_ID
    )
    if schema_data is not None:
        return schema_data, DEFAULT_RUN_ID

    preview_run_id = f"preview-{source_name}"
    schema_data = SchemaAggregator.load_source_schema(
        source_name, output_dir, run_id=preview_run_id
    )
    if schema_data is not None:
        return schema_data, preview_run_id

    return None, None


def _is_valid_job_id(job_id: str) -> bool:
    """Check if a string looks like a job ID (UUID format) vs a source name."""
    import re

    uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    return bool(re.match(uuid_pattern, job_id, re.IGNORECASE))


def register_source_schema_jobs_views(app, flask_app, output_dir):
    """Register source schema job endpoints."""

    @app.route("/api/source-schema-jobs/", methods=["GET"])
    def list_source_schema_jobs():
        """
        List all sources with cached schema availability.

        Returns:
            JSON array of source objects with schema metadata:
            - source_name: name of the source
            - source_type: type of the source (postgresql, mysql, etc.)
            - has_cached_schema: whether a cached schema exists
            - generated_at: timestamp of schema generation (if cached)
            - total_tables: number of tables (if cached)
            - total_columns: number of columns (if cached)
        """
        try:
            sources = []

            project_sources = flask_app.project.sources or []

            main_schemas = SchemaAggregator.list_stored_schemas(output_dir, run_id=DEFAULT_RUN_ID)
            main_schema_map = {s["source_name"]: s for s in main_schemas}

            for source in project_sources:
                cached = main_schema_map.get(source.name)
                if cached is None:
                    preview_run_id = f"preview-{source.name}"
                    preview_schemas = SchemaAggregator.list_stored_schemas(
                        output_dir, run_id=preview_run_id
                    )
                    for s in preview_schemas:
                        if s["source_name"] == source.name:
                            cached = s
                            break

                source_info = {
                    "source_name": source.name,
                    "source_type": source.type,
                    "has_cached_schema": cached is not None,
                }

                if cached is not None:
                    source_info["generated_at"] = cached.get("generated_at")
                    source_info["total_tables"] = cached.get("total_tables", 0)
                    source_info["total_columns"] = cached.get("total_columns", 0)

                sources.append(source_info)

            return jsonify(sources)

        except Exception as e:
            Logger.instance().error(f"Error listing source schema jobs: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/source-schema-jobs/", methods=["POST"])
    def run_source_schema_job():
        """
        Trigger on-demand schema generation for a source.

        POST body:
            {
                "config": {"source_name": "..."},
                "run": true
            }

        Returns:
            JSON with run_instance_id for polling status (202 Accepted)
        """
        try:
            Logger.instance().info("Received POST to /api/source-schema-jobs/")
            data = request.get_json()
            Logger.instance().info(f"Request data parsed: {bool(data)}")

            if not data:
                return jsonify({"message": "Request body is required"}), 400

            if not data.get("run"):
                return jsonify({"message": "run parameter must be true to execute"}), 400

            config = data.get("config")
            if config is None:
                return jsonify({"message": "config field is required"}), 400

            source_name = config.get("source_name")
            if not source_name:
                return jsonify({"message": "config.source_name is required"}), 400

            Logger.instance().info(f"Processing schema generation for source: {source_name}")

            source = flask_app.project.find_source(source_name)
            if source is None:
                return (
                    jsonify({"message": f"Source '{source_name}' not found in project"}),
                    404,
                )

            config["source_type"] = source.type

            run_manager = PreviewRunManager.instance()
            existing_run_id = run_manager.find_existing_run(config, object_type="source_schema")

            if existing_run_id:
                Logger.instance().info(
                    f"Returning existing schema generation run {existing_run_id}"
                )
                return jsonify({"run_instance_id": existing_run_id}), 202

            job_id = run_manager.create_run(config, object_type="source_schema")
            Logger.instance().info(f"Created schema generation run with job_id: {job_id}")

            thread = threading.Thread(
                target=execute_source_schema_job,
                args=(job_id, config, flask_app, output_dir, run_manager),
                daemon=True,
            )
            thread.start()

            Logger.instance().info(f"Started schema generation job {job_id} for {source_name}")
            return jsonify({"run_instance_id": job_id}), 202

        except Exception as e:
            Logger.instance().error(f"Error creating schema generation job: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/source-schema-jobs/<identifier>/", methods=["GET"])
    def get_source_schema_or_job_status(identifier):
        """
        Get cached schema for a source OR job status.

        This endpoint serves dual purposes:
        - If identifier is a UUID (job_id): returns job status
        - If identifier is a source name: returns cached schema

        Args:
            identifier: Either a job_id (UUID) or source_name

        Returns:
            JSON schema data, job status, or 404
        """
        try:
            if _is_valid_job_id(identifier):
                return _get_job_status(identifier)
            else:
                return _get_source_schema(identifier)
        except Exception as e:
            Logger.instance().error(f"Error in get_source_schema_or_job_status: {str(e)}")
            return jsonify({"message": str(e)}), 500

    def _get_job_status(job_id):
        """Get status of a schema generation job."""
        Logger.instance().info(f"GET /api/source-schema-jobs/{job_id}/ - fetching job status")
        run_manager = PreviewRunManager.instance()
        run = run_manager.get_run(job_id)

        if not run:
            Logger.instance().info(f"Schema generation job {job_id} not found")
            return jsonify({"message": f"Job {job_id} not found"}), 404

        response = run.to_dict()

        if run.status == RunStatus.COMPLETED:
            config = run.config or {}
            source_name = config.get("source_name")
            if source_name:
                schema_data, _ = _load_schema_with_fallback(source_name, output_dir)
                if schema_data:
                    response["result"] = {
                        "source_name": source_name,
                        "total_tables": schema_data.get("metadata", {}).get("total_tables", 0),
                        "total_columns": schema_data.get("metadata", {}).get("total_columns", 0),
                        "generated_at": schema_data.get("generated_at"),
                    }

        Logger.instance().info(f"Returning job status: {run.status}")
        return jsonify(response)

    def _get_source_schema(source_name):
        """Get cached schema for a source."""
        schema_data, _ = _load_schema_with_fallback(source_name, output_dir)

        if schema_data is None:
            Logger.instance().info(f"Schema not found for source: {source_name}")
            return (
                jsonify(
                    {
                        "message": f"Schema not found for source '{source_name}'. "
                        "Use POST /api/source-schema-jobs/ with config.source_name to generate."
                    }
                ),
                404,
            )

        return jsonify(schema_data)

    @app.route("/api/source-schema-jobs/<source_name>/tables/", methods=["GET"])
    def list_source_tables(source_name):
        """
        List tables in a cached source schema.

        Args:
            source_name: Name of the source

        Query params:
            search: Optional search string to filter table names

        Returns:
            JSON array of table objects with metadata
        """
        try:
            schema_data, _ = _load_schema_with_fallback(source_name, output_dir)

            if schema_data is None:
                return (
                    jsonify({"message": f"Schema not found for source '{source_name}'"}),
                    404,
                )

            search = request.args.get("search", "").lower()
            tables = []

            for table_name, table_info in schema_data.get("tables", {}).items():
                if search and search not in table_name.lower():
                    continue

                tables.append(
                    {
                        "name": table_name,
                        "column_count": len(table_info.get("columns", {})),
                        "metadata": table_info.get("metadata", {}),
                    }
                )

            tables.sort(key=lambda t: t["name"])

            return jsonify(tables)

        except Exception as e:
            Logger.instance().error(f"Error listing tables for source {source_name}: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route(
        "/api/source-schema-jobs/<source_name>/tables/<table_name>/columns/", methods=["GET"]
    )
    def list_source_schema_table_columns(source_name, table_name):
        """
        List columns for a table in a cached source schema.

        Args:
            source_name: Name of the source
            table_name: Name of the table

        Query params:
            search: Optional search string to filter column names

        Returns:
            JSON array of column objects with type and nullable info
        """
        try:
            schema_data, _ = _load_schema_with_fallback(source_name, output_dir)

            if schema_data is None:
                return (
                    jsonify({"message": f"Schema not found for source '{source_name}'"}),
                    404,
                )

            tables = schema_data.get("tables", {})

            if table_name not in tables:
                return (
                    jsonify(
                        {"message": f"Table '{table_name}' not found in source '{source_name}'"}
                    ),
                    404,
                )

            search = request.args.get("search", "").lower()
            columns = []

            for col_name, col_info in tables[table_name].get("columns", {}).items():
                if search and search not in col_name.lower():
                    continue

                columns.append(
                    {
                        "name": col_name,
                        "type": col_info.get("type", "unknown"),
                        "nullable": col_info.get("nullable", True),
                    }
                )

            columns.sort(key=lambda c: c["name"])

            return jsonify(columns)

        except Exception as e:
            Logger.instance().error(
                f"Error listing columns for {source_name}.{table_name}: {str(e)}"
            )
            return jsonify({"message": str(e)}), 500
