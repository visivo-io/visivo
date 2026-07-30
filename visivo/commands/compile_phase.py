from time import time

compile_import_start = time()
from visivo.logger.logger import Logger

Logger.instance().debug("Compiling project...")
import json

from visivo.commands.parse_project_phase import parse_project_phase

import_duration = round(time() - compile_import_start, 2)
Logger.instance().debug(f"Compile Import completed in {import_duration}s")


def _collect_compile_telemetry(project):
    """Collect telemetry metrics during compile phase."""
    try:
        from visivo.telemetry.command_tracker import track_compile_metrics

        track_compile_metrics(project)
    except Exception:
        # Silently ignore any telemetry errors
        pass


def compile_phase(
    default_source: str,
    working_dir: str,
    output_dir: str,
    dbt_profile: str = None,
    dbt_target: str = None,
    no_deprecation_warnings: bool = False,
    project=None,
):
    # Track parse project - skip if project already provided
    parse_start = time()
    if project is None:
        Logger.instance().debug("    Running parse project phase...")
        project = parse_project_phase(
            working_dir, output_dir, default_source, dbt_profile, dbt_target
        )
        parse_duration = round(time() - parse_start, 2)
        Logger.instance().debug(f"Project parsing completed in {parse_duration}s")
    else:
        Logger.instance().debug("    Using provided project, skipping parse phase...")
        parse_duration = 0.0

    # Validate that every table's column-select / pivot config compiles to valid
    # SQL (smoke-test bug #7). Done here, at COMPILE, rather than in the Table
    # model validator, so a broken table doesn't block the whole project from
    # LOADING — the server stays up and surfaces this through error.json, and the
    # CLI fails with one actionable message naming every broken table.
    from visivo.query.table_sql_validator import validate_project_table_sql

    table_sql_error = validate_project_table_sql(project)
    if table_sql_error:
        raise ValueError(table_sql_error)

    # Run deprecation checks (non-blocking)
    if not no_deprecation_warnings:
        from visivo.models.deprecations import DeprecationChecker

        checker = DeprecationChecker()
        warnings = checker.check_all(project)
        checker.report(warnings)

    # Collect project metrics for telemetry
    _collect_compile_telemetry(project)

    with open(f"{output_dir}/error.json", "w") as fp:
        fp.write(json.dumps({}))

    total_duration = round(time() - parse_start, 2)

    Logger.instance().success(
        f"Compile completed in {total_duration}s "
        f"imports: {import_duration}s, "
        f"parse: {parse_duration}s"
    )

    return project
