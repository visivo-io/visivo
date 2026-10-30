import os
from typing import Optional


def resolve_database_path(database: str, project_dir: Optional[str] = None) -> str:
    if project_dir and not os.path.isabs(database):
        return os.path.join(project_dir, database)
    return database


class DatabaseFileMixin:
    """For a source whose ``database`` is a local file, with optional ``attach`` sources."""

    def check_database_files_exist(self, project_dir: Optional[str] = None):
        """Raise FileNotFoundError when the database file, or an attached one, is missing.

        Connecting creates a missing file, so a connection test must check first. A relative
        path is looked for in ``project_dir`` (the process cwd when it is ``None``).
        """
        databases = [self.get_database()]
        for attachment in getattr(self, "attach", None) or []:
            databases.append(attachment.source.get_database())
        for database in databases:
            if not database or database == ":memory:":
                continue
            path = resolve_database_path(str(database), project_dir)
            if not os.path.isfile(path):
                raise FileNotFoundError(f"File not found: {path}")
