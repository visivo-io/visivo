import importlib.util
import re
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
MKDOCS_DIR = REPO_ROOT / "mkdocs"
DOCS_URL = re.compile(r"https?://docs\.visivo\.io(/[^\s)\"'`<>\]]*)?")


def _load_hook():
    spec = importlib.util.spec_from_file_location(
        "docs_redirects", MKDOCS_DIR / "hooks" / "redirects.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HOOK = _load_hook()


def _config():
    class Loader(yaml.SafeLoader):
        pass

    Loader.add_multi_constructor("tag:yaml.org,2002:python/", lambda loader, suffix, node: None)
    Loader.add_multi_constructor("!", lambda loader, suffix, node: None)
    return yaml.load((REPO_ROOT / "mkdocs.yml").read_text(), Loader=Loader)


def _nav_pages(node):
    if isinstance(node, str):
        if node.endswith(".md"):
            yield node
    elif isinstance(node, list):
        for item in node:
            yield from _nav_pages(item)
    elif isinstance(node, dict):
        for item in node.values():
            yield from _nav_pages(item)


def _page_urls():
    urls = set()
    for page in _nav_pages(_config()["nav"]):
        stem = page[: -len(".md")]
        if stem.endswith("/index"):
            urls.add(stem[: -len("index")])
        elif stem == "index":
            urls.add("")
        else:
            urls.add(stem + "/")
    return urls


def _normalize(path):
    path = (path or "/").split("#")[0].split("?")[0].lstrip("/")
    if path and not path.endswith("/"):
        path += "/"
    return path


def _resolves(path):
    key = _normalize(path)
    return key in _page_urls() or key.rstrip("/") in HOOK.REDIRECTS


def _agent_text_sources():
    sources = {p: p.read_text() for p in (REPO_ROOT / "visivo" / "agent").rglob("*.md")}
    for py in (
        REPO_ROOT / "visivo" / "agent" / "skills.py",
        REPO_ROOT / "visivo" / "commands" / "init_phase.py",
    ):
        sources[py] = py.read_text()
    return sources


def test_guessed_paths_redirect_to_real_pages():
    assert set(HOOK.REDIRECTS) >= {"quickstart", "cli", "deployments", "topics/dbt"}
    pages = _page_urls()
    for source, target in HOOK.REDIRECTS.items():
        assert _normalize(target) in pages, f"/{source}/ redirects to missing page {target}"
        assert _normalize(source) not in pages, f"/{source}/ is a real page; drop the redirect"


def test_every_docs_url_in_agent_material_resolves():
    failures = []
    for path, text in _agent_text_sources().items():
        for match in DOCS_URL.finditer(text):
            if not _resolves(match.group(1)):
                failures.append(f"{path.relative_to(REPO_ROOT)}: {match.group(0)}")
    assert failures == [], "docs.visivo.io URLs with no page or redirect:\n" + "\n".join(failures)


def test_resolver_rejects_unknown_paths():
    assert _resolves("/topics/deployments/")
    assert _resolves("/quickstart")
    assert not _resolves("/no/such/page/")


def test_hook_writes_redirect_pages(tmp_path):
    config = {"site_dir": str(tmp_path), "site_url": "https://docs.visivo.io"}
    (tmp_path / "cli").mkdir()
    (tmp_path / "cli" / "index.html").write_text("real")
    HOOK.on_post_build(config)
    quickstart = (tmp_path / "quickstart" / "index.html").read_text()
    assert 'url=/"' in quickstart
    assert (tmp_path / "cli" / "index.html").read_text() == "real"
    assert "/topics/deployments/" in (tmp_path / "deployments" / "index.html").read_text()
    assert (
        "/reference/configuration/Dbt/" in (tmp_path / "topics" / "dbt" / "index.html").read_text()
    )


def test_hook_respects_site_url_prefix(tmp_path):
    HOOK.on_post_build({"site_dir": str(tmp_path), "site_url": "https://example.test/docs/"})
    assert "/docs/reference/cli/" in (tmp_path / "cli" / "index.html").read_text()
