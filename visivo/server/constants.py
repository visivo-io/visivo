import os

# Overridable so the CLI can be pointed at a development deployment. Everything
# that talks to cloud — tokens, deploys, agent inference — resolves through this
# one name, so a single export moves all of them together.
VISIVO_HOST = os.environ.get("VISIVO_HOST", "https://app.visivo.io").rstrip("/")
