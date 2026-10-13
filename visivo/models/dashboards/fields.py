from typing import Any, Union
from typing_extensions import Annotated
from pydantic import Discriminator, Tag
from visivo.models.dashboard import Dashboard
from visivo.models.dashboards.external_dashboard import ExternalDashboard
from visivo.models.dashboards.template_dashboard import TemplateDashboard
from visivo.parsers.yaml_ordered_dict import YamlOrderedDict


def get_dashboard_discriminator_value(value: Any) -> str:
    if isinstance(value, (dict, YamlOrderedDict)):
        if "href" in value:
            return "external"
        elif "template" in value:
            return "template"
        elif "rows" in value:
            return "internal"
    elif hasattr(value, "href"):
        return "external"
    elif hasattr(value, "template"):
        return "template"
    elif hasattr(value, "rows"):
        return "internal"
    return "internal"


DashboardField = Annotated[
    Union[
        Annotated[Dashboard, Tag("internal")],
        Annotated[ExternalDashboard, Tag("external")],
        Annotated[TemplateDashboard, Tag("template")],
    ],
    Discriminator(get_dashboard_discriminator_value),
]
