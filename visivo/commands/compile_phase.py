from time import time

compile_import_start = time()
from visivo.logger.logger import Logger

Logger.instance().debug("Compiling project...")
import json

from visivo.parsers.serializer import Serializer
from visivo.commands.parse_project_phase import parse_project_phase

import_duration = round(time() - compile_import_start, 2)
Logger.instance().debug(f"Compile Import completed in {import_duration}s")


def compile_phase(
    default_source: str,
    working_dir: str,
    output_dir: str,
    dbt_profile: str = None,
    dbt_target: str = None,
):
    # Track parse project
    parse_start = time()
    Logger.instance().debug("    Running parse project phase...")
    project = parse_project_phase(working_dir, output_dir, default_source, dbt_profile, dbt_target)
    parse_duration = round(time() - parse_start, 2)
    Logger.instance().debug(f"Project parsing completed in {parse_duration}s")
    
    # Collect project metrics for telemetry (lightweight operation)
    try:
        from visivo.telemetry import get_telemetry_context
        from visivo.telemetry.collector import collect_project_metrics
        
        object_counts = collect_project_metrics(project)
        if object_counts:  # Only store if we successfully collected metrics
            get_telemetry_context().set("object_counts", object_counts)
    except Exception:
        # Silently ignore any telemetry errors
        pass

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
