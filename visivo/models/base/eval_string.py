import os
from typing import Any, List
import ast
import operator as op
import re
from visivo.models.base.context_string import ContextString

INLINE_CONTEXT_STRING_REGEX = r"\${\s*ref\([a-zA-Z0-9\s'\"\-_]+?\)\s*}"
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
        references = map(lambda c: c.get_references(), self.get_context_strings())
        return [ref for sublist in references for ref in sublist]

    def evaluate(self, project, output_dir) -> Any:
        operators = {
            ast.Add: op.add,
            ast.Sub: op.sub,
            ast.Mult: op.mul,
            ast.Div: op.truediv,
            ast.Pow: op.pow,
            ast.BitXor: op.xor,
            ast.USub: op.neg,
        }

        def any_test_failed():
            # This is a placeholder. Replace with actual implementation.
            return False

        def eval_expr(node):
            if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.And):
                return all(eval_expr(value) for value in node.values)
            if isinstance(node, ast.Constant):
                return node.n
            elif isinstance(node, ast.BinOp):
                return operators[type(node.op)](
                    eval_expr(node.left), eval_expr(node.right)
                )
            elif isinstance(node, ast.UnaryOp):
                return operators[type(node.op)](eval_expr(node.operand))
            elif isinstance(node, ast.BoolOp):
                return operators[type(node.op)](eval_expr(node.operand))
            elif isinstance(node, ast.Call):
                if node.func.id == "any_test_failed":
                    return any_test_failed()
                else:
                    raise ValueError(f"Unsupported function: {node.func.id}")
            elif isinstance(node, ast.Compare):
                left = eval_expr(node.left)
                for op, right in zip(node.ops, node.comparators):
                    if not isinstance(
                        op, (ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE)
                    ):
                        raise TypeError(
                            f"Unsupported comparison operator: {op.__class__.__name__}"
                        )
                    right = eval_expr(right)
                    if not compare_op(op, left, right):
                        return False
                    left = right
                return True
            elif isinstance(node, ast.Attribute):
                if node.value.id == "env":
                    return os.getenv(node.attr)
                else:
                    raise ValueError(f"Unsupported attribute: {node.value.id}")
            else:
                raise TypeError(f"Unsupported type {node.__class__}")

        def compare_op(op, left, right):
            return {
                ast.Eq: lambda: left == right,
                ast.NotEq: lambda: left != right,
                ast.Lt: lambda: left < right,
                ast.LtE: lambda: left <= right,
                ast.Gt: lambda: left > right,
                ast.GtE: lambda: left >= right,
            }[type(op)]()

        try:
            expression = (
                re.match(EVAL_STRING_REGEX, self.value.strip()).group(1).strip()
            )
            parsed = ast.parse(expression, mode="eval")
            def replace_context_strings(expression):
                context_strings = self.get_context_strings()
                for context_string in context_strings:
                    expression = expression.replace(
                        context_string.value, context_string.get_path()
                    )
                return expression

            expression = replace_context_strings(expression)
            return eval_expr(parsed.body)
        except (SyntaxError, TypeError, KeyError, ValueError, NameError) as e:
            breakpoint()
            raise ValueError(f"Invalid expression: {self.value}") from e

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
