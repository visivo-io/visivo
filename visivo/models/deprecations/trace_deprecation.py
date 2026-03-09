"""Deprecation checker for Trace model usage with automatic migration support."""

import re
from io import StringIO
from typing import TYPE_CHECKING, List, Optional, Dict, Set, Any

import yaml
import sqlglot
from sqlglot import exp

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.models.trace import Trace
from visivo.utils import list_all_ymls_in_dir

if TYPE_CHECKING:
    from visivo.models.project import Project


class TraceDeprecation(BaseDeprecationChecker):
    """
    Warns about Trace usage in favor of Insights.

    Traces are being replaced by Insights which provide more
    powerful client-side data processing with interactions.

    Supports automatic migration of trace definitions to insight format:
    - model refs are embedded into ?{} expressions as ${ref(model).column}
    - cohort_on becomes a split interaction
    - order_by becomes sort interaction(s)
    - filters become filter interaction(s)

    Traces with columns definitions or inline models are skipped
    (they require manual migration).
    """

    REMOVAL_VERSION = "2.0.0"
    FEATURE_NAME = "Trace"
    MIGRATION_GUIDE = "Convert to Insight. Use 'interactions' for client-side processing."

    def check(self, project: "Project") -> List[DeprecationWarning]:
        warnings = []
        traces = project.dag().get_nodes_by_types([Trace], True)

        for trace in traces:
            trace_name = getattr(trace, "name", None) or "unnamed"
            trace_path = getattr(trace, "path", None) or ""

            warnings.append(
                DeprecationWarning(
                    feature=self.FEATURE_NAME,
                    message=f"Trace '{trace_name}' uses deprecated Trace model.",
                    migration=self.MIGRATION_GUIDE,
                    removal_version=self.REMOVAL_VERSION,
                    location=trace_path,
                )
            )

        return warnings

    def can_migrate(self) -> bool:
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        file_contents: Dict[str, str] = {}
        file_data: Dict[str, Any] = {}
        converted_trace_names: Set[str] = set()

        sql_model_names: Set[str] = set()

        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path) as f:
                    content = f.read()
                data = yaml.safe_load(content)
                file_contents[str(file_path)] = content
                file_data[str(file_path)] = data

                if data and isinstance(data.get("models"), list):
                    for model in data["models"]:
                        if isinstance(model, dict) and self._is_sql_model(model):
                            sql_model_names.add(model["name"])

                if data and isinstance(data.get("traces"), list):
                    for trace in data["traces"]:
                        if isinstance(trace, dict) and self._can_convert_trace(
                            trace, sql_model_names
                        ):
                            converted_trace_names.add(trace["name"])
            except Exception:
                continue

        if not converted_trace_names:
            return []

        migrations = []
        for file_path, content in file_contents.items():
            try:
                data = file_data.get(file_path)
                if not data:
                    continue
                new_content = self._migrate_file(content, data, converted_trace_names)
                if new_content and new_content != content:
                    migrations.append(
                        MigrationAction(
                            file_path=file_path,
                            old_text=content,
                            new_text=new_content,
                            description="trace to insight conversion",
                        )
                    )
            except Exception:
                continue

        return migrations

    def _is_sql_model(self, model: dict) -> bool:
        if not isinstance(model, dict):
            return False
        if "args" in model:
            return False
        if "models" in model:
            return False
        return True

    def _can_convert_trace(self, trace: dict, sql_model_names: Set[str] = None) -> bool:
        model = trace.get("model")
        if model is None or isinstance(model, dict):
            return False

        model_name = self._extract_model_name(str(model))
        if not model_name:
            return False

        if trace.get("columns"):
            return False

        if sql_model_names is not None and model_name not in sql_model_names:
            return False

        return True

    def _migrate_file(
        self, content: str, data: dict, converted_trace_names: Set[str]
    ) -> Optional[str]:
        from ruamel.yaml import YAML

        yaml_rt = YAML()
        yaml_rt.preserve_quotes = True
        doc = yaml_rt.load(content)

        if not doc:
            return None

        changed = False

        if "traces" in doc and isinstance(doc["traces"], list):
            traces_to_keep = []
            insights_to_add = []

            for trace in doc["traces"]:
                if isinstance(trace, dict) and trace.get("name") in converted_trace_names:
                    insight = self._convert_trace(trace)
                    if insight:
                        insights_to_add.append(insight)
                        changed = True
                    else:
                        traces_to_keep.append(trace)
                else:
                    traces_to_keep.append(trace)

            if insights_to_add:
                if traces_to_keep:
                    doc["traces"] = traces_to_keep
                else:
                    del doc["traces"]

                if "insights" not in doc or doc.get("insights") is None:
                    doc["insights"] = []
                doc["insights"].extend(insights_to_add)

        if "charts" in doc and isinstance(doc["charts"], list):
            for chart in doc["charts"]:
                if not isinstance(chart, dict):
                    continue
                chart_traces = chart.get("traces")
                if not isinstance(chart_traces, list):
                    continue

                to_move = []
                to_keep = []
                for ref in chart_traces:
                    ref_name = self._extract_ref_name_from_value(ref)
                    if ref_name and ref_name in converted_trace_names:
                        to_move.append(ref)
                    else:
                        to_keep.append(ref)

                if to_move:
                    changed = True
                    if to_keep:
                        chart["traces"] = to_keep
                    else:
                        del chart["traces"]

                    if "insights" not in chart or chart.get("insights") is None:
                        chart["insights"] = []
                    chart["insights"].extend(to_move)

        if not changed:
            return None

        stream = StringIO()
        yaml_rt.dump(doc, stream)
        return stream.getvalue()

    def _convert_trace(self, trace: dict) -> Optional[dict]:
        model_ref = trace.get("model")
        if model_ref is None or isinstance(model_ref, dict):
            return None

        model_name = self._extract_model_name(str(model_ref))
        if not model_name:
            return None

        insight: dict = {"name": trace["name"]}

        if "props" in trace and trace["props"]:
            insight["props"] = self._transform_props(trace["props"], model_name)

        interactions = []

        cohort_on = trace.get("cohort_on")
        if cohort_on:
            expr = self._get_query_value(str(cohort_on))
            if expr:
                transformed = self._transform_expression(expr, model_name)
                interactions.append({"split": f"?{{ {transformed} }}"})

        filters = trace.get("filters")
        if filters and isinstance(filters, list):
            for f in filters:
                expr = self._get_query_value(str(f))
                if expr:
                    transformed = self._transform_expression(expr, model_name)
                    interactions.append({"filter": f"?{{ {transformed} }}"})

        order_by = trace.get("order_by")
        if order_by and isinstance(order_by, list):
            for ob in order_by:
                expr = self._get_query_value(str(ob))
                if expr:
                    transformed = self._transform_order_by(expr, model_name)
                    interactions.append({"sort": f"?{{ {transformed} }}"})

        if interactions:
            insight["interactions"] = interactions

        return insight

    def _extract_model_name(self, ref_str: str) -> Optional[str]:
        match = re.search(r"ref\(\s*([^)]+)\s*\)", ref_str)
        if match:
            name = match.group(1).strip()
            if (name.startswith("'") and name.endswith("'")) or (
                name.startswith('"') and name.endswith('"')
            ):
                name = name[1:-1]
            return name
        return None

    def _extract_ref_name_from_value(self, value) -> Optional[str]:
        s = str(value)
        match = re.search(r"ref\(\s*([^)]+)\s*\)", s)
        if match:
            name = match.group(1).strip()
            if (name.startswith("'") and name.endswith("'")) or (
                name.startswith('"') and name.endswith('"')
            ):
                name = name[1:-1]
            return name
        return None

    def _get_query_value(self, value: str) -> Optional[str]:
        match = re.match(r"^\?\{\s*(.+?)\s*\}$", value, re.DOTALL)
        if match:
            return match.group(1)
        return value.strip() if value.strip() else None

    def _transform_props(self, props: dict, model_name: str) -> dict:
        new_props = {}
        for key, value in props.items():
            if isinstance(value, str):
                new_props[key] = self._transform_prop_value(value, model_name)
            elif isinstance(value, dict):
                new_props[key] = self._transform_props(value, model_name)
            elif isinstance(value, list):
                new_props[key] = [self._transform_list_item(v, model_name) for v in value]
            else:
                new_props[key] = value
        return new_props

    def _transform_list_item(self, value: Any, model_name: str) -> Any:
        if isinstance(value, str):
            return self._transform_prop_value(value, model_name)
        elif isinstance(value, dict):
            return self._transform_props(value, model_name)
        return value

    def _transform_prop_value(self, value: str, model_name: str) -> str:
        match = re.match(r"^\?\{\s*(.+?)\s*\}$", value, re.DOTALL)
        if match:
            expr = match.group(1)
            transformed = self._transform_expression(expr, model_name)
            return f"?{{ {transformed} }}"
        return value

    def _transform_expression(self, expr: str, model_name: str) -> str:
        try:
            parsed = sqlglot.parse_one(f"SELECT {expr} AS __visivo_r__")
        except Exception:
            return expr

        placeholders: Dict[str, str] = {}
        counter = [0]

        def replace_column(node):
            if isinstance(node, exp.Column) and not node.table:
                col_name = node.name
                placeholder = f"__VISIVO_REF_{counter[0]}__"
                counter[0] += 1
                placeholders[placeholder] = f"${{ref({model_name}).{col_name}}}"
                return exp.Column(this=exp.Identifier(this=placeholder, quoted=False))
            return node

        transformed = parsed.transform(replace_column)

        if not placeholders:
            return expr

        sql = transformed.sql()

        prefix = "SELECT "
        suffix = " AS __visivo_r__"
        if sql.startswith(prefix):
            sql = sql[len(prefix) :]
        if sql.endswith(suffix):
            sql = sql[: -len(suffix)]

        for ph, ref_str in placeholders.items():
            sql = sql.replace(ph, ref_str)

        return sql

    def _transform_order_by(self, expr: str, model_name: str) -> str:
        try:
            parsed = sqlglot.parse_one(f"SELECT 1 FROM __t__ ORDER BY {expr}")
        except Exception:
            return self._transform_expression(expr, model_name)

        order = parsed.find(exp.Order)
        if not order:
            return self._transform_expression(expr, model_name)

        placeholders: Dict[str, str] = {}
        counter = [0]

        def replace_column(node):
            if isinstance(node, exp.Column) and not node.table:
                col_name = node.name
                placeholder = f"__VISIVO_REF_{counter[0]}__"
                counter[0] += 1
                placeholders[placeholder] = f"${{ref({model_name}).{col_name}}}"
                return exp.Column(this=exp.Identifier(this=placeholder, quoted=False))
            return node

        transformed = parsed.transform(replace_column)

        if not placeholders:
            return expr

        sql = transformed.sql()
        order_idx = sql.upper().find("ORDER BY ")
        if order_idx == -1:
            return expr
        order_sql = sql[order_idx + len("ORDER BY ") :]

        for ph, ref_str in placeholders.items():
            order_sql = order_sql.replace(ph, ref_str)

        return order_sql
