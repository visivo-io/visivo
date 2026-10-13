import json
import os
from threading import Thread
from uuid import uuid4
from flask import copy_current_request_context, jsonify, request
import requests
from visivo.logger.logger import Logger
from visivo.tokens.token_functions import get_existing_token
from visivo.server.store import background_jobs, background_jobs_lock


def register_cloud_views(app, flask_app, output_dir):
    # The host THIS serve is bound to, not the import-time default (VIS-1376).
    # Deploys have to follow `--host` along with the token lookup and the
    # agent, or `--host` moves two of the three and the odd one out silently
    # talks to production.
    def _host():
        return flask_app.host

    # Both nouns for one release (VIS-1352). The viewer asks for `branches` now;
    # a viewer build that predates the rename still asks for `stages`, and the
    # two are served by the same handler rather than by two that can drift.
    @app.route("/api/cloud/branches/", methods=["GET"])
    @app.route("/api/cloud/stages/", methods=["GET"])
    def cloud_branches():
        token = get_existing_token(host=_host())

        json_headers = {
            "content-type": "application/json",
            "Authorization": f"Api-Key {token}",
        }

        # Active branches only. An archived branch is one someone has put
        # away; offering it as a deploy target is offering a mistake, and the
        # filter belongs here rather than in the page so every caller of this
        # endpoint gets the same list.
        response = requests.get(
            f"{_host()}/api/stages/",
            headers=json_headers,
            params={"archived": "false"},
        )

        if response.status_code == 200:
            payload = response.json()
            return jsonify(
                {
                    "message": "Branches fetched successfully",
                    "branches": payload,
                    # The old key too, for a viewer build that predates the rename.
                    "stages": payload,
                }
            )

        if response.status_code == 401:
            return jsonify({"message": "UnAuthorized access", "stage": response.json()}), 401

        return jsonify({"message": "Something went wrong!", "stage": response.json()}), 500

    @app.route("/api/cloud/branches/", methods=["POST"])
    @app.route("/api/cloud/stages/", methods=["POST"])
    def create_cloud_branch():
        data = request.get_json()
        name = data.get("name", "")

        token = get_existing_token(host=_host())

        if name == "":
            return jsonify({"message": "Name is required"}), 400

        json_headers = {
            "content-type": "application/json",
            "Authorization": f"Api-Key {token}",
        }

        body = {
            "name": name,
        }

        response = requests.post(
            f"{_host()}/api/stages/", data=json.dumps(body), headers=json_headers
        )

        if response.status_code == 201:
            payload = response.json()
            return jsonify(
                {
                    "message": "Branch created successfully",
                    "branch": payload,
                    # The old key too, for a viewer build predating the rename.
                    "stage": payload,
                }
            )

        if response.status_code == 401:
            return jsonify({"message": "UnAuthorized access", "stage": response.json()}), 401

        return jsonify({"message": "Something went wrong!", "stage": response.json()}), 500

    def deploy(stage: str, deploy_id):
        from visivo.commands.deploy_phase import deploy_phase

        deploy_phase(
            user_dir=os.path.expanduser("~"),
            working_dir=flask_app._working_dir,
            output_dir=output_dir,
            stage=stage,
            host=_host(),
            deploy_id=deploy_id,
        )

    @app.route("/api/cloud/deploy/", methods=["POST"])
    def cloud_deploy():
        data = request.get_json()
        stage = data.get("name")
        deploy_id = str(uuid4())

        with background_jobs_lock:
            background_jobs[deploy_id] = {
                "status": 200,
                "messages": "",
                "project_url": None,
            }

        @copy_current_request_context
        def deploy_with_context(stage, deploy_id):
            deploy(stage, deploy_id)
            with background_jobs_lock:
                background_jobs[deploy_id]["status"] = 201

        thread = Thread(target=deploy_with_context, args=(stage, deploy_id), daemon=True)
        thread.start()

        return jsonify({"message": "Deployment initiated successfully", "deploy_id": deploy_id})

    @app.route("/api/cloud/job/status/<deploy_id>/", methods=["GET"])
    def get_job_status(deploy_id):
        with background_jobs_lock:
            job = background_jobs.get(deploy_id)
            if not job:
                return jsonify({"error": "Invalid deploy ID"}), 404
            return jsonify(job)
