"""Loads the rule files under ``rules/`` into the contracts in ``schema``.

YAML, Pydantic-validated, is the single source of truth for chart selection:
reviewers and research subagents author entries without touching code, the
recommender reads them, and the on-demand skills are rendered from them.
"""

from pathlib import Path

import yaml

from visivo.agent.charting.schema import (
    FAMILIES,
    KNOWN_TYPES,
    TABLE_TYPES,
    FamiliesDoc,
    InteractivityDoc,
    LayoutDoc,
    PairingsDoc,
    TablesDoc,
    TraceEntry,
    TransformsDoc,
    split_pairing,
)

RULES_DIR = Path(__file__).parent / "rules"
TRACES_DIR = RULES_DIR / "traces"


class _Loader(yaml.SafeLoader):
    """Plain dicts: the project parser makes SafeLoader build YamlOrderedDict,
    which safe_dump cannot write back."""


_Loader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, yaml.SafeLoader.construct_yaml_map
)


def load_yaml(text):
    return yaml.load(text, Loader=_Loader)


def _mapping(path):
    loaded = load_yaml(Path(path).read_text()) or {}
    if not isinstance(loaded, dict):
        raise ValueError(f"{path}: expected a mapping")
    return loaded


def _load(model, path):
    loaded = _mapping(path)
    try:
        return model(**loaded)
    except ValueError as error:
        raise ValueError(f"{path}: {error}") from error


def load_transforms(path=None):
    """The ``TransformsDoc`` from ``transforms.yml``."""
    return _load(TransformsDoc, path or RULES_DIR / "transforms.yml")


def load_pairings(path=None):
    """The ``PairingsDoc`` from ``pairings.yml``."""
    return _load(PairingsDoc, path or RULES_DIR / "pairings.yml")


def unresolved_names(entries, transforms, pairings):
    """``["<type>: <name>", ...]`` for every repair, transform, pairing and
    alternative an entry names that no rule file defines. A repair may also
    name a chart type or family to switch to."""
    charts = set(KNOWN_TYPES) | set(FAMILIES)
    known = {t.name for t in transforms.transforms}
    problems = []
    for entry in entries:
        problems += [
            f"{entry.type}: repair {n}"
            for n in entry.limits.repair
            if n not in known and n not in charts
        ]
        problems += [f"{entry.type}: transform {n}" for n in entry.transforms if n not in known]
        problems += [
            f"{entry.type}: alternative {n}" for n in entry.alternatives if n not in charts
        ]
        for reference in entry.pairings:
            name, arg = split_pairing(reference)
            pairing = pairings.get(name)
            if pairing is None or (
                arg is not None and (pairing.param is None or arg not in charts)
            ):
                problems.append(f"{entry.type}: pairing {reference}")
    return problems


def _resolve(rule, entries, path):
    """Attach the entries ``rule`` claims, preferred first, and check the
    claim agrees with what each entry says about itself."""
    by_type = {e.type: e for e in entries}
    missing = [t for t in rule.trace_types if t not in by_type]
    if missing:
        raise ValueError(f"{path}: {rule.name} claims {missing}, which have no entry")
    wrong = [t for t in rule.trace_types if rule.name not in by_type[t].families()]
    if wrong:
        raise ValueError(f"{path}: {rule.name} claims {wrong}, whose entries name other families")
    tables = [e for e in entries if e.type in TABLE_TYPES and rule.name in e.families()]
    members = [by_type[t] for t in rule.trace_types] + tables
    if members and (rule.data_shape is not None or rule.layout is not None):
        raise ValueError(
            f"{path}: {rule.name} restates data_shape or layout; they come from its entries"
        )
    if not members and rule.data_shape is None:
        raise ValueError(f"{path}: {rule.name} has no entries, so it needs its own data_shape")
    return rule.model_copy(update={"members": members})


def load_family_doc(path=None, entries=None):
    """The ``FamiliesDoc`` with every family's member entries attached.

    Fails, naming the file, when a family claims a type whose entry names a
    different family, when an entry's family claims nothing, when a family
    restates what its entries hold, or when an entry names a repair,
    transform or pairing that no rule file defines.
    """
    path = Path(path) if path else RULES_DIR / "families.yml"
    loaded = _mapping(path)
    families = loaded.get("families")
    if not isinstance(families, list) or not families:
        raise ValueError(f"{path}: expected a non-empty 'families' list")
    if any(isinstance(f, dict) and "members" in f for f in families):
        raise ValueError(f"{path}: members are attached from traces/, never written")
    doc = FamiliesDoc(**loaded)
    names = [rule.name for rule in doc.families]
    duplicates = sorted({n for n in names if names.count(n) > 1})
    if duplicates:
        raise ValueError(f"{path}: duplicate families {duplicates}")
    entries = load_traces() if entries is None else entries
    resolved = [_resolve(rule, entries, path) for rule in doc.families]
    claimed = {(t, rule.name) for rule in doc.families for t in rule.trace_types}
    unclaimed = [
        f"{e.type} ({family})"
        for e in entries
        if e.type not in TABLE_TYPES
        for family in e.families()
        if (e.type, family) not in claimed
    ]
    if unclaimed:
        raise ValueError(f"{path}: no family claims {unclaimed}")
    problems = unresolved_names(entries, load_transforms(), load_pairings())
    if problems:
        raise ValueError(f"unresolved names in traces/: {problems}")
    return doc.model_copy(update={"families": resolved})


def load_families(path=None, entries=None):
    """``[FamilyRule]`` from ``families.yml``, in file order, each with its
    member entries attached."""
    return load_family_doc(path, entries).families


def load_layout(path=None):
    """The ``LayoutDoc`` from ``layout.yml``."""
    path = Path(path) if path else RULES_DIR / "layout.yml"
    loaded = yaml.safe_load(path.read_text()) or {}
    if not isinstance(loaded, dict):
        raise ValueError(f"{path}: expected a mapping")
    try:
        return LayoutDoc(**loaded)
    except Exception as error:
        raise ValueError(f"{path}: {error}") from error


def load_traces(path=None):
    """``[TraceEntry]`` from ``rules/traces/*.yml``, sorted by type.

    One file per type, named after it, so a reviewer can find an entry
    without opening the loader. Validation errors name the file.
    """
    directory = Path(path) if path else TRACES_DIR
    entries = []
    for file in sorted(directory.glob("*.yml")):
        loaded = yaml.safe_load(file.read_text())
        if not isinstance(loaded, dict):
            raise ValueError(f"{file}: expected a mapping")
        try:
            entry = TraceEntry(**loaded)
        except Exception as error:
            raise ValueError(f"{file}: {error}") from error
        if entry.type != file.stem:
            raise ValueError(f"{file}: file is named '{file.stem}' but the entry is '{entry.type}'")
        entries.append(entry)
    return entries


def load_interactivity(path=None):
    """The ``InteractivityDoc`` from ``interactivity.yml``."""
    path = Path(path) if path else RULES_DIR / "interactivity.yml"
    loaded = yaml.safe_load(path.read_text()) or {}
    if not isinstance(loaded, dict):
        raise ValueError(f"{path}: expected a mapping")
    try:
        return InteractivityDoc(**loaded)
    except Exception as error:
        raise ValueError(f"{path}: {error}") from error


def load_tables(path=None):
    """The ``TablesDoc`` from ``tables.yml``."""
    path = Path(path) if path else RULES_DIR / "tables.yml"
    loaded = yaml.safe_load(path.read_text()) or {}
    if not isinstance(loaded, dict):
        raise ValueError(f"{path}: expected a mapping")
    try:
        return TablesDoc(**loaded)
    except Exception as error:
        raise ValueError(f"{path}: {error}") from error
