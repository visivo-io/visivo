"""The Quick Start page must be executable, not aspirational.

``mkdocs/index.md`` is the single most-read page Visivo publishes, and in the
2.1 field test it was also the least true one. It told new users three things
that the CLI does not do:

1. "``visivo serve``  ... Visivo will prompt you to select from several example
   dashboards" — ``visivo/commands/serve.py`` contains no prompt of any kind.
   In an empty directory it builds an in-memory ``Project(name="Quickstart
   Visivo")`` with empty lists and logs "No jobs run."
2. The same claim repeated in a "what happens behind the scenes" tip block.
3. A YAML sample (``layout: {title: Monthly Revenue}``) that the tool's own
   parser rejects — ``layout.title`` must be an object, not a string.

Every one of those was *checkable from the code*, so this module checks them
on every PR. Two guards:

``test_quickstart_yaml_fences_parse``
    Every ``yaml`` fence on the page is loaded and constructed with the real
    ``Project`` model (the technique landed in #636 for the ``init`` scaffold).
    A fence that a new user copies must be a fence the parser accepts.

``test_quickstart_commands_and_flags_exist``
    Every ``visivo ...`` invocation in a ``bash`` fence is resolved against the
    real Click app: the subcommand must exist and every flag must be a declared
    option on it. This is what would have caught "``--example`` loads from
    GitHub" style drift, and it is why the page can name flags at all.

Both guards are page-scoped on purpose. Widening them to the whole ``mkdocs/``
tree is tracked separately (docs example harness); the Quick Start is the page
that earns a dedicated gate.
"""

import re
import warnings
from pathlib import Path

import pytest
import yaml

from visivo.command_line import visivo
from visivo.models.project import Project

# tests/docs/test_quickstart_truth.py -> parents[2] == repo root.
REPO_ROOT = Path(__file__).resolve().parents[2]
QUICKSTART = REPO_ROOT / "mkdocs" / "index.md"

FENCE_RE = re.compile(r"^([ \t]*)```(\w+)[ \t]*\n(.*?)^\1```[ \t]*$", re.MULTILINE | re.DOTALL)


def _fences(language):
    """Yield (line_number, dedented_body) for every fence of ``language``.

    Fences nested inside an admonition are indented; the body is dedented by
    the fence's own indent so it round-trips through a YAML parser.
    """
    text = QUICKSTART.read_text()
    for match in FENCE_RE.finditer(text):
        indent, lang, body = match.group(1), match.group(2), match.group(3)
        if lang != language:
            continue
        line_no = text.count("\n", 0, match.start()) + 1
        if indent:
            body = "\n".join(
                line[len(indent) :] if line.startswith(indent) else line
                for line in body.splitlines()
            )
        yield line_no, body


def test_quickstart_page_exists():
    assert QUICKSTART.is_file(), f"Quick Start page missing at {QUICKSTART}"


@pytest.mark.parametrize("language,minimum", [("yaml", 2), ("bash", 4)])
def test_fences_are_discovered(language, minimum):
    """Discovery sanity: if the extractor silently matches nothing, the two
    guards below pass vacuously and the page is unguarded again."""
    found = list(_fences(language))
    assert len(found) >= minimum, f"Only found {len(found)} {language} fences in {QUICKSTART}"


def test_quickstart_yaml_fences_parse():
    """Every YAML fence must construct the real Project model.

    Partial fences (an excerpt showing only ``charts:``) are wrapped into a
    minimal project document, which is exactly how a reader would paste them.
    """
    failures = []
    for line_no, body in _fences("yaml"):
        try:
            document = yaml.safe_load(body)
        except yaml.YAMLError as error:
            failures.append(f"{QUICKSTART.name}:{line_no} is not valid YAML: {error}")
            continue

        assert isinstance(document, dict), f"{QUICKSTART.name}:{line_no} is not a YAML mapping"
        if "name" not in document:
            document = {"name": "docs-example", **document}

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                Project.model_validate(document)
        except Exception as error:  # pydantic ValidationError and friends
            failures.append(f"{QUICKSTART.name}:{line_no} rejected by Project: {error}")

    assert failures == [], "Quick Start YAML the parser rejects:\n" + "\n\n".join(failures)


def _option_flags(command):
    flags = set()
    for param in command.params:
        if param.param_type_name == "option":
            flags.update(param.opts)
            flags.update(param.secondary_opts)
    return flags


def test_quickstart_commands_and_flags_exist():
    """Every `visivo ...` line on the page must resolve against the real CLI."""
    failures = []
    for line_no, body in _fences("bash"):
        for raw_line in body.splitlines():
            line = raw_line.split("#", 1)[0].strip()
            if not line.startswith("visivo"):
                continue
            tokens = line.split()[1:]
            words = [token for token in tokens if not token.startswith("-")]
            flags = [token.split("=", 1)[0] for token in tokens if token.startswith("-")]

            if not words:
                # A group-level invocation such as `visivo --version`.
                group_flags = _option_flags(visivo) | {"--help"}
                unknown = [flag for flag in flags if flag not in group_flags]
                if unknown:
                    failures.append(f"{QUICKSTART.name}:{line_no} unknown group flags {unknown}")
                continue

            name = words[0]
            command = visivo.commands.get(name)
            if command is None:
                failures.append(f"{QUICKSTART.name}:{line_no} `visivo {name}` is not a command")
                continue

            known = _option_flags(command) | {"--help"}
            unknown = [flag for flag in flags if flag not in known]
            if unknown:
                failures.append(f"{QUICKSTART.name}:{line_no} `visivo {name}` has no {unknown}")

    assert failures == [], "Quick Start CLI usage that does not exist:\n" + "\n".join(failures)


def test_quickstart_does_not_claim_serve_prompts_for_an_example():
    """`visivo serve` has never had a prompt; `visivo init --example` is the
    command that installs one. Keep the page from regrowing the claim."""
    text = QUICKSTART.read_text().lower()
    failures = []
    if "visivo init --example" not in text:
        failures.append("Quick Start must lead with `visivo init --example`")
    for phrase in (
        "prompt you to select",
        "prompts you to choose",
        "choose from available examples",
        "initializes the selected example",
    ):
        if phrase in text:
            failures.append(f"Quick Start re-states the refuted claim: {phrase!r}")
    assert failures == [], "\n".join(failures)
