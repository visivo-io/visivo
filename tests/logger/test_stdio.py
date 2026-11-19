import pytest

from visivo.logger.stdio import subcommand


@pytest.mark.parametrize(
    "argv, expected",
    [
        (["mcp"], "mcp"),
        (["mcp", "--port", "8001"], "mcp"),
        (["-e", "mcp", "serve"], "serve"),
        (["--env-file", ".env.local", "mcp"], "mcp"),
        (["-p", "mcp"], "mcp"),
        (["serve", "--source", "mcp"], "serve"),
        (["--version"], None),
        ([], None),
    ],
)
def test_subcommand_skips_the_groups_own_options(argv, expected):
    assert subcommand(argv) == expected
