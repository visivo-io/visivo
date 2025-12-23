from time import time

compile_import_start = time()
from visivo.logger.logger import Logger

Logger.instance().debug("Compiling project...")
import json

from visivo.parsers.serializer import Serializer
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
):
    # Track parse project
    parse_start = time()
    Logger.instance().debug("    Running parse project phase...")
    project = parse_project_phase(working_dir, output_dir, default_source, dbt_profile, dbt_target)
    parse_duration = round(time() - parse_start, 2)
    Logger.instance().debug(f"Project parsing completed in {parse_duration}s")

    # Run deprecation checks (non-blocking)
    if not no_deprecation_warnings:
        from visivo.models.deprecations import DeprecationChecker

        checker = DeprecationChecker()
        warnings = checker.check_all(project)
        checker.report(warnings)

    # Collect project metrics for telemetry
    _collect_compile_telemetry(project)

    # Track artifacts writing
    artifacts_start = time()
    Logger.instance().debug("    Writing artifacts...")

    # Write the original project.json
    with open(f"{output_dir}/project.json", "w") as fp:
        serializer = Serializer(project=project)
        fp.write(serializer.dereference().model_dump_json(exclude_none=True))

    # Write the flattened explorer.json for the QueryExplorer
    with open(f"{output_dir}/explorer.json", "w") as fp:
        serializer = Serializer(project=project)
        explorer_data = serializer.create_flattened_project()
        json.dump(explorer_data, fp)
    artifacts_duration = round(time() - artifacts_start, 2)
    Logger.instance().debug(f"Project artifacts written in {artifacts_duration}s")

    total_duration = round(time() - parse_start, 2)

    with open(f"{output_dir}/error.json", "w") as error_file:
        error_file.write(json.dumps({}))

    Logger.instance().success(
        f"Compile completed in {total_duration}s "
        f"imports: {import_duration}s, "
        f"parse: {parse_duration}s, "
        f"artifacts: {artifacts_duration}s, "
    )

    return project
