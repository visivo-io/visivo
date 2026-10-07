"""The agent tests exercise real managers, which is the point: a registry that
agrees with a mocked manager tells you nothing about whether it agrees with the
one the HTTP routes call.

Imported rather than copied so the fixture cannot drift from the server tests'.
"""

from tests.server.conftest import (  # noqa: F401
    integration_app,
    integration_client,
    output_dir,
)
