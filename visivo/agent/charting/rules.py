"""Loads the rule files under ``rules/`` into the contracts in ``schema``.

YAML, Pydantic-validated, is the single source of truth for chart selection:
reviewers and research subagents author entries without touching code, the
recommender reads them, and the on-demand skills are rendered from them.
"""

from pathlib import Path

import yaml

from visivo.agent.charting.schema import FamilyRule, InteractivityDoc, LayoutDoc

RULES_DIR = Path(__file__).parent / "rules"


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
