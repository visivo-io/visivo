"""Path-segment validation shared by the read-only schema views.

Both the model and source schema endpoints interpolate a user-supplied name and
optional ``run_id`` query param directly into the on-disk artifact path
(``{output_dir}/{run_id}/schemas/{name}/schema.json``). Without a strict
allowlist a caller could smuggle ``..`` / ``/`` segments and traverse outside
the output directory, so every such value is validated here before it reaches
the filesystem.
"""

import re

# Names and run_ids are simple identifiers (e.g. ``main``, ``preview-<uuid>``,
# ``orders``); anything with a path separator or a parent-directory reference is
# rejected outright.
_SAFE_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")


def is_safe_path_segment(value) -> bool:
    """True when ``value`` is a filesystem-safe single path segment.

    Rejects non-strings, empty strings, anything outside the allowlist charset
    (which already excludes ``/`` and ``\\``), and any ``..`` parent-directory
    reference.
    """
    return isinstance(value, str) and bool(_SAFE_SEGMENT_PATTERN.match(value)) and ".." not in value
