import click


@click.command()
@click.option(
    "--full",
    is_flag=True,
    default=False,
    help=(
        "Emit the complete project schema (~3.3 MB), including the vendored Plotly "
        "trace-prop and layout vocabularies. This is what the viewer validates against."
    ),
)
@click.option(
    "--props",
    "prop_type",
    default=None,
    metavar="TYPE",
    help=(
        "Emit the full Plotly property schema for one insight props type "
        "(e.g. --props bar). This is the vocabulary the core subset prunes."
    ),
)
@click.option(
    "--layout",
    is_flag=True,
    default=False,
    help="Emit the full Plotly layout schema (what a chart's `layout` accepts).",
)
@click.option(
    "-o",
    "--output",
    "output",
    default=None,
    type=click.Path(dir_okay=False),
    help="Write the schema to this file instead of stdout.",
)
@click.option(
    "--indent",
    default=None,
    type=int,
    help="Pretty-print with this many spaces of indentation. Default is compact.",
)
def schema(full, prop_type, layout, output, indent):
    """
    Writes the Visivo project JSON Schema to stdout, for an agent (or an editor) to read.

    With no options this emits the CORE subset: the objects you author by hand in
    project.visivo.yml -- sources, models, metrics, dimensions, relations, insights,
    charts, tables, markdowns, inputs, dashboards and tests -- at roughly 90 KB
    instead of the full schema's 3.3 MB, which is far too large to put in a prompt.

    The subset is derived mechanically; the rule is documented in
    visivo/commands/schema_phase.py so it can be re-derived rather than hand-maintained.
    """
    import sys

    from visivo.commands.schema_phase import SchemaSelectionError, schema_phase

    try:
        schema_string = schema_phase(full=full, prop_type=prop_type, layout=layout, indent=indent)
    except SchemaSelectionError as error:
        raise click.ClickException(str(error))

    if output:
        with open(output, "w") as file:
            file.write(schema_string)
        # stderr, so that stdout carries the schema and nothing else no matter
        # which flags were passed.
        click.echo(f"Schema written to {output} ({len(schema_string)} bytes)", err=True)
    else:
        # Straight to stdout, unbuffered by click's styling, so that
        # `visivo schema | jq` and `visivo schema > core.json` both work.
        sys.stdout.write(schema_string)
        sys.stdout.write("\n")
