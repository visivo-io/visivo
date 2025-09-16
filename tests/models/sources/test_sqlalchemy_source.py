from typing import Literal
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.source import ServerSource


class MockSqlAlchemySource(ServerSource, SqlalchemySource):
    type: Literal["mock"]

    def get_connection_dialect(self):
        return "sqlite"

    def get_dialect(self):
        return "sqlite"


def test_SqlAlchemySource_get_engine():
    data = {
        "name": "source",
        "database": "database",
        "type": "mock",
        "after_connect": "SELECT 1",
    }
    source = MockSqlAlchemySource(**data)
    engine = source.get_engine()
    assert engine is not None
