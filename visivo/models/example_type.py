from enum import Enum


class ExampleTypeEnum(str, Enum):
    """Enum for different example project types available for initialization."""

    github_releases = "github-releases"
    ev_sales = "ev-sales"
    college_football = "college-football"
