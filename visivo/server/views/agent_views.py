"""Driving the built-in loop from the viewer (VIS-1338).

Start, poll, stop — the same three verbs a run has, and deliberately the same
shape, so the Agent tab reuses the polling the Runs view already does rather
than inventing a second way to watch work happen.

Dual-mounted, like ``commit`` and ``discard``: the project-scoped path is the
one the viewer calls and the one core can serve, so the SAME tab drives a local
loop and a cloud one without learning which it has. `visivo serve` hosts one
project and ignores the id; cloud hosts many and does not.

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
SESSION_GONE = "agent_session_gone"


def register_agent_views(app, flask_app):
    sessions = SessionManager.instance()

    @app.route("/api/agent/", methods=["GET"])
    @app.route("/api/projects/<project_id>/agent/", methods=["GET"])
    def list_agent_sessions(project_id=None):
        return jsonify({"sessions": sessions.list()})

    @app.route("/api/agent/", methods=["POST"])
    @app.route("/api/projects/<project_id>/agent/", methods=["POST"])
    def start_agent_session(project_id=None):
        body = request.get_json(silent=True) or {}
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"error": "A prompt is required."}), 400

        active = sessions.active()
        if active:
            return jsonify({"action": ALREADY_RUNNING, "session": active[0].to_dict()}), 409

        # Continuing a conversation, or starting one. The id comes back from
        # the first turn; without it every prompt would begin from nothing.
        #
        # Checked BEFORE the model is resolved: whether this session exists is
        # a fact about the request, while whether a key is configured is a fact
        # about the deployment. Resolving first made the answer depend on
        # whether the caller happened to have a key — which is how this passed
        # locally and 400'd in CI.
        continuing = body.get("session_id")
        if continuing and sessions.get(continuing) is None:
            return (
                jsonify(
                    {
                        "error": "That conversation is no longer available.",
                        "action": SESSION_GONE,
                    }
                ),
                404,
            )

        try:
            model, overlay, source = resolve(body.get("model"))
        except AgentNotConfigured as unconfigured:
            # 400, not 500: nothing is broken, the user has not set a key. The
            # message is the instructions, so the tab can show it verbatim.
            return jsonify({"error": str(unconfigured), "action": "configure_agent"}), 400

        # pydantic-ai reads the key from the environment, so a key that came
        # from the profile has to be put there. Set once, for this process.
        for name, value in overlay.items():
            os.environ.setdefault(name, value)

        session = start(flask_app, prompt, model, session_id=continuing)
        if session is None:
            # Evicted between the check above and here. Vanishingly unlikely,
            # and still not something to answer by starting a conversation the
            # user did not ask for.
            return (
                jsonify(
                    {
                        "error": "That conversation is no longer available.",
                        "action": SESSION_GONE,
                    }
                ),
                404,
            )
        # Whose money this is spending. The tab says so, because someone using
        # their own key should never be unsure whether they are.
        return jsonify({**session.to_dict(), "model_source": source}), 201

    @app.route("/api/agent/<session_id>/", methods=["GET"])
    @app.route("/api/projects/<project_id>/agent/<session_id>/", methods=["GET"])
    def get_agent_session(session_id, project_id=None):
        session = sessions.get(session_id)
        if session is None:
            return jsonify({"error": "Session not found"}), 404
        return jsonify(session.to_dict())

    @app.route("/api/agent/<session_id>/cancel/", methods=["POST"])
    @app.route("/api/projects/<project_id>/agent/<session_id>/cancel/", methods=["POST"])
    def cancel_agent_session(session_id, project_id=None):
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
