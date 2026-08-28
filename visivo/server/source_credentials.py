"""Shared source-credential externalisation helpers (VIS-1216).

Two save paths need the same guarantee — a credential the user typed never
lands in the project YAML:

- the onboarding ``/api/source/create/`` path (``views/project_views.py``)
  uses :func:`externalize_source_credentials` on a freshly built source, and
- the Workspace save path (``managers/source_manager.py``) uses
  :func:`env_var_name` / :func:`merge_env_file` plus the
  :data:`SECRET_MASK` sentinel to preserve or externalize secrets on
  ``save_from_config``.

Both write the real value to the project's ``.env`` (merged, never
clobbered), load it into ``os.environ`` so the reference resolves in the
running server, and put a ``${env.<NAME>}`` reference where the plaintext
would have been.
"""

import os
import re
from pathlib import Path

from pydantic import SecretStr

from visivo.query.patterns import ENV_VAR_CONTEXT_PATTERN

# Fields on a source that hold a credential we never want written into the
# project YAML by the onboarding path. Anything present here is moved to .env
# and referenced via ${env.*} instead (VIS-1216). The SourceManager path does
# not use this list — it protects every SecretStr-typed field on the model.
CREDENTIAL_FIELDS = ("username", "password", "credentials_base64")

# The literal Pydantic emits when a non-empty SecretStr is serialized
# (str(), model_dump(mode="json"), model_dump_json() all agree). This is what
# the API returns for stored secrets, and what the frontend round-trips back
# on save. Derived from Pydantic itself rather than hardcoded so a masking
# change upstream breaks tests instead of silently destroying credentials.
SECRET_MASK = str(SecretStr("mask-probe"))


def env_var_name(source_name: str, field: str) -> str:
    """A per-source, per-field env var name, e.g. "my-source" + password ->
    MY_SOURCE_PASSWORD. Per-source so multiple sources never collide on a
    single shared DB_PASSWORD."""
    prefix = re.sub(r"\W", "_", source_name).strip("_").upper()
    return f"{prefix}_{field.upper()}" if prefix else field.upper()


def merge_env_file(project_dir, env_values):
    """Upsert KEY=VALUE pairs into the project's .env, preserving any existing
    keys, comments, and unrelated vars (the old code clobbered the whole file)."""
    if not env_values:
        return
    env_path = Path(project_dir) / ".env" if project_dir else Path(".env")
    lines = env_path.read_text().splitlines() if env_path.exists() else []

    seen = set()
    out = []
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            key = stripped.split("=", 1)[0].strip()
            if key in env_values:
                out.append(f"{key}={env_values[key]}")
                seen.add(key)
                continue
        out.append(line)
    for key, value in env_values.items():
        if key not in seen:
            out.append(f"{key}={value}")

    env_path.write_text("\n".join(out) + "\n")


def externalize_source_credentials(source, project_dir):
    """Move a freshly-built source's credentials out of the project YAML.

    For every credential field present, the real value is written to .env
    (merged, not clobbered), loaded into os.environ so the ${env.*} ref resolves
    in this same running server process, and the field on the returned dict is
    replaced with a ${env.<NAME>} reference. Returns the source as a JSON-ready
    dict with the credentials swapped for refs.
    """
    import json

    source_dict = json.loads(source.model_dump_json(exclude_none=True))

    env_values = {}
    for field in CREDENTIAL_FIELDS:
        value = getattr(source, field, None)
        if value is None:
            continue
        raw = value.get_secret_value() if isinstance(value, SecretStr) else str(value)
        if not raw:
            # An empty credential must not survive as a masked "**********"
            # literal in the YAML — drop it entirely.
            source_dict.pop(field, None)
            continue
        if re.search(ENV_VAR_CONTEXT_PATTERN, raw):
            continue  # already a ${env.*} ref — leave it be

        var_name = env_var_name(source.name, field)
        env_values[var_name] = raw
        source_dict[field] = f"${{env.{var_name}}}"

    merge_env_file(project_dir, env_values)
    os.environ.update(env_values)
    return source_dict
