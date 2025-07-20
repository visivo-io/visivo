import os
import subprocess
from flask import jsonify, request
from visivo.server.text_editors import get_editor_configs


def register_editor_views(app, flask_app, output_dir):
    @app.route("/api/editors/installed", methods=["GET"])
    def get_installed_editors():
        editors, platform = get_editor_configs()

        # Check which editors are installed
        installed_editors = []
        for editor in editors:
            # Skip editors that don't support this platform
            if not editor["paths"][platform]:
                continue

            for path in editor["paths"][platform]:
                if os.path.exists(path):
                    # Only send back safe information to the client
                    installed_editors.append({"name": editor["name"], "id": editor["id"]})
                    break

        return jsonify(installed_editors)

    @app.route("/api/editors/open", methods=["POST"])
    def open_in_editor():
        data = request.get_json()
        if not data or "editorId" not in data or "filePath" not in data:
            return jsonify({"error": "Missing required parameters"}), 400

        editor_id = data["editorId"]
        file_path = data["filePath"]

        # Validate file path exists
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404

        # Get editor configurations
        editors, platform = get_editor_configs()

        # Find the selected editor
        editor_config = next((e for e in editors if e["id"] == editor_id), None)
        if not editor_config or not editor_config["commands"][platform]:
            return jsonify({"error": "Invalid editor for this platform"}), 400

        try:
            # Get the command for the selected editor
            command = editor_config["commands"][platform]

            # Special handling for VS Code on macOS
            if platform == "mac" and editor_id == "vscode":
                if command[0] == "open":
                    # When using 'open' command, file path goes at the end
                    subprocess.Popen(command + ["--", file_path])
                    subprocess.call(["wmctrl", "-a", file_path])
                else:
                    # When using 'code' command directly
                    subprocess.Popen(command + [file_path])
            else:
                # Normal handling for other editors
                subprocess.Popen(command + [file_path])

            return jsonify({"message": "File opened successfully"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
