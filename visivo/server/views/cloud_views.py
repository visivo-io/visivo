import json
import os
from threading import Thread
from uuid import uuid4
from flask import copy_current_request_context, jsonify, request
import requests
from visivo.logger.logger import Logger
from visivo.server.constants import VISIVO_HOST
from visivo.tokens.token_functions import get_existing_token
from visivo.server.store import background_jobs, background_jobs_lock


def register_cloud_views(app, flask_app, output_dir):
    @app.route("/api/cloud/stages/", methods=["GET"])
    def cloud_stages():
        token = get_existing_token()

        json_headers = {
            "content-type": "application/json",
            "Authorization": f"Api-Key {token}",
        }

        response = requests.get(f"{VISIVO_HOST}/api/stages/", headers=json_headers)

        if response.status_code == 200:
            return jsonify({"message": "Stages fetched successfully", "stages": response.json()})

        if response.status_code == 401:
            return jsonify({"message": "UnAuthorized access", "stage": response.json()}), 401

        return jsonify({"message": "Something went wrong!", "stage": response.json()}), 500

    @app.route("/api/cloud/stages/", methods=["POST"])
    def create_cloud_stages():
        data = request.get_json()
        name = data.get("name", "")

        token = get_existing_token()

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
            f"{VISIVO_HOST}/api/stages/", data=json.dumps(body), headers=json_headers
        )

        if response.status_code == 201:
            return jsonify({"message": "Stages fetched successfully", "stage": response.json()})

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
            host=VISIVO_HOST,
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
