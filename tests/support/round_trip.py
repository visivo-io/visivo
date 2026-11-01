"""VIS-1198: parse → write → re-parse must not lose anything.

The gate on everything that writes to a customer's repo. If a write silently
drops a key the parser did not model, the repo loses user config — and because
the repo is the source of truth, that loss is authoritative. It is invisible in
review (the diff looks fine) and surfaces later as a dashboard that stopped
rendering.

The round trip exercised here is the visivo half:

    parse → named_child_nodes() → ProjectWriter → re-parse

``assemble_project`` — the other stage the card names — lives in **core**
(`apps/deploys/services/assembler.py`), not here, so the cloud half of the round
trip needs its own harness on that side.
"""

import os
import shutil

from visivo.discovery.discover import Discover
from visivo.parsers.parser_factory import ParserFactory
from visivo.server.project_writer import ProjectWriter

# The Project root is not an object the writer edits, and an inline-defined
# child is written as part of whatever contains it — rewriting either as a
# standalone top-level entry would be a change the round trip never makes.
SKIP_TYPES = ("Project",)


def plain(value):
    """A plain-dict view, for comparison.

    Never compare loaded YAML mappings directly: `setup_yaml_ordered_dict()`
    registers `YamlOrderedDict` globally on `yaml.SafeLoader`, and it extends
    `OrderedDict`, whose `__eq__` is ORDER-SENSITIVE. A fidelity harness that
    compares those reports every key reorder as data loss — which is the one
    thing it must not do, since the formatter reorders keys on purpose.
    """
    if isinstance(value, dict):
        return {key: plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    return value


def parse_project(working_dir):
    discover = Discover(working_dir=working_dir, output_dir=os.path.join(working_dir, "target"))
    return ParserFactory().build(project_file=discover.project_file, files=discover.files).parse()


def comparable(project):
    """What the round trip compares: every named object's config, by name.

    Configs rather than raw file text, because the writer is allowed to move a
    key or requote a scalar — it is not allowed to change what the project
    means. Comparing bytes would fail on formatting; comparing parsed configs
    fails only on lost or altered data, which is the actual risk.
    """
    return {
        name: plain(entry.get("config"))
        for name, entry in project.named_child_nodes().items()
        if entry.get("type") not in SKIP_TYPES
    }


def rewrite_every_object(working_dir):
    """Feed every object back through ProjectWriter as an unchanged edit.

    Marking everything ``Modified`` is the worst case a cloud commit can
    produce, and the one most likely to expose a lossy write path: a real commit
    only touches what changed, so a bug here would otherwise surface only for
    whichever object happened to be edited.
    """
    project = parse_project(working_dir)
    lineage_keyed = project.named_child_nodes()

    # `named_child_nodes()` keys model-scoped metrics/dimensions by
    # `<model>.<name>`, because a bare name may repeat across models. But the
    # inline/ref markers embedded in configs carry the BARE name, and
    # `ProjectWriter._get_named_child_config` looks them up with it — so its
    # dict has to be bare-keyed, which is what `commit_views` passes (its keys
    # come from `cached_objects`). Feeding the lineage-keyed map straight in
    # KeyErrors on the first model-scoped field.
    # Every entry has to STAY in the map even when it is not being rewritten:
    # a parent's config holds a marker for its inline children, and
    # `__reconstruct_named_child_config` resolves those with
    # `named_children[name]`. Dropping them KeyErrors on the first inline chart.
    named_children = {}
    for key, entry in lineage_keyed.items():
        bare_name = key.split(".")[-1]
        is_model_scoped = key != bare_name
        # A model-scoped field is written as part of its model's config rather
        # than standalone, so it is still exercised — it rides along inside the
        # model marked Modified below.
        skip_write = (
            entry.get("type") in SKIP_TYPES or entry.get("is_inline_defined") or is_model_scoped
        )
        entry["status"] = "Unchanged" if skip_write else "Modified"
        # On a bare-name collision prefer the top-level object over a
        # model-scoped alias, since that is what a marker means by the name.
        if bare_name not in named_children or not is_model_scoped:
            named_children[bare_name] = entry

    writer = ProjectWriter(named_children)
    writer.update_file_contents()
    writer.write()


def copy_project(source_dir, destination_dir):
    """Work on a copy — the harness writes files."""
    shutil.copytree(source_dir, destination_dir, dirs_exist_ok=True)
    return str(destination_dir)


def assert_round_trips(working_dir):
    """Rewrite every object, re-parse, and assert nothing changed."""
    before = comparable(parse_project(working_dir))
    rewrite_every_object(working_dir)
    after = comparable(parse_project(working_dir))

    missing = sorted(set(before) - set(after))
    added = sorted(set(after) - set(before))
    assert not missing, f"objects lost by the round trip: {missing}"
    assert not added, f"objects invented by the round trip: {added}"

    changed = {name: (before[name], after[name]) for name in before if before[name] != after[name]}
    assert not changed, f"configs changed by the round trip: {sorted(changed)}"
