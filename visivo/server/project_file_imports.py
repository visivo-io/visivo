"""Inspect or import a project file (docs/contracts/project-files-and-credentials.md)."""

import datetime
import decimal
import os
import uuid
from typing import Optional

from visivo.server.project_file_uploads import UploadError, format_for

PREVIEW_ROWS = 20
ENCODINGS = {"utf-8", "utf-16", "latin-1"}


def resolve_file(root: str, path) -> str:
    """Absolute path of a project-relative ``path`` that stays inside ``root``."""
    if not isinstance(path, str) or not path.strip():
        raise UploadError("Send the file's path.", "invalid_request", 400)
    parts = path.split("/")
    if path.startswith("/") or "\\" in path or ".." in parts or "" in parts:
        raise UploadError(
            "Send a project-relative path such as files/sales.csv.", "invalid_request", 400
        )
    root = os.path.realpath(root)
    absolute = os.path.join(root, *parts)
    real = os.path.realpath(absolute)
    if os.path.commonpath([root, real]) != root or not os.path.isfile(real):
        raise UploadError(f"{path} is not a file in this project.", "not_found", 404)
    return real


def reader_options(path: str, options) -> dict:
    if options is None:
        options = {}
    if not isinstance(options, dict):
        raise UploadError("options must be an object.", "invalid_request", 400)
    allowed = set(format_for(path)["options"])
    chosen = {
        "header": True,
        "delimiter": "\t" if path.lower().endswith(".tsv") else ",",
        "encoding": "utf-8",
    }
    for key, value in options.items():
        if key not in allowed:
            continue
        if key == "header" and not isinstance(value, bool):
            raise UploadError("header must be true or false.", "invalid_request", 400)
        if key == "delimiter" and not (isinstance(value, str) and len(value) == 1):
            raise UploadError("delimiter must be one character.", "invalid_request", 400)
        if key == "encoding" and value not in ENCODINGS:
            raise UploadError(
                f"encoding must be one of {', '.join(sorted(ENCODINGS))}.", "invalid_request", 400
            )
        chosen[key] = value
    return chosen


def _json_value(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (datetime.date, datetime.datetime, datetime.time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return str(value)


def preview_csv(absolute_path: str, name: str, options: dict) -> dict:
    import duckdb

    connection = duckdb.connect(":memory:")
    try:
        relation = connection.read_csv(
            absolute_path,
            header=options["header"],
            sep=options["delimiter"],
            encoding=options["encoding"],
        )
        columns = [
            {"name": column, "type": str(column_type)}
            for column, column_type in zip(relation.columns, relation.types)
        ]
        rows = [[_json_value(v) for v in row] for row in relation.limit(PREVIEW_ROWS).fetchall()]
        row_count = relation.aggregate("count(*)").fetchone()[0]
    finally:
        connection.close()
    return {"name": name, "columns": columns, "rows": rows, "row_count": row_count}


def source_config(source_name: str, path: str, options: dict) -> dict:
    return {
        "name": source_name,
        "type": "csv",
        "file": path,
        "delimiter": options["delimiter"],
        "encoding": options["encoding"],
        "has_header": options["header"],
    }


def existing_import(source_manager, source_name: str, path: str) -> Optional[bool]:
    """True when ``source_name`` already reads ``path``, False when the name is taken
    by another source, None when it is free."""
    source = source_manager.get(source_name)
    if source is None:
        return None
    return getattr(source, "type", None) == "csv" and getattr(source, "file", None) == path
