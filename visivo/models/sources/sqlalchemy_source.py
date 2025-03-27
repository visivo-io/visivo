from abc import ABC, abstractmethod
from typing import Any, Optional
import click
from visivo.models.sources.source import Source


class SqlalchemySource(Source, ABC):

    _engine: Any = None
    after_connect: Optional[str] = None

    @abstractmethod
    def get_dialect(self):
        raise NotImplementedError(f"No dialect method implemented for {self.type}")

    def read_sql(self, query: str):
        from pandas import DataFrame
        from sqlalchemy import text

        with self.connect() as connection:
            query = text(query)
            results = connection.execute(query)
            columns = results.keys()
            data = results.fetchall()
            results.close()

        return DataFrame(data, columns=columns)

    def get_connection(self):
        from sqlalchemy import text

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
        from sqlalchemy import create_engine, event
        from visivo.logging.logger import Logger

        if not self._engine:
            from sqlalchemy.pool import NullPool

            Logger.instance().debug(f"Creating engine for Source: {self.name}")
            self._engine = create_engine(self.url(), poolclass=NullPool)

            @event.listens_for(self._engine, "connect")
            def connect(dbapi_connection, connection_record):
                if self.after_connect:
                    cursor_obj = dbapi_connection.cursor()
                    cursor_obj.execute(self.after_connect)
                    cursor_obj.close()

        return self._engine
