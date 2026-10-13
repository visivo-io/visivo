"""Where a run writes what it builds.

One definition per artifact, because the job that writes a file and anything
that later asks whether it exists have to agree. They were separate f-strings
in five modules, and a check that drifts from the writer is a check that
silently answers the wrong question.

Two shapes, because callers hold two different things: ``run_dir`` turns an
output directory and a run id into the directory a run owns, and the rest take
that directory. A caller already holding the run directory — the field resolver
does — passes it straight in.
"""

from visivo.constants import DEFAULT_RUN_ID


def run_dir(output_dir, run_id=None):
    """The directory this run writes into."""
    return f"{output_dir}/{run_id or DEFAULT_RUN_ID}"


def schema_file(run_directory, name):
    """A model's or source's column schema.

    Both live in ``schemas/``: a source's introspection and a model's resolved
    columns answer the same question for whatever reads them.
    """
    return f"{run_directory}/schemas/{name}.json"


def input_metadata_file(run_directory, name):
    """An input's computed options."""
    return f"{run_directory}/inputs/{name}.json"


def model_data_file(run_directory, name):
    """A model's rows."""
    return f"{run_directory}/models/{name}.parquet"
