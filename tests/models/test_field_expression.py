import pytest
from pydantic import ValidationError

from visivo.models.dimension import Dimension
from visivo.models.metric import Metric


# A metric's/dimension's NAME is its alias — the query builder supplies it. An
# expression that aliases itself wraps to `(gdp as gdp2) AS "..."`, which no
# dialect parses. Nothing rejected it, so the value saved and failed much later
# as a raw parser error quoting generated table names the user never wrote.
class TestSelfAliasedExpressions:
    @pytest.mark.parametrize(
        "expression",
        ["gdp as gdp2", "gdp AS gdp2", "lower(name) as lowered", "x + 1 as total"],
    )
    def test_dimension_rejects_a_self_alias(self, expression):
        with pytest.raises(ValidationError) as excinfo:
            Dimension(name="gdp2", expression=expression)
        message = str(excinfo.value)
        assert "must not alias itself" in message
        # The message has to say what to do instead, not just what is wrong.
        assert "Use '" in message

    def test_metric_rejects_a_self_alias(self):
        with pytest.raises(ValidationError) as excinfo:
            Metric(name="total", expression="sum(amount) as total")
        assert "must not alias itself" in str(excinfo.value)

    def test_the_message_suggests_the_unaliased_expression(self):
        with pytest.raises(ValidationError) as excinfo:
            Dimension(name="gdp2", expression="gdp as gdp2")
        assert "Use 'gdp'" in str(excinfo.value)

    @pytest.mark.parametrize(
        "expression",
        [
            "gdp",
            "sum(amount)",
            "gdp * 2",
            "case when x > 3 then 'a' else 'b' end",
            "cast(ts as date)",  # `as` INSIDE a cast is not a self-alias
        ],
    )
    def test_valid_expressions_pass(self, expression):
        assert Dimension(name="d", expression=expression).expression == expression

    def test_a_context_string_is_not_parsed_as_sql(self):
        # Not SQL until it is resolved, so there is nothing to parse yet.
        expression = "${ref(orders).gdp}"
        assert Dimension(name="d", expression=expression).expression == expression

    def test_unparseable_sql_fails_open(self):
        # The dialect here is unknown (the parent model's source decides it), so
        # valid-but-exotic SQL must not be blocked by a check that exists to
        # catch one specific mistake. A real syntax error still surfaces where
        # it always did.
        expression = "some_udf(x) filter (where y) over ()"
        assert Dimension(name="d", expression=expression).expression == expression


@pytest.mark.parametrize("field_type", [Dimension, Metric])
def test_field_expression_rejects_accessor_outside_reference(field_type):
    with pytest.raises(ValidationError) as excinfo:
        field_type(name="total", expression="sum(${ref(orders)}.amount)")
    assert "expression" in str(excinfo.value)
    assert "${ref(orders).amount}" in str(excinfo.value)


class TestWrappedExpressions:
    @pytest.mark.parametrize(
        "expression,inner",
        [
            ("?{ count(${ref(trips).id}) }", "count(${ref(trips).id})"),
            ("?{sum(amount)}", "sum(amount)"),
            ("  ?{\n  ${ref(trips).borough}\n}  ", "${ref(trips).borough}"),
        ],
    )
    def test_metric_and_dimension_reject_a_query_string_wrapper(self, expression, inner):
        for model, name in ((Metric, "metric"), (Dimension, "dimension")):
            with pytest.raises(ValidationError) as excinfo:
                model(name="m", expression=expression)
            message = str(excinfo.value)
            assert f"A {name} expression is plain SQL" in message
            assert f"Write '{inner}' without the '?{{ }}' wrapper" in message

    @pytest.mark.parametrize(
        "expression",
        ["count(*)", "${ref(trips).borough}", "case when x = '?{' then 1 end"],
    )
    def test_an_unwrapped_expression_passes(self, expression):
        assert Metric(name="m", expression=expression).expression == expression

    def test_sql_that_does_not_parse_fails_open(self):
        assert Metric(name="m", expression="sum(amount").expression == "sum(amount"

    @pytest.mark.parametrize("expression", ["", None])
    def test_an_empty_expression_is_left_to_the_field(self, expression):
        from visivo.models.base.field_expression import reject_aliased_expression

        assert reject_aliased_expression(expression, "metric") == expression
