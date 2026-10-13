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
on every PR. The guards:

``test_quickstart_yaml_fences_parse``
    Every ``yaml`` fence on the page is loaded and constructed with the real
    ``Project`` model (the technique landed in #636 for the ``init`` scaffold).
    A fence that a new user copies must be a fence the parser accepts.

``test_quickstart_chart_examples_keep_their_insights``
    Parsing is not enough. ``Chart.insights`` defaults to ``[]``, so a chart
    that lists none validates, compiles, exits 0 and renders an *empty* chart —
    the only signal is ``No jobs run.``, which this same page teaches means
    "nothing to build yet". A chart example that a reader may paste over their
    working one must therefore carry its ``insights:`` list.

``test_quickstart_commands_and_flags_exist``
    Every ``visivo ...`` invocation in a ``bash`` fence is resolved against the
    real Click app: the subcommand must exist, every flag must be a declared
    option on it, **and** every value handed to a ``click.Choice`` option must
    be one of that option's real choices. Names alone were not enough — with
    only the name check, rewriting the page's headline command to ``visivo init
    --example nyc-taxi`` kept the whole module green while the real CLI answers
    ``Invalid value for '--example'``.

``test_example_table_matches_the_enum`` / ``..._chart_types_match_the_samples``
    The three example names and the chart types each one shows are advertised in
    a markdown table, which no fence guard can see. They are pinned to
    ``ExampleTypeEnum`` and to ``visivo/templates/samples/`` directly.

``test_quickstart_names_the_macos_floor_install_sh_enforces``
    Step 1 is a ``curl | bash`` line, and ``install.sh`` hard-exits on macOS
    below a version it hardcodes. The page must name the same number.

Both fence guards are page-scoped on purpose. Widening them to the whole
``mkdocs/`` tree is tracked separately (docs example harness); the Quick Start
is the page that earns a dedicated gate.
"""

import re
import shlex
import warnings
from pathlib import Path

import click
import pytest
import yaml

from visivo.command_line import visivo
from visivo.models.example_type import ExampleTypeEnum
from visivo.models.project import Project

# tests/docs/test_quickstart_truth.py -> parents[2] == repo root.
REPO_ROOT = Path(__file__).resolve().parents[2]
QUICKSTART = REPO_ROOT / "mkdocs" / "index.md"
INSTALL_SCRIPT = REPO_ROOT / "install.sh"

FENCE_RE = re.compile(r"^([ \t]*)```(\w+)[ \t]*\n(.*?)^\1```[ \t]*$", re.MULTILINE | re.DOTALL)
# Any fence opener at all, tagged or not. `_fences` can only see tagged ones,
# so an untagged fence is content nothing on this page validates.
ANY_FENCE_OPEN_RE = re.compile(r"^[ \t]*```(\S*)[ \t]*$", re.MULTILINE)


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


@pytest.mark.parametrize("language,minimum", [("yaml", 1), ("bash", 5)])
def test_fences_are_discovered(language, minimum):
    """Discovery sanity: if the extractor silently matches nothing, the guards
    below pass vacuously and the page is unguarded again.

    The floors are the page's *current* counts, deliberately with no slack. A
    floor of 4 against 5 real bash fences let the headline
    ``visivo init --example ev-sales`` fence lose its ```bash tag and stop being
    checked while this test stayed green.
    """
    found = list(_fences(language))
    assert len(found) >= minimum, f"Only found {len(found)} {language} fences in {QUICKSTART}"


def test_every_fence_declares_a_language():
    """The other half of the anti-vacuity check.

    ``FENCE_RE`` needs a language tag, so an untagged fence is invisible to both
    guards — dropping a tag is the cheapest way to smuggle unvalidated YAML or
    an unvalidated command onto the page. Openers and closers alternate, so the
    tag on every odd-numbered opener must be non-empty.
    """
    tags = ANY_FENCE_OPEN_RE.findall(QUICKSTART.read_text())
    assert len(tags) % 2 == 0, f"Unbalanced code fences in {QUICKSTART}: {tags}"
    untagged = [index for index, tag in enumerate(tags) if index % 2 == 0 and not tag]
    assert untagged == [], (
        f"{QUICKSTART.name} has {len(untagged)} fence(s) with no language tag; "
        "nothing on this page validates their contents."
    )


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


def test_quickstart_chart_examples_keep_their_insights():
    """A chart example on this page must carry the insights it wraps.

    ``Chart.insights`` is ``List[InsightRef] = Field([])``. A chart that lists
    none is therefore *valid*: the project compiles, ``visivo run`` exits 0, the
    dashboard item renders an empty chart, and the only diagnostic anywhere is
    ``No jobs run. Ensure your filter contains nodes that are runnable.`` — the
    exact string this page elsewhere teaches means "nothing to build yet".

    So an excerpt that shows a ``- name:`` line without ``insights:`` is a trap:
    a reader who pastes it over their working chart silently orphans the
    insight. Either elide the ``- name:`` line, or keep ``insights:``.
    """
    failures = []
    for line_no, body in _fences("yaml"):
        document = yaml.safe_load(body)
        if not isinstance(document, dict):
            continue
        for chart in document.get("charts") or []:
            if not isinstance(chart, dict) or "name" not in chart:
                continue
            if not chart.get("insights"):
                failures.append(
                    f"{QUICKSTART.name}:{line_no} chart {chart['name']!r} declares no `insights:`; "
                    "pasted over a working chart it renders empty and only logs `No jobs run.`"
                )
    assert failures == [], "Quick Start charts that build nothing:\n" + "\n".join(failures)


def _option_flags(command):
    flags = set()
    for param in command.params:
        if param.param_type_name == "option":
            flags.update(param.opts)
            flags.update(param.secondary_opts)
    return flags


def _options_by_flag(command):
    """Map every spelling of every option back to the Click ``Option`` itself.

    ``_option_flags`` answers "does this flag exist"; this answers "and what may
    follow it", which is what catches ``--example nyc-taxi``.
    """
    mapping = {}
    for param in command.params:
        if param.param_type_name == "option":
            for opt in list(param.opts) + list(param.secondary_opts):
                mapping[opt] = param
    return mapping


def _choice_failures(command_label, line_label, tokens, options):
    """Check every ``click.Choice`` option's VALUE, not just its name."""
    failures = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        index += 1
        if not token.startswith("-"):
            continue
        flag, separator, inline_value = token.partition("=")
        param = options.get(flag)
        if param is None or getattr(param, "is_flag", False):
            continue
        if separator:
            value = inline_value
        elif index < len(tokens) and not tokens[index].startswith("-"):
            value = tokens[index]
            index += 1
        else:
            continue
        if isinstance(param.type, click.Choice) and value not in param.type.choices:
            failures.append(
                f"{line_label} `{command_label} {flag} {value}` is rejected by the CLI: "
                f"{flag} accepts {list(param.type.choices)}"
            )
    return failures


def test_quickstart_commands_and_flags_exist():
    """Every `visivo ...` line on the page must resolve against the real CLI."""
    failures = []
    for line_no, body in _fences("bash"):
        for raw_line in body.splitlines():
            line = raw_line.split("#", 1)[0].strip()
            if not line.startswith("visivo"):
                continue
            tokens = shlex.split(line)[1:]
            label = f"{QUICKSTART.name}:{line_no}"

            if not tokens or tokens[0].startswith("-"):
                # A group-level invocation such as `visivo --version`.
                group_flags = _option_flags(visivo) | {"--help"}
                unknown = [
                    token.split("=", 1)[0]
                    for token in tokens
                    if token.startswith("-") and token.split("=", 1)[0] not in group_flags
                ]
                if unknown:
                    failures.append(f"{label} unknown group flags {unknown}")
                continue

            name = tokens[0]
            command = visivo.commands.get(name)
            if command is None:
                failures.append(f"{label} `visivo {name}` is not a command")
                continue

            arguments = tokens[1:]
            known = _option_flags(command) | {"--help"}
            unknown = [
                token.split("=", 1)[0]
                for token in arguments
                if token.startswith("-") and token.split("=", 1)[0] not in known
            ]
            if unknown:
                failures.append(f"{label} `visivo {name}` has no {unknown}")
                continue

            failures.extend(
                _choice_failures(f"visivo {name}", label, arguments, _options_by_flag(command))
            )

    assert failures == [], "Quick Start CLI usage that does not exist:\n" + "\n".join(failures)


EXAMPLE_ROW_NAME_RE = re.compile(r"^`([a-z0-9-]+)`$")


def _example_table_rows():
    """Return ``{example_name: [cell, ...]}`` for the ``--example`` table.

    The header row's first cell is ``` `--example` value ```, which does not
    match ``EXAMPLE_ROW_NAME_RE``, so it drops out along with the ``| --- |``
    separator.
    """
    text = QUICKSTART.read_text()
    header = text.find("| `--example` value |")
    assert header != -1, (
        f"{QUICKSTART.name} no longer has an `--example` table. Either restore it or "
        "delete this guard deliberately — do not let it pass vacuously."
    )
    rows = {}
    for line in text[header:].split("\n\n", 1)[0].splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        match = EXAMPLE_ROW_NAME_RE.match(cells[0])
        if match:
            rows[match.group(1)] = cells
    return rows


def test_example_table_matches_the_enum():
    """The example names live in a markdown table, which no fence guard sees.

    ``--example`` is a ``click.Choice`` over ``ExampleTypeEnum``; drop or rename
    a member and the table starts advertising a value that hard-errors. The
    table is the page's answer to "which examples can I pick", so it is pinned
    to the enum in both directions.
    """
    advertised = set(_example_table_rows())
    real = {member.value for member in ExampleTypeEnum}
    assert (
        advertised == real
    ), f"Quick Start advertises {sorted(advertised)} but ExampleTypeEnum is {sorted(real)}"


SAMPLES_DIR = REPO_ROOT / "visivo" / "templates" / "samples"


def _sample_insight_types(example):
    """Every ``props.type`` the bundled sample actually uses."""
    document = yaml.safe_load((SAMPLES_DIR / example / "project.visivo.yml").read_text())
    types = set()
    for insight in document.get("insights") or []:
        props = insight.get("props") if isinstance(insight, dict) else None
        if isinstance(props, dict) and "type" in props:
            types.add(props["type"])
    return types


def test_example_table_chart_types_match_the_samples():
    """The third column promises which chart types each example shows.

    That column is prose about files sitting in this repo, so nothing stops it
    drifting when a sample is retuned. Pin it to the samples themselves.
    """
    failures = []
    for name, cells in _example_table_rows().items():
        advertised = {cell.strip().strip("`") for cell in cells[2].split(",")}
        real = _sample_insight_types(name)
        if advertised != real:
            failures.append(
                f"{name}: page says {sorted(advertised)}, "
                f"templates/samples/{name} uses {sorted(real)}"
            )
    assert failures == [], "Quick Start example table drifted from the samples:\n" + "\n".join(
        failures
    )


def test_quickstart_names_the_macos_floor_install_sh_enforces():
    """Step 1 pipes ``install.sh`` into bash, and that script hard-exits on old
    macOS before it downloads anything. The page has to name the same floor."""
    match = re.search(r'BASH_REMATCH\[1\]\}"\s*-lt\s*(\d+)', INSTALL_SCRIPT.read_text())
    assert match, f"Could not find the macOS version gate in {INSTALL_SCRIPT}"
    floor = match.group(1)
    assert f"macOS {floor} or later" in QUICKSTART.read_text(), (
        f"{INSTALL_SCRIPT.name} requires macOS {floor} or later; "
        f"{QUICKSTART.name} must say so in step 1."
    )


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
