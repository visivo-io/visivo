"""Move source credentials out of project YAML into the project's ``.env``.

Shared by the onboarding ``/api/source/create/`` path
(:func:`externalize_source_credentials`) and the SourceManager draft-save path.
"""

import json
import os
import re
from pathlib import Path
from typing import Dict

from dotenv import dotenv_values
from pydantic import SecretStr

from visivo.logger.logger import Logger
from visivo.query.patterns import ENV_VAR_CONTEXT_PATTERN, ENV_VAR_NAME_PATTERN

# Credential fields the onboarding path externalizes. SourceManager instead covers
# every SecretStr field on the model.
CREDENTIAL_FIELDS = ("username", "password", "credentials_base64")

# What Pydantic renders for a non-empty SecretStr — the API's echo of a stored secret.
SECRET_MASK = str(SecretStr("mask-probe"))


def env_var_name(source_name: str, field: str) -> str:
    """A per-source, per-field env var name, e.g. "my-source" + password ->
    MY_SOURCE_PASSWORD, always one ``${env.NAME}`` can reference."""
    prefix = re.sub(r"[^A-Za-z0-9]", "_", source_name or "").strip("_").upper()
    field_part = re.sub(r"[^A-Za-z0-9]", "_", field or "").strip("_").upper()
    name = f"{prefix}_{field_part}" if prefix else field_part
    if not re.fullmatch(ENV_VAR_NAME_PATTERN, name):
        # Empty or leading digit ("2024_warehouse").
        name = f"_{name}"
    if not re.fullmatch(ENV_VAR_NAME_PATTERN, name):  # pragma: no cover - defensive
        raise ValueError(f"Cannot derive a valid environment variable name from {source_name!r}")
    return name


def env_file_path(project_dir) -> Path:
    return Path(project_dir) / ".env" if project_dir else Path(".env")


def read_env_file(project_dir) -> Dict[str, str]:
    """The project .env exactly as python-dotenv will load it; ``{}`` when absent."""
    path = env_file_path(project_dir)
    try:
        if not path.exists():
            return {}
        return {key: value for key, value in dotenv_values(str(path)).items() if value is not None}
    except OSError:  # pragma: no cover - defensive
        return {}


def quote_env_value(value: str) -> str:
    """Encode a secret so python-dotenv reads back the exact same string.

    dotenv's own ``set_key`` is not enough: it interpolates ``${...}`` even in
    quoted values and has no escape for it, so ``p${a}ss`` reads back as ``pss``.
    ``${`` is written as ``${:-$}{`` (an empty-name ref defaulting to ``$``).
    """
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    escaped = escaped.replace("\n", "\\n").replace("\r", "\\r")
    escaped = escaped.replace("${", "${:-$}{")
    return f'"{escaped}"'


def ensure_env_gitignored(project_dir) -> None:
    """Add ``.env`` to the project's .gitignore before a credential is written to it."""
    if not project_dir:
        return
    gitignore = Path(project_dir) / ".gitignore"
    try:
        if gitignore.exists():
            content = gitignore.read_text()
            if ".env" in {line.strip() for line in content.splitlines()}:
                return
            prefix = "" if content.endswith("\n") or not content else "\n"
            with gitignore.open("a") as f:
                f.write(f"{prefix}.env\n")
        else:
            gitignore.write_text(".env\n")
    except OSError as e:  # pragma: no cover - defensive
        Logger.instance().warn(f"Could not add .env to .gitignore in {project_dir}: {e}")


def merge_env_file(project_dir, env_values):
    """Upsert KEY=VALUE pairs into the project's .env, keeping every other line."""
    if not env_values:
        return
    env_path = env_file_path(project_dir)
    lines = env_path.read_text().splitlines() if env_path.exists() else []

    seen = set()
    out = []
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            key = stripped.split("=", 1)[0].strip()
            if key in env_values:
                out.append(f"{key}={quote_env_value(env_values[key])}")
                seen.add(key)
                continue
        out.append(line)
    for key, value in env_values.items():
        if key not in seen:
            out.append(f"{key}={quote_env_value(value)}")

    env_path.write_text("\n".join(out) + "\n")


def externalize_source_credentials(source, project_dir):
    """Write a freshly built source's credentials to .env and os.environ.

    Returns the source as a JSON-ready dict with each credential replaced by its
    ``${env.<NAME>}`` reference (VIS-1216).
    """
    source_dict = json.loads(source.model_dump_json(exclude_none=True))

    env_values = {}
    for field in CREDENTIAL_FIELDS:
        value = getattr(source, field, None)
        if value is None:
            continue
        raw = value.get_secret_value() if isinstance(value, SecretStr) else str(value)
        if not raw:
            source_dict.pop(field, None)
            continue
        if re.search(ENV_VAR_CONTEXT_PATTERN, raw):
            continue

        var_name = env_var_name(source.name, field)
        env_values[var_name] = raw
        source_dict[field] = f"${{env.{var_name}}}"

    merge_env_file(project_dir, env_values)
    os.environ.update(env_values)
    return source_dict
