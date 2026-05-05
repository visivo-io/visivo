"""CLI command for migrating deprecated syntax to current recommended syntax."""

import click
from visivo.commands.options import working_dir


@click.command()
@working_dir
@click.option(
    "--apply",
    is_flag=True,
    default=False,
    help="Apply migrations to files. Default is dry-run mode.",
)
def migrate(working_dir, apply):
    """
    Migrate deprecated syntax in a Visivo project to its current
    recommended form.

    By default the command runs in dry-run mode, reporting what would
    change without modifying any files. Use --apply to write the
    changes back to disk.
    """
    from visivo.commands.migrate_phase import migrate_phase

    migrate_phase(
        working_dir=working_dir,
        dry_run=not apply,
    )
