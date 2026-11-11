import re
from pathlib import Path

import yaml
from mkdocs.structure.files import File, Files
from mkdocs_redirects.plugin import RedirectPlugin

REPO_ROOT = Path(__file__).resolve().parents[2]
MKDOCS_DIR = REPO_ROOT / "mkdocs"
DOCS_URL = re.compile(r"https?://docs\.visivo\.io(/[^\s)\"'`<>\]]*)?")


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


def _url(page):
    stem = page[: -len(".md")]
    if stem == "index":
        return ""
    if stem.endswith("/index"):
        return stem[: -len("index")]
    return stem + "/"


def _page_urls():
    return {_url(page) for page in _nav_pages(_config()["nav"])}


def _redirect_maps():
    for plugin in _config()["plugins"]:
        if isinstance(plugin, dict) and "redirects" in plugin:
            return plugin["redirects"]["redirect_maps"]
    raise AssertionError("mkdocs.yml does not configure the redirects plugin")


def _redirect_urls():
    return {_url(source): _url(target) for source, target in _redirect_maps().items()}


def _normalize(path):
    path = (path or "/").split("#")[0].split("?")[0].lstrip("/")
    if path and not path.endswith("/"):
        path += "/"
    return path


def _resolves(path):
    key = _normalize(path)
    return key in _page_urls() or key in _redirect_urls()


def _guarded_text_sources():
    paths = [
        *(REPO_ROOT / "visivo" / "agent").rglob("*.md"),
        REPO_ROOT / "visivo" / "agent" / "skills.py",
        *(REPO_ROOT / "visivo" / "commands").rglob("*.py"),
    ]
    return {p: p.read_text() for p in paths}


def test_guessed_paths_redirect_to_real_pages():
    redirects = _redirect_urls()
    assert set(redirects) >= {
        "quickstart/",
        "get-started/installation/",
        "cli/",
        "deployments/",
        "topics/dbt/",
    }
    pages = _page_urls()
    for source, target in redirects.items():
        assert target in pages, f"/{source} redirects to {target}, which is not in the nav"
        assert source not in pages, f"/{source} is a real page; drop the redirect"


def test_guard_scans_every_cli_command_module():
    commands = set((REPO_ROOT / "visivo" / "commands").rglob("*.py"))
    assert REPO_ROOT / "visivo" / "commands" / "init_phase.py" in commands
    assert commands <= set(_guarded_text_sources())


def test_every_docs_url_in_agent_and_cli_text_resolves():
    failures = []
    for path, text in _guarded_text_sources().items():
        for match in DOCS_URL.finditer(text):
            if not _resolves(match.group(1)):
                failures.append(f"{path.relative_to(REPO_ROOT)}: {match.group(0)}")
    assert failures == [], "docs.visivo.io URLs with no page or redirect:\n" + "\n".join(failures)


def test_resolver_rejects_unknown_paths():
    assert _resolves("/topics/deployments/")
    assert _resolves("/quickstart")
    assert not _resolves("/no/such/page/")


def _build_redirects(site_dir):
    plugin = RedirectPlugin()
    plugin.load_config({"redirect_maps": _redirect_maps()})
    docs = [
        File(page, str(MKDOCS_DIR), str(site_dir), True) for page in _nav_pages(_config()["nav"])
    ]
    plugin.on_files(Files(docs), config={})
    plugin.on_post_build({"site_dir": str(site_dir), "use_directory_urls": True})


def _redirect_target(site_dir, url):
    page = (site_dir / url / "index.html").read_text()
    return re.search(r'http-equiv="refresh" content="0; url=([^"]+)"', page).group(1)


def test_plugin_writes_a_page_for_each_redirect(tmp_path):
    _build_redirects(tmp_path)
    assert _redirect_target(tmp_path, "quickstart") == "../"
    assert _redirect_target(tmp_path, "get-started/installation") == "../../installation/"
    assert _redirect_target(tmp_path, "topics/targets") == "../sources/"
    assert _redirect_target(tmp_path, "topics/dbt") == "../../reference/configuration/Dbt/"
    for source in _redirect_urls():
        assert (tmp_path / source / "index.html").exists(), f"no redirect page for /{source}"
