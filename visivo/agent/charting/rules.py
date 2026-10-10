"""Loads the rule files under ``rules/`` into the contracts in ``schema``.

YAML, Pydantic-validated, is the single source of truth for chart selection:
reviewers and research subagents author entries without touching code, the
recommender reads them, and the on-demand skills are rendered from them.
"""

from pathlib import Path

import yaml

from visivo.agent.charting.schema import FamilyRule, TraceEntry

RULES_DIR = Path(__file__).parent / "rules"
TRACES_DIR = RULES_DIR / "traces"


def load_families(path=None):
    """``[FamilyRule]`` from ``families.yml``, in file order."""
    path = Path(path) if path else RULES_DIR / "families.yml"
    loaded = yaml.safe_load(path.read_text()) or {}
    families = loaded.get("families")
    if not isinstance(families, list) or not families:
        raise ValueError(f"{path}: expected a non-empty 'families' list")
    rules = [FamilyRule(**entry) for entry in families]
    names = [rule.name for rule in rules]
    duplicates = sorted({n for n in names if names.count(n) > 1})
    if duplicates:
        raise ValueError(f"{path}: duplicate families {duplicates}")
    return rules


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
