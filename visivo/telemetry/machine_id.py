"""
Machine ID management for telemetry.
"""

import os
import sys
import uuid
from pathlib import Path
from .config import is_ci_environment, is_telemetry_enabled


def _is_interactive() -> bool:
    """True only when a human is plausibly at a terminal.

    A genuine first-time install is interactive; automation — CI, cron,
    containers, serverless — runs with NO controlling TTY (and often a fresh
    ``$HOME`` each invocation, which is exactly what makes every run look like a
    brand-new install). This is the universal backstop to
    ``is_ci_environment()``'s explicit env/marker detection: it needs no
    platform-specific signal, so visivo running inside ANY container/CI — RWX
    (whose runtime exposes no env var visivo can read and has no ``/.dockerenv``),
    Docker, Cloud Run, and repos we don't control — never reports a spurious
    ``new_installation``.

    Suppresses only when BOTH stdin and stdout are non-interactive, so a human
    who merely pipes output (``visivo run > log``) still counts.
    """
    try:
        return sys.stdin.isatty() or sys.stdout.isatty()
    except Exception:
        # A missing/closed stream (detached process) is not interactive.
        return False


def get_machine_id() -> str:
    """
    Get or create a persistent anonymous machine ID.

    The machine ID is stored in ~/.visivo/machine_id and is created
    on first use. This provides anonymous user identification while
    preserving privacy.

    For CI/CD environments, generates a special prefixed ID that
    changes with each run to avoid persistence issues.

    Returns:
        str: A UUID string that uniquely identifies this installation
    """
    # Check if we're in CI/CD
    if is_ci_environment():
        # For CI, generate a new ID each time with a special prefix
        # This helps us identify CI runs and doesn't try to persist
        return f"ci-{uuid.uuid4()}"

    # Normal user environment - use persistent ID
    visivo_dir = Path.home() / ".visivo"
    machine_id_path = visivo_dir / "machine_id"

    # Try to read existing machine ID
    if machine_id_path.exists():
        try:
            with open(machine_id_path, "r") as f:
                machine_id = f.read().strip()
                # Validate it's a valid UUID (no prefix for regular users)
                if not machine_id.startswith("ci-"):
                    uuid.UUID(machine_id)
                    return machine_id
        except Exception:
            # If file is corrupted or invalid, regenerate
            pass

    # Generate new machine ID
    machine_id = str(uuid.uuid4())
    is_new_installation = True  # Flag to track this is a new installation

    # Ensure directory exists
    try:
        visivo_dir.mkdir(exist_ok=True)

        # Write machine ID to file
        with open(machine_id_path, "w") as f:
            f.write(machine_id)

    except Exception:
        # If we can't write the file, just return the generated ID
        # It will be regenerated next time, but that's better than failing
        pass

    # Send new installation event if telemetry is enabled AND this looks like a
    # real interactive install. The interactivity gate is what stops automation
    # we can't detect by env/marker (RWX CI, arbitrary Docker in other people's
    # repos) from reporting a spurious install on every fresh-$HOME run — see
    # _is_interactive().
    if is_new_installation and is_telemetry_enabled() and _is_interactive():
        try:
            # Import here to avoid circular dependencies
            from .client import get_telemetry_client
            from .events import NewInstallationEvent

            client = get_telemetry_client(enabled=True)
            event = NewInstallationEvent.create(machine_id)
            client.track(event)
        except Exception:
            # Silently ignore telemetry errors
            pass

    return machine_id
