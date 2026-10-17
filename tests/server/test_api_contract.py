"""The viewer's API surface against api-contract.yml and the Flask route table.

The viewer is served by `visivo serve` (Flask) and by Visivo Cloud, which does not live in this
repo. api-contract.yml is the one place that says which surface answers each path. This test keeps
the manifest honest on the half it can see: every path the viewer can request has an entry, every
entry claiming `studio` resolves on Flask with the verbs the viewer sends, every studio-only entry
explains itself, and no entry is dead. The cloud half is checked by the cloud repo's parity test
against this same file.
"""

import re
import tempfile
from pathlib import Path

import yaml

from visivo.models.project import Project
from visivo.server.flask_app import FlaskApp

REPO = Path(__file__).resolve().parents[2]
MANIFEST = REPO / "api-contract.yml"
URLS_JS = REPO / "viewer" / "src" / "config" / "urls.js"
VIEWER_SRC = REPO / "viewer" / "src"

PARAM_RE = re.compile(
    r"<(?:[a-z_]+:)?[A-Za-z_][A-Za-z0-9_]*>|\{[A-Za-z_][A-Za-z0-9_]*\}|\$\{[^}]*\}"
)
CALL_RE = re.compile(r"\b(?:apiFetch|fetch)\s*\(")
GETURL_RE = re.compile(r"getUrl\(\s*'([A-Za-z0-9_]+)'")
METHOD_RE = re.compile(r"method:\s*['\"]([A-Z]+)['\"]")
LITERAL_RE = re.compile(r"(['\"`])(/api/[^'\"`\s]*)\1")


def normalise(path):
    p = path if path.startswith("/") else "/" + path
    return PARAM_RE.sub("{}", p).split("?")[0]


def registry(env="server"):
    text = URLS_JS.read_text()
    m = re.search(rf"^\s*{env}:\s*\{{", text, re.M)
    depth, i = 0, m.end() - 1
    start = i
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    return dict(re.findall(r"^\s*([A-Za-z0-9_]+):\s*'([^']+)'", text[start:i], re.M))


def balanced_call_args(text, start):
    depth, i = 0, start
    while i < len(text):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
        i += 1
    return text[start + 1 :]


def split_top_level(args):
    parts, depth, cur = [], 0, []
    for ch in args:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if "".join(cur).strip():
        parts.append("".join(cur).strip())
    return parts


def call_method(args):
    m = METHOD_RE.search(args)
    if m:
        return m.group(1)
    parts = split_top_level(args)
    if len(parts) <= 1 or (parts[1].startswith("{") and "method" not in parts[1]):
        return "GET"
    return None


def viewer_paths():
    """Normalised path -> {"keys", "methods", "sites"} for the registry and every literal call."""
    reg = registry()
    paths = {}
    for key, tmpl in reg.items():
        paths.setdefault(normalise(tmpl), {"keys": set(), "methods": set(), "sites": []})
        paths[normalise(tmpl)]["keys"].add(key)
    for f in sorted(VIEWER_SRC.rglob("*.js*")):
        if ".test." in f.name or "__mocks__" in f.parts or f.suffix not in (".js", ".jsx"):
            continue
        if f == URLS_JS:
            continue
        text = f.read_text()
        rel = str(f.relative_to(REPO / "viewer"))
        seen = set()
        for m in CALL_RE.finditer(text):
            args = balanced_call_args(text, m.end() - 1)
            line = text.count("\n", 0, m.start()) + 1
            key, lit = GETURL_RE.search(args), LITERAL_RE.search(args)
            tmpl = reg.get(key.group(1)) if key else (lit.group(2) if lit else None)
            if not tmpl or tmpl == "/api/":
                continue
            e = paths.setdefault(normalise(tmpl), {"keys": set(), "methods": set(), "sites": []})
            e["sites"].append(f"{rel}:{line}")
            method = call_method(args)
            if method:
                e["methods"].add(method)
            seen.add(line)
        for i, line_text in enumerate(text.splitlines(), 1):
            if i in seen or line_text.strip().startswith(("//", "*", "/*")):
                continue
            for lm in LITERAL_RE.finditer(line_text):
                if lm.group(2) == "/api/":
                    continue
                e = paths.setdefault(
                    normalise(lm.group(2)), {"keys": set(), "methods": set(), "sites": []}
                )
                e["sites"].append(f"{rel}:{i}")
    return paths


def flask_paths():
    app = FlaskApp(tempfile.mkdtemp(), Project(name="api-contract")).app
    out = {}
    for rule in app.url_map.iter_rules():
        out.setdefault(normalise(rule.rule), set()).update(rule.methods - {"HEAD", "OPTIONS"})
    return out


def manifest_entries(manifest):
    entries = {}
    for key, spec in (manifest.get("entries") or {}).items():
        entries[normalise(spec["path"])] = {"id": key, **spec}
    for spec in manifest.get("literals") or []:
        entries[normalise(spec["path"])] = {"id": spec["path"], **spec}
    return entries


def contract_problems(manifest, flask, viewer):
    """Every way the manifest, the Flask routes and the viewer can disagree, as sentences."""
    entries = manifest_entries(manifest)
    problems = []
    for path, v in viewer.items():
        spec = entries.get(path)
        if spec is None:
            problems.append(
                f"viewer path has no manifest entry: {path} keys={sorted(v['keys'])} sites={v['sites'][:2]}"
            )
            continue
        serves = set(spec.get("serves") or [])
        verbs = set() if spec.get("drift") else set(spec.get("verbs") or [])
        if "studio" in serves:
            if path not in flask:
                problems.append(f"{spec['id']}: claims studio but Flask has no route for {path}")
            elif verbs - flask[path]:
                problems.append(
                    f"{spec['id']}: Flask lacks {sorted(verbs - flask[path])} on {path}"
                )
        elif path in flask:
            problems.append(
                f"{spec['id']}: Flask serves {path} but the entry does not claim studio"
            )
        if (
            "studio" in serves
            and "cloud" not in serves
            and not (spec.get("cloud_equivalent") or spec.get("reason"))
        ):
            problems.append(f"{spec['id']}: studio-only with no cloud_equivalent and no reason")
        if not spec.get("drift") and verbs - v["methods"] - {"GET"} and v["methods"]:
            problems.append(
                f"{spec['id']}: lists verbs {sorted(verbs - v['methods'])} the viewer never sends on {path}"
            )
    for path, spec in entries.items():
        if path not in viewer:
            problems.append(f"{spec['id']}: nothing in the viewer references {path}")
    return problems


def test_manifest_matches_viewer_and_flask():
    manifest = yaml.safe_load(MANIFEST.read_text())
    problems = contract_problems(manifest, flask_paths(), viewer_paths())
    assert not problems, "api-contract.yml is out of date:\n  " + "\n  ".join(problems)


def test_every_viewer_registry_key_is_in_the_manifest():
    manifest = yaml.safe_load(MANIFEST.read_text())
    missing = sorted(set(registry()) - set(manifest["entries"]))
    assert not missing, f"registry keys without a manifest entry: {missing}"


def test_contract_problems_detects_each_failure():
    flask = {"/api/sources/": {"GET", "POST"}, "/api/local/": {"POST"}}
    viewer = {
        "/api/sources/": {"keys": {"sourcesList"}, "methods": {"GET", "POST"}, "sites": ["a.js:1"]},
        "/api/local/": {"keys": {"local"}, "methods": {"POST"}, "sites": ["b.js:2"]},
        "/api/new/": {"keys": set(), "methods": {"GET"}, "sites": ["c.js:3"]},
        "/api/ghost/": {"keys": {"ghost"}, "methods": {"GET"}, "sites": ["d.js:4"]},
    }
    manifest = {
        "entries": {
            "sourcesList": {
                "path": "/api/sources/",
                "verbs": ["GET", "POST", "DELETE"],
                "serves": ["studio", "cloud"],
            },
            "local": {"path": "/api/local/", "verbs": ["POST"], "serves": ["studio"]},
            "ghost": {"path": "/api/ghost/", "verbs": ["GET"], "serves": ["studio"], "reason": "x"},
            "dead": {"path": "/api/dead/", "verbs": ["GET"], "serves": ["cloud"]},
        }
    }
    problems = contract_problems(manifest, flask, viewer)
    assert any("no manifest entry: /api/new/" in p for p in problems)
    assert any("sourcesList: Flask lacks ['DELETE']" in p for p in problems)
    assert any("sourcesList: lists verbs ['DELETE'] the viewer never sends" in p for p in problems)
    assert any("local: studio-only with no cloud_equivalent and no reason" in p for p in problems)
    assert any("ghost: claims studio but Flask has no route" in p for p in problems)
    assert any("dead: nothing in the viewer references" in p for p in problems)
    assert len(problems) == 6


def test_contract_problems_is_quiet_when_everything_agrees():
    flask = {"/api/sources/": {"GET", "POST"}}
    viewer = {"/api/sources/": {"keys": {"sourcesList"}, "methods": {"GET"}, "sites": ["a.js:1"]}}
    manifest = {
        "entries": {
            "sourcesList": {
                "path": "/api/sources/",
                "verbs": ["GET"],
                "serves": ["studio", "cloud"],
            }
        }
    }
    assert contract_problems(manifest, flask, viewer) == []


def test_known_drift_skips_the_verb_check_but_not_the_route_check():
    flask = {"/api/p/{}/": {"GET"}}
    viewer = {"/api/p/{}/": {"keys": {"p"}, "methods": {"POST"}, "sites": ["a.js:1"]}}
    manifest = {
        "entries": {
            "p": {
                "path": "/api/p/{id}/",
                "verbs": ["POST"],
                "serves": ["studio", "cloud"],
                "drift": "VIS-1508",
            }
        }
    }
    assert contract_problems(manifest, flask, viewer) == []
    manifest["entries"]["p"]["path"] = "/api/gone/{id}/"
    viewer = {"/api/gone/{}/": viewer["/api/p/{}/"]}
    assert any(
        "claims studio but Flask has no route" in p
        for p in contract_problems(manifest, flask, viewer)
    )
