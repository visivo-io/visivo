import os
from flask import Flask
from visivo.models.project import Project
from visivo.parsers.serializer import Serializer
from visivo.server.views import register_views
from visivo.logger.logger import Logger
from visivo.server.repositories.worksheet_repository import WorksheetRepository
from visivo.telemetry.middleware import init_telemetry_middleware
from visivo.server.managers.source_manager import SourceManager
from visivo.server.managers.model_manager import ModelManager
from visivo.server.managers.dimension_manager import DimensionManager
from visivo.server.managers.metric_manager import MetricManager
from visivo.server.managers.relation_manager import RelationManager
from visivo.server.managers.insight_manager import InsightManager
from visivo.server.managers.input_manager import InputManager
from visivo.server.managers.markdown_manager import MarkdownManager
from visivo.server.managers.chart_manager import ChartManager
from visivo.server.managers.table_manager import TableManager


class FlaskApp:

    def __init__(self, output_dir, project: Project, working_dir=None):
        self.app = Flask(__name__, static_folder=output_dir, static_url_path="/data")

        self._project_json = (
            Serializer(project=project).dereference().model_dump_json(exclude_none=True)
        )
        self._project = project

        self._working_dir = working_dir
        self.hot_reload_server = None  # Will be set by serve_phase

        self.app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
        self.worksheet_repo = WorksheetRepository(os.path.join(output_dir, "worksheets.db"))

        # Initialize object managers with DAG for efficient loading
        dag = project.dag()

        self.source_manager = SourceManager()
        self.source_manager.load(dag)

        self.model_manager = ModelManager()
        self.model_manager.load(dag)

        self.dimension_manager = DimensionManager()
        self.dimension_manager.load(dag)

        self.metric_manager = MetricManager()
        self.metric_manager.load(dag)

        self.relation_manager = RelationManager()
        self.relation_manager.load(dag)

        self.insight_manager = InsightManager()
        self.insight_manager.load(dag)

        self.input_manager = InputManager()
        self.input_manager.load(dag)

        self.markdown_manager = MarkdownManager()
        self.markdown_manager.load(dag)

        self.chart_manager = ChartManager()
        self.chart_manager.load(dag)

        self.table_manager = TableManager()
        self.table_manager.load(dag)

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
        # Reload object managers with new project DAG (preserves cached objects)
        dag = value.dag()
        self.source_manager.load(dag)
        self.model_manager.load(dag)
        self.dimension_manager.load(dag)
        self.metric_manager.load(dag)
        self.relation_manager.load(dag)
        self.insight_manager.load(dag)
        self.input_manager.load(dag)
        self.markdown_manager.load(dag)
        self.chart_manager.load(dag)
        self.table_manager.load(dag)
