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
    # Same file as every other user-level preference — read through the shared
    # helper so the path and the "unreadable means defaults" handling have one
    # definition. Imported here rather than at module scope: telemetry loads
    # very early, and server.user_config pulls in the logger.
    from visivo.server.user_config import read_user_config

    return read_user_config().get("telemetry_enabled", True) is False


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


# Environment variables that indicate a CI/CD run. Kept as a module-level
# constant (not inlined in is_ci_environment) so tests clear EXACTLY what the
# detector checks — the copy hardcoded in test_ci_detection drifted from this
# list, which is how RWX CI ended up spamming new_installation.
CI_ENV_VARS = [
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
    "MINT",  # Mint — rwx's legacy name (kept for older runners)
    "RWX_RUN_ID",  # RWX (rwx.com, the current Mint) — always set in a task run
    "RWX_TASK_ID",  # RWX — also always set; belt-and-braces alongside RWX_RUN_ID
    "CODEBUILD_BUILD_ID",  # AWS CodeBuild
    "TF_BUILD",  # Azure DevOps
    "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI",  # Azure DevOps
    "KUBERNETES_SERVICE_HOST",  # Kubernetes-hosted runner
    # Serverless / PaaS hosts run visivo non-interactively — often with a fresh,
    # EMPTY $HOME on every cold start — so without these each invocation looks
    # like a brand-new install and spams new_installation. Cloud Run is the one
    # that bit us: it runs on gVisor, which sets NONE of the vars above and has
    # no /.dockerenv, so it slipped through entirely.
    "K_SERVICE",  # Google Cloud Run (services AND jobs)
    "FUNCTION_TARGET",  # Google Cloud Functions (2nd gen) / Functions Framework
    "GAE_ENV",  # Google App Engine
    "AWS_LAMBDA_FUNCTION_NAME",  # AWS Lambda
    "AWS_EXECUTION_ENV",  # AWS managed compute (Lambda and others)
    "DYNO",  # Heroku
    "FLY_APP_NAME",  # Fly.io
    "RENDER",  # Render
    "VERCEL",  # Vercel
    "NETLIFY",  # Netlify
]

# Filesystem markers that reveal we're inside a container/pod even when no env
# var is set. `/.dockerenv` exists ONLY under the Docker *daemon* runtime — it is
# ABSENT under BuildKit builds, containerd/CRI-O, gVisor (Cloud Run), and Podman,
# which is how server contexts kept looking like fresh installs. A module-level
# constant (mirroring CI_ENV_VARS) so tests neutralize EXACTLY what the detector
# checks and can't drift.
CONTAINER_MARKER_PATHS = (
    "/.dockerenv",  # Docker daemon runtime
    "/run/.containerenv",  # Podman
    # Every Kubernetes pod mounts a service-account token here — belt-and-braces
    # alongside KUBERNETES_SERVICE_HOST for any pod that somehow lacks the env.
    "/var/run/secrets/kubernetes.io/serviceaccount",
)


def is_ci_environment() -> bool:
    """
    Detect if we're running in an automated (non-interactive) environment.

    Checks for common CI/CD and serverless/PaaS environment variables — plus
    container/pod filesystem markers — that indicate we're running in an
    automated environment rather than on a developer's machine.

    Returns:
        bool: True if running in CI/CD or a server/container context, else False
    """
    for var in CI_ENV_VARS:
        if os.getenv(var):
            return True

    for marker in CONTAINER_MARKER_PATHS:
        if os.path.exists(marker):
            return True

    return False
