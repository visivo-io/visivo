from pydantic import Field, HttpUrl
from visivo.models.dashboards.base_dashboard import BaseDashboard
from typing import Literal


class ExternalDashboard(BaseDashboard):
    """
    Represents an external dashboard that links to another system or URL
    """

    type: Literal["external"] = Field(
        "external", description="The type of dashboard (always 'external')"
    )
    href: HttpUrl = Field(..., description="URL to the external dashboard")
