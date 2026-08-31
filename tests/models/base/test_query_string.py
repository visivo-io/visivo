import re

import pytest
from pydantic import BaseModel, ValidationError

from visivo.models.base.query_string import QueryString
from visivo.query.patterns import QUERY_STRING_VALUE_PATTERN


class _Holder(BaseModel):
    """Minimal carrier so the pydantic validator actually runs."""

    value: QueryString


# ---------------------------------------------------------------------------
# The acceptance gate
#
# `validate_and_create` used to accept anything that started `?{` and ended
# `}`. `get_value()` reads the body with QUERY_STRING_VALUE_PATTERN, which is
# NARROWER, so values in the gap validated fine, were written to YAML, and then
# came back as None at run time — where
# `InsightInteraction.field_values_with_js_template_literals` hands them to
# `re.sub` and the run dies with
# `TypeError: expected string or bytes-like object, got 'NoneType'`.
#
# The gate is now the pattern itself, so the gap is closed by construction:
# anything that validates has a readable body.
# ---------------------------------------------------------------------------

# Values the OLD gate let through and `get_value()` then could not read.
UNREADABLE_BUT_ONCE_ACCEPTED = [
    "?{}",
    "?{ }",
    "?{   }",
    "?{a\nb}",
    "?{case when x > 0\n  then 1 else 0 end}",
    "?{${ref(o).a}\n  = ${ref(o).b}}",
]


@pytest.mark.parametrize("value", UNREADABLE_BUT_ONCE_ACCEPTED)
def test_a_value_get_value_cannot_read_is_refused_at_validation(value):
    """The gate and the reader agree, or the failure moves to run time."""
    # The premise: this really is a value the reader cannot read.
    assert QueryString(value).get_value() in (None, ""), value

    with pytest.raises(ValidationError) as excinfo:
        _Holder(value=value)
    assert "QueryString" in str(excinfo.value)


@pytest.mark.parametrize("value", UNREADABLE_BUT_ONCE_ACCEPTED)
def test_the_old_looser_gate_would_have_accepted_these(value):
    """Pins what changed, so the fix cannot be quietly reverted.

    Every value above satisfies the previous `startswith`/`endswith` test — that
    is precisely why it reached YAML.
    """
    assert value.startswith("?{") and (
        value.endswith("}") or re.match(QUERY_STRING_VALUE_PATTERN, value)
    )


@pytest.mark.parametrize(
    "value, expected_hint",
    [
        ("date DESC", "must be wrapped"),
        (">{ anyTestFailed() }", "must be wrapped"),
        ("?{}", "needs an expression"),
        ("?{  }", "needs an expression"),
        ("?{a\nb}", "single line"),
        ("?{x}[a]", "[index|slice]"),
        ("?{x}[0][1]", "[index|slice]"),
    ],
)
def test_the_rejection_says_which_way_the_value_missed(value, expected_hint):
    """One generic 'invalid' is not a diagnosis; each way of missing differs."""
    with pytest.raises(ValidationError) as excinfo:
        _Holder(value=value)
    message = str(excinfo.value)
    assert expected_hint in message
    # And it quotes what was actually supplied, so the author can find it.
    assert repr(value) in message or value in message


@pytest.mark.parametrize(
    "value",
    [
        "?{x}",
        "?{ MAX(amount) }",
        "?{${ref(orders).month} ASC}",
        "?{x}[0]",
        "?{x}[-1]",
        "?{x}[1:5]",
        "?{x}[::2]",
        "?{x}[0,2]",
        "?{sum(${ref(o).a})}[0]",
        # Leading/trailing newlines are only padding — the body is still one
        # line, and the reader handles it. Not the case being refused.
        "?{\n  sum(a)\n}",
    ],
)
def test_every_value_the_reader_can_read_still_validates(value):
    holder = _Holder(value=value)
    assert holder.value.get_value(), value


def test_a_long_value_is_truncated_in_the_message_not_dumped_whole():
    long_value = "?{" + ("x" * 200) + "\n" + ("y" * 200) + "}"
    with pytest.raises(ValidationError) as excinfo:
        _Holder(value=long_value)
    assert "..." in str(excinfo.value)


def test_QueryString_get_value():
    query_string = QueryString("?{ value }")
    assert query_string.get_value() == "value"

    query_string = QueryString("?{ value.property }")
    assert query_string.get_value() == "value.property"

    query_string = QueryString("?{ value[0] }")
    assert query_string.get_value() == "value[0]"

    query_string = QueryString("{ value }")
    assert query_string.get_value() == None

    query_string = QueryString('?{ "value" }')
    assert query_string.get_value() == '"value"'
