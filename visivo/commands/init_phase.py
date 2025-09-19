from typing import get_args
import click
import yaml
import json
import os
import shutil
from pathlib import Path
from git import Repo
from visivo.command_line import load_env
from visivo.logger.logger import Logger
from visivo.models.include import Include
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.postgresql_source import PostgresqlSource, PostgresqlType
from visivo.models.sources.snowflake_source import SnowflakeSource, SnowflakeType
from visivo.models.sources.sqlite_source import SqliteSource, SqliteType
from visivo.models.sources.mysql_source import MysqlSource, MysqlType
from visivo.models.sources.bigquery_source import BigQuerySource, BigQueryType
from visivo.models.project import Project
from visivo.models.dashboard import Dashboard
from visivo.models.chart import Chart
from visivo.models.item import Item
from visivo.models.row import Row
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.defaults import Defaults
from visivo.commands.utils import create_file_database
from visivo.parsers.file_names import PROFILE_FILE_NAME
from visivo.commands.utils import get_source_types
from visivo.models.sources.duckdb_source import DuckdbSource, DuckdbType
from visivo.parsers.parser_factory import ParserFactory
from visivo.discovery.discover import Discover
from visivo.version import VISIVO_VERSION
from visivo.models.example_type import ExampleTypeEnum


def get_env_content_for_example_type(example_type: str) -> str:
    """Generate .env content based on example type."""
    match example_type:
        case ExampleTypeEnum.github_releases:
            return "REPO_NAME=visivo\nREPO_COMPANY=visivo-io"
        case ExampleTypeEnum.ev_sales:
            return "# EV Sales Data Configuration\n# Add any required environment variables here"
        case ExampleTypeEnum.college_football:
            return (
                "# College Football 2024 Dashboard\n# Add any required environment variables here"
            )
        case _:
            return "# Add any required environment variables here"


def create_basic_project(project_name: str, project_dir: str = "."):
    """Create a basic empty project with just name and structure."""
    Logger.instance().success(f"Initializing project '{project_name}' in {project_dir}")

    # Create basic project structure
    project = Project(name=project_name)

    # Write project file
    project_file_path = os.path.join(project_dir, "project.visivo.yml")
    with open(project_file_path, "w") as fp:
        fp.write(yaml.dump(json.loads(project.model_dump_json(exclude_none=True)), sort_keys=False))

    Logger.instance().success(f"Created project file: {project_file_path}")
    return project_file_path


def load_example_project(
    project_name: str, example_type: str = ExampleTypeEnum.github_releases, project_dir: str = "."
):
    """Load example project from GitHub repository."""
    GIT_TEMP_DIR = "tempgit"

    # Map example type to actual repo name
    repo_name_map = {
        ExampleTypeEnum.github_releases: "github-releases",
        ExampleTypeEnum.ev_sales: "ev-sales",
        ExampleTypeEnum.college_football: "2024-college-football-dashboards",
    }

    repo_name = repo_name_map.get(example_type, example_type)
    repo_url = f"https://github.com/visivo-io/{repo_name}.git"
    project_path = Path(project_dir)
    env_path = project_path / ".env"
    gitignore_path = project_path / ".gitignore"
    temp_clone_path = project_path / GIT_TEMP_DIR

    Logger.instance().info(f"Loading example project '{example_type}' for '{project_name}'")

    try:
        # Backup existing .gitignore and .env
        if gitignore_path.exists():
            shutil.copy(gitignore_path, project_path / ".gitignore.bak")
        if env_path.exists():
            shutil.copy(env_path, project_path / ".env.bak")

        # Clean up any existing temp folder and clone
        if temp_clone_path.exists():
            shutil.rmtree(temp_clone_path)
        Repo.clone_from(repo_url, temp_clone_path)

        # Move files from temp into the main project path, skipping .gitignore and .env
        for item in temp_clone_path.iterdir():
            if item.name in [".git", ".gitignore", ".env", "README.md", "LICENSE"]:
                continue
            dest = project_path / item.name
            if item.is_dir():
                shutil.copytree(item, dest, dirs_exist_ok=True)
            else:
                shutil.copy2(item, dest)

        # Remove the temporary directory
        shutil.rmtree(temp_clone_path)

        # Restore .gitignore and .env if needed
        if (project_path / ".gitignore.bak").exists():
            shutil.move(project_path / ".gitignore.bak", gitignore_path)
        if (project_path / ".env.bak").exists():
            shutil.move(project_path / ".env.bak", env_path)

        # If .env doesn't exist, create it with content based on example type
        if not env_path.exists():
            env_content = get_env_content_for_example_type(example_type)
            with open(env_path, "w") as fp:
                fp.write(env_content)

            load_env(env_path)

        # Update project name in the YAML file
        discover = Discover(working_dir=project_path, output_dir=None)

        from ruamel.yaml import YAML

        yaml_parser = YAML()
        yaml_parser.preserve_quotes = True
        yaml_parser.indent(mapping=2, sequence=4, offset=2)

        if discover.project_file.exists():
            with discover.project_file.open("r") as f:
                data = yaml_parser.load(f)

            if "name" in data:
                data["name"] = project_name

            with discover.project_file.open("w") as f:
                yaml_parser.dump(data, f)

        Logger.instance().success(f"Successfully loaded example project '{example_type}'")
        return str(discover.project_file) if discover.project_file.exists() else None

    except Exception as e:
        Logger.instance().error(f"Error loading example project: {str(e)}")
        raise


def init_phase(project_dir, example_type=None):
    """Main init phase function that handles both simple and example project creation."""
    if project_dir:
        project_name = os.path.basename(os.path.abspath(project_dir))
    else:
        project_dir = "."
        project_name = os.path.basename(os.path.abspath("."))

    if example_type:
        # Load example project
        return load_example_project(project_name, example_type, project_dir)
    else:
        # Create basic project
        return create_basic_project(project_name, project_dir)
