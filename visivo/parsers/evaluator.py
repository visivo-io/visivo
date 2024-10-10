from typing import Any, Optional
import ast
import operator as op
import os
import json

from visivo.models.test_run import TestRun
from visivo.utils import (
    combine_dict_properties,
    merge_dicts,
    nested_dict_from_dotted_keys,
)

SUPPORTED_NUMPY_FUNCTIONS = ["sum", "all", "mean", "any"]
TRACE_DATA_NODES = ["props", "columns"]


def evaluate_expression(
    expression: str,
    project: Any = None,
    output_dir: str = "",
    test_run: Optional[TestRun] = None,
) -> Any:
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

    def build_list_of_nodes(node, previous_nodes=[]):
        if isinstance(node, ast.Subscript) or isinstance(node, ast.Attribute):
            previous_nodes.append(node)
            return build_list_of_nodes(node.value, previous_nodes)
        elif isinstance(node, ast.Name):
            previous_nodes.append(node)
            return previous_nodes
        else:
            return previous_nodes

    def get_object_from_data(trace):
        data_file_path = os.path.join(output_dir, trace.name, "data.json")

        if not os.path.exists(data_file_path):
            raise FileNotFoundError(f"Data file not found: {data_file_path}")

        with open(data_file_path, "r") as file:
            data = json.load(file)
            combined = combine_dict_properties(data)
            return nested_dict_from_dotted_keys(combined)

    def get_object_from_node(current_object, index, nodes):
        node = nodes[index]
        last_node = index == len(nodes) - 1
        next_index = index + 1
        if isinstance(node, ast.Subscript):
            value = current_object[node.slice.value]
            if last_node:
                return value
            return get_object_from_node(value, next_index, nodes)
        elif isinstance(node, ast.Attribute):
            if (
                current_object.__class__.__name__ == "Trace"
                and node.attr in TRACE_DATA_NODES
            ):
                trace_data = get_object_from_data(current_object)
                current_object = merge_dicts(
                    current_object.model_dump(by_alias=True), trace_data
                )
            if isinstance(current_object, dict):
                value = current_object[node.attr]
            else:
                value = getattr(current_object, node.attr)
            if last_node:
                return value
            return get_object_from_node(value, next_index, nodes)
        elif isinstance(node, ast.Name):
            return current_object
        else:
            raise ValueError(f"Unsupported node type: {node.__class__.__name__}")

    def eval_subscripts(node):
        nodes = build_list_of_nodes(node)
        nodes = nodes[::-1]  # Reverse the order of nodes
        if hasattr(nodes[0], "id") and nodes[0].id == "project":
            value = get_object_from_node(project, 1, nodes)
            return value
        else:
            raise ValueError(f"Unsupported node type: {nodes[0].id}")

    def handle_numpy(node):
        if hasattr(numpy, node.func.id):
            numpy_function = getattr(numpy, node.func.id)
            return numpy_function(*[evaluate_node(arg) for arg in node.args])
        else:
            raise ValueError(f"Unsupported numpy function: {node.func.id}")

    def evaluate_node(node):
        if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.And):
            return all(evaluate_node(value) for value in node.values)
        if isinstance(node, ast.Constant):
            return node.n
        if isinstance(node, ast.List):
            return list(map(lambda a: evaluate_node(a), node.elts))
        elif isinstance(node, ast.BinOp):
            return operators[type(node.op)](
                evaluate_node(node.left), evaluate_node(node.right)
            )
        elif isinstance(node, ast.UnaryOp):
            return operators[type(node.op)](evaluate_node(node.operand))
        elif isinstance(node, ast.BoolOp):
            return operators[type(node.op)](evaluate_node(node.operand))
        elif isinstance(node, ast.Call):
            if node.func.id == "any_test_failed":
                return any_test_failed()
            elif node.func.id in SUPPORTED_NUMPY_FUNCTIONS:
                return handle_numpy(node)
            else:
                raise ValueError(f"Unsupported function: {node.func.id}")
        elif isinstance(node, ast.Compare):
            left = evaluate_node(node.left)
            for op, right in zip(node.ops, node.comparators):
                if not isinstance(
                    op, (ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE)
                ):
                    raise TypeError(
                        f"Unsupported comparison operator: {op.__class__.__name__}"
                    )
                right = evaluate_node(right)
                if not compare_op(op, left, right):
                    return False
                left = right
            return True
        elif isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name):
                if node.value.id == "env":
                    return os.getenv(node.attr)
                elif node.value.id == "project":
                    return getattr(project, node.attr)
            return eval_subscripts(node)
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
        parsed = ast.parse(expression, mode="eval")

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
