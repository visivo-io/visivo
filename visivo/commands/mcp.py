import io
import os
import sys

import click

from visivo.commands.options import (
    dbt_profile,
    dbt_target,
    host,
    no_deprecation_warnings,
    output_dir,
    port,
    source,
    threads,
    working_dir,
)


@click.command()
@source
@working_dir
@output_dir
@port
@threads
@dbt_profile
@dbt_target
@no_deprecation_warnings
@host
def mcp(
    output_dir,
    working_dir,
    source,
    port,
    threads,
    dbt_profile,
    dbt_target,
    no_deprecation_warnings,
    host,
):
    """Serves the project's MCP tools over stdio, for a client that starts Visivo itself.

    Also serves the local web app on --port, where you review and commit the
    drafts the agent writes. Logs go to stderr. The command ends when the
    client closes stdin. The output directory defaults to "target" in the
    working directory, because a client can start the command from anywhere.
    """
    from click.core import ParameterSource

    context = click.get_current_context()
    if context.get_parameter_source("output_dir") == ParameterSource.DEFAULT:
        output_dir = os.path.join(working_dir, "target")

    from visivo.logger.stdio import claim_stdout

    writer = claim_stdout()

    from visivo.commands.mcp_phase import mcp_phase

    mcp_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=source,
        threads=threads,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
        no_deprecation_warnings=no_deprecation_warnings,
        host=host,
        port=port,
        reader=io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8"),
        writer=writer,
    )
