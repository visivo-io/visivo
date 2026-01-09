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
    Migrate deprecated syntax to current recommended syntax.

    By default runs in dry-run mode, showing what would be changed without
    modifying any files. Use --apply to actually modify files.

    Migrations include:
    - {{ env_var('VAR') }} -> ${env.VAR}
    - ref(name) -> ${refs.name}
    - ${ref(name).property} -> ${refs.name.property}
    """
    from visivo.commands.migrate_phase import migrate_phase

    migrate_phase(
        working_dir=working_dir,
        dry_run=not apply,
    )
