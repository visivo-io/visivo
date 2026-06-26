"""VIS-1020 acceptance §4: the BACKEND rejects out-of-schema insight saves.

The viewer's TracePropsEditor surfaces AJV inline errors client-side, but the
client never persists props itself — it POSTs the insight to the Flask server,
where the authoritative guard is Pydantic ``InsightProps`` validation. These
tests prove that guard cannot be bypassed:

1. Constructing an ``InsightProps`` / ``Insight`` with a clearly invalid prop
   (an out-of-enum ``type``, an out-of-enum value on a real Plotly prop, or an
   unknown additional key under ``additionalProperties: false``) raises a
   Pydantic ``ValidationError``.
2. The ``POST /api/insights/<name>/`` save endpoint returns ``400`` for those
   same invalid props (and ``200`` for valid props), so an out-of-schema save
   is rejected end-to-end rather than written to cache.
"""

import pytest
from unittest.mock import Mock
from flask import Flask
from pydantic import ValidationError

from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.server.managers.insight_manager import InsightManager
from visivo.server.views.insights_views import register_insights_views

# ---------------------------------------------------------------------------
# Model layer: the authoritative Pydantic guard
# ---------------------------------------------------------------------------


def test_insight_props_out_of_enum_type_raises():
    """``type`` is constrained to the ``PropType`` enum; a bogus chart type
    must raise rather than silently constructing an unrenderable insight."""
    with pytest.raises(ValidationError):
        InsightProps(type="notarealtype")


def test_insight_props_out_of_enum_value_raises():
    """A real Plotly prop with an out-of-enum value (``orientation`` only
    accepts ``"v"``/``"h"``) is rejected by the embedded jsonschema."""
    with pytest.raises(ValidationError):
        InsightProps(type="bar", orientation="sideways")


def test_insight_props_forbidden_extra_key_raises():
    """An unknown additional key is rejected because the Plotly schema sets
    ``additionalProperties: false`` for each insight type."""
    with pytest.raises(ValidationError):
        InsightProps(type="bar", garblegarble=42)


def test_insight_with_invalid_props_raises():
    """The same guard applies when the invalid props are nested inside a full
    ``Insight`` (the shape the server validates on save)."""
    with pytest.raises(ValidationError):
        Insight(name="bad_insight", props={"type": "bar", "orientation": "sideways"})


def test_valid_insight_props_construct_cleanly():
    """Sanity: a valid prop combination constructs without raising, so the
    rejection tests above aren't passing for the wrong reason."""
    props = InsightProps(type="bar", orientation="v")
    assert props.type.value == "bar"
    assert props.model_dump().get("orientation") == "v"


# ---------------------------------------------------------------------------
# Endpoint layer: POST /api/insights/<name>/ rejects out-of-schema saves
# ---------------------------------------------------------------------------


class TestInsightSaveRejectsInvalidProps:
    """Drive the real save endpoint with a real ``InsightManager`` so the
    authoritative Pydantic validation runs (no mocking of the manager)."""

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()
        flask_app.insight_manager = InsightManager()

        register_insights_views(app, flask_app, "/tmp/output")
        app.flask_app = flask_app
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    @pytest.mark.parametrize(
        "invalid_props",
        [
            {"type": "notarealtype"},  # out-of-enum chart type
            {"type": "bar", "orientation": "sideways"},  # out-of-enum prop value
            {"type": "bar", "garblegarble": 42},  # forbidden additional key
        ],
        ids=["bad-type-enum", "bad-prop-enum", "forbidden-extra-key"],
    )
    def test_save_invalid_props_returns_400(self, client, app, invalid_props):
        response = client.post(
            "/api/insights/bad_insight/",
            json={"props": invalid_props},
            content_type="application/json",
        )

        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data
        assert "Invalid insight configuration" in data["error"]
        # Nothing should have been written to the manager's cache.
        assert app.flask_app.insight_manager.get("bad_insight") is None

    def test_save_valid_props_returns_200(self, client, app):
        response = client.post(
            "/api/insights/good_insight/",
            json={"props": {"type": "bar", "orientation": "v"}},
            content_type="application/json",
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data["insight"] == "good_insight"
        # The valid insight is persisted to cache.
        saved = app.flask_app.insight_manager.get("good_insight")
        assert saved is not None
        assert saved.props.type.value == "bar"
