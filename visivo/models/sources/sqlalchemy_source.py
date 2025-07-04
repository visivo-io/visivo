from abc import ABC, abstractmethod
from typing import Any, Optional
import click
from pydantic import PrivateAttr
from visivo.models.sources.source import Source
from sqlalchemy import create_engine, event, text
from sqlalchemy.pool import NullPool
from visivo.logger.logger import Logger
import polars as pl
from copy import deepcopy
import pyarrow as pa
import json


class SqlalchemySource(Source, ABC):

    _engine: Any = PrivateAttr(default=None)
    after_connect: Optional[str] = None

    @abstractmethod
    def get_dialect(self):
        raise NotImplementedError(f"No dialect method implemented for {self.type}")

    def read_sql(self, query: str):
        with self.connect() as connection:
            query = text(query)
            results = connection.execute(query)
            columns = list(results.keys())
            data = results.fetchall()
            results.close()
        # Convert to dict of columns for Polars
        if data:
            data_dict = {}
            data_dict = {col: [row[i] for row in data] for i, col in enumerate(columns)}
            for i, col in enumerate(columns):
                values = [row[i] for row in data]
                if isinstance(values[0], (dict, list)):
                    values = [json.dumps(v) for v in values]
                data_dict[col] = values

            return pl.DataFrame(data_dict)
        else:
            # No data, just return empty DataFrame with columns
            schema = {col: pl.String for col in columns}
            return pl.DataFrame({col: [] for col in columns}, schema=schema)

    def get_connection(self):

        try:
            connection = (
                self.get_engine().connect()
            )  # I wonder if creating mutltiple engines is part of the problem.
            if hasattr(self, "attach") and self.attach:
                for attachment in self.attach:
                    connection.execute(
                        text(
                            f"attach database '{attachment.source.database}' as {attachment.schema_name};"
                        )
                    )
            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to source '{self.name}'. Ensure the database is running and the connection properties are correct. Full Error: {str(err)}"
            )

    def get_engine(self):

        if not self._engine:

            Logger.instance().debug(f"Creating engine for Source: {self.name}")
            self._engine = create_engine(
                self.url(), poolclass=NullPool, connect_args=self.connect_args()
            )

            @event.listens_for(self._engine, "connect")
            def connect(dbapi_connection, connection_record):
                if self.after_connect:
                    cursor_obj = dbapi_connection.cursor()
                    cursor_obj.execute(self.after_connect)
                    cursor_obj.close()

        return self._engine

    def __deepcopy__(self, memo):
        copied = self.model_copy(deep=False)
        # manually deepcopy only safe attrs
        for name, val in self.__dict__.items():
            if name != "_plugin_module":
                setattr(copied, name, deepcopy(val, memo))
        return copied

    def connect_args(self):
        return {}
