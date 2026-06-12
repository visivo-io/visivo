from pydantic import Field, HttpUrl
from visivo.models.dashboards.base_dashboard import BaseDashboard
from typing import Literal


class ExternalDashboard(BaseDashboard):
    """
    An ExternalDashboard is a link-out entry in your dashboard list that points to a
    dashboard hosted in another system (for example a legacy BI tool or a status page).

    Use it to keep a single catalog of all your organization's dashboards in Visivo
    while you migrate, or when some content must stay in another tool.

    !!! example

        ``` yaml
        dashboards:
          - name: Legacy Sales Dashboard
            type: external
            href: https://bi.example.com/dashboards/sales
        ```
    """

    type: Literal["external"] = Field(
        "external", description="The type of dashboard (always 'external')"
    )
    href: HttpUrl = Field(..., description="URL to the external dashboard")
