from typing import Any, Dict, List, Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.source import ServerSource
from visivo.logger.logger import Logger
from pydantic import Field

PostgresqlType = Literal["postgresql"]

# One round trip per schema, reading only pg_attribute/pg_class/pg_namespace.
#
# relkind covers ordinary ('r'), partitioned ('p'), view ('v'), materialized
# view ('m') and foreign ('f') tables — everything a query can name. attnum > 0
# skips system columns (ctid, xmin, ...); attisdropped skips the tombstones a
# DROP COLUMN leaves behind, which still occupy an attnum.
#
# has_table_privilege keeps the answer to what this role can actually SELECT.
# That is the honest schema for query planning, and it means a restricted
# account gets a clean smaller schema rather than a schema plus a page of
# permission-denied warnings for tables it was never going to read.
#
# The literal relkinds are constants, not input, so they are inlined; the schema
# is bound. CAST is needed because psycopg2 sends an untyped NULL for None,
# which COALESCE cannot resolve on its own.
_COLUMNS_FOR_SCHEMA = """
    SELECT c.relname AS table_name,
           a.attname AS column_name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
           NOT a.attnotnull AS is_nullable
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = COALESCE(CAST(:schema AS text), current_schema())
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND pg_catalog.has_table_privilege(c.oid, 'SELECT')
    ORDER BY c.relname, a.attnum
"""


class PostgresqlSource(ServerSource, SqlalchemySource):
    """
    PostgresqlSources hold the connection information to PostgreSQL data sources.

    !!! example

        === "Simple"

            ``` yaml
                sources:
                  - name: postgresql_source
                    type: postgresql
                    database: database
                    username: ${env.PG_USER}
                    password: ${env.PG_PASSWORD}
                    connection_pool_size: 2
            ```

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: PostgresqlType
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    def get_connection_dialect(self):
        return "postgresql+psycopg2"

    def get_dialect(self):
        return "postgresql"

    def _columns_by_table(self, inspector, schema, errors: List[str]) -> Dict[str, Any]:
        """``{table_name: [column_info, ...]}`` from pg_catalog directly.

        Overrides the generic reflection because SQLAlchemy's batched
        ``get_multi_columns`` joins ``pg_collation`` and ``pg_constraint`` for
        collation and constraint detail this schema never uses. A locked-down
        server can deny exactly those catalogs while still permitting ordinary
        reflection, which drops the source onto the per-table fallback — around
        1.9s per table, so a 186-table schema takes ~6 minutes and the caller
        times out long before it finishes, reporting an empty schema that reads
        like an empty database. This query cannot hit that wall: it touches
        ``pg_attribute``, ``pg_class`` and ``pg_namespace`` and nothing else.

        Not ``information_schema.columns``, despite being the portable spelling
        and what the Snowflake source uses. Two reasons, both specific to
        Postgres: its ``columns`` view joins ``pg_collation`` itself (check
        ``pg_get_viewdef``), so it fails on the same servers this exists to
        rescue; and it reports every enum, domain and extension type as the
        literal string ``USER-DEFINED``, where ``format_type`` gives the real
        type name for SQLGlot to resolve.

        Column defaults are not fetched. Nothing downstream reads them, and
        collecting them means joining ``pg_attrdef`` — another catalog to be
        denied, for a field no caller uses.

        Types come back as ``format_type`` strings rather than SQLAlchemy type
        objects. ``_build_table_schema`` handles that unchanged: its mapper
        falls through to ``_parse_type_string``, which resolves the Postgres
        spellings correctly (``character varying(100)`` -> VARCHAR(100),
        ``timestamp with time zone`` -> TIMESTAMPTZ, ``integer[]`` ->
        ARRAY<INT>, ``numeric(10,2)`` -> DECIMAL(10, 2)).
        """
        from sqlalchemy import text

        try:
            with inspector.engine.connect() as connection:
                rows = connection.execute(text(_COLUMNS_FOR_SCHEMA), {"schema": schema}).fetchall()
        except Exception as e:
            # Fall back rather than fail: an unexpected catalog restriction
            # should degrade to the generic path, which has its own batched
            # attempt and per-table fallback, not take the source down.
            errors.append(
                f"catalog column query failed for schema {schema or 'default'} "
                f"({self._concise_error(e)}); fell back to generic reflection"
            )
            return super()._columns_by_table(inspector, schema, errors)

        columns: Dict[str, Any] = {}
        for table_name, column_name, data_type, is_nullable in rows:
            columns.setdefault(table_name, []).append(
                {
                    "name": column_name,
                    "type": data_type,
                    "nullable": bool(is_nullable),
                    "default": None,
                }
            )
        return columns

    def list_databases(self):
        """Return list of databases for PostgreSQL server."""
        try:
            with self.get_connection() as connection:
                from sqlalchemy import text

                rows = connection.execute(
                    text("SELECT datname FROM pg_database WHERE datistemplate = false")
                ).fetchall()
                return [r[0] for r in rows]
        except Exception as e:
            # Re-raise to allow proper error handling in UI
            raise e
