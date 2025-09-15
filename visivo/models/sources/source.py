from typing import Optional, Dict, List, Any
from visivo.models.base.named_model import NamedModel
from abc import ABC, abstractmethod
from pydantic import Field, SecretStr


class DefaultSource:
    pass


class Source(ABC, NamedModel):

    @abstractmethod
    def get_connection(self):
        raise NotImplementedError(f"No get_connection method implemented for {self.type}")

    @abstractmethod
    def read_sql(self, query: str, **kwargs):
        raise NotImplementedError(f"No read sql method implemented for {self.type}")

    def get_schema(self, table_names: List[str] = None) -> Dict[str, Any]:
        """Extract table and column metadata and build SQLGlot schema.

        Args:
            table_names: Optional list of table names to include. If None, includes all tables.

        Returns:
            Dictionary containing:
            - tables: Dict mapping table names to column info
            - sqlglot_schema: SQLGlot MappingSchema for query optimization
            - metadata: Additional metadata about the schema
        """
        raise NotImplementedError(f"No get_schema method implemented for {self.type}")

    @abstractmethod
    def description(self):
        """Return a description of this source for logging and error messages."""
        raise NotImplementedError(f"No description method implemented for {self.type}")

    @abstractmethod
    def get_dialect(self):
        """Return the dialect string for this source (e.g., 'postgresql', 'mysql')."""
        raise NotImplementedError(f"No get_dialect method implemented for {self.type}")

    def connect(self):
        return Connection(source=self)


class ServerSource(Source):
    """
    Sources hold the connection information to your data sources.
    """

    host: Optional[str] = Field(None, description="The host url of the database.")
    port: Optional[int] = Field(None, description="The port of the database.")
    database: str = Field(
        ..., description="The database that the Visivo project will use in queries."
    )
    username: Optional[str] = Field(None, description="Username for the database.")
    password: Optional[SecretStr] = Field(
        None, description="Password corresponding to the username."
    )
    db_schema: Optional[str] = Field(
        None, description="The schema that the Visivo project will use in queries."
    )

    def description(self):
        """Return a description of this source for logging and error messages."""
        return f"{self.type} source '{self.name}' (host: {self.host}, database: {self.database})"

    def get_password(self):
        return self.password.get_secret_value() if self.password is not None else None

    def url(self):
        from sqlalchemy.engine import URL

        url = URL.create(
            host=self.host,
            username=self.username,
            password=self.get_password(),
            port=self.port,
            drivername=self.get_dialect(),
            database=self.database,
            query=None,
        )
        return url


class Connection:
    def __init__(self, source: Source):
        self.source = source

    def __enter__(self):
        self.conn = self.source.get_connection()
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.conn.close()
        self.conn = None
        self.conn_type = None
