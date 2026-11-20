import os
import re
from typing import Optional
from urllib.parse import urlparse

REMOTE_PREFIXES = ("https://", "http://")
DUCKLAKE_PREFIX = "ducklake:"
FILE_CATALOG_PREFIXES = ("sqlite:", "duckdb:")
# Two or more characters, so that a Windows drive letter stays a file path.
NON_FILE_SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]+:")


def is_remote_database(database) -> bool:
    return isinstance(database, str) and database.lower().startswith(REMOTE_PREFIXES)


def is_file_database(database) -> bool:
    """False for ``:memory:`` and for a URI such as ``ducklake:...``, ``md:...`` or ``https://...``."""
    if not isinstance(database, str) or not database or database == ":memory:":
        return False
    return not NON_FILE_SCHEME.match(database)


def ducklake_catalog_file(database) -> Optional[str]:
    """The file of a `ducklake:[sqlite:|duckdb:]<path>` catalog. None for any other value."""
    if not isinstance(database, str) or not database.lower().startswith(DUCKLAKE_PREFIX):
        return None
    path = database[len(DUCKLAKE_PREFIX) :]
    if path.lower().startswith(FILE_CATALOG_PREFIXES):
        path = path.split(":", 1)[1]
    return path if is_file_database(path) else None


def remote_database_alias(database: str) -> str:
    """The name a remote database is attached under: its file stem, as DuckDB names a local one."""
    stem = os.path.splitext(os.path.basename(urlparse(database).path))[0]
    alias = re.sub(r"[^A-Za-z0-9_]", "_", stem) or "remote"
    return alias if not alias[0].isdigit() else f"_{alias}"


URI_DATABASE_PREFIXES = ("md:", "s3://") + REMOTE_PREFIXES


def is_uri_database(database) -> bool:
    """True when ``database`` names a remote database (MotherDuck, S3, HTTPS), not a local file."""
    return str(database or "").lower().startswith(URI_DATABASE_PREFIXES)


def resolve_database_path(database: str, project_dir: Optional[str] = None) -> str:
    if project_dir and not os.path.isabs(database):
        return os.path.join(project_dir, database)
    return database


class DatabaseFileMixin:
    """For a source whose ``database`` is a local file, with optional ``attach`` sources."""

    def check_database_files_exist(self, project_dir: Optional[str] = None):
        """Raise FileNotFoundError when the database file, or an attached one, is missing.

        Connecting creates a missing file, so a connection test must check first. A relative
        path is looked for in ``project_dir`` (the process cwd when it is ``None``). The file
        of a DuckLake catalog (``ducklake:sqlite:<path>``) is checked in the same way.
        """
        databases = [self.get_database()]
        for attachment in getattr(self, "attach", None) or []:
            if attachment.source is not None:
                databases.append(attachment.source.get_database())
            elif getattr(attachment, "ducklake", None) is not None:
                databases.append(attachment.ducklake.catalog_uri())
        for database in databases:
            database = ducklake_catalog_file(database) or database
            if not database or not is_file_database(str(database)):
                continue
            path = resolve_database_path(str(database), project_dir)
            if not os.path.isfile(path):
                raise FileNotFoundError(f"File not found: {path}")
