from typing import Any, Union
from typing_extensions import Annotated
from pydantic import Discriminator, Tag
from visivo.models.dashboard import Dashboard
from visivo.models.dashboards.external_dashboard import ExternalDashboard

def get_dashboard_discriminator_value(value: Any) -> str:
    if isinstance(value, dict):
        return value.get("type", "internal")
    elif hasattr(value, "type"):
        return value.type
    return "internal"

DashboardField = Annotated[
    Union[
        Annotated[Dashboard, Tag("internal")],
        Annotated[ExternalDashboard, Tag("external")],
    ],
    Discriminator(get_dashboard_discriminator_value),
] 