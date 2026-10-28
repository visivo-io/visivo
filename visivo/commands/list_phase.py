from pydantic import BaseModel
from visivo.models.chart import Chart
from visivo.models.dashboards.base_dashboard import BaseDashboard
from visivo.models.dimension import Dimension
from visivo.models.inputs.input import Input
from visivo.models.insight import Insight
from visivo.models.markdown import Markdown
from visivo.models.metric import Metric
from visivo.models.models.model import Model
from visivo.models.relation import Relation
from visivo.models.sources.source import Source
from visivo.models.table import Table
from visivo.server.rename_service import TYPE_TO_MANAGER

OBJECT_TYPE_CLASSES = {
    "sources": Source,
    "models": Model,
    "metrics": Metric,
    "dimensions": Dimension,
    "relations": Relation,
    "insights": Insight,
    "charts": Chart,
    "tables": Table,
    "markdowns": Markdown,
    "inputs": Input,
    "dashboards": BaseDashboard,
}

OBJECT_TYPES = tuple(TYPE_TO_MANAGER)


def list_phase(project, object_type):
    target_class = OBJECT_TYPE_CLASSES[object_type]

    def collect_objects(item):
        collected = []
        if isinstance(item, list):
            for sub_item in item:
                collected.extend(collect_objects(sub_item))
        elif isinstance(item, BaseModel):
            for f in item.model_fields_set:
                collected.extend(collect_objects(getattr(item, f)))
            if "name" in item.model_fields_set and isinstance(item, target_class):
                collected.append(getattr(item, "name"))

        return collected

    objects = [f" - {name}" for name in collect_objects(project)]

    print(f"{object_type}:\n" + "\n".join(objects))
