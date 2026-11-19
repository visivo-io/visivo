import pytest

from visivo.models.sources.project_root import set_project_root


@pytest.fixture(autouse=True)
def _reset_project_root():
    """The CLI's --working-dir sets a process-wide project root; one test must
    not resolve another test's relative file paths against it."""
    yield
    set_project_root(None)
