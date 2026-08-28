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
