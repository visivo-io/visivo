from typing import Any, List
import re
from visivo.models.base.context_string import ContextString
from visivo.models.test_run import TestRun
from visivo.parsers.evaluator import evaluate_expression

INLINE_CONTEXT_STRING_REGEX = r"\${\s*[\(a-zA-Z0-9\s'\"\-_\\.\]\[)]+?\s*}"
EVAL_STRING_REGEX = r"^>{(.*)}$"

"""
EvalString represents a string that contains expressions to be evaluated.

This class is used for handling strings that may contain references or expressions
enclosed in '>{' and '}' delimiters. It provides functionality to validate the
string format and extract embedded ContextString instances.

Available injected methods:
    - any_test_failed() -> bool

Available injected attributes:
    - env -> Dict[str, Any]
"""


class EvalString:
    def __init__(self, value: str):
        self.value = value

    def __str__(self):
        return self.value

    def get_context_strings(self) -> List[ContextString]:
        return list(
            map(
                lambda m: ContextString(m),
                re.findall(INLINE_CONTEXT_STRING_REGEX, self.value),
            )
        )

    def get_references(self) -> List[str]:
        return list(
            filter(None, map(lambda c: c.get_reference(), self.get_context_strings()))
        )

    def get_paths(self) -> List[str]:
        return list(
            filter(None, map(lambda c: c.get_path(), self.get_context_strings()))
        )

    def evaluate(
        self, dag: Any, project: Any, output_dir: str, test_run: TestRun = None
    ) -> Any:
        expression = re.match(EVAL_STRING_REGEX, self.value.strip()).group(1).strip()
        expression = self.__replace_context_strings(expression=expression, dag=dag)
        return evaluate_expression(
            expression=expression,
            project=project,
            output_dir=output_dir,
            test_run=test_run,
        )

    def __replace_context_strings(self, expression: str, dag: Any) -> str:
        context_strings = self.get_context_strings()
        for context_string in context_strings:
            if context_string.get_reference() is not None:
                item = context_string.get_item(dag=dag)

                path = item.path
                props_path = context_string.get_ref_props_path()
                if props_path is not None:
                    path = path + props_path
                expression = expression.replace(context_string.value, path)
            else:
                expression = expression.replace(
                    context_string.value, context_string.get_path()
                )
        return expression

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, handler: Any):
        from pydantic_core import core_schema

        def validate_and_create(value: Any) -> "EvalString":
            if isinstance(value, cls):
                return value
            str_value = str(value)
            if not (str_value.startswith(">{") and str_value.endswith("}")):
                raise ValueError("EvalString must start with '>{' and end with '}'")
            return cls(str_value)

        return core_schema.no_info_after_validator_function(
            validate_and_create,
            core_schema.str_schema(),
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )
