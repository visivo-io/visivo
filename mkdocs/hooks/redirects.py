import html
from pathlib import Path
from urllib.parse import urlparse

REDIRECTS = {
    "quickstart": "/",
    "cli": "/reference/cli/",
    "deployments": "/topics/deployments/",
    "topics/dbt": "/reference/configuration/Dbt/",
}

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting</title>
<link rel="canonical" href="{url}">
<meta http-equiv="refresh" content="0; url={url}">
</head>
<body>Redirecting to <a href="{url}">{url}</a></body>
</html>
"""


def on_post_build(config, **kwargs):
    prefix = urlparse(config.get("site_url") or "").path.rstrip("/")
    site_dir = Path(config["site_dir"])
    for source, target in REDIRECTS.items():
        destination = site_dir / source / "index.html"
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(PAGE.format(url=html.escape(prefix + target)))
