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
from typing import Dict

from dotenv import dotenv_values
from pydantic import SecretStr

from visivo.logger.logger import Logger
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


# A legal POSIX-style environment variable name. Deliberately the same shape
# as the name group of ENV_VAR_CONTEXT_PATTERN: a name this rejects cannot be
# referenced as ${env.NAME} at all, so the reference would resolve to nothing
# and the source would authenticate with the literal "${env....}" string.
ENV_VAR_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def env_var_name(source_name: str, field: str) -> str:
    """A per-source, per-field env var name, e.g. "my-source" + password ->
    MY_SOURCE_PASSWORD. Per-source so multiple sources never collide on a
    single shared DB_PASSWORD.

    The result is always a legal env var name that ``ENV_VAR_CONTEXT_PATTERN``
    accepts. Source names are far more permissive than env var names — they may
    start with a digit ("2024_warehouse") or carry non-ASCII letters ("café") —
    and both produce a ``${env.*}`` reference the resolver silently ignores, so
    they are normalised here: non-ASCII is folded to ``_`` and a leading digit
    gains a ``_`` prefix.
    """
    prefix = re.sub(r"[^A-Za-z0-9]", "_", source_name or "").strip("_").upper()
    field_part = re.sub(r"[^A-Za-z0-9]", "_", field or "").strip("_").upper()
    name = f"{prefix}_{field_part}" if prefix else field_part
    if not ENV_VAR_NAME_PATTERN.match(name):
        # Empty, or starting with a digit. A leading underscore is the smallest
        # edit that makes it legal (and keeps it readable in .env).
        name = f"_{name}"
    if not ENV_VAR_NAME_PATTERN.match(name):  # pragma: no cover - defensive
        raise ValueError(f"Cannot derive a valid environment variable name from {source_name!r}")
    return name


def env_file_path(project_dir) -> Path:
    """The .env this project reads and writes."""
    return Path(project_dir) / ".env" if project_dir else Path(".env")


def read_env_file(project_dir) -> Dict[str, str]:
    """The project .env as ``python-dotenv`` itself parses it.

    Uses dotenv rather than a hand-rolled ``split("=")`` so callers compare
    against the value a restart would actually load — quoting and escaping
    included. A missing or unreadable file is normal and answers ``{}``.
    """
    path = env_file_path(project_dir)
    try:
        if not path.exists():
            return {}
        return {key: value for key, value in dotenv_values(str(path)).items() if value is not None}
    except OSError:  # pragma: no cover - defensive
        return {}


def quote_env_value(value: str) -> str:
    """Encode a secret so ``python-dotenv`` reads back the exact same string.

    Writing ``KEY=<raw>`` is lossy: dotenv's unquoted parser strips trailing
    whitespace, truncates at ``#``, drops surrounding quotes, and a value with
    a newline in it corrupts the file outright — so an ordinary password like
    ``Passw0rd #1`` came back as ``Passw0rd`` on the next server start, with
    the real value gone from every file.

    Double quotes are used because dotenv's double-quoted escapes cover the
    cases single quotes cannot (``\\n``/``\\r`` keep multi-line values —
    e.g. a wrapped base64 service-account blob — on one line, and an
    apostrophe needs no escape). ``${`` is encoded as ``${:-$}{``: dotenv
    interpolates POSIX ``${VAR}`` references inside quoted values too and
    offers no escape for them, but ``${:-$}`` is a reference with an empty
    name and a ``$`` default, so it resolves back to a literal ``$``.
    """
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    escaped = escaped.replace("\n", "\\n").replace("\r", "\\r")
    escaped = escaped.replace("${", "${:-$}{")
    return f'"{escaped}"'


def ensure_env_gitignored(project_dir) -> None:
    """Make sure the .env we are about to write cannot be committed.

    The onboarding path pairs its .env write with a .gitignore append (see
    ``views/utils.write_project_file``); every other writer needs the same
    pairing, or a plaintext credential lands in a tracked file the next time
    the user runs ``git add .``.
    """
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
    """Upsert KEY=VALUE pairs into the project's .env, preserving any existing
    keys, comments, and unrelated vars (the old code clobbered the whole file).

    Values are quoted and escaped (see :func:`quote_env_value`) so what dotenv
    reads back on the next run is byte-identical to what was written.
    """
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
