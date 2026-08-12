import json
import os
import re
from pathlib import Path

import yaml
from pydantic import SecretStr
from visivo.logger.logger import Logger
from visivo.models.dashboard import Dashboard
from visivo.models.item import Item
from visivo.models.row import Row
from visivo.query.patterns import ENV_VAR_CONTEXT_PATTERN

# Fields on a source that hold a credential we never want written into the
# project YAML. Anything present here is moved to .env and referenced via
# ${env.*} instead (VIS-1216).
CREDENTIAL_FIELDS = ("username", "password", "credentials_base64")


def _env_var_name(source_name: str, field: str) -> str:
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

        var_name = _env_var_name(source.name, field)
        env_values[var_name] = raw
        source_dict[field] = f"${{env.{var_name}}}"

    merge_env_file(project_dir, env_values)
    os.environ.update(env_values)
    return source_dict


def load_csv(conn, file_path, table_name):
    table_exists = (
        conn.execute(
            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '{table_name}'"
        ).fetchone()[0]
        > 0
    )

    if table_exists:
        Logger.instance().info(f"Table '{table_name}' already exists. Skipping creation.")
        return

    try:
        conn.execute(
            f"CREATE TABLE \"{table_name}\" AS SELECT * FROM read_csv_auto('{file_path}', encoding='UTF-8')"
        )
    except Exception:
        try:
            conn.execute(
                f"CREATE TABLE \"{table_name}\" AS SELECT * FROM read_csv_auto('{file_path}', encoding='UTF-16')"
            )
        except Exception:
            conn.execute(
                f"CREATE TABLE \"{table_name}\" AS SELECT * FROM read_csv_auto('{file_path}', ignore_errors=true)"
            )
            Logger.instance().info(f"Loaded {os.path.basename(file_path)} with encoding errors.")


def create_source_dashboard(source):
    text = f"""
    # Example Source Configuration

    Based on your we have created a source configuration in the project.visivo.yml file.

    ``` yaml
    {yaml.dump(json.loads(source.model_dump_json(exclude_none=True)), sort_keys=False)}
    ```
    """
    return Dashboard(name="Example Dashboard", rows=[Row(items=[Item(markdown=text)])])


def write_project_file(project, project_dir):
    """
    Writes the project to a YAML file (project.visivo.yml), optionally in a given directory.
    Also writes a .gitignore file if a project_dir is provided.
    """
    project.project_file_path = (
        os.path.join(project_dir, "project.visivo.yml") if project_dir else "project.visivo.yml"
    )

    with open(project.project_file_path, "w") as f:
        content = yaml.dump(json.loads(project.model_dump_json(exclude_none=True)), sort_keys=False)
        f.write(content)

    if project_dir:
        gitignore_path = os.path.join(project_dir, ".gitignore")
        lines_to_add = {".env", "target", ".visivo_cache"}

        existing_lines = set()
        if os.path.exists(gitignore_path):
            with open(gitignore_path, "r") as f:
                existing_lines = {line.strip() for line in f}

        with open(gitignore_path, "a") as f:
            for line in lines_to_add:
                if line not in existing_lines:
                    f.write(line + "\n")
