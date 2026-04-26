"""Shared parquet-write helper for model and insight jobs.

This module exists to give both ``run_model_data_job.py`` and
``run_insight_job.py`` a single, robust implementation for writing
list-of-dicts data to parquet. Two latent issues drove the extraction:

* **B12** — ``pl.DataFrame(data)`` with the polars default
  ``infer_schema_length=100`` produces wrong dtypes for null-heavy or
  rare-type columns (UUID varchar / TIMESTAMP_TZ / ARRAY / DATE columns
  whose first 100 values are NULL). When the first non-null value
  arrives, polars raises ``ComputeError`` and the whole model build
  aborts. We pass ``infer_schema_length=None`` to scan all rows.
* **B14** — Decimal columns become ``Decimal128`` in the parquet, which
  the viewer's Arrow.js renderer serializes as
  ``{0: low, 1: mid, 2: high, 3: sign}`` instead of a number. Plotly
  receives an object and renders garbage. We cast Decimal columns to
  Float64 before writing, which is acceptable lossy conversion for the
  visualization path (Float64 has ~15 significant digits, more than any
  realistic dashboard metric needs).

Diagnostic files:
``specs/plan/v1-final-bugfixes/B12-polars-infer-schema-length.md``
``specs/plan/v1-final-bugfixes/B14-arrow-decimal128-object-serialization.md``
"""

from typing import List

import polars as pl


def write_dicts_to_parquet(data: List[dict], path: str) -> None:
    """Write a list-of-dicts to parquet at ``path``.

    The implementation is robust to two issues that affected the prior
    naive ``pl.DataFrame(data).write_parquet(path)``:

    1. Null-heavy columns (B12): ``infer_schema_length=None`` scans all
       rows so polars can pick the right dtype even when the first 100
       rows of a column are NULL.
    2. Decimal columns (B14): every ``pl.Decimal`` column is cast to
       ``Float64`` before write so the viewer's Arrow.js layer
       deserialises it as a JS Number rather than a 128-bit object.

    Args:
        data: list of row dicts (typically the output of
            ``Source.read_sql``).
        path: absolute or relative path to the destination parquet file.
    """
    df = pl.DataFrame(data, infer_schema_length=None)

    decimal_cols = [name for name, dtype in df.schema.items() if isinstance(dtype, pl.Decimal)]
    if decimal_cols:
        df = df.with_columns([pl.col(c).cast(pl.Float64) for c in decimal_cols])

    df.write_parquet(path)
