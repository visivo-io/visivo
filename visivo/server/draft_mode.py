"""Helpers for resolving draft-mode behavior on a project.

Draft mode controls whether viewer save actions write straight to YAML or
park changes in a per-object cache that an explicit "Publish" later flushes.

Resolution order:
1. ``defaults.draft_mode_enabled`` if explicitly set (True or False).
2. Otherwise: True when the project has any models, insights, or dashboards
   (it has substantive content; collaborators/CI may benefit from staging
   changes); False for fresh projects (immediate write reduces friction).
"""

from typing import Optional

from visivo.models.project import Project


def resolve_draft_mode_enabled(project: Optional[Project]) -> bool:
    """Compute the effective ``draft_mode_enabled`` flag for the project.

    A None or missing project is treated like a fresh project (immediate write).
    """
    if project is None:
        return False

    defaults = getattr(project, "defaults", None)
    if defaults is not None and defaults.draft_mode_enabled is not None:
        return bool(defaults.draft_mode_enabled)

    # Auto-derive from project state. A "fresh" project has no models,
    # insights, or dashboards (the user-visible content surfaces).
    has_content = bool(
        getattr(project, "models", [])
        or getattr(project, "insights", [])
        or getattr(project, "dashboards", [])
    )
    return has_content
