from visivo.server.views.dashboard_views import register_dashboard_views
from visivo.server.views.data_views import register_data_views
from visivo.server.views.editor_views import register_editor_views
from visivo.server.views.project_views import register_project_views
from visivo.server.views.sources_views import register_source_views
from visivo.server.views.trace_views import register_trace_views
from visivo.server.views.worksheet_views import register_worksheet_views


def register_views(app, flask_app, output_dir):
    register_data_views(app, flask_app, output_dir)
    register_project_views(app, flask_app, output_dir)
    register_worksheet_views(app, flask_app, output_dir)
    register_editor_views(app, flask_app, output_dir)
    register_dashboard_views(app, flask_app, output_dir)
    register_trace_views(app, flask_app, output_dir)
    register_source_views(app, flask_app, output_dir)
