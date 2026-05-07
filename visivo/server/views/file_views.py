import os
import threading
from flask import jsonify, send_file
from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash


def register_file_views(app, output_dir):
    # Per-run cache: {run_id: {hash: parquet_filename}}. Lazy-built on first
    # request for a run; refreshed on a cache-miss before returning 404 so a
    # freshly-written parquet is served without restarting the server.
    _cache = {}
    _lock = threading.Lock()

    def _files_dir(run_id):
        return os.path.join(output_dir, run_id, "files")

    def _build_cache(run_id):
        mapping = {}
        files_dir = _files_dir(run_id)
        if os.path.isdir(files_dir):
            for entry in os.listdir(files_dir):
                if entry.endswith(".parquet"):
                    stem = entry[: -len(".parquet")]
                    mapping[alpha_hash(stem)] = entry
        return mapping

    def _resolve_filename(hash_value, run_id):
        with _lock:
            mapping = _cache.get(run_id)
            if mapping is None or hash_value not in mapping:
                mapping = _build_cache(run_id)
                _cache[run_id] = mapping
            return mapping.get(hash_value)

    @app.route("/api/files/<hash>/<run_id>/")
    def serve_file_data_by_hash_with_run(hash, run_id):
        """Serve a parquet by hash, with a fallback that hashes on-disk stems.

        Resolution order:
          1. Direct match: ``<run_id>/files/<hash>.parquet`` (legacy path used
             pre-1.0.82 when parquets were written with hash filenames).
          2. Hash-of-stem fallback: scan the run's files dir, return the
             parquet whose stem hashes to ``<hash>``. This is the post-1.0.82
             path — parquets are written under their clean model name while
             the frontend still requests ``alpha_hash(model_name)``.
        """
        try:
            data_file = os.path.join(output_dir, run_id, "files", f"{hash}.parquet")
            if os.path.exists(data_file):
                return send_file(data_file)

            filename = _resolve_filename(hash, run_id)
            if filename:
                resolved = os.path.join(output_dir, run_id, "files", filename)
                if os.path.exists(resolved):
                    return send_file(resolved)

            return (
                jsonify({"error": f"Data file not found for hash: {hash} in run: {run_id}"}),
                404,
            )
        except Exception as e:
            Logger.instance().error(f"Error serving data file by hash: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/files/<hash>/")
    def serve_file_data_by_hash(hash):
        """API endpoint to serve data file by hash (defaults to main run for backward compatibility)"""
        return serve_file_data_by_hash_with_run(hash, "main")
