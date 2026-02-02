from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.dashboard import Dashboard
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class DashboardManager(ObjectManager[Dashboard]):
    """
    Manages Dashboard objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(Dashboard)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._dashboard_adapter = TypeAdapter(Dashboard)

    def validate_object(self, obj_data: dict) -> Dashboard:
        return self._dashboard_adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        self._published_objects.clear()
        for dashboard in all_descendants_of_type(type=Dashboard, dag=dag):
            if dashboard.name:
                self._published_objects[dashboard.name] = dashboard

    def save_from_config(self, config: dict) -> Dashboard:
        dashboard = self.validate_object(config)
        self.save(dashboard.name, dashboard)
        return dashboard

    def get_dashboard_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        dashboard = self.get(name)
        if not dashboard:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, dashboard, status)

    def get_all_dashboards_with_status(self) -> List[Dict[str, Any]]:
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            if name in self._cached_objects and self._cached_objects[name] is None:
                if name in self._published_objects:
                    dashboard = self._published_objects[name]
                    result.append(self._serialize_object(name, dashboard, ObjectStatus.DELETED))
                continue

            dashboard_info = self.get_dashboard_with_status(name)
            if dashboard_info:
                result.append(dashboard_info)

        return result

    def validate_config(self, config: dict) -> Dict[str, Any]:
        try:
            dashboard = self.validate_object(config)
            return {
                "valid": True,
                "name": dashboard.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid dashboard configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Dashboard validation failed: {e}")
            return {"valid": False, "error": str(e)}
