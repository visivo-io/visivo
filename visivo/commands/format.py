import click
from visivo.commands.options import output_dir, working_dir


@click.command()
@click.argument("paths", nargs=-1, type=click.Path())
@working_dir
@output_dir
@click.option(
    "--check",
    is_flag=True,
    default=False,
    help="Report files that are not canonical and exit non-zero. Writes nothing.",
)
def format(working_dir, output_dir, paths, check):
    """
    Rewrites your project's YAML in a canonical style: a fixed key order per object type,
    consistent indentation and quoting, and multi-line SQL as a block scalar. Comments are
    preserved. With no PATHS, formats every file in the project.

    Use --check in CI to fail when a file is not already formatted.
    """
    from visivo.logger.logger import Logger

    from visivo.commands.format_phase import format_phase

    changed = format_phase(
        working_dir=working_dir,
        output_dir=output_dir,
        paths=paths,
        check=check,
    )

    if check and changed:
        raise click.ClickException(f"{changed} file(s) are not formatted. Run 'visivo format'.")

    if not check and changed:
        Logger.instance().success(f"Formatted {changed} file(s)")
