from time import time
from datetime import datetime, timezone

compile_import_start = time()
from visivo.logger.logger import Logger

Logger.instance().debug("Compiling project...")
import json
import os

from visivo.parsers.serializer import Serializer
from visivo.parsers.line_validation_error import LineValidationError
from visivo.commands.parse_project_phase import parse_project_phase

import_duration = round(time() - compile_import_start, 2)
Logger.instance().debug(f"Compile Import completed in {import_duration}s")


def _collect_compile_telemetry(project):
    """Collect telemetry metrics during compile phase."""
    try:
        from visivo.telemetry.command_tracker import track_compile_metrics

        track_compile_metrics(project)
    except Exception:
        # Silently ignore any telemetry errors
        pass


def _serialize_validation_error(line_error: LineValidationError) -> dict:
    """Convert a LineValidationError into the structured shape consumed by the
    viewer's CompileErrorBanner.

    The shape is:
    {
        "compile_failed": True,
        "errors": [
            {"loc": [...], "msg": "...", "type": "...", "file": "...", "line": N}
        ],
        "summary": "<N validation errors in <Title>>",
        "compiled_at": "<iso8601 utc>"
    }

    The ``file`` and ``line`` fields are populated when YamlOrderedDict source
    locations are available; otherwise they are omitted (never fabricated).
    """
    validation_error = line_error.validation_error
    structured_errors = []

    for err in validation_error.errors():
        entry = {
            "loc": [str(part) for part in err.get("loc", [])],
            "msg": err.get("msg", ""),
            "type": err.get("type", ""),
        }
        # Try to extract a file:line hint from the LineValidationError helper.
        line_hint = line_error.get_line_message(err)
        if line_hint:
            # ``line_hint`` looks like " Location: /abs/path:LINE\n" — extract
            # the final ":N" segment without resorting to a regex parse.
            cleaned = line_hint.strip()
            if cleaned.startswith("Location:"):
                cleaned = cleaned[len("Location:") :].strip()
            if ":" in cleaned:
                file_part, _, line_part = cleaned.rpartition(":")
                if file_part and line_part.isdigit():
                    entry["file"] = file_part
                    entry["line"] = int(line_part)
        structured_errors.append(entry)

    return {
        "compile_failed": True,
        "errors": structured_errors,
        "summary": (
            f"{validation_error.error_count()} validation errors " f"in {validation_error.title}"
        ),
        "compiled_at": datetime.now(timezone.utc).isoformat(),
    }


def _print_compile_failure(error_payload: dict, project_file_path: str = None):
    """Print a clear, terminal-friendly compile-failure summary.

    Uses the existing logger system rather than ``print()`` so the output
    integrates with spinners and CI mode.
    """
    log = Logger.instance()
    summary = error_payload.get("summary", "Compile failed")
    errors = error_payload.get("errors", [])
    log.error(f"⚠ Compile failed ({len(errors)} errors). Last good state preserved.")
    for err in errors:
        loc = ".".join(err.get("loc", []))
        msg = err.get("msg", "")
        # Strip the "Value error, " prefix Pydantic emits for our model
        # validators — it's noise for end users.
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, ") :]
        file_hint = err.get("file")
        location_prefix = f"{file_hint}: " if file_hint else ""
        line_hint = f" (line {err['line']})" if err.get("line") else ""
        log.error(f"  → {location_prefix}{msg} at {loc}{line_hint}")
    log.error(f"\nSummary: {summary}")


def compile_phase(
    default_source: str,
    working_dir: str,
    output_dir: str,
    dbt_profile: str = None,
    dbt_target: str = None,
    no_deprecation_warnings: bool = False,
    project=None,
):
    # Track parse project - skip if project already provided
    parse_start = time()
    if project is None:
        Logger.instance().debug("    Running parse project phase...")
        try:
            project = parse_project_phase(
                working_dir, output_dir, default_source, dbt_profile, dbt_target
            )
        except LineValidationError as line_error:
            # Make sure the output directory exists so we always have a place
            # to write error.json — even on first compile of a brand-new project.
            os.makedirs(output_dir, exist_ok=True)

            error_payload = _serialize_validation_error(line_error)
            with open(f"{output_dir}/error.json", "w") as fp:
                json.dump(error_payload, fp)

            _print_compile_failure(error_payload)

            # Re-raise so callers (CLI, hot-reload) can react. project.json is
            # intentionally left untouched: the previous, last-known-good
            # project remains in place for the viewer.
            raise

        parse_duration = round(time() - parse_start, 2)
        Logger.instance().debug(f"Project parsing completed in {parse_duration}s")
    else:
        Logger.instance().debug("    Using provided project, skipping parse phase...")
        parse_duration = 0.0

    # Run deprecation checks (non-blocking)
    if not no_deprecation_warnings:
        from visivo.models.deprecations import DeprecationChecker

        checker = DeprecationChecker()
        warnings = checker.check_all(project)
        checker.report(warnings)

    # Collect project metrics for telemetry
    _collect_compile_telemetry(project)

    # Track artifacts writing
    artifacts_start = time()
    Logger.instance().debug("    Writing artifacts...")

    # Use single Serializer instance for both operations
    serializer = Serializer(project=project)

    with open(f"{output_dir}/project.json", "w") as fp:
        fp.write(serializer.dereference().model_dump_json(exclude_none=True))

    explorer_data = serializer.create_flattened_project()
    with open(f"{output_dir}/explorer.json", "w") as fp:
        json.dump(explorer_data, fp)

    with open(f"{output_dir}/error.json", "w") as fp:
        fp.write(json.dumps({}))

    artifacts_duration = round(time() - artifacts_start, 2)
    Logger.instance().debug(f"Project artifacts written in {artifacts_duration}s")

    total_duration = round(time() - parse_start, 2)

    Logger.instance().success(
        f"Compile completed in {total_duration}s "
        f"imports: {import_duration}s, "
        f"parse: {parse_duration}s, "
        f"artifacts: {artifacts_duration}s, "
    )

    return project
