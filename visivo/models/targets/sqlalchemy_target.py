from abc import ABC, abstractmethod
from typing import Any
from pandas import DataFrame
from sqlalchemy import create_engine, text
import click
from visivo.models.targets.target import Target


class SqlalchemyTarget(Target, ABC):

    _engine: Any = None

    @abstractmethod
    def get_dialect(self):
        raise NotImplementedError(f"No dialect method implemented for {self.type}")

    def read_sql(self, query: str) -> DataFrame:
        with self.connect() as connection:
            query = text(query)
            results = connection.execute(query)
            columns = results.keys()
            data = results.fetchall()
            results.close()

        return DataFrame(data, columns=columns)

    def get_connection(self):
        try:
            connection = self.get_engine().connect()
            if hasattr(self, "attach") and self.attach:
                for attachment in self.attach:
                    connection.execute(
                        text(
                            f"attach database '{attachment.target.database}' as {attachment.schema_name};"
                        )
                    )
            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to target '{self.name}'. Ensure the database is running and the connection properties are correct."
            )

    def get_engine(self):
        if not self._engine:
            if hasattr(self, "connection_pool_size"):
                self._engine = create_engine(
                    self.url(), pool_size=self.connection_pool_size
                )
            else:
                self._engine = create_engine(self.url())

        return self._engine
