"""Validator for the items a template dashboard's slots point at."""

from visivo.models.validators.base_validator import BaseProjectValidator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class TemplateDashboardItemsValidator(BaseProjectValidator):
    """Every `data-visivo-item` slot must name a chart, table, markdown or input.

    Names that don't exist at all already fail while the DAG resolves the dashboard's
    refs; this catches names that exist but can't be shown, such as a model.
    """

    def validate(self, project: "Project") -> "Project":
        from visivo.models.chart import Chart
        from visivo.models.dashboards.template_dashboard import TemplateDashboard
        from visivo.models.inputs.input import Input
        from visivo.models.markdown import Markdown
        from visivo.models.table import Table

        renderable = (Chart, Table, Markdown, Input)
        dag = project.dag()
        for dashboard in project.dashboards:
            if not isinstance(dashboard, TemplateDashboard):
                continue
            resolved = {getattr(node, "name", None): node for node in dag.successors(dashboard)}
            for name in dashboard.item_names():
                node = resolved.get(name)
                if node is not None and not isinstance(node, renderable):
                    raise ValueError(
                        f"Template dashboard '{dashboard.name}' places '{name}', which is a "
                        f"{node.__class__.__name__}. Slots can hold a chart, table, markdown "
                        "or input."
                    )
        return project
