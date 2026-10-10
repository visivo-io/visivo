"""Profiling API endpoints.

``POST /api/profiles/`` is the one the Explorer and the agent share: a
built model or any SQL on any source in, the unified profile plus its shape
cards out, from the same Python classifier (VIS-1413). The older
``/api/models/<name>/profile/`` and ``/histogram/`` routes stay for models.
"""

from flask import jsonify, request
from visivo.jobs.run_model_data_job import UI_QUERY_TIMEOUT_S, QueryTimeout
from visivo.logger.logger import Logger
from visivo.server.services.profiling_service import (
    DEFAULT_SAMPLE_ROWS,
    MAX_PROFILE_COLUMNS,
    ProfilingService,
)
from visivo.server.source_resolution import find_source


def _column_subset(body):
    columns = body.get("columns")
    if columns is None:
        return None
    if not isinstance(columns, list) or not all(isinstance(c, str) for c in columns):
        raise ValueError("'columns' must be a list of column names")
    if len(columns) > MAX_PROFILE_COLUMNS:
        raise ValueError(f"'columns' may name at most {MAX_PROFILE_COLUMNS} columns")
    return columns


def register_profiling_views(app, flask_app, output_dir):
    """Register profiling-related API endpoints."""

    # Initialize the profiling service
    profiling_service = ProfilingService(output_dir)

    @app.route("/api/profiles/", methods=["POST"])
    def profile_relation():
        """Profile a model or a query and classify its columns.

        Body: ``{"model_name": ...}`` for a built model's parquet, or
        ``{"source_name": ..., "sql": ...}`` for a bounded sample of a query
        (draft sources resolve first). Optional ``columns`` (≤40) and, for a
        query, ``sample_rows``.

        Returns ``{"profile": {...}, "shape_cards": [...]}``.
        """
        body = request.get_json(silent=True) or {}
        try:
            columns = _column_subset(body)
            model_name = body.get("model_name")
            if model_name:
                profile = profiling_service.profile_model(model_name, columns=columns)
            else:
                source_name, sql = body.get("source_name"), body.get("sql")
                if not source_name or not sql:
                    return (
                        jsonify({"error": "Provide 'model_name', or 'source_name' and 'sql'."}),
                        400,
                    )
                source = find_source(flask_app, source_name)
                if source is None:
                    return jsonify({"error": f"Source '{source_name}' not found"}), 404
                sample_rows = int(body.get("sample_rows") or DEFAULT_SAMPLE_ROWS)
                profile = profiling_service.profile_query(
                    source,
                    sql,
                    columns=columns,
                    sample_rows=max(1, min(sample_rows, DEFAULT_SAMPLE_ROWS)),
                    timeout_s=UI_QUERY_TIMEOUT_S,
                )
            return jsonify(
                {"profile": profile, "shape_cards": profiling_service.shape_cards(profile)}
            )
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        except FileNotFoundError as error:
            return jsonify({"error": str(error)}), 404
        except QueryTimeout as error:
            return jsonify({"error": str(error), "error_type": "timeout"}), 504
        except Exception as error:
            Logger.instance().error(f"Error profiling: {error}")
            return jsonify({"error": str(error)}), 500

    @app.route("/api/models/<model_name>/profile/", methods=["GET"])
    def get_model_profile(model_name):
        """
        Get profile statistics for a model's parquet file.

        Query parameters:
            tier: 1 or 2 (default 2)
                - Tier 1: Fast metadata from parquet (< 100ms)
                - Tier 2: Full statistics via DuckDB SUMMARIZE (100ms - 2s)

        Returns:
            JSON with profile data including columns, statistics, and metadata.
            Returns 404 if the parquet file doesn't exist.
        """
        try:
            # Parse tier parameter (default to 2)
            tier_str = request.args.get("tier", "2")
            try:
                tier = int(tier_str)
                if tier not in (1, 2):
                    tier = 2
            except ValueError:
                tier = 2

            # Check if parquet exists
            if not profiling_service.parquet_exists(model_name):
                return (
                    jsonify({"error": f"Parquet file not found for model: {model_name}"}),
                    404,
                )

            # Get profile based on tier
            if tier == 1:
                profile = profiling_service.get_tier1_profile(model_name)
            else:
                profile = profiling_service.get_tier2_profile(model_name)

            return jsonify(profile)

        except FileNotFoundError as e:
            Logger.instance().debug(f"Parquet file not found: {e}")
            return jsonify({"error": str(e)}), 404
        except Exception as e:
            Logger.instance().error(f"Error profiling model: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/models/<model_name>/histogram/<column>/", methods=["GET"])
    def get_model_histogram(model_name, column):
        """
        Get histogram data for a specific column in a model's parquet file.

        Query parameters:
            bins: Number of bins/buckets (default 20, clamped to 5-100)

        Returns:
            JSON with histogram buckets.
            - For numeric columns: bucket ranges with counts
            - For categorical columns: top N values by frequency
            Returns 404 if the parquet file doesn't exist.
        """
        try:
            # Parse bins parameter (default 20, clamped 5-100)
            bins_str = request.args.get("bins", "20")
            try:
                bins = int(bins_str)
                bins = max(5, min(100, bins))
            except ValueError:
                bins = 20

            # Check if parquet exists
            if not profiling_service.parquet_exists(model_name):
                return (
                    jsonify({"error": f"Parquet file not found for model: {model_name}"}),
                    404,
                )

            histogram = profiling_service.get_histogram(model_name, column, bins)
            return jsonify(histogram)

        except FileNotFoundError as e:
            Logger.instance().debug(f"Parquet file not found: {e}")
            return jsonify({"error": str(e)}), 404
        except ValueError as e:
            Logger.instance().debug(f"Invalid column: {e}")
            return jsonify({"error": str(e)}), 404
        except Exception as e:
            Logger.instance().error(f"Error generating histogram: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/models/<model_name>/profile/invalidate/", methods=["POST"])
    def invalidate_model_profile_cache(model_name):
        """
        Invalidate the cached profile for a model.

        Returns:
            JSON with success message.
        """
        try:
            profiling_service.invalidate_cache(model_name)
            return jsonify({"message": f"Cache invalidated for model: {model_name}"})
        except Exception as e:
            Logger.instance().error(f"Error invalidating cache: {str(e)}")
            return jsonify({"error": str(e)}), 500
