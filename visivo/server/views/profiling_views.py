"""Profiling API endpoints for model parquet files."""

from flask import jsonify, request
from visivo.logger.logger import Logger
from visivo.server.services.profiling_service import ProfilingService


def register_profiling_views(app, flask_app, output_dir):
    """Register profiling-related API endpoints."""

    # Initialize the profiling service
    profiling_service = ProfilingService(output_dir)

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
