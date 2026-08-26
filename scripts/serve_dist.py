"""Serve a `visivo dist` bundle the way a static host would.

`visivo dist` writes a `_redirects` file (`/*  /index.html  200`) because the
viewer is a client-routed SPA: a dashboard lives at `/<dashboard-name>`, which
is not a file on disk. Netlify/S3/Cloudflare honour that rule; a plain static
server does not, so deep links 404 and the bundle looks broken for reasons that
have nothing to do with the build.

This reproduces that one rule locally and in CI, so a smoke test exercises the
same routes a real deployment serves.

Usage:
    python scripts/serve_dist.py <dist_dir> [port]
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SPARequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.translate_path(self.path.split("?")[0])
        # Fall back to index.html only for route-shaped requests. A missing
        # *file* (`/data/dashboards.json`, `/assets/index.js`) must still 404 —
        # answering 200-with-HTML would turn a missing artifact into a JSON
        # parse error and hide the very regression this exists to catch.
        if not os.path.exists(path) and "." not in os.path.basename(path):
            self.path = "/index.html"
        return SimpleHTTPRequestHandler.do_GET(self)

    def log_message(self, *args):
        pass


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    dist_dir = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8899
    if not os.path.isdir(dist_dir):
        raise SystemExit(f"No dist directory at '{dist_dir}'. Run `visivo dist` first.")
    os.chdir(dist_dir)
    print(f"Serving {dist_dir} on http://localhost:{port} (SPA fallback enabled)")
    ThreadingHTTPServer(("127.0.0.1", port), SPARequestHandler).serve_forever()


if __name__ == "__main__":
    main()
