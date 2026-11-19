"""Plain column names for file sources whose headers were written for people."""

import re
import unicodedata


def tidy_column_name(name: str) -> str:
    """``Status (checked Nov 3)`` -> ``status_checked_nov_3``: lowercase ASCII
    words joined by underscores, so the column can be named in SQL unquoted."""
    ascii_name = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    tidy = re.sub(r"[^0-9a-zA-Z]+", "_", ascii_name).strip("_").lower() or "column"
    return f"_{tidy}" if tidy[0].isdigit() else tidy


def tidy_column_names(names):
    """Tidy each name, numbering repeats (``pay``, ``pay_2``) so none collide."""
    taken, result = set(), []
    for name in names:
        base = tidy_column_name(name)
        tidy, n = base, 2
        while tidy in taken:
            tidy, n = f"{base}_{n}", n + 1
        taken.add(tidy)
        result.append(tidy)
    return result


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def select_list(connection, reader_sql: str, tidy: bool) -> str:
    """The projection for a view over ``reader_sql``: ``*``, or every column
    renamed to its tidy name."""
    if not tidy:
        return "*"
    names = [
        row[0] for row in connection.execute(f"DESCRIBE SELECT * FROM {reader_sql}").fetchall()
    ]
    return ", ".join(
        f"{_quote(name)} AS {_quote(new)}" for name, new in zip(names, tidy_column_names(names))
    )
