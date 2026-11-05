"""Serve a `visivo dist` bundle the way a static host would.

`visivo dist` writes a `_redirects` file (`/*  /index.html  200`) because the
viewer is a client-routed SPA: a dashboard lives at `/<dashboard-name>`, which
is not a file on disk. Netlify/S3/Cloudflare honour that rule; a plain static
server does not, so deep links 404 and the bundle looks broken for reasons that
have nothing to do with the build.

This reproduces that one rule locally and in CI, so a smoke test exercises the
same routes a real deployment serves. It also serves `.wasm` as
`application/wasm` and gzips text and wasm responses, as static hosts do, so
load times measured against it are close to a real deployment.

Usage:
    python scripts/serve_dist.py <dist_dir> [port]
"""

import gzip
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

GZIP_TYPES = ("text/", "application/javascript", "application/json", "application/wasm")


class SPARequestHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".js": "text/javascript",
        ".json": "application/json",
    }
    _gzipped = {}

    def do_GET(self):
        path = self.translate_path(self.path.split("?")[0])
        # Fall back to index.html only for route-shaped requests. A missing
        # *file* (`/data/dashboards.json`, `/assets/index.js`) must still 404 —
        # answering 200-with-HTML would turn a missing artifact into a JSON
        # parse error and hide the very regression this exists to catch.
        if not os.path.exists(path) and "." not in os.path.basename(path):
            self.path = "/index.html"
            path = self.translate_path(self.path)
        if os.path.isfile(path) and self._accepts_gzip():
            content_type = self.guess_type(path)
            if content_type.startswith(GZIP_TYPES):
                return self._send_gzipped(path, content_type)
        return SimpleHTTPRequestHandler.do_GET(self)

    def _accepts_gzip(self):
        encodings = self.headers.get("Accept-Encoding", "")
        return "gzip" in [e.split(";")[0].strip() for e in encodings.split(",")]

    def _send_gzipped(self, path, content_type):
        key = (path, os.path.getmtime(path))
        body = self._gzipped.get(key)
        if body is None:
            with open(path, "rb") as f:
                body = gzip.compress(f.read(), compresslevel=6)
            self._gzipped[key] = body
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        self.wfile.write(body)

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
