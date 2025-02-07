from typing import Dict, List, Optional, Union
from pydantic import BaseModel, Field, HttpUrl
from .dashboard import DashboardLevel

class LevelCustomization(BaseModel):
    """Customization for a dashboard level including name and description"""
    description: str = Field(..., description="Custom description for this level")
    name: Optional[str] = Field(None, description="Custom display name for this level")

class ExternalDashboard(BaseModel):
    """
    Represents an external dashboard that links to another system or URL
    """
    name: str = Field(..., description="Name of the external dashboard")
    href: HttpUrl = Field(..., description="URL to the external dashboard")
    description: Optional[str] = Field(None, description="Optional description of the dashboard")
    image: Optional[str] = Field(None, description="Optional path to dashboard thumbnail image")
    level: Optional[DashboardLevel] = Field(None, description="Optional importance level of the dashboard")
    tags: List[str] = Field(default_factory=list, description="Optional tags for the dashboard")

class View(BaseModel):
    """
    Configuration for dashboard views and external dashboard links
    """
    level: Dict[str, Union[LevelCustomization, str]] = Field(
        default_factory=dict,
        description="Custom names and descriptions for dashboard levels",
        json_schema_extra={
            "examples": {"L0": {"description": "Overview", "name": "Overview"}}
        }
    )
    external_dashboards: List[ExternalDashboard] = Field(
        default_factory=list,
        description="List of external dashboard links to include"
    )

    def validate_levels(self):
        """Validate that all level keys are valid DashboardLevel values"""
        valid_levels = set(DashboardLevel.__members__.keys())
        level_dict = {}
        
        for key, value in self.level.items():
            # Skip special keys like 'path'
            if key in ['path']:
                continue
                
            if key not in valid_levels:
                raise ValueError(f"Invalid level key: {key}. Must be one of {valid_levels}")
            
            # Ensure the value is a LevelCustomization
            if not isinstance(value, LevelCustomization):
                raise ValueError(f"Value for level {key} must be a LevelCustomization object")
            
            level_dict[key] = value
            
        # Update self.level to only contain valid dashboard levels
        self.level = level_dict

    def model_post_init(self, __context):
        """Validate levels after initialization"""
        super().model_post_init(__context)
        self.validate_levels() 