import pytest
from unittest.mock import Mock
from flask import Flask

from visivo.server.views.expression_views import register_expression_views


class TestExpressionViews:

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config["TESTING"] = True

        flask_app = Mock()
        register_expression_views(app, flask_app, "/tmp/output")
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def test_translate_simple_expression(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "total", "expression": "SUM(amount)", "type": "metric"}],
                "source_dialect": "duckdb",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["translations"]) == 1
        assert data["translations"][0]["name"] == "total"
        assert data["translations"][0]["duckdb_expression"] is not None

    def test_detect_metric_type_for_aggregate(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "SUM(amount)", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"][0]["detected_type"] == "metric"

    def test_detect_dimension_type_for_non_aggregate(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "UPPER(name)", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"][0]["detected_type"] == "dimension"

    def test_detect_metric_for_count_distinct(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "COUNT(DISTINCT id)", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"][0]["detected_type"] == "metric"

    def test_detect_metric_for_avg(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "AVG(price)", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"][0]["detected_type"] == "metric"

    def test_empty_expressions_returns_empty(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={"expressions": []},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["translations"] == []
        assert data["errors"] == []

    def test_invalid_expression_returns_error(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "bad", "expression": "SUM(", "type": ""}],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["errors"]) == 1
        assert data["errors"][0]["name"] == "bad"

    def test_no_body_returns_400(self, client):
        response = client.post(
            "/api/expressions/translate/",
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_expression_containing_select_keyword(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [
                    {
                        "name": "has_select",
                        "expression": "CASE WHEN status = 'SELECT' THEN 1 ELSE 0 END",
                        "type": "dimension",
                    }
                ],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["errors"]) == 0
        expr = data["translations"][0]["duckdb_expression"]
        assert "CASE" in expr
        assert "'SELECT'" in expr or "SELECT" in expr

    def test_cross_dialect_transpilation(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [
                    {"name": "pg_cast", "expression": "NOW()::DATE", "type": "dimension"}
                ],
                "source_dialect": "postgres",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["errors"]) == 0
        expr = data["translations"][0]["duckdb_expression"]
        assert expr is not None
        assert len(expr) > 0

    def test_multiple_expressions_per_request(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [
                    {"name": "a", "expression": "SUM(x)", "type": ""},
                    {"name": "b", "expression": "UPPER(name)", "type": ""},
                    {"name": "c", "expression": "COUNT(*)", "type": ""},
                ],
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["translations"]) == 3
        assert data["translations"][0]["detected_type"] == "metric"
        assert data["translations"][1]["detected_type"] == "dimension"
        assert data["translations"][2]["detected_type"] == "metric"

    def test_unknown_source_dialect_falls_back(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "t", "expression": "SUM(amount)", "type": "metric"}],
                "source_dialect": "foobar_nonexistent",
            },
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["translations"]) == 1
        assert data["translations"][0]["duckdb_expression"] is not None


class TestExpressionValidateView:
    """/api/expressions/validate/ (VIS-993 layer 2): sqlglot parse validation.

    Unlike /translate/ (which gracefully passes unparseable expressions through
    so the explorer keeps working), /validate/ REPORTS parse failures so the
    viewer's validation-as-save gate can block persistence of a doomed
    expression before it caches and fires a run.
    """

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config["TESTING"] = True
        flask_app = Mock()
        register_expression_views(app, flask_app, "/tmp/output")
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def _validate(self, client, expression, name="expr", dialect="duckdb"):
        response = client.post(
            "/api/expressions/validate/",
            json={
                "expressions": [{"name": name, "expression": expression}],
                "source_dialect": dialect,
            },
        )
        assert response.status_code == 200
        return response.get_json()["results"][0]

    def test_valid_aggregate_expression(self, client):
        result = self._validate(client, "AVG(value)")
        assert result["valid"] is True
        assert result["name"] == "expr"

    def test_unbalanced_brace_is_invalid(self, client):
        result = self._validate(client, "AVG(value)}")
        assert result["valid"] is False
        assert result["error"]

    def test_error_messages_carry_no_ansi_escapes(self, client):
        result = self._validate(client, "AVG(value)}")
        assert "\x1b" not in result["error"]

    def test_unbalanced_quote_is_invalid(self, client):
        result = self._validate(client, "SUM('amount")
        assert result["valid"] is False

    def test_context_ref_with_field_is_substituted_and_valid(self, client):
        result = self._validate(client, "${ref(daily_metrics).value} * 2")
        assert result["valid"] is True

    def test_composite_metric_refs_are_substituted_and_valid(self, client):
        result = self._validate(client, "${ref(avg_value)} / ${ref(new_y_sum)}")
        assert result["valid"] is True

    def test_relation_condition_with_refs_is_valid(self, client):
        result = self._validate(client, "${ref(orders).id} = ${ref(users).order_id}")
        assert result["valid"] is True

    def test_broken_sql_around_valid_refs_is_invalid(self, client):
        result = self._validate(client, "${ref(daily_metrics).value} +* 2")
        assert result["valid"] is False

    def test_empty_expression_is_invalid(self, client):
        result = self._validate(client, "")
        assert result["valid"] is False

    def test_multiple_expressions_validate_independently(self, client):
        response = client.post(
            "/api/expressions/validate/",
            json={
                "expressions": [
                    {"name": "good", "expression": "SUM(x)"},
                    {"name": "bad", "expression": "SUM(x))"},
                ],
                "source_dialect": "duckdb",
            },
        )
        results = response.get_json()["results"]
        assert results[0]["valid"] is True
        assert results[1]["valid"] is False

    def test_missing_body_is_400(self, client):
        response = client.post("/api/expressions/validate/", json=None)
        assert response.status_code == 400


class TestExpressionErrorSanitisation:
    """The parse harness must never leak into a user-facing message (M13).

    Both endpoints parse a bare expression by wrapping it into
    ``SELECT <expr> FROM __placeholder__``, and ``/validate/`` additionally
    swaps every ``${ref(...)}`` for an identifier sqlglot can read. When the
    parse fails, sqlglot quotes that wrapped SQL back — so the viewer used to
    show ``__visivo_ctx__`` and ``__placeholder__``, names that appear nowhere
    in the user's project, alongside a column number counted in a statement
    they never wrote.
    """

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config["TESTING"] = True
        flask_app = Mock()
        register_expression_views(app, flask_app, "/tmp/output")
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def _validate(self, client, expression, dialect="duckdb"):
        response = client.post(
            "/api/expressions/validate/",
            json={
                "expressions": [{"name": "expr", "expression": expression}],
                "source_dialect": dialect,
            },
        )
        assert response.status_code == 200
        return response.get_json()["results"][0]

    # Every broken shape a relation condition / metric / interaction can take.
    BROKEN_EXPRESSIONS = [
        "${ref(orders).amount} >",
        "sum(${ref(orders).amount}",
        "case when ${ref(o).a} then ${ref(o).b}",
        "${ref(daily_metrics).value} +* 2",
        "${ref(orders).id} = ${ref(users).order_id} AND",
        "AVG(value)}",
        "SUM('amount",
    ]

    @pytest.mark.parametrize("expression", BROKEN_EXPRESSIONS)
    def test_validate_error_leaks_no_internal_sentinels(self, client, expression):
        result = self._validate(client, expression)
        assert result["valid"] is False
        assert "__visivo_ctx" not in result["error"]
        assert "placeholder" not in result["error"]
        assert "\x1b" not in result["error"]

    @pytest.mark.parametrize(
        "expression, ref_text",
        [
            ("${ref(orders).amount} >", "${ref(orders).amount}"),
            ("sum(${ref(orders).amount}", "${ref(orders).amount}"),
            ("${ref(daily_metrics).value} +* 2", "${ref(daily_metrics).value}"),
        ],
    )
    def test_validate_error_quotes_the_users_own_ref(self, client, expression, ref_text):
        """The message must be about the text the author typed."""
        result = self._validate(client, expression)
        assert ref_text in result["error"]

    def test_validate_error_restores_each_distinct_ref_separately(self, client):
        """Two different refs must come back as themselves, not as one token.

        A single shared ``__visivo_ctx__`` sentinel made this impossible; the
        substitution numbers its tokens so the map is exact.
        """
        result = self._validate(client, "case when ${ref(o).a} then ${ref(o).b}")
        assert "${ref(o).a}" in result["error"]
        assert "${ref(o).b}" in result["error"]

    def test_validate_error_drops_the_wrapped_statements_position(self, client):
        """ "Line 1, Col: 28" counts characters in SQL the user never wrote."""
        result = self._validate(client, "${ref(orders).amount} >")
        assert "Col:" not in result["error"]

    def test_validate_error_still_explains_what_is_wrong(self, client):
        """Sanitising must not empty the message out."""
        result = self._validate(client, "sum(${ref(orders).amount}")
        assert "Expecting )" in result["error"]

    def test_translate_error_leaks_no_placeholder_table(self, client):
        response = client.post(
            "/api/expressions/translate/",
            json={
                "expressions": [{"name": "bad", "expression": "SUM(amount"}],
                "source_dialect": "duckdb",
            },
        )
        assert response.status_code == 200
        errors = response.get_json()["errors"]
        assert len(errors) == 1
        assert "placeholder" not in errors[0]["error"]
        assert "\x1b" not in errors[0]["error"]

    def test_sanitiser_leaves_a_real_table_named_placeholder_alone(self):
        """The tail stripper requires the sentinel's leading underscore."""
        from visivo.server.views.expression_views import sanitize_expression_error

        message = sanitize_expression_error(Exception("no such column in placeholder"))
        assert message == "no such column in placeholder"

    def test_sanitiser_scrubs_an_unmapped_context_token(self):
        """Belt and braces: a token the map missed still must not escape."""
        from visivo.server.views.expression_views import sanitize_expression_error

        message = sanitize_expression_error(Exception("bad __visivo_ctx_7__ here"), {})
        assert "__visivo_ctx" not in message

    def test_substitution_maps_each_ref_to_a_unique_token(self):
        from visivo.server.views.expression_views import substitute_context_tokens

        substituted, mapping = substitute_context_tokens("${ref(a).x} = ${ref(b).y}")
        assert len(mapping) == 2
        assert len(set(mapping.keys())) == 2
        assert "${" not in substituted
        for token, original in mapping.items():
            assert token in substituted
            assert original in ("${ref(a).x}", "${ref(b).y}")
