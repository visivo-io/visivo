"""Phase implementation for the migrate command."""

import os
from collections import defaultdict
from typing import Dict, List

import yaml

from visivo.logger.logger import Logger
from visivo.models.deprecations import DeprecationChecker, MigrationAction


def migrate_phase(working_dir: str, dry_run: bool = True):
    """
    Execute migration of deprecated syntax in YAML files.

    Process:
    1. Check for project.visivo.yml file
    2. Find all YAML files in working directory
    3. Collect all migrations from all deprecation checkers
    4. Group migrations by file
    5. Apply or preview migrations

    Args:
        working_dir: The directory to scan for YAML files
        dry_run: If True, only report what would change without modifying files
    """
    logger = Logger.instance()

    # Check for project.visivo.yml file
    project_file = os.path.join(working_dir, "project.visivo.yml")
    if not os.path.exists(project_file):
        logger.error("No project.visivo.yml file found in the current directory.")
        logger.error("The migrate command must be run from a Visivo project folder.")
        return

    if dry_run:
        logger.info("Running in dry-run mode. Use --apply to make changes.")
        logger.info("")

    # Collect all migrations from all checkers
    checker = DeprecationChecker()
    all_migrations = checker.get_all_migrations(working_dir)

    if not all_migrations:
        logger.success("No deprecated syntax found. Project is up to date!")
        return

    # Group by file
    migrations_by_file: Dict[str, List[MigrationAction]] = defaultdict(list)
    for migration in all_migrations:
        migrations_by_file[migration.file_path].append(migration)

    # Report and optionally apply
    total_migrations = 0
    files_modified = 0

    for file_path, migrations in sorted(migrations_by_file.items()):
        # Make path relative to working dir for cleaner output
        try:
            rel_path = os.path.relpath(file_path, working_dir)
        except ValueError:
            rel_path = file_path

        logger.info(f"\n{rel_path}:")

        for m in migrations:
            desc = f" ({m.description})" if m.description else ""
            logger.info(f"  {m.old_text}")
            logger.info(f"    -> {m.new_text}{desc}")
            total_migrations += 1

        if not dry_run:
            success = _apply_migrations_to_file(file_path, migrations, logger)
            if success:
                files_modified += 1
                logger.success(f"  Applied {len(migrations)} migration(s)")
            else:
                logger.error("  Failed to apply migrations")

    # Summary
    logger.info("")
    if dry_run:
        logger.warn(f"Found {total_migrations} migration(s) in {len(migrations_by_file)} file(s).")
        logger.warn("Run with --apply to make changes.")
    else:
        logger.success(f"Applied {total_migrations} migration(s) to {files_modified} file(s).")


def _apply_migrations_to_file(
    file_path: str,
    migrations: List[MigrationAction],
    logger: Logger,
) -> bool:
    """
    Apply all migrations to a single file.

    Args:
        file_path: Path to the file to modify
        migrations: List of migrations to apply
        logger: Logger instance for output

    Returns:
        True if successful, False if any issues
    """
    try:
        # Read original content
        with open(file_path, "r") as f:
            content = f.read()

        original_content = content

        # Apply all replacements
        for migration in migrations:
            content = content.replace(migration.old_text, migration.new_text)

        # Skip if no changes
        if content == original_content:
            return True

        # Validate the result is still valid YAML
        try:
            yaml.safe_load(content)
        except yaml.YAMLError as e:
            logger.error(f"Migration would create invalid YAML in {file_path}: {e}")
            return False

        # Write updated content
        with open(file_path, "w") as f:
            f.write(content)

        return True

    except Exception as e:
        logger.error(f"Error migrating {file_path}: {e}")
        return False
