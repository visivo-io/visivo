from typing import Literal
from visivo.models.sources.sqlalchemy_source import SqlalchemySource


class MockSqlAlchemySource(SqlalchemySource):
    type: Literal["mock"]

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
