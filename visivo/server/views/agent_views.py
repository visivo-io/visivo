"""Driving the built-in loop from the viewer (VIS-1338).

Start, poll, stop — the same three verbs a run has, and deliberately the same
shape, so the Agent tab reuses the polling the Runs view already does rather
than inventing a second way to watch work happen.

The loop is not held open across the request. A model call takes as long as it
takes, and an HTTP request that waits for one is a request that times out in a
proxy somebody else configured.
"""

import os

from flask import jsonify, request

from visivo.agent.model_config import AgentNotConfigured, resolve
from visivo.agent.runner import start
from visivo.agent.sessions import SessionManager
from visivo.logger.logger import Logger

# One at a time. Two loops editing the same draft tier would interleave writes
# to the same objects with no way to tell whose was whose, and the user is
# watching one conversation.
ALREADY_RUNNING = "agent_in_progress"


def register_agent_views(app, flask_app):
    sessions = SessionManager.instance()

    @app.route("/api/agent/", methods=["GET"])
    def list_agent_sessions():
        return jsonify({"sessions": sessions.list()})

    @app.route("/api/agent/", methods=["POST"])
    def start_agent_session():
        body = request.get_json(silent=True) or {}
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"error": "A prompt is required."}), 400

        active = sessions.active()
        if active:
            return jsonify({"action": ALREADY_RUNNING, "session": active[0].to_dict()}), 409

        try:
            model, overlay = resolve(body.get("model"))
        except AgentNotConfigured as unconfigured:
            # 400, not 500: nothing is broken, the user has not set a key. The
            # message is the instructions, so the tab can show it verbatim.
            return jsonify({"error": str(unconfigured), "action": "configure_agent"}), 400

        # pydantic-ai reads the key from the environment, so a key that came
        # from the profile has to be put there. Set once, for this process.
        for name, value in overlay.items():
            os.environ.setdefault(name, value)

        session = start(flask_app, prompt, model)
        return jsonify(session.to_dict()), 201

    @app.route("/api/agent/<session_id>/", methods=["GET"])
    def get_agent_session(session_id):
        session = sessions.get(session_id)
        if session is None:
            return jsonify({"error": "Session not found"}), 404
        return jsonify(session.to_dict())

    @app.route("/api/agent/<session_id>/cancel/", methods=["POST"])
    def cancel_agent_session(session_id):
        session = sessions.get(session_id)
        if session is None:
            return jsonify({"error": "Session not found"}), 404
        stopped = sessions.cancel(session_id)
        if not stopped:
            # Already finished. Not an error — the user pressed Stop as it
            # ended, and the answer is simply its final state.
            return jsonify({"cancelled": False, "session": session.to_dict()})
        Logger.instance().info(f"Agent session {session_id} cancelled by the user.")
        return jsonify({"cancelled": True, "session": sessions.get(session_id).to_dict()})
