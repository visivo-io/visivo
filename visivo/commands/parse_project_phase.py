from visivo.discovery.discover import Discover
from visivo.parsers.parser_factory import ParserFactory
from visivo.models.project import Defaults
import yaml
import click

def parse_project_phase(working_dir, output_dir, default_source):
    discover = Discover(working_dir=working_dir, output_dir=output_dir)
    parser = ParserFactory().build(
        project_file=discover.project_file, files=discover.files
    )
    project = None
    try:
        project = parser.parse()
        if not project.defaults:
            project.defaults = Defaults()
        if default_source:
            project.defaults.source_name = default_source
    except yaml.YAMLError as e:
        message = "\n"
        if hasattr(e, "problem_mark"):
            mark = e.problem_mark
            message = f"\n Error position: line:{mark.line+1} column:{mark.column+1}\n"
        raise click.ClickException(
            f"There was an error parsing the yml file(s):{message} {e}"
        )

    return project