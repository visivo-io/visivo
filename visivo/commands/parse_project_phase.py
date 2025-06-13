from visivo.discovery.discover import Discover
from visivo.parsers.parser_factory import ParserFactory
from visivo.models.project import Defaults
from visivo.logger.logger import Logger
from visivo.commands.dbt_phase import dbt_phase
from visivo.utils import get_dashboards_dir
import yaml
import click
import os
from time import time


def parse_project_phase(working_dir, output_dir, default_source, dbt_profile, dbt_target):

    # Run and Track dbt phase
    dbt_start = time()
    Logger.instance().debug("    Running dbt phase...")
    dbt_phase(working_dir, output_dir, dbt_profile, dbt_target)
    dbt_duration = round(time() - dbt_start, 2)
    if os.environ.get("STACKTRACE"):
        Logger.instance().info(f"dbt phase completed in {dbt_duration}s")

    discover = Discover(working_dir=working_dir, output_dir=output_dir)
    parser = ParserFactory().build(project_file=discover.project_file, files=discover.files)

    project = None
    try:
        project = parser.parse()
        if not project.defaults:
            project.defaults = Defaults()
        if default_source:
            project.defaults.source_name = default_source
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        # Ensure dashboard directory exists
        dashboard_dir = get_dashboards_dir(output_dir)
        os.makedirs(dashboard_dir, exist_ok=True)

    except yaml.YAMLError as e:
        message = "\n"
        if hasattr(e, "problem_mark"):
            mark = e.problem_mark
            message = f"\n Error position: line:{mark.line+1} column:{mark.column+1}\n"
        raise click.ClickException(f"There was an error parsing the yml file(s):{message} {e}")

    return project
