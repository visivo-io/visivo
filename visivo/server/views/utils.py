import json
import os

import yaml
from visivo.logger.logger import Logger
from visivo.models.chart import Chart
from visivo.models.dashboard import Dashboard
from visivo.models.item import Item
from visivo.models.models.sql_model import SqlModel
from visivo.models.row import Row
from visivo.models.trace import Trace


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
            Logger.instance().warning(f"Loaded {os.path.basename(file_path)} with encoding errors.")


def create_example_dashboard():
    model = SqlModel(name="Example Model", sql="SELECT * FROM test_table")
    trace = Trace(
        name="Example Trace",
        model=model,
        props={"type": "scatter", "x": "?{x}", "y": "?{y}"},
    )
    chart = Chart(name="Example Chart", traces=[trace])
    return Dashboard(name="Example Dashboard", rows=[Row(items=[Item(chart=chart)])])


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
        content = content.replace("'**********'", "\"{{ env_var('DB_PASSWORD') }}\"")
        f.write(content)

    if project_dir:
        gitignore_path = os.path.join(project_dir, ".gitignore")
        with open(gitignore_path, "w") as f:
            f.write(".env\ntarget\n.visivo_cache")
