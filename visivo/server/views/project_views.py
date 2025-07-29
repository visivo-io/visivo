import json
import os
from pathlib import Path
import re
import shutil
from flask import jsonify, request
from git import Repo
import yaml
from ruamel.yaml import YAML
from visivo.commands.compile_phase import compile_phase
from visivo.commands.utils import create_source
from visivo.discovery.discover import Discover
from visivo.logger.logger import Logger
from visivo.models.dashboard import Dashboard
from visivo.models.defaults import Defaults
from visivo.models.include import Include
from visivo.models.item import Item
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.row import Row
from visivo.models.source import CreateSourceRequest, SourceTypeEnum
from visivo.models.table import Table
from visivo.models.trace import Trace
from visivo.parsers.parser_factory import ParserFactory
from visivo.server.project_writer import ProjectWriter
from visivo.server.views.utils import create_example_dashboard, load_csv, write_project_file


def register_project_views(app, flask_app, output_dir):
    @app.route("/api/project/named_children/", methods=["GET"])
    def named_children():
        named_children = flask_app._project.named_child_nodes()
        if named_children:
            return jsonify(named_children)
        else:
            return jsonify({})

    @app.route("/api/project/project_file_path/", methods=["GET"])
    def project_file_path():
        project_file_path = flask_app._project.project_file_path
        if project_file_path:
            return jsonify(project_file_path)
        else:
            return jsonify({})

    @app.route("/api/project/write_changes/", methods=["POST"])
    def write_changes():
        data = request.get_json()
        if not data:
            return jsonify({"message": "No data provided"}), 400

        try:
            project_writer = ProjectWriter(data)
            project_writer.update_file_contents()
            project_writer.write()
            return jsonify({"message": "Changes written successfully"}), 200
        except Exception as e:
            Logger.instance().error(f"Error writing changes: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/project/load_example", methods=["POST"])
    def load_example_project():
        """Load example project from GitHub"""
        data = request.get_json()

        GIT_TEMP_DIR = "tempgit"

        project_name = data.get("project_name", "").strip()
        example_type = data.get("example_type", "github-releases")
        project_dir = data.get("project_dir", ".")

        if not project_name:
            return jsonify({"message": "Project name is required"}), 400

        repo_url = f"https://github.com/visivo-io/{example_type}.git"
        project_path = Path(project_dir)
        env_path = project_path / ".env"
        gitignore_path = project_path / ".gitignore"
        temp_clone_path = project_path / GIT_TEMP_DIR

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

            # If .env doesn't exist, create it
            if not env_path.exists():
                with open(env_path, "w") as fp:
                    fp.write("REPO_NAME=visivo\nREPO_COMPANY=visivo-io")

            # Initialize the project
            discover = Discover(working_dir=project_path, output_dir=None)

            try:
                parser = ParserFactory().build(
                    project_file=discover.project_file, files=discover.files
                )
                project = parser.parse()

                flask_app.project = project
            except yaml.YAMLError as e:
                message = "\n"
                if hasattr(e, "problem_mark"):
                    mark = e.problem_mark
                    message = f"\n Error position: line:{mark.line+1} column:{mark.column+1}\n"
                Logger.instance().error(f"Error parsing YAML file(s): {message} {e}")

            from ruamel.yaml import YAML

            yaml = YAML()
            yaml.preserve_quotes = True
            yaml.indent(mapping=2, sequence=4, offset=2)

            Logger.instance().error(f"discover.project_file: {discover.project_file}")
            with discover.project_file.open("r") as f:
                data = yaml.load(f)
                f.close()

            if "name" in data:
                data["name"] = project_name

            with discover.project_file.open("w") as f:
                yaml.dump(data, f)

            return jsonify({"message": "Project created successfully"}), 200

        except Exception as e:
            Logger.instance().error(f"Error cloning releases: {str(e)}")
            return jsonify({"message": f"Failed to clone GitHub repository"}), 500

    @app.route("/api/project/init", methods=["POST"])
    def init_project():
        data = request.get_json()
        project_name = data.get("project_name", "").strip()
        project_dir = data.get("project_dir", "").strip()

        if not project_name:
            return jsonify({"message": "Project name is required"}), 400

        project_path = (
            os.path.join(project_dir, "project.visivo.yml") if project_dir else "project.visivo.yml"
        )

        return jsonify({"message": "Project initialized", "project_file_path": project_path})

    @app.route("/api/source/create", methods=["POST"])
    def create_source_api():
        form = request.form
        data = CreateSourceRequest(
            project_name=form.get("project_name", "Example Project"),
            source_name=form.get("source_name", "Example Source"),
            database=form.get("database", "Quickstart"),
            source_type=form.get("source_type"),
            host=form.get("host", ""),
            port=form.get("port"),
            username=form.get("username", ""),
            password=form.get("password", ""),
            account=form.get("account", ""),
            warehouse=form.get("warehouse", ""),
            credentials_base64=form.get("credentials_base64", ""),
            project=form.get("project", ""),
            dataset=form.get("dataset", ""),
            project_dir=form.get("project_dir", ""),
        )

        source = create_source(**data.model_dump())
        if isinstance(source, str):
            return jsonify({"message": source}), 400

        return jsonify({"message": "Source created", "source": source.model_dump()})

    @app.route("/api/source/upload", methods=["POST"])
    def upload_file():
        file = request.files.get("file")
        source_type = request.form.get("source_type")
        source_name = request.form.get("source_name")
        project_dir = request.form.get("project_dir", "")

        if not file:
            return jsonify({"message": "File is required"}), 400

        file_path = os.path.join(project_dir, file.filename)
        file.save(file_path)

        table_name = re.sub(r"\W|^(?=\d)", "_", os.path.splitext(file.filename)[0])
        source = create_source(
            project_name="Temp",
            source_name=source_name,
            source_type=source_type,
            project_dir=project_dir,
        )

        with source.connect() as conn:
            conn.execute("INSTALL 'excel'")
            conn.execute("LOAD 'excel'")

            if source_type == SourceTypeEnum.csv:
                load_csv(conn, file_path, table_name)
            elif source_type == SourceTypeEnum.excel:
                conn.execute(
                    f"CREATE TABLE \"{table_name}\" AS SELECT * FROM read_xlsx('{file_path}')"
                )

            columns = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
            quoted_cols = [f'"{col[1]}"' for col in columns]

            model = SqlModel(
                name="file_extract_model",
                sql=f'SELECT {", ".join(quoted_cols)} FROM "{table_name}"',
            )
            trace = Trace(
                name="file_extract_trace",
                model=model,
                columns={col[1]: f'"{col[1]}"' for col in columns},
                props={"type": "scatter"},
            )
            column_defs = [
                {"header": col[1].replace("_", " ").title(), "key": f"columns.{col[1]}"}
                for col in columns
            ]
            table = Table(
                name=f"{table_name}_table",
                traces=[trace],
                column_defs=[{"trace_name": trace.name, "columns": column_defs}],
            )
            dashboard = Dashboard(
                name="Uploaded File Dashboard", rows=[Row(items=[Item(table=table)])]
            )

            return jsonify({"message": "File uploaded", "dashboard": dashboard.model_dump()})

    @app.route("/api/project/finalize", methods=["POST"])
    def finalize_project():
        data = request.get_json()
        project_name = data.get("project_name")
        project_dir = data.get("project_dir")
        sources = data.get("sources", [])
        dashboards = data.get("dashboards", [])
        include_example_dashboard = data.get("include_example_dashboard", True)

        includes = []

        if include_example_dashboard:
            includes.append(
                Include(
                    path="visivo-io/visivo.git@v0.0.1 -- test-projects/demo/dashboards/welcome.visivo.yml"
                )
            )

        if include_example_dashboard:
            dashboards.append(create_example_dashboard())

        project = Project(
            name=project_name,
            includes=includes,
            defaults=Defaults(source_name=sources[0]["name"] if sources else None),
            sources=sources,
            dashboards=dashboards,
        )

        write_project_file(project, project_dir)

        return jsonify({"message": "Project finalized"})
