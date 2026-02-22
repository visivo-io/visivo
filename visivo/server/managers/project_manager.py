import json
import os
from typing import Optional, Dict, Any
from pydantic import ValidationError

from visivo.logger.logger import Logger
from visivo.models.project import Project
from visivo.models.defaults import Defaults
from visivo.server.managers.object_manager import ObjectStatus


class ProjectManager:
    """
    Manages project defaults with caching and status tracking.

    Note: Locally, there's only one project. In the cloud, there can be multiple.
    This manager handles both cases by treating the project name as the key.
    """

    def __init__(self, project: Project, cache_dir: str):
        self.project = project
        self.cache_dir = cache_dir
        self.cache_file = os.path.join(cache_dir, ".project_defaults_cache.json")
        self._cached_defaults: Optional[Defaults] = None
        self._load_cache()

    def _load_cache(self):
        """Load cached defaults from disk if they exist."""
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r") as f:
                    data = json.load(f)
                    if data:
                        self._cached_defaults = Defaults(**data)
                        Logger.instance().debug(
                            f"Loaded cached project defaults from {self.cache_file}"
                        )
            except Exception as e:
                Logger.instance().error(f"Error loading project defaults cache: {e}")
                self._cached_defaults = None

    def _save_cache(self):
        """Save cached defaults to disk."""
        try:
            os.makedirs(self.cache_dir, exist_ok=True)
            with open(self.cache_file, "w") as f:
                if self._cached_defaults:
                    json.dump(
                        self._cached_defaults.model_dump(mode="json", exclude_none=True),
                        f,
                        indent=2,
                    )
                else:
                    json.dump({}, f)
            Logger.instance().debug(f"Saved project defaults cache to {self.cache_file}")
        except Exception as e:
            Logger.instance().error(f"Error saving project defaults cache: {e}")

    def _clear_cache(self):
        """Clear the cached defaults."""
        self._cached_defaults = None
        if os.path.exists(self.cache_file):
            os.remove(self.cache_file)

    def get_status(self) -> ObjectStatus:
        """
        Get the status of the project defaults.
        - NEW: Cached defaults exist but no published defaults
        - MODIFIED: Cached defaults differ from published defaults
        - PUBLISHED: No cached defaults or cached matches published
        """
        if self._cached_defaults is None:
            return ObjectStatus.PUBLISHED

        published_defaults = self.project.defaults

        # If no published defaults, this is NEW
        if published_defaults is None:
            return ObjectStatus.NEW

        # Compare cached vs published
        cached_dict = self._cached_defaults.model_dump(mode="json", exclude_none=True)
        published_dict = published_defaults.model_dump(mode="json", exclude_none=True)

        if cached_dict != published_dict:
            return ObjectStatus.MODIFIED

        return ObjectStatus.PUBLISHED

    def get_project_with_status(self) -> Dict[str, Any]:
        """
        Return project metadata with status and config.

        Returns:
            {
                "id": str,  # project name (locally), UUID (in cloud)
                "name": str,
                "status": str,
                "config": {
                    "defaults": {...}
                }
            }
        """
        status = self.get_status()

        # Use cached defaults if they exist, otherwise published
        defaults = self._cached_defaults if self._cached_defaults else self.project.defaults
        defaults_dict = defaults.model_dump(mode="json", exclude_none=True) if defaults else {}

        return {
            "id": self.project.name,  # Locally uses name; cloud can use UUID
            "name": self.project.name,
            "status": status.value,
            "config": {"defaults": defaults_dict},
        }

    def get_all_projects_with_status(self) -> list:
        """
        Return list of projects with status.
        Locally, this is just one project. In the cloud, there can be multiple.
        """
        return [self.get_project_with_status()]

    def save_from_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save project defaults from config dict.

        Args:
            config: Dict with "defaults" key containing defaults config

        Returns:
            Saved project metadata dict
        """
        if "defaults" not in config:
            raise ValueError("Config must contain 'defaults' key")

        defaults_config = config["defaults"]

        # Validate by creating Defaults object
        try:
            self._cached_defaults = Defaults(**defaults_config)
        except ValidationError as e:
            raise ValidationError(f"Invalid defaults configuration: {e}")

        self._save_cache()
        return self.get_project_with_status()

    def mark_for_deletion(self) -> bool:
        """
        Mark project defaults for deletion (clears cache).
        This reverts to published defaults.
        """
        self._clear_cache()
        return True

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, bool]:
        """
        Validate project config without saving.

        Returns:
            {"valid": bool, "error": str (if invalid)}
        """
        try:
            if "defaults" not in config:
                return {"valid": False, "error": "Config must contain 'defaults' key"}

            Defaults(**config["defaults"])
            return {"valid": True}
        except ValidationError as e:
            first_error = e.errors()[0]
            return {"valid": False, "error": f"{first_error['loc']}: {first_error['msg']}"}
        except Exception as e:
            return {"valid": False, "error": str(e)}
