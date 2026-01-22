import json
import os
from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash


def register_input_jobs_views(app, flask_app, output_dir):

    @app.route("/api/input-jobs/", methods=["GET"])
    def get_input_jobs_api():
        """Get input metadata by input names.

        Query params:
            input_names: List of input names to fetch metadata for

        Returns:
            JSON array of input metadata objects, each with:
            - id: input name
            - name: input name
            - files: array of file references with signed_data_file_url converted to API URLs
            - type: single-select or multi-select
            - structure: options or range
            - static_props: static options/range values (null if query-based)
            - display: display configuration
            - warnings: array of warning messages
        """
        try:
            input_names = request.args.getlist("input_names")
            project_id = request.args.get("project_id")

            if not input_names:
                return jsonify({"message": "input_names parameter is required"}), 400

            inputs = []
            missing_inputs = []

            for name in input_names:
                # Use alpha_hash to match backend name_hash() method
                name_hash = alpha_hash(name)
                input_file = os.path.join(output_dir, "inputs", f"{name_hash}.json")

                if not os.path.exists(input_file):
                    Logger.instance().info(f"Input file not found: {input_file}")
                    missing_inputs.append(name)
                    continue

                try:
                    with open(input_file, "r") as f:
                        file_contents = json.load(f)

                    # Start with ID
                    input_data = {"id": name}

                    # Merge file contents
                    input_data.update(file_contents)

                    # Convert file paths to proper API URLs
                    if "files" in input_data:
                        for file_ref in input_data["files"]:
                            if "signed_data_file_url" in file_ref:
                                file_path = file_ref["signed_data_file_url"]
                                # Convert absolute paths to API URLs
                                # file_path format: {output_dir}/files/{hash}.parquet
                                # Extract hash (filename without extension)
                                filename = os.path.basename(file_path)
                                file_hash = os.path.splitext(filename)[
                                    0
                                ]  # Remove .parquet extension
                                file_ref["signed_data_file_url"] = f"/api/files/{file_hash}/"

                    inputs.append(input_data)
                    Logger.instance().debug(
                        f"Loaded input '{name}' with {len(input_data.get('files', []))} files"
                    )

                except json.JSONDecodeError as e:
                    Logger.instance().error(f"Invalid JSON in input file {input_file}: {str(e)}")
                    return jsonify({"message": f"Invalid JSON in input '{name}'"}), 500
                except Exception as e:
                    Logger.instance().error(f"Error loading input '{name}': {str(e)}")
                    return jsonify({"message": f"Error loading input '{name}': {str(e)}"}), 500

            if missing_inputs:
                Logger.instance().info(f"Missing input files: {missing_inputs}")
                if not inputs:
                    return (
                        jsonify({"message": f"No input files found for: {missing_inputs}"}),
                        404,
                    )

            return jsonify(inputs)

        except Exception as e:
            Logger.instance().error(f"Error fetching inputs data: {str(e)}")
            return jsonify({"message": str(e)}), 500
