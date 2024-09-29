from typing import Any
import ast
import operator as op
import os

SUPPORTED_NUMPY_FUNCTIONS = ["sum", "all", "mean"]


def evaluate_expression(expression: str, project: Any, output_dir: str) -> Any:
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
        # This is a placeholder. Replace with actual implementation.
        return False

    def build_list_of_nodes(node, previous_nodes=[]):
        if isinstance(node, ast.Subscript) or isinstance(node, ast.Attribute):
            previous_nodes.append(node)
            return build_list_of_nodes(node.value, previous_nodes)
        elif isinstance(node, ast.Name):
            previous_nodes.append(node)
            return previous_nodes
        else:
            return previous_nodes

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
            if isinstance(node.value, ast.Subscript):
                return eval_subscripts(node)
            if isinstance(node.value, ast.Name):
                if node.value.id == "env":
                    return os.getenv(node.attr)
                elif node.value.id == "project":
                    return getattr(project, node.attr)
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
