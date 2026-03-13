import os
import glob
from flask import jsonify
from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash


def register_model_data_views(app, flask_app, output_dir):

    @app.route("/api/models/<model_name>/data/")
    def get_model_data(model_name):
        """Check if pre-computed parquet data exists for a model and return it.

        Searches across all run directories for a parquet file matching the
        model's name hash. Returns the data as JSON if found.
        """
        try:
            name_hash = alpha_hash(model_name)
            pattern = os.path.join(output_dir, "*", "files", f"{name_hash}.parquet")
            matches = glob.glob(pattern)

            if not matches:
                return jsonify({"available": False}), 200

            parquet_path = sorted(matches, key=os.path.getmtime, reverse=True)[0]

            try:
                import polars as pl

                df = pl.read_parquet(parquet_path)
                columns = df.columns
                rows = df.to_dicts()
                row_count = len(rows)

                MAX_ROWS = 10000
                if row_count > MAX_ROWS:
                    rows = rows[:MAX_ROWS]

                return (
                    jsonify(
                        {
                            "available": True,
                            "columns": columns,
                            "rows": rows,
                            "row_count": row_count,
                            "truncated": row_count > MAX_ROWS,
                        }
                    ),
                    200,
                )
            except Exception as e:
                Logger.instance().debug(f"Failed to read parquet for model '{model_name}': {e}")
                return jsonify({"available": False}), 200

        except Exception as e:
            Logger.instance().error(f"Error checking model data for '{model_name}': {str(e)}")
            return jsonify({"error": str(e)}), 500
