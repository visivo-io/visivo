import os
from flask import Flask, jsonify
from visivo.models.project import Project
from visivo.parsers.serializer import Serializer
from visivo.server.source_metadata import (
    check_source_connection,
    gather_source_metadata,
    get_database_schemas,
    get_schema_tables,
    get_source_databases,
    get_table_columns,
)
from visivo.server.views import register_views
from visivo.logger.logger import Logger
from visivo.server.repositories.worksheet_repository import WorksheetRepository
from visivo.telemetry.middleware import init_telemetry_middleware


class FlaskApp:
    def __init__(self, output_dir, project: Project):
        self.app = Flask(__name__, static_folder=output_dir, static_url_path="/data")

        self._project_json = (
            Serializer(project=project).dereference().model_dump_json(exclude_none=True)
        )
        self._project = project

        self.app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
        self.worksheet_repo = WorksheetRepository(os.path.join(output_dir, "worksheets.db"))

        # Initialize telemetry middleware
        init_telemetry_middleware(self.app, project)

        register_views(self.app, self, output_dir)

    @property
    def project(self):
        return self._project

    @project.setter
    def project(self, value):
        Logger.instance().debug(f"Setting new project on FlaskApp")
        self._project_json = (
            Serializer(project=value).dereference().model_dump_json(exclude_none=True)
        )
        self._project = value
