"""Turn a config's validation error into something an agent can act on.

Pydantic's text names the field it refused and nothing about what it would have
accepted, and it ends each line with a documentation link. An agent reading
"Extra inputs are not permitted" for `insight` on a dashboard item guesses, and
in practice it guessed again and again.
"""

import re
from functools import lru_cache

_PYDANTIC_LINK = re.compile(r"\s*For further information visit https://errors\.pydantic\.dev\S*")

# Set by the parser on every object, never written by an author.
_INTERNAL_FIELDS = {"path", "file_path"}


def clean_message(error) -> str:
    return _PYDANTIC_LINK.sub("", str(error)).strip()


@lru_cache(maxsize=1)
def _schema():
    from visivo.agent.schema import _project_schema

    return _project_schema()


def _resolve(node):
    defs = _schema().get("$defs", {})
    while isinstance(node, dict) and isinstance(node.get("$ref"), str):
        node = defs.get(node["$ref"].rsplit("/", 1)[-1], {})
    return node


def _branches(node):
    found = []
    for key in ("anyOf", "oneOf"):
        for branch in node.get(key, []):
            branch = _resolve(branch)
            found.extend(
                _branches(branch) if ("anyOf" in branch or "oneOf" in branch) else [branch]
            )
    return found


def _is_tag(branch, key):
    tag = branch.get("properties", {}).get("type", {})
    return key in (tag.get("const"), branch.get("title"))


def _step(node, key):
    node = _resolve(node)
    if isinstance(key, int):
        return node.get("items") if node.get("type") == "array" else None
    if key in node.get("properties", {}):
        return node["properties"][key]
    branches = _branches(node)
    tagged = [branch for branch in branches if _is_tag(branch, key)]
    if tagged:
        return tagged[0]
    if key == "Ref" and branches:
        return {"type": "string"}
    holding = [branch for branch in branches if key in branch.get("properties", {})]
    return holding[0]["properties"][key] if holding else None


def allowed_fields(type_key, loc):
    """The fields the object holding ``loc[-1]`` accepts, or ``None`` when the
    location cannot be followed through the schema."""
    node = _schema().get("properties", {}).get(type_key, {}).get("items")
    for key in loc[:-1]:
        node = _step(node, key) if node is not None else None
    if node is None:
        return None
    node = _resolve(node)
    objects = [node] if node.get("properties") else _branches(node)
    fields = []
    for branch in objects:
        for name in branch.get("properties", {}):
            if name not in _INTERNAL_FIELDS and name not in fields:
                fields.append(name)
    return fields or None


def _a(noun):
    return f"{'an' if noun[:1] in 'aeiou' else 'a'} {noun}"


def _join(names):
    quoted = [f"`{name}`" for name in names]
    return quoted[0] if len(quoted) == 1 else ", ".join(quoted[:-1]) + " or " + quoted[-1]


def generic_hints(type_key, problems):
    """Hints any type's error earns: which fields are allowed where one was
    refused, and how to write a reference where a bare name was given."""
    hints = []
    refused = {}
    for problem in problems:
        loc = tuple(problem.get("loc") or ())
        if problem.get("type") == "extra_forbidden" and loc:
            refused.setdefault(loc[:-1], []).append(loc[-1])
        elif problem.get("type") == "string_pattern_mismatch" and loc and loc[-1] == "Ref":
            given = problem.get("input")
            name = given.strip() if isinstance(given, str) and given.strip() else "name"
            field = next((part for part in reversed(loc[:-1]) if isinstance(part, str)), None)
            target = f"`{field}`" if field else "This field"
            hints.append(
                f"{target} takes a reference to another object, not its bare name: "
                f"write `${{ref({name})}}`."
            )
    for holder_loc, names in refused.items():
        fields = allowed_fields(type_key, holder_loc + (names[0],))
        if not fields:
            continue
        holder = next((part for part in reversed(holder_loc) if isinstance(part, str)), None)
        where = f"An entry in `{holder}`" if holder else _a(type_key[:-1]).capitalize()
        noun = "field" if len(names) == 1 else "fields"
        hints.append(
            f"{where} has no {_join(names)} {noun}. It accepts: "
            + ", ".join(f"`{name}`" for name in fields)
            + "."
        )
    return hints
