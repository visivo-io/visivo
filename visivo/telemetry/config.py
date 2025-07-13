"""
Telemetry configuration and opt-out logic.
"""

import os
from pathlib import Path
from typing import Optional
import yaml

# Default telemetry endpoint - this should be configured based on your backend
TELEMETRY_ENDPOINT = os.getenv("VISIVO_TELEMETRY_ENDPOINT", "https://telemetry.visivo.io/v1/events")
TELEMETRY_TIMEOUT = 1.0  # Maximum time to wait for telemetry requests

# PostHog configuration
# This API key is for the Visivo project on PostHog Cloud
# Users can override this by setting VISIVO_POSTHOG_API_KEY environment variable
# or use their own self-hosted PostHog instance
POSTHOG_API_KEY = os.getenv(
    "VISIVO_POSTHOG_API_KEY", "phc_DaLOz39kD2u4ZFNi6aXQuA7ncmnbAGoE8dLZc2z7Agj"
)
POSTHOG_HOST = os.getenv("VISIVO_POSTHOG_HOST", "https://app.posthog.com")


def _check_env_disabled() -> bool:
    """Check if telemetry is disabled via environment variable."""
    return os.getenv("VISIVO_TELEMETRY_DISABLED", "").lower() in ("true", "1", "yes")


def _check_global_config_disabled() -> bool:
    """Check if telemetry is disabled in global config file."""
    config_path = Path.home() / ".visivo" / "config.yml"
    if not config_path.exists():
        return False

    try:
        with open(config_path, "r") as f:
            config = yaml.safe_load(f) or {}
            return config.get("telemetry_enabled", True) is False
    except Exception:
        # If we can't read the config, assume telemetry is enabled
        return False


def is_telemetry_enabled(project_defaults: Optional[object] = None) -> bool:
    """
    Check if telemetry is enabled based on all configuration sources.

    Args:
        project_defaults: Optional Defaults object from the project

    Returns:
        bool: True if telemetry is enabled, False otherwise
    """
    # Check environment variable first (highest priority)
    if _check_env_disabled():
        return False

    # Check project defaults if provided
    if project_defaults and hasattr(project_defaults, "telemetry_enabled"):
        if project_defaults.telemetry_enabled is False:
            return False

    # Check global config file
    if _check_global_config_disabled():
        return False

    # Telemetry is enabled by default
    return True


def is_ci_environment() -> bool:
    """
    Detect if we're running in a CI/CD environment.

    Checks for common CI environment variables that indicate
    we're running in an automated environment rather than
    on a developer's machine.

    Returns:
        bool: True if running in CI/CD, False otherwise
    """
    # Common CI environment variables
    ci_env_vars = [
        "CI",  # Generic CI indicator (GitHub Actions, GitLab CI, CircleCI, etc.)
        "CONTINUOUS_INTEGRATION",  # Generic
        "GITHUB_ACTIONS",  # GitHub Actions
        "GITLAB_CI",  # GitLab CI
        "CIRCLECI",  # CircleCI
        "JENKINS_HOME",  # Jenkins
        "JENKINS_URL",  # Jenkins
        "TEAMCITY_VERSION",  # TeamCity
        "TRAVIS",  # Travis CI
        "BUILDKITE",  # Buildkite
        "DRONE",  # Drone
        "BITBUCKET_BUILD_NUMBER",  # Bitbucket Pipelines
        "SEMAPHORE",  # Semaphore CI
        "APPVEYOR",  # AppVeyor
        "WERCKER",  # Wercker
        "MAGNUM",  # Magnum CI
        "MINT",  # Mint (rwx)
        "CODEBUILD_BUILD_ID",  # AWS CodeBuild
        "TF_BUILD",  # Azure DevOps
        "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI",  # Azure DevOps
    ]

    # Check if any CI environment variable is set
    for var in ci_env_vars:
        if os.getenv(var):
            return True

    # Additional heuristics for container environments
    # Check if running in Docker
    if os.path.exists("/.dockerenv"):
        return True

    # Check for Kubernetes
    if os.getenv("KUBERNETES_SERVICE_HOST"):
        return True

    return False
