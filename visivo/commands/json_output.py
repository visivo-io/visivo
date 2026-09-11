"""
``--json`` output for ``visivo compile``, ``visivo run`` and ``visivo test``.

An agent driving the CLI should not have to scrape human log lines to find out
what happened. With ``--json`` each of those three commands prints exactly one
JSON object on **stdout** and nothing else; every human-readable line the
command would normally print goes to **stderr** instead. The process exit code
is unchanged, so ``&&`` chains keep working.

THE ENVELOPE (stable; keys are always present)
==============================================

.. code-block:: json

    {
      "visivo_json_version": 1,
      "command": "compile",
      "success": true,
      "cli_version": "2.1.1",
      "duration_ms": 812,
      "result": {},
      "errors": []
    }

``result`` is command-specific and documented on the three ``*_result``
builders below. ``errors`` is always a list -- empty on success -- of objects
with this stable shape:

.. code-block:: json

    {
      "code": "bad_reference",
      "name": "total_units_kpi",
      "message": "The reference \\"ref(orders)\\" does not point to an object.",
      "file": "project.visivo.yml",
      "line": 31,
      "object_path": "project.insights[0]",
      "details": null
    }

Any of ``name``, ``file``, ``line``, ``object_path`` and ``details`` may be
``null`` when the CLI genuinely does not know the value; the key is still
there, so a consumer can index without guarding.
"""

import json
import re
import sys
from contextlib import contextmanager, redirect_stdout
from time import time
from typing import Any, Dict, List, Optional

#: Bump when the envelope changes shape in a way a consumer would notice.
VISIVO_JSON_VERSION = 1

#: The keys every entry of ``errors`` carries, in order. Documented contract:
#: add to the end, never remove, and bump ``VISIVO_JSON_VERSION`` if that ever
#: stops being true.
ERROR_KEY_ORDER = ("code", "name", "message", "file", "line", "object_path", "details")

#: The keys the envelope itself carries, same rules.
ENVELOPE_KEY_ORDER = (
    "visivo_json_version",
    "command",
    "success",
    "cli_version",
    "duration_ms",
    "result",
    "errors",
)

_ANSI = re.compile(r"\x1b\[[0-9;]*m")

#: The list-valued half of ``schema_phase.CORE_PROJECT_PROPERTIES``, minus
#: ``includes`` (Include objects carry a path, not a name).
_PROJECT_COLLECTIONS = (
    "sources",
    "models",
    "metrics",
    "dimensions",
    "relations",
    "insights",
    "charts",
    "tables",
    "markdowns",
    "inputs",
    "dashboards",
    "tests",
)

#: Collections that can also be written *inside* another object rather than at
#: the project root, as ``{parent: {nested: qualify?}}``. Reading only the root
#: reports ``"metrics": []`` for a project whose model-scoped metrics compiled
#: fine, and an agent concludes its edit was dropped. ``qualify`` prefixes the
#: owner's name, spelling the reference a model-scoped metric is used by
#: (``model.metric``); an inline insight keeps a project-wide name and stays bare.
_NESTED_COLLECTIONS = {
    "models": {"metrics": True, "dimensions": True},
    "charts": {"insights": False},
}


def json_output(function):
    """The ``--json`` flag for compile/run/test."""
    import click

    return click.option(
        "--json",
        "json_output",
        help=(
            "Emit a single JSON object on stdout describing the result, and send every "
            "human-readable line to stderr. The shape is documented in "
            "visivo/commands/json_output.py. The exit code is unchanged."
        ),
        is_flag=True,
        default=False,
    )(function)


def strip_ansi(text: Any) -> str:
    return _ANSI.sub("", str(text)) if text is not None else ""


def _error(
    code: str,
    message: str,
    name: Optional[str] = None,
    file: Optional[str] = None,
    line: Optional[int] = None,
    object_path: Optional[str] = None,
    details: Optional[dict] = None,
) -> Dict[str, Any]:
    values = {
        "code": code,
        "name": name,
        "message": strip_ansi(message).strip(),
        "file": file,
        "line": line,
        "object_path": object_path,
        "details": details,
    }
    return {key: values[key] for key in ERROR_KEY_ORDER}


def envelope(
    command: str,
    success: bool,
    result: Optional[dict] = None,
    errors: Optional[List[dict]] = None,
    duration_ms: Optional[int] = None,
) -> Dict[str, Any]:
    from visivo.version import VISIVO_VERSION

    values = {
        "visivo_json_version": VISIVO_JSON_VERSION,
        "command": command,
        "success": success,
        "cli_version": VISIVO_VERSION,
        "duration_ms": duration_ms,
        "result": result if result is not None else {},
        "errors": errors if errors is not None else [],
    }
    return {key: values[key] for key in ENVELOPE_KEY_ORDER}


# ---------------------------------------------------------------------------
# Turning exceptions into the error array.
# ---------------------------------------------------------------------------


def _split_location(location: Optional[str]):
    """``"project.visivo.yml:14"`` -> ``("project.visivo.yml", 14)``.

    Also accepts the ``file:line[column]`` form ``load_yaml_file`` raises for a
    YAML syntax error; the column is dropped, since the envelope reports lines.
    """
    if not location:
        return (None, None)
    # First line only -- the YAML-syntax form continues with "\n  Issue: ..." --
    # and never split on spaces, because a project path may contain one.
    lines = location.strip().splitlines()
    text = lines[0].strip() if lines else ""
    if text.endswith("]") and "[" in text:
        text = text[: text.rindex("[")]
    file_name, separator, line_text = text.rpartition(":")
    if separator and line_text.isdigit():
        return (file_name or None, int(line_text))
    return (text or None, None)


def _location_for(line_validation_error, pydantic_error) -> tuple:
    """Best-effort ``(file, line)`` for one pydantic error entry."""
    try:
        message = line_validation_error.get_line_message(pydantic_error)
    except Exception:
        return (None, None)
    if not message:
        return (None, None)
    _, _, tail = message.partition("Location:")
    return _split_location(tail.strip())


def _name_and_path(pydantic_error) -> tuple:
    """Best-effort ``(name, object_path)`` for one pydantic error entry.

    ``name`` stays ``None`` rather than guessing: for
    ``loc == ("models", 0, "bogus_field")`` the last string is a *field* name,
    and reporting it as the object's name would send an agent to the wrong
    place. ``_resolve_in_files`` fills it in from the YAML when it can.
    """
    context = pydantic_error.get("ctx")
    name = None
    object_path = None
    if isinstance(context, dict):
        name = context.get("name")
        object_path = context.get("path")

    location = pydantic_error.get("loc") or ()
    if object_path is None and location:
        object_path = ".".join(str(part) for part in location)
    return (name, object_path)


def _yaml_documents(files):
    """Re-load the project's YAML with the line-annotating loader."""
    import yaml

    from visivo.parsers.yaml_ordered_dict import setup_yaml_ordered_dict

    setup_yaml_ordered_dict()
    documents = []
    for path in files or []:
        try:
            with open(path, "r") as handle:
                documents.append((str(path), yaml.safe_load(handle)))
        except Exception:
            continue
    return documents


def _find_named(node, name):
    """The mapping in ``node`` whose ``name`` is ``name``, or None."""
    if isinstance(node, dict):
        if node.get("name") == name:
            return node
        for value in node.values():
            found = _find_named(value, name)
            if found is not None:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _find_named(value, name)
            if found is not None:
                return found
    return None


def _key_location(mapping, key: str) -> Optional[str]:
    locator = getattr(mapping, "key_loc", None)
    return locator(key) if callable(locator) else None


def _resolve_in_files(files, name: Optional[str], location) -> tuple:
    """Walk the project YAML for ``(name, file, line)`` the error did not carry.

    Two independent lookups, both structural (the YAML is parsed, not pattern
    matched):

    * a named object -- the ``name:`` key's own file and line;
    * a ``("<collection>", <index>, ...)`` location -- the object at that
      index, but only when exactly one file has such an entry, so a project
      split across ``includes`` reports nothing rather than the wrong object.
    """
    documents = _yaml_documents(files)
    if not documents:
        return (name, None, None)

    if name:
        for file_name, document in documents:
            mapping = _find_named(document, name)
            if mapping is not None:
                return (name, file_name, _split_location(_key_location(mapping, "name"))[1])
        return (name, None, None)

    parts = list(location or ())
    if len(parts) >= 2 and isinstance(parts[0], str) and isinstance(parts[1], int):
        collection, index = parts[0], parts[1]
        candidates = []
        for file_name, document in documents:
            entries = document.get(collection) if isinstance(document, dict) else None
            if isinstance(entries, list) and index < len(entries):
                entry = entries[index]
                if isinstance(entry, dict) and entry.get("name"):
                    candidates.append((entry, file_name))
        if len(candidates) == 1:
            entry, file_name = candidates[0]
            return (
                entry.get("name"),
                file_name,
                _split_location(_key_location(entry, "name"))[1],
            )
    return (name, None, None)


def errors_from_exception(exception: BaseException) -> List[dict]:
    """Flatten any exception the CLI raises into the stable error array."""
    from pydantic import ValidationError

    from visivo.parsers.line_validation_error import LineValidationError

    if isinstance(exception, LineValidationError):
        errors = []
        for pydantic_error in exception.validation_error.errors():
            name, object_path = _name_and_path(pydantic_error)
            file_name, line = _location_for(exception, pydantic_error)
            if name is None or file_name is None or line is None:
                resolved_name, resolved_file, resolved_line = _resolve_in_files(
                    exception.files, name, pydantic_error.get("loc")
                )
                name = name or resolved_name
                file_name = file_name or resolved_file
                line = line if line is not None else resolved_line
            errors.append(
                _error(
                    code=pydantic_error.get("type", "validation_error"),
                    message=pydantic_error.get("msg", ""),
                    name=name,
                    file=file_name,
                    line=line,
                    object_path=object_path,
                )
            )
        return errors or [_error(code="validation_error", message=str(exception))]

    if isinstance(exception, ValidationError):
        errors = []
        for pydantic_error in exception.errors():
            name, object_path = _name_and_path(pydantic_error)
            errors.append(
                _error(
                    code=pydantic_error.get("type", "validation_error"),
                    message=pydantic_error.get("msg", ""),
                    name=name,
                    object_path=object_path,
                )
            )
        return errors or [_error(code="validation_error", message=str(exception))]

    import click

    if isinstance(exception, click.ClickException):
        message = exception.format_message()
        # A YAML syntax error from load_yaml_file already knows where it is:
        # "Invalid yaml in project\n  Location: <file>:<line>[<col>]\n  Issue: ..."
        _, marker, tail = message.partition("Location:")
        file_name, line = _split_location(tail) if marker else (None, None)
        return [_error(code="cli_error", message=message, file=file_name, line=line)]

    return [_error(code=type(exception).__name__, message=str(exception))]


# ---------------------------------------------------------------------------
# Per-command results.
# ---------------------------------------------------------------------------


def _names(collection) -> List[Optional[str]]:
    # Never fall back to str(item): a Pydantic repr of a whole dashboard would
    # bloat the envelope. A null entry is the honest answer for a nameless one.
    return [getattr(item, "name", None) for item in (collection or [])]


def _nested_names(project, parent: str, nested: str, qualify: bool) -> List[Optional[str]]:
    """Members of ``nested`` written inside a ``parent`` object, not at the root."""
    names: List[Optional[str]] = []
    for owner in getattr(project, parent, None) or []:
        owner_name = getattr(owner, "name", None)
        for item in getattr(owner, nested, None) or []:
            name = getattr(item, "name", None)
            names.append(f"{owner_name}.{name}" if qualify and owner_name and name else name)
    return names


def compile_result(project, working_dir: str, output_dir: str) -> Dict[str, Any]:
    """``compile``: what the CLI actually parsed out of the project files.

    ``objects`` maps each authorable project collection to the names it holds,
    so an agent can confirm the object it just wrote was picked up -- including
    the ones written inside another object rather than at the root, per
    ``_NESTED_COLLECTIONS``.
    """
    objects = {
        collection: _names(getattr(project, collection, None))
        for collection in _PROJECT_COLLECTIONS
    }
    for parent, nested_collections in _NESTED_COLLECTIONS.items():
        for nested, qualify in nested_collections.items():
            objects[nested] = objects[nested] + _nested_names(project, parent, nested, qualify)
    return {
        "project_name": getattr(project, "name", None),
        "working_dir": working_dir,
        "output_dir": output_dir,
        "objects": objects,
        "object_counts": {key: len(value) for key, value in objects.items()},
    }


#: The DAG runner formats each job as ``"<summary> ......[STATUS 0.3s]"``,
#: followed by optional ``error:`` and artifact-path continuation lines.
_JOB_LINE = re.compile(r"^(?P<summary>.*?)\s*\.{3,}\s*\[(?P<status>[^\]]*)\]\s*$")

#: Continuation-line prefixes that introduce a *path*: ``query:`` and
#: ``database file:`` from ``job.py``, ``query saved to:`` from
#: ``run_insight_job``. Longest first, so a prefix that extends another still
#: matches its own.
_ARTIFACT_PREFIXES = ("query saved to:", "database file:", "query:")


def _artifact_path(line: str) -> Optional[str]:
    for prefix in _ARTIFACT_PREFIXES:
        if line.startswith(prefix):
            return line[len(prefix) :].strip()
    return None


def parse_job_message(message: Any) -> Dict[str, Optional[str]]:
    """``(summary, status, error, artifact)`` out of one formatted job message.

    A failing insight produces a *block*, not a line::

        Failed job for insight kpi .....[FAILURE 0.5s]
            error: Conversion Error: could not convert 'West' to INTEGER
            LINE 7: SUM(CAST("ev_sales"."region" AS INTEGER)) AS ...
                        ^
            at line 7
            query saved to: target/logs/failed_queries/insight_kpi.sql

    so ``error`` accumulates every line after ``error:`` until a path line ends it.
    """
    lines = [line.strip() for line in strip_ansi(message).split("\n")]
    lines = [line for line in lines if line]
    parsed: Dict[str, Optional[str]] = {
        "summary": lines[0] if lines else None,
        "status": None,
        "error": None,
        "artifact": None,
    }
    if lines:
        match = _JOB_LINE.match(lines[0])
        if match:
            parsed["summary"] = match.group("summary").strip()
            status = match.group("status").split()
            parsed["status"] = status[0] if status else None

    error_lines: List[str] = []
    for line in lines[1:]:
        artifact = _artifact_path(line)
        if artifact is not None:
            parsed["artifact"] = artifact
        elif line.startswith("error:"):
            error_lines = [line[len("error:") :].strip()]
        elif error_lines:
            error_lines.append(line)
        else:
            # A bare path: the success branch of `_format_message` emits one
            # with no prefix when the artifact is neither .sql nor .duckdb.
            parsed["artifact"] = line
    if error_lines:
        parsed["error"] = "\n".join(line for line in error_lines if line)
    return parsed


def _job_entry(job_result) -> Dict[str, Any]:
    item = getattr(job_result, "item", None)
    parsed = parse_job_message(getattr(job_result, "message", ""))
    return {
        "name": getattr(item, "name", None),
        "type": type(item).__name__ if item is not None else None,
        "success": bool(getattr(job_result, "success", False)),
        "summary": parsed["summary"],
        "error": parsed["error"],
        "artifact": parsed["artifact"],
    }


def run_result(runner, project, output_dir: str) -> Dict[str, Any]:
    """``run``: one entry per job the DAG runner executed, in the order it finished.

    Each entry is ``{name, type, success, summary, error, artifact}``: ``summary``
    is the runner's one-line description with its alignment padding removed,
    ``error`` is the exception text for a failed job (``null`` otherwise, and
    often several lines), and ``artifact`` is the path the job wrote or was
    reading (``null`` when the job did not name one).

    ``job_counts.total`` is 0 when the filter matched nothing runnable, and that
    is not a failure: ``visivo run`` exits 0 there too, and ``--json`` promises
    the same exit code. A consumer that needs to know work happened reads
    ``job_counts.total``, not ``success``.
    """
    succeeded = [_job_entry(result) for result in getattr(runner, "successful_job_results", [])]
    failed = [_job_entry(result) for result in getattr(runner, "failed_job_results", [])]
    return {
        "project_name": getattr(project, "name", None),
        "output_dir": output_dir,
        "jobs": succeeded + failed,
        "job_counts": {
            "succeeded": len(succeeded),
            "failed": len(failed),
            "total": len(succeeded) + len(failed),
        },
    }


def run_errors(runner) -> List[dict]:
    errors = []
    for job_result in getattr(runner, "failed_job_results", []):
        item = getattr(job_result, "item", None)
        details = getattr(job_result, "error_details", None)
        parsed = parse_job_message(getattr(job_result, "message", ""))
        errors.append(
            _error(
                code="job_failed",
                message=parsed["error"] or parsed["summary"] or "",
                name=getattr(item, "name", None),
                file=parsed["artifact"],
                object_path=getattr(item, "path", None),
                details=details if isinstance(details, dict) else None,
            )
        )
    return errors


def _test_names(project) -> Dict[str, str]:
    """``{test.path: test.name}`` -- a ``TestRun`` only carries the path."""
    try:
        from visivo.models.test import Test

        return {
            test.path: test.name for test in project.descendants_of_type(type=Test) if test.path
        }
    except Exception:
        return {}


def test_result(test_run, project, output_dir: str) -> Dict[str, Any]:
    """``test``: every assertion the run evaluated, passing and failing.

    Each entry is ``{test_id, name, passed, message}``. ``test_id`` is the
    test's project path (what the runner reports); ``name`` is the test's own
    name, resolved off the project, or ``null`` if it cannot be matched.
    """
    names = _test_names(project)
    results = [
        {
            "test_id": success.test_id,
            "name": names.get(success.test_id),
            "passed": True,
            "message": None,
        }
        for success in getattr(test_run, "successes", [])
    ]
    results += [
        {
            "test_id": failure.test_id,
            "name": names.get(failure.test_id),
            "passed": False,
            "message": strip_ansi(failure.message),
        }
        for failure in getattr(test_run, "failures", [])
    ]
    return {
        "project_name": getattr(project, "name", None),
        "output_dir": output_dir,
        "tests": results,
        "test_counts": {
            "passed": len(getattr(test_run, "successes", [])),
            "failed": len(getattr(test_run, "failures", [])),
            "total": len(results),
        },
    }


def test_errors(test_run, project=None) -> List[dict]:
    names = _test_names(project) if project is not None else {}
    return [
        _error(
            code="test_failed",
            message=failure.message,
            name=names.get(failure.test_id) or failure.test_id,
            object_path=failure.test_id,
        )
        for failure in getattr(test_run, "failures", [])
    ]


# ---------------------------------------------------------------------------
# Emitting.
# ---------------------------------------------------------------------------


def emit(payload: Dict[str, Any], stream=None) -> None:
    """Write one JSON object, and nothing else, to the real stdout."""
    target = stream if stream is not None else sys.stdout
    target.write(json.dumps(payload))
    target.write("\n")
    target.flush()


@contextmanager
def json_command(command: str):
    """Run a command body in ``--json`` mode.

    Everything the body prints to stdout -- ``Logger``, the test runner's dots,
    a stray ``print`` deep in a job -- is rerouted to stderr for the duration,
    so the single JSON object this emits is the only thing on stdout.

    The body receives a mutable dict; set ``result`` on it and, if the command
    failed without raising, ``errors`` and ``success``. Any exception the body
    raises becomes the error array and a non-zero exit.
    """
    real_stdout = sys.stdout
    started = time()
    state: Dict[str, Any] = {"result": None, "errors": [], "success": True}

    def fail(errors: List[dict]) -> None:
        emit(
            envelope(
                command=command,
                success=False,
                result=state.get("result"),
                errors=errors,
                duration_ms=int((time() - started) * 1000),
            ),
            stream=real_stdout,
        )

    try:
        with redirect_stdout(sys.stderr):
            yield state
    except SystemExit as exit_request:
        # Honour the exit code, but never leave stdout empty: an agent that got
        # no JSON cannot tell a crash from a clean run.
        code = exit_request.code
        if code in (0, None):
            raise
        fail(
            state.get("errors")
            or [_error(code="exited", message=f"visivo {command} exited {code}")]
        )
        raise
    except Exception as exception:
        fail(errors_from_exception(exception))
        sys.exit(1)

    success = bool(state.get("success")) and not state.get("errors")
    emit(
        envelope(
            command=command,
            success=success,
            result=state.get("result"),
            errors=state.get("errors") or [],
            duration_ms=int((time() - started) * 1000),
        ),
        stream=real_stdout,
    )
    if not success:
        sys.exit(1)
