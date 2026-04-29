import os
import click
from visivo.commands.options import project_dir
from visivo.models.example_type import ExampleTypeEnum


@click.command()
@project_dir
@click.option(
    "--example",
    type=click.Choice([e.value for e in ExampleTypeEnum]),
    help="Load an example project from GitHub",
    default=None,
)
@click.option(
    "--bare",
    is_flag=True,
    default=False,
    help="Only write the project files; do not auto-launch the dev server.",
)
@click.option(
    "--headless",
    is_flag=True,
    default=False,
    help="Do not open the browser when the dev server starts.",
)
@click.option(
    "--no-onboarding",
    is_flag=True,
    default=False,
    help="When auto-launching the dev server, do not append ?onboarding=1 to the URL.",
)
@click.option(
    "-p",
    "--port",
    help="What port to serve on when auto-launching the dev server",
    default=8000,
)
def init(project_dir, example, bare, headless, no_onboarding, port):
    """
    Initialize a new Visivo project.

    By default, creates a scaffolded project.visivo.yml file with commented examples
    and continues into `visivo serve` to open the in-browser onboarding wizard.

    Use --example to load an example project from GitHub instead of the scaffold.
    Use --bare to skip auto-launching the dev server.
    Use --headless to skip opening the browser.
    Use --no-onboarding to skip the ?onboarding=1 query param when launching the browser.
    """
    from visivo.logger.logger import Logger

    Logger.instance().debug("Init")

    from visivo.commands.init_phase import init_phase

    project_file_path = init_phase(project_dir, example)

    Logger.instance().success("Done")

    if bare:
        return

    # Auto-launch the dev server pointed at the freshly-initialized project.
    final_project_dir = project_dir or "."
    from visivo.commands.serve_phase import serve_phase
    from visivo.commands.parse_project_phase import parse_project_phase

    output_dir = os.path.join(os.path.abspath(final_project_dir), "target")
    server_url = f"http://localhost:{port}"

    project = parse_project_phase(
        working_dir=os.path.abspath(final_project_dir),
        output_dir=output_dir,
        default_source=None,
        dbt_profile=None,
        dbt_target=None,
    )

    server, on_change, on_ready = serve_phase(
        output_dir=output_dir,
        working_dir=os.path.abspath(final_project_dir),
        default_source=None,
        dag_filter=None,
        threads=None,
        skip_compile=False,
        project=project,
        server_url=server_url,
        new=not headless,
        onboarding=not no_onboarding,
        no_deprecation_warnings=False,
    )

    Logger.instance().info(f"Server running at {server_url}")
    server.serve(
        host="0.0.0.0",
        port=port,
        on_change_callback=on_change,
        on_server_ready=on_ready,
    )
