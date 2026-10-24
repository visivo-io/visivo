from typing import Any, Optional
import ast
import operator as op
import os
import json

from visivo.constants import DEFAULT_RUN_ID

from visivo.models.test_run import TestRun
from visivo.utils import merge_dicts, nested_dict_from_dotted_keys

SUPPORTED_NUMPY_FUNCTIONS = [
    "sum",
    "all",
    "mean",
    "any",
    "std",
    "var",
    "min",
    "max",
    "median",
]
SUPPORTED_BUILTIN_FUNCTIONS = {"round": round, "len": len}
TRACE_DATA_NODES = ["props", "columns"]
COMPARISON_SYMBOLS = {
    ast.Eq: "==",
    ast.NotEq: "!=",
    ast.Lt: "<",
    ast.LtE: "<=",
    ast.Gt: ">",
    ast.GtE: ">=",
}


def _insight_info_path(output_dir: str, insight_name: str) -> str:
    return os.path.join(output_dir, DEFAULT_RUN_ID, "insights", f"{insight_name}.json")


def load_insight_data(output_dir: str, insight_name: str) -> dict:
    """Reads the output `visivo run` wrote for an insight and returns its props as a
    nested dict of numpy arrays."""
    import duckdb
    import numpy

    info_path = _insight_info_path(output_dir, insight_name)
    if not os.path.exists(info_path):
        raise FileNotFoundError(
            f"No run output for insight '{insight_name}' at {info_path}. "
            "Run `visivo run` before `visivo test`."
        )
    with open(info_path, "r") as file:
        info = json.load(file)

    flat = dict(info.get("static_props") or {})
    query = info.get("query")
    if query:
        connection = duckdb.connect(":memory:")
        try:
            for file_info in info.get("files") or []:
                data_path = file_info["signed_data_file_url"]
                run_marker = data_path.rfind(f"/{DEFAULT_RUN_ID}/")
                if not os.path.exists(data_path) and run_marker >= 0:
                    data_path = output_dir + data_path[run_marker:]
                if not os.path.exists(data_path):
                    raise FileNotFoundError(
                        f"Data file not found for insight '{insight_name}': "
                        f"{file_info['signed_data_file_url']}. Run `visivo run` first."
                    )
                escaped_path = data_path.replace("'", "''")
                connection.execute(
                    f'CREATE VIEW "{file_info["name_hash"]}" AS '
                    f"SELECT * FROM read_parquet('{escaped_path}')"
                )
            result = connection.execute(query)
            columns = [description[0] for description in result.description]
            rows = result.fetchall()
        finally:
            connection.close()
        column_values = {
            column: numpy.array([row[index] for row in rows])
            for index, column in enumerate(columns)
        }
        for prop_path, column in (info.get("props_mapping") or {}).items():
            if column in column_values:
                flat[prop_path] = column_values[column]
    return nested_dict_from_dotted_keys(flat)


def _format_value(value: Any) -> str:
    import numpy

    if isinstance(value, numpy.ndarray):
        return numpy.array2string(value, threshold=10, edgeitems=3)
    if isinstance(value, numpy.generic):
        return repr(value.item())
    return repr(value)


def evaluate_expression(
    expression: str,
    project: Any = None,
    output_dir: str = "",
    test_run: Optional[TestRun] = None,
    explain: bool = False,
) -> Any:
    """Evaluates a test expression. With `explain=True` returns a string showing the
    values each comparison saw instead of the result."""
    import numpy

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
        if test_run is None:
            return False
        else:
            return test_run.success

    def get_insight_object(insight):
        data = load_insight_data(output_dir, insight.name)
        return merge_dicts(insight.model_dump(), data)

    def get_attribute(current_object, attr):
        if current_object.__class__.__name__ == "Insight" and attr in TRACE_DATA_NODES:
            current_object = get_insight_object(current_object)
        if isinstance(current_object, dict):
            return current_object[attr]
        return getattr(current_object, attr)

    def evaluate_slice(node):
        if isinstance(node, ast.Slice):
            return slice(
                *[
                    None if part is None else evaluate_node(part)
                    for part in (node.lower, node.upper, node.step)
                ]
            )
        return evaluate_node(node)

    def function_name(node):
        func = node.func
        if isinstance(func, ast.Name):
            return func.id, None
        if (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id == "numpy"
        ):
            return func.attr, "numpy"
        raise ValueError("Unsupported function call")

    def handle_call(node):
        name, namespace = function_name(node)
        if namespace is None and name == "any_test_failed":
            return any_test_failed()
        args = [evaluate_node(arg) for arg in node.args]
        if namespace == "numpy" or (namespace is None and name in SUPPORTED_NUMPY_FUNCTIONS):
            if name not in SUPPORTED_NUMPY_FUNCTIONS:
                raise ValueError(f"Unsupported numpy function: {name}")
            return getattr(numpy, name)(*args)
        if name in SUPPORTED_BUILTIN_FUNCTIONS:
            return SUPPORTED_BUILTIN_FUNCTIONS[name](*args)
        raise ValueError(f"Unsupported function: {name}")

    def evaluate_node(node):
        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                return all(evaluate_node(value) for value in node.values)
            raise TypeError(f"Unsupported boolean operator: {node.op.__class__.__name__}")
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.List):
            return list(map(lambda a: evaluate_node(a), node.elts))
        elif isinstance(node, ast.BinOp):
            return operators[type(node.op)](evaluate_node(node.left), evaluate_node(node.right))
        elif isinstance(node, ast.UnaryOp):
            return operators[type(node.op)](evaluate_node(node.operand))
        elif isinstance(node, ast.Call):
            return handle_call(node)
        elif isinstance(node, ast.Compare):
            left = evaluate_node(node.left)
            for comparison, right in zip(node.ops, node.comparators):
                right = evaluate_node(right)
                if not compare_op(comparison, left, right):
                    return False
                left = right
            return True
        elif isinstance(node, ast.Name):
            if node.id == "project":
                return project
            raise ValueError(f"Unsupported name: {node.id}")
        elif isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name) and node.value.id == "env":
                return os.getenv(node.attr)
            return get_attribute(evaluate_node(node.value), node.attr)
        elif isinstance(node, ast.Subscript):
            return evaluate_node(node.value)[evaluate_slice(node.slice)]
        else:
            raise TypeError(f"Unsupported type {node.__class__}")

    def compare_op(comparison, left, right):
        if not isinstance(comparison, tuple(COMPARISON_SYMBOLS)):
            raise TypeError(f"Unsupported comparison operator: {comparison.__class__.__name__}")
        return {
            ast.Eq: lambda: left == right,
            ast.NotEq: lambda: left != right,
            ast.Lt: lambda: left < right,
            ast.LtE: lambda: left <= right,
            ast.Gt: lambda: left > right,
            ast.GtE: lambda: left >= right,
        }[type(comparison)]()

    def explain_node(node):
        if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.And):
            failed = [value for value in node.values if not evaluate_node(value)]
            return "; ".join(explain_node(value) for value in failed)
        if isinstance(node, ast.Compare):
            left = evaluate_node(node.left)
            text = _format_value(left)
            for comparison, right in zip(node.ops, node.comparators):
                right = evaluate_node(right)
                text += f" {COMPARISON_SYMBOLS[type(comparison)]} {_format_value(right)}"
            return text
        return _format_value(evaluate_node(node))

    try:
        parsed = ast.parse(expression, mode="eval")
        if explain:
            return explain_node(parsed.body)
        return evaluate_node(parsed.body)
    except (
        SyntaxError,
        TypeError,
        KeyError,
        ValueError,
        NameError,
        AttributeError,
        IndexError,
    ) as e:
        raise ValueError(f"Invalid expression: {expression}: {e}") from e
