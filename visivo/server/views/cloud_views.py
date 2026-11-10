import json
import os
from threading import Thread
from urllib.parse import urljoin
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

    def _account_default_branch(branches, json_headers):
        """The account's default branch name, so the deploy dialog can preselect it."""
        names = [b.get("name") for b in branches if isinstance(b, dict) and b.get("name")]
        if len(names) <= 1:
            return names[0] if names else None
        try:
            response = requests.get(
                f"{_host()}/api/projects/home/", headers=json_headers, timeout=10
            )
            default = response.json().get("default_branch") if response.status_code == 200 else None
        except Exception as e:
            Logger.instance().debug(f"Could not fetch the account default branch: {e}")
            default = None
        return default if default in names else names[0]

    @app.route("/api/cloud/branches/", methods=["GET"])
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
                    "default_branch": _account_default_branch(payload, json_headers),
                }
            )

        if response.status_code == 401:
            return jsonify({"message": "UnAuthorized access", "stage": response.json()}), 401

        return jsonify({"message": "Something went wrong!", "stage": response.json()}), 500

    @app.route("/api/cloud/branches/", methods=["POST"])
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
            branch=stage,
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
            job = dict(job)
        if job.get("project_url"):
            job["project_url"] = urljoin(f"{_host()}/", job["project_url"])
        return jsonify(job)
