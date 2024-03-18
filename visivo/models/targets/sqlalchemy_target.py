from abc import ABC
from typing import Any
from pandas import DataFrame
from sqlalchemy import create_engine, text
import click
from visivo.models.targets.target import Target


class SqlalchemyTarget(Target):


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
            return self.get_engine().connect()
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to target '{self.name}'. Ensure the database is running and the connection properties are correct."
            )

    def get_engine(self):
        if not self._engine:
            if self.hasattr("connection_pool_size"):
                self._engine = create_engine(
                    self.url(), pool_size=self.connection_pool_size
                )
            else:
                self._engine = create_engine(self.url())

        return self._engine
