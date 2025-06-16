from visivo.query.dialect import Dialect
from tests.factories.model_factories import SourceFactory


def test_dialect():
    sqlite_dialect = Dialect(**{"type": "sqlite"})
    sqlite_aggregates = sqlite_dialect.aggregates
    assert set(sqlite_aggregates) == set(
        ["sum", "max", "avg", "min", "count", "total", "group_concat"]
    )

    postgresql_dialect = Dialect(**{"type": "postgresql"})
    postgresql_aggregates = postgresql_dialect.aggregates
    assert "sum" in postgresql_aggregates and "bit_or" in postgresql_aggregates

    snowflake_dialect = Dialect(**{"type": "snowflake"})
    snowflake_aggregates = snowflake_dialect.aggregates
    assert "avg" in snowflake_aggregates and "listagg" in snowflake_aggregates

    mysql_dialect = Dialect(**{"type": "mysql"})
    mysql_aggregates = mysql_dialect.aggregates
    assert "count" in mysql_aggregates and "json_arrayagg" in mysql_aggregates


def test_dialect_from_source():
    source = SourceFactory()
    dialect = Dialect(type=source.type)
    assert dialect.type == "sqlite"

    assert "like" in dialect.comparisons
    assert "total" in dialect.aggregates
