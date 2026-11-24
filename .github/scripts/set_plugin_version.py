"""Write the release version into the Claude Code plugin manifest.

Claude Code keeps a user on the version that plugin.json names, so the manifest
must move with pyproject.toml and visivo/version.py or no user gets an update.

Usage: python set_plugin_version.py VERSION [PLUGIN_JSON]
"""

import json
import sys
from pathlib import Path

DEFAULT_MANIFEST = "claude-plugin/.claude-plugin/plugin.json"


def set_version(path, version):
    path = Path(path)
    manifest = json.loads(path.read_text())
    manifest["version"] = version
    path.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    set_version(sys.argv[2] if len(sys.argv) > 2 else DEFAULT_MANIFEST, sys.argv[1])
