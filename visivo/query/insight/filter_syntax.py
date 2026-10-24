"""Whether an insight's filters parse as SQL, judged before and during a build.

A filter that does not parse cannot be placed in WHERE, HAVING or QUALIFY, so
it is an error that names the insight and the filter, never a filter that is
left out of the query.
"""

import re
from typing import Callable, Optional

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError, TokenError

from visivo.query.patterns import FIELD_REF_PATTERN, INPUT_FRONTEND_PATTERN

_FIELD_REF = re.compile(FIELD_REF_PATTERN)
_FRONTEND_INPUT = re.compile(INPUT_FRONTEND_PATTERN)
_VALUES_SAMPLE = "'a', 'b'"

IsInput = Callable[[str], bool]


class InsightFilterError(ValueError):
    def __init__(self, insight_name: str, filter_text: str, hint: Optional[str] = None):
        self.insight_name = insight_name
        self.filter_text = filter_text
        self.hint = hint
        self.message = f"Insight '{insight_name}' has a filter that is not valid SQL: {filter_text}"
        if hint:
            self.message += f". Hint: {hint}"
        super().__init__(self.message)


def _sample(accessor: str, wrap_values: bool) -> str:
    if accessor == "values":
        return f"({_VALUES_SAMPLE})" if wrap_values else _VALUES_SAMPLE
    return "0"


def _parse_text(filter_text: str, is_input: IsInput, wrap_values: bool = False) -> str:
    """The filter with every ``${...}`` replaced by SQL of the same shape: an
    input by a sample of its accessor (two quoted values for ``.values``, as the
    viewer substitutes a multi-selection), anything else by a column name."""

    def field_ref(match):
        name = match.group(1).strip().strip("'\"")
        if is_input(name):
            return _sample((match.group(2) or "").strip(), wrap_values)
        return "visivo_ref"

    def frontend_input(match):
        if is_input(match.group(1)):
            return _sample(match.group(2), wrap_values)
        return match.group(0)

    text = _FIELD_REF.sub(field_ref, filter_text)
    return _FRONTEND_INPUT.sub(frontend_input, text)


def _parse(text: str, dialect: Optional[str]) -> Optional[exp.Expression]:
    try:
        return sqlglot.parse_one(text, dialect=dialect)
    except (ParseError, TokenError):
        return None


def _values_inputs(filter_text: str, is_input: IsInput):
    names = [
        match.group(1).strip().strip("'\"")
        for match in _FIELD_REF.finditer(filter_text)
        if (match.group(2) or "").strip() == "values"
    ]
    names += [m.group(1) for m in _FRONTEND_INPUT.finditer(filter_text) if m.group(2) == "values"]
    return [name for name in dict.fromkeys(names) if is_input(name)]


def filter_error(
    insight_name: str, filter_text: str, is_input: IsInput, dialect: Optional[str]
) -> InsightFilterError:
    """The error for a filter that does not parse, with a hint when the only
    fault is an ``IN`` over a multi-select's ``.values`` without parentheses."""
    hint = None
    values_inputs = _values_inputs(filter_text, is_input)
    if values_inputs:
        wrapped = _parse(_parse_text(filter_text, is_input, wrap_values=True), dialect)
        if wrapped is not None and wrapped.find(exp.In) is not None:
            hint = f"wrap the values in parentheses: IN (${{ref({values_inputs[0]}).values}})"
    return InsightFilterError(insight_name, filter_text, hint)


def check_filter(
    insight_name: str, filter_text: str, is_input: IsInput, dialect: Optional[str]
) -> None:
    """Raise ``InsightFilterError`` when ``filter_text`` does not parse in
    ``dialect`` for any selection of its inputs. A filter with a ``${...}`` this
    cannot model is left to the build, which resolves every reference."""
    text = _parse_text(filter_text, is_input)
    if "${" in text or _parse(text, dialect) is not None:
        return
    raise filter_error(insight_name, filter_text, is_input, dialect)


def strings_in(value):
    """Every string at any depth of ``value``."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings_in(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings_in(item)


def reads_input(insight, is_input: IsInput) -> bool:
    """Whether ``insight`` refs an input anywhere. Such an insight is built in
    DuckDB, because its query runs in the viewer."""
    for text in strings_in(insight.model_dump(mode="json", exclude_none=True)):
        names = [m.group(1).strip().strip("'\"") for m in _FIELD_REF.finditer(text)]
        names += [m.group(1) for m in _FRONTEND_INPUT.finditer(text)]
        if any(is_input(name) for name in names):
            return True
    return False


def insight_filter_error(
    insight, is_input: IsInput, source_dialect: Optional[str]
) -> Optional[str]:
    """Why the first filter of ``insight`` that does not parse is refused, or
    ``None``. Filters parse in the dialect the build uses: DuckDB when the
    insight reads an input, else its source's dialect (``None`` is generic)."""
    dialect = "duckdb" if reads_input(insight, is_input) else source_dialect
    for interaction in insight.interactions or []:
        if interaction.filter is None:
            continue
        try:
            check_filter(insight.name, interaction.filter.get_value(), is_input, dialect)
        except InsightFilterError as error:
            return error.message
    return None
