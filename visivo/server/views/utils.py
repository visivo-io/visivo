import json
import os

import yaml
from visivo.logger.logger import Logger
from visivo.models.dashboard import Dashboard
from visivo.models.item import Item
from visivo.models.row import Row

# Credential-externalisation helpers moved to visivo.server.source_credentials
# so the SourceManager save path can share them without importing a views
# module. Re-exported here to keep the onboarding path's import site (and any
# external callers) working unchanged. `_env_var_name` keeps its old private
# name as an alias for the same reason.
from visivo.server.source_credentials import (  # noqa: F401
    CREDENTIAL_FIELDS,
    env_var_name,
    env_var_name as _env_var_name,
    externalize_source_credentials,
    merge_env_file,
)


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
