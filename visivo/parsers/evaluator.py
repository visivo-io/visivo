from typing import Any
import ast
import operator as op
import os


def evaluate_expression(expression: str, project: Any, output_dir: str) -> Any:
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

    def build_list_of_nodes(node):
        if isinstance(node, ast.Subscript) or isinstance(node.value, ast.Attribute):
            return [build_list_of_nodes(node.value)]
        elif isinstance(node, ast.Name):
            return [node.id]
        else:
            return []

    def eval_subscripts(node):
        nodes = build_list_of_nodes(node)
        nodes = nodes[::-1]  # Reverse the order of nodes
        if nodes[0] == "project":
            for node in nodes:
                if isinstance(node, ast.Subscript):
                    project = project[node.value]
                else:
                    project = getattr(project, node)

    def evaluate_node(node):
        if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.And):
            return all(evaluate_node(value) for value in node.values)
        if isinstance(node, ast.Constant):
            return node.n
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
                eval_subscripts(node.value)
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
    except (SyntaxError, TypeError, KeyError, ValueError, NameError) as e:
        raise ValueError(f"Invalid expression: {expression}") from e
