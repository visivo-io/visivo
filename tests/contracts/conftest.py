"""The MCP parity contract drives the real endpoint against real managers.

Imported rather than copied, for the reason tests/agent/conftest.py gives:
a fixture that drifts from the server tests' is a contract checked against
something other than what ships.
"""

from tests.server.conftest import (  # noqa: F401
    integration_app,
    integration_client,
    output_dir,
)
