from typing import List, Optional, Union
from pydantic import BaseModel, Field, HttpUrl

class Level(BaseModel):
    """Represents a dashboard level with title and description"""
    
    title: str = Field(..., description="Display title for this level")
    description: str = Field(..., description="Description of this level's purpose")

class ExternalDashboard(BaseModel):
    """
    Represents an external dashboard that links to another system or URL
    """
    name: str = Field(..., description="Name of the external dashboard")
    href: HttpUrl = Field(..., description="URL to the external dashboard")
    description: Optional[str] = Field(None, description="Optional description of the dashboard")
    image: Optional[str] = Field(None, description="Optional path to dashboard thumbnail image")
    level: Optional[Union[int, str]] = Field(None, description="Optional importance level of the dashboard (index or title)")
    tags: List[str] = Field(default_factory=list, description="Optional tags for the dashboard")

class View(BaseModel):
    """
    Configuration for dashboard views and external dashboard links
    """
    
    levels: List[Level] = Field(
        default_factory=list,
        description="Ordered list of dashboard levels with titles and descriptions",
        json_schema_extra={
            "examples": [
                {"title": "Overview", "description": "The most important dashboards and metrics for the organization"},
                {"title": "Department", "description": "The most important dashboards & metrics for a department"}
            ]
        }
    )
    external_dashboards: List[ExternalDashboard] = Field(
        default_factory=list,
        description="List of external dashboard links to include"
    )

    def get_level_by_title(self, title: str) -> Optional[int]:
        """Get the index of a level by its title"""
        for i, level in enumerate(self.levels):
            if level.title == title:
                return i
        return None

    def get_level_by_index_or_title(self, level: Union[int, str]) -> Optional[int]:
        """Convert a level reference (index or title) to an index"""
        if isinstance(level, int):
            return level if 0 <= level < len(self.levels) else None
        return self.get_level_by_title(level)

