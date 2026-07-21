"""Migrates the removed CsvScriptModel and LocalMergeModel shapes.

A csv script model (a model with ``args:``) becomes a DuckDB source carrying a
``seeds:`` entry, plus a plain sql model pointed at it. That is a 1:1 rewrite of
the old behaviour, which already created one ``{output_dir}/models/{name}.duckdb``
per csv script model.

A local merge model (a model with ``models:``) is reported but never rewritten —
folding several models' SQL into one is a judgement call, not a mechanical edit.
"""

import io
import re
from typing import TYPE_CHECKING, List, Optional, Tuple

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    RewriteAction,
    UnmigratableWarning,
)
from visivo.utils import list_all_ymls_in_dir

if TYPE_CHECKING:
    from visivo.models.project import Project

SEED_DATABASE_DIR = "target/seeds"

# ```yaml / ```yml fenced blocks in markdown, capturing the block body
MARKDOWN_YAML_FENCE = re.compile(
    r"(?P<open>^```ya?ml[^\n]*\n)(?P<body>.*?)(?P<close>^```)", re.M | re.S
)

LOCAL_MERGE_GUIDANCE = (
    "rewrite as a sql model whose own SQL does the join, with every input "
    "seeded onto one shared source"
)


def _yaml():
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096  # don't re-wrap long scalars
    yaml.indent(mapping=2, sequence=4, offset=2)
    return yaml


def _slugify(name: str) -> str:
    """A filesystem-safe stem for a seed's DuckDB file."""
    return re.sub(r"[^a-zA-Z0-9]+", "_", str(name)).strip("_").lower() or "seed"


def is_csv_script_model(model) -> bool:
    return isinstance(model, dict) and "args" in model


def is_local_merge_model(model) -> bool:
    return isinstance(model, dict) and "models" in model and "args" not in model


def _unique_source_name(base: str, taken) -> str:
    name = base
    suffix = 2
    while name in taken:
        name = f"{base}-{suffix}"
        suffix += 1
    return name


def _build_source(model: CommentedMap, taken_source_names) -> Tuple[CommentedMap, str, str]:
    """Return (source, source_name, table_name) for a csv script model."""
    model_name = model.get("name")
    table_name = model.get("table_name", "model")
    source_name = _unique_source_name(f"{model_name}-source", taken_source_names)

    seed = CommentedMap()
    seed["table_name"] = table_name
    seed["args"] = model["args"]
    if model.get("allow_empty"):
        seed["allow_empty"] = model["allow_empty"]

    seeds = CommentedSeq()
    seeds.append(seed)

    source = CommentedMap()
    source["name"] = source_name
    source["type"] = "duckdb"
    source["database"] = f"{SEED_DATABASE_DIR}/{_slugify(model_name)}.duckdb"
    source["seeds"] = seeds

    return source, source_name, table_name


def _rewrite_model(model: CommentedMap, source_name: str, table_name: str) -> CommentedMap:
    """Turn a csv script model into a sql model pointed at its new source.

    Keys other than the csv-script ones are carried through untouched so
    anything else authored on the model survives the migration.
    """
    rewritten = CommentedMap()
    rewritten["name"] = model.get("name")
    rewritten["source"] = f"${{ref({source_name})}}"
    rewritten["sql"] = f"select * from {table_name}"
    for key, value in model.items():
        if key not in ("name", "args", "table_name", "allow_empty", "source", "sql"):
            rewritten[key] = value
    return rewritten


def collect_names(node, into=None) -> set:
    """Every ``name:`` value anywhere in a document.

    Visivo names are global across object types — a generated source name can
    collide with an existing dashboard just as easily as with another source —
    so uniqueness has to be checked against all of them, project-wide.
    """
    names = set() if into is None else into
    if isinstance(node, dict):
        name = node.get("name")
        if isinstance(name, str):
            names.add(name)
        for value in node.values():
            collect_names(value, names)
    elif isinstance(node, list):
        for value in node:
            collect_names(value, names)
    return names


def migrate_document(document, taken_names: Optional[set] = None) -> Optional[List[str]]:
    """Rewrite every csv script model in a parsed YAML document, in place.

    Args:
        document: The parsed YAML document to rewrite
        taken_names: Names already claimed project-wide. Mutated as names are
            allocated so a multi-file migration cannot mint the same name twice.

    Returns:
        A description per migrated model, or None when nothing changed.
    """
    if not isinstance(document, dict):
        return None

    models = document.get("models")
    if not isinstance(models, list):
        return None

    csv_indexes = [i for i, model in enumerate(models) if is_csv_script_model(model)]
    if not csv_indexes:
        return None

    sources = document.get("sources")
    if not isinstance(sources, list):
        sources = CommentedSeq()
        # Sources read better above the models that reference them
        keys = list(document.keys())
        position = keys.index("models") if "models" in keys else len(keys)
        document.insert(position, "sources", sources)

    taken = collect_names(document) if taken_names is None else taken_names
    descriptions = []

    for index in csv_indexes:
        model = models[index]
        source, source_name, table_name = _build_source(model, taken)
        taken.add(source_name)
        sources.append(source)
        models[index] = _rewrite_model(model, source_name, table_name)
        descriptions.append(
            f"model '{model.get('name')}' (csv script) -> source '{source_name}' "
            f"with a seed, plus a sql model"
        )

    return descriptions


def migrate_yaml_text(
    text: str, taken_names: Optional[set] = None
) -> Optional[Tuple[str, List[str]]]:
    """Rewrite csv script models in a YAML string. Returns None when unchanged."""
    yaml = _yaml()
    try:
        document = yaml.load(text)
    except Exception:
        return None

    descriptions = migrate_document(document, taken_names)
    if not descriptions:
        return None

    stream = io.StringIO()
    yaml.dump(document, stream)
    return stream.getvalue(), descriptions


def migrate_markdown_text(
    text: str, taken_names: Optional[set] = None
) -> Optional[Tuple[str, List[str]]]:
    """Rewrite csv script models inside every yaml fence of a markdown string."""
    descriptions = []

    def replace(match):
        migrated = migrate_yaml_text(match.group("body"), taken_names)
        if not migrated:
            return match.group(0)
        body, block_descriptions = migrated
        descriptions.extend(block_descriptions)
        return f"{match.group('open')}{body}{match.group('close')}"

    result = MARKDOWN_YAML_FENCE.sub(replace, text)
    if not descriptions:
        return None
    return result, descriptions


def _local_merge_names(document) -> List[str]:
    if not isinstance(document, dict):
        return []
    models = document.get("models")
    if not isinstance(models, list):
        return []
    return [m.get("name") for m in models if is_local_merge_model(m)]


class ModelTypeDeprecationChecker(BaseDeprecationChecker):
    """Migrates csv script models; reports local merge models as manual work."""

    def check(self, project: "Project") -> List[DeprecationWarning]:
        # Both types fail to parse now, so a parsed project can never carry them.
        return []

    def can_migrate(self) -> bool:
        return True

    def _files(self, working_dir: str, include_markdown: bool):
        for path in list_all_ymls_in_dir(working_dir):
            yield path, False
        if include_markdown:
            import os

            for root, _dirs, files in os.walk(working_dir):
                if any(part.startswith(".") for part in root.split(os.sep)):
                    continue
                for name in files:
                    if name.endswith(".md"):
                        yield os.path.join(root, name), True

    def _taken_names(self, working_dir: str, include_markdown: bool) -> set:
        """Every name already used anywhere in the project.

        Collected up front, across all files, so generated source names collide
        with neither an existing object nor another file's generated name.
        """
        yaml = _yaml()
        taken = set()
        for path, is_markdown in self._files(working_dir, include_markdown):
            try:
                with open(path, "r") as file:
                    text = file.read()
            except (OSError, UnicodeDecodeError):
                continue

            bodies = (
                [match.group("body") for match in MARKDOWN_YAML_FENCE.finditer(text)]
                if is_markdown
                else [text]
            )
            for body in bodies:
                try:
                    collect_names(yaml.load(body), taken)
                except Exception:
                    continue
        return taken

    def get_rewrites_from_files(
        self, working_dir: str, include_markdown: bool = False
    ) -> List[RewriteAction]:
        rewrites = []
        taken_names = self._taken_names(working_dir, include_markdown)
        for path, is_markdown in self._files(working_dir, include_markdown):
            try:
                with open(path, "r") as file:
                    text = file.read()
            except (OSError, UnicodeDecodeError):
                continue

            migrated = (
                migrate_markdown_text(text, taken_names)
                if is_markdown
                else migrate_yaml_text(text, taken_names)
            )
            if migrated:
                new_content, descriptions = migrated
                rewrites.append(
                    RewriteAction(
                        file_path=path, new_content=new_content, descriptions=descriptions
                    )
                )
        return rewrites

    def get_unmigratable(
        self, working_dir: str, include_markdown: bool = False
    ) -> List[UnmigratableWarning]:
        warnings = []
        yaml = _yaml()
        for path, is_markdown in self._files(working_dir, include_markdown):
            try:
                with open(path, "r") as file:
                    text = file.read()
            except (OSError, UnicodeDecodeError):
                continue

            bodies = (
                [match.group("body") for match in MARKDOWN_YAML_FENCE.finditer(text)]
                if is_markdown
                else [text]
            )
            for body in bodies:
                try:
                    document = yaml.load(body)
                except Exception:
                    continue
                for name in _local_merge_names(document):
                    warnings.append(
                        UnmigratableWarning(
                            file_path=path,
                            subject=f"model '{name}' (local merge)",
                            guidance=LOCAL_MERGE_GUIDANCE,
                        )
                    )
        return warnings
