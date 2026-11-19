"""Every writer refuses a cardinality that disagrees with a primary key, and the
fan-out guard reads the declared values when it cannot measure (VIS-1718)."""

import pytest

from visivo.agent.tool_types import ToolError
from visivo.agent.tools import call
from visivo.server.services import join_cardinality

ACCOUNTS = "select 1 as account_id, 'Retail' as industry union all select 2, 'Media'"
SUBSCRIPTIONS = (
    "select 1 as account_id, 'Free' as plan union all select 1, 'Team' union all select 2, 'Free'"
)
CONDITION = "${ref(accounts).account_id} = ${ref(subscriptions).account_id}"
REFUSAL = (
    "Relation 'accounts_to_subscriptions' declares cardinality 'many_to_one', so one "
    "'subscriptions' row matches many 'accounts' rows. But the condition joins 'accounts' "
    "on its primary_key (account_id), so each key matches one 'accounts' row. Change the "
    "cardinality of the relation, or correct the primary_key of model 'accounts'."
)


def _model_config(app, name, sql, primary_key=None):
    config = {"name": name, "sql": sql, "source": f"${{ref({app.project.sources[0].name})}}"}
    if primary_key:
        config["primary_key"] = primary_key
    return config


def _relation_config(cardinality=None):
    config = {"name": "accounts_to_subscriptions", "condition": CONDITION}
    if cardinality:
        config["cardinality"] = cardinality
    return config


@pytest.fixture
def app(integration_app):
    integration_app.model_manager.save_from_config(
        _model_config(integration_app, "accounts", ACCOUNTS, "account_id")
    )
    integration_app.model_manager.save_from_config(
        _model_config(integration_app, "subscriptions", SUBSCRIPTIONS)
    )
    return integration_app


@pytest.fixture
def client(app):
    return app.app.test_client()


class TestRelationWriters:
    def test_the_api_route_refuses_the_contradiction(self, app, client):
        response = client.post(
            "/api/relations/accounts_to_subscriptions/", json=_relation_config("many_to_one")
        )

        assert response.status_code == 400
        assert response.get_json()["error"] == REFUSAL
        assert app.relation_manager.get("accounts_to_subscriptions") is None

    def test_the_agent_tool_refuses_the_contradiction(self, app):
        with pytest.raises(ToolError, match="Invalid relation: Relation") as refused:
            call(app, "write_relation", {"config": _relation_config("many_to_one")})

        assert REFUSAL in str(refused.value)
        assert app.relation_manager.get("accounts_to_subscriptions") is None

    def test_the_validate_route_refuses_the_contradiction(self, client):
        response = client.post(
            "/api/relations/accounts_to_subscriptions/validate/",
            json=_relation_config("many_to_one"),
        )

        assert response.status_code == 400
        assert response.get_json()["error"] == REFUSAL

    @pytest.mark.parametrize("cardinality", ["one_to_many", None])
    def test_both_writers_save_an_agreeing_relation(self, app, client, cardinality):
        config = _relation_config(cardinality)

        response = client.post("/api/relations/accounts_to_subscriptions/", json=config)
        result = call(app, "write_relation", {"config": config})

        assert response.status_code in (200, 201)
        assert "error" not in result
        assert app.relation_manager.get("accounts_to_subscriptions").cardinality == cardinality


class TestModelWriters:
    @pytest.fixture
    def related(self, app):
        app.model_manager.save_from_config(_model_config(app, "accounts", ACCOUNTS))
        app.relation_manager.save_from_config(_relation_config("many_to_one"))
        return app

    def test_the_api_route_refuses_a_primary_key_that_contradicts_a_relation(self, related):
        response = related.app.test_client().post(
            "/api/models/accounts/", json=_model_config(related, "accounts", ACCOUNTS, "account_id")
        )

        assert response.status_code == 400
        assert response.get_json()["error"] == REFUSAL
        assert related.model_manager.get("accounts").primary_key is None

    def test_the_agent_tool_refuses_a_primary_key_that_contradicts_a_relation(self, related):
        config = _model_config(related, "accounts", ACCOUNTS, "account_id")

        with pytest.raises(ToolError, match="Invalid model: Relation") as refused:
            call(related, "write_model", {"config": config})

        assert REFUSAL in str(refused.value)
        assert related.model_manager.get("accounts").primary_key is None

    def test_a_primary_key_the_relation_does_not_join_on_is_saved(self, related):
        config = _model_config(related, "accounts", ACCOUNTS, "industry")

        result = call(related, "write_model", {"config": config})

        assert "error" not in result
        assert related.model_manager.get("accounts").primary_key == "industry"


class TestFanOutGuardReadsDeclarations:
    @pytest.fixture
    def unmeasured(self, app, monkeypatch):
        monkeypatch.setattr(join_cardinality, "key_stats", lambda *args: None)
        return app

    def _insight(self, app):
        config = {
            "name": "accounts_by_plan",
            "props": {
                "type": "bar",
                "x": "?{${ref(subscriptions).plan}}",
                "y": "?{count(${ref(accounts).account_id})}",
            },
        }
        return [
            w
            for w in call(app, "write_insight", {"config": config}).get("warnings", [])
            if "fan-out" in w
        ]

    def test_an_unmeasured_relation_with_nothing_declared_is_not_judged(self, unmeasured):
        unmeasured.model_manager.save_from_config(_model_config(unmeasured, "accounts", ACCOUNTS))

        result = call(unmeasured, "write_relation", {"config": _relation_config()})

        assert "cardinality" not in result
        assert self._insight(unmeasured) == []

    def test_a_declared_cardinality_names_the_fan_out(self, unmeasured):
        result = call(unmeasured, "write_relation", {"config": _relation_config("one_to_many")})

        assert result["cardinality"] == {
            "kind": "one_to_many",
            "accounts": "one",
            "subscriptions": "many",
        }
        [warning] = [w for w in result["warnings"] if "one-to-many" in w]
        assert "one key matches more than one `subscriptions` rows." in warning
        [fanout] = self._insight(unmeasured)
        assert "takes COUNT over `accounts` rows" in fanout
        assert "matches more than one `subscriptions` rows" in fanout

    def test_a_primary_key_alone_does_not_name_a_many_side(self, unmeasured):
        result = call(unmeasured, "write_relation", {"config": _relation_config()})

        assert "cardinality" not in result
        assert self._insight(unmeasured) == []

    def test_a_declared_one_to_one_is_not_warned(self, unmeasured):
        result = call(unmeasured, "write_relation", {"config": _relation_config("one_to_one")})

        assert result["cardinality"]["kind"] == "one_to_one"
        assert self._insight(unmeasured) == []

    def test_the_measurement_wins_and_names_a_wrong_cardinality(self, app):
        result = call(app, "write_relation", {"config": _relation_config("one_to_one")})

        assert result["cardinality"]["kind"] == "one_to_many"
        [warning] = [w for w in result["warnings"] if "cardinality `one_to_one`" in w]
        assert "says that `subscriptions.account_id` is unique" in warning
        assert "up to 2 `subscriptions` rows" in warning

    def test_the_measurement_names_a_wrong_primary_key(self, app):
        app.model_manager.save_from_config(
            _model_config(app, "subscriptions", SUBSCRIPTIONS, "account_id")
        )

        result = call(app, "write_relation", {"config": _relation_config()})

        [warning] = [w for w in result["warnings"] if "primary_key of `subscriptions`" in w]
        assert "up to 2 `subscriptions` rows" in warning

    def test_the_measurement_names_a_many_side_that_is_unique(self, app):
        app.model_manager.save_from_config(_model_config(app, "profiles", ACCOUNTS))
        config = {
            "name": "accounts_to_profiles",
            "condition": "${ref(accounts).account_id} = ${ref(profiles).account_id}",
            "cardinality": "one_to_many",
        }

        result = call(app, "write_relation", {"config": config})

        assert result["cardinality"]["kind"] == "one_to_one"
        [warning] = result["warnings"]
        assert "cardinality `one_to_many` says that `profiles` is the many side" in warning
        assert "`profiles.account_id` is unique in the data" in warning

    def test_an_agreeing_declaration_adds_no_warning(self, app):
        result = call(app, "write_relation", {"config": _relation_config("one_to_many")})

        assert not [w for w in result["warnings"] if "says that" in w]
