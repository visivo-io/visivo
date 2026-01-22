from visivo.server.views.auth_views import register_auth_views
from visivo.server.views.cloud_views import register_cloud_views
from visivo.server.views.dashboard_views import register_dashboard_views
from visivo.server.views.data_views import register_data_views
from visivo.server.views.dimension_views import register_dimension_views
from visivo.server.views.editor_views import register_editor_views
from visivo.server.views.input_jobs_views import register_input_jobs_views
from visivo.server.views.inputs_views import register_inputs_views
from visivo.server.views.insight_views import register_insight_views
from visivo.server.views.insights_crud_views import register_insights_crud_views
from visivo.server.views.markdowns_crud_views import register_markdowns_crud_views
from visivo.server.views.charts_crud_views import register_charts_crud_views
from visivo.server.views.tables_crud_views import register_tables_crud_views
from visivo.server.views.metric_views import register_metric_views
from visivo.server.views.model_views import register_model_views
from visivo.server.views.profiling_views import register_profiling_views
from visivo.server.views.project_views import register_project_views
from visivo.server.views.publish_views import register_publish_views
from visivo.server.views.relation_views import register_relation_views
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
    register_insight_views(app, flask_app, output_dir)
    register_insights_crud_views(app, flask_app, output_dir)
    register_inputs_views(app, flask_app, output_dir)
    register_markdowns_crud_views(app, flask_app, output_dir)
    register_charts_crud_views(app, flask_app, output_dir)
    register_tables_crud_views(app, flask_app, output_dir)
    register_input_jobs_views(app, flask_app, output_dir)
    register_source_views(app, flask_app, output_dir)
    register_model_views(app, flask_app, output_dir)
    register_dimension_views(app, flask_app, output_dir)
    register_metric_views(app, flask_app, output_dir)
    register_relation_views(app, flask_app, output_dir)
    register_profiling_views(app, flask_app, output_dir)
    register_publish_views(app, flask_app, output_dir)
    register_auth_views(app, flask_app, output_dir)
    register_cloud_views(app, flask_app, output_dir)
