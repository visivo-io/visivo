from typing import Any, Union
import json
from typing_extensions import Annotated
from pydantic import Discriminator, Tag
from visivo.models.dashboard import Dashboard
from visivo.models.dashboards.external_dashboard import ExternalDashboard
from visivo.logging.logger import Logger
from visivo.parsers.yaml_ordered_dict import YamlOrderedDict


def get_dashboard_discriminator_value(value: Any) -> str:
    if isinstance(value, (dict, YamlOrderedDict)):
        if "href" in value:
            return "external"
        elif "rows" in value:
            return "internal"
    elif hasattr(value, "href"):
        return "external"
    elif hasattr(value, "rows"):
        return "internal"
    return "internal"


DashboardField = Annotated[
    Union[
        Annotated[Dashboard, Tag("internal")],
        Annotated[ExternalDashboard, Tag("external")],
    ],
    Discriminator(get_dashboard_discriminator_value),
]
