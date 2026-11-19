"""Write the release version into server.json, the MCP registry listing.

The listing names the PyPI package version a client installs, so it must move
with pyproject.toml and visivo/version.py.

Usage: python set_server_json_version.py VERSION [SERVER_JSON]
"""

import json
import sys
from pathlib import Path


def set_version(path, version):
    path = Path(path)
    listing = json.loads(path.read_text())
    listing["version"] = version
    for package in listing.get("packages", []):
        package["version"] = version
    path.write_text(json.dumps(listing, indent=2) + "\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    set_version(sys.argv[2] if len(sys.argv) > 2 else "server.json", sys.argv[1])
