from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field
from visivo.logger.logger import Logger

RedshiftType = Literal["redshift"]


class RedshiftSource(SqlalchemySource):
    """
    RedshiftSources hold the connection information to Amazon Redshift data sources.

    !!! example

        === "Basic Username/Password"

            ``` yaml
                sources:
                  - name: redshift_source
                    type: redshift
                    database: dev
                    host: my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com
                    port: 5439
                    username: {% raw %}{{ env_var('REDSHIFT_USER') }}{% endraw %}
                    password: {% raw %}{{ env_var('REDSHIFT_PASSWORD') }}{% endraw %}
                    db_schema: public
            ```

        === "IAM Authentication"

            ``` yaml
                sources:
                  - name: redshift_source
                    type: redshift
                    database: dev
                    host: my-cluster.abcdefghij.us-east-1.redshift.amazonaws.com
                    port: 5439
                    username: {% raw %}{{ env_var('REDSHIFT_USER') }}{% endraw %}
                    cluster_identifier: my-cluster
                    region: us-east-1
                    iam: true
                    db_schema: public
            ```

    !!! note

        Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    type: RedshiftType
    cluster_identifier: Optional[str] = Field(
        None, description="The cluster identifier for IAM authentication."
    )
    region: Optional[str] = Field(
        None, description="The AWS region where your Redshift cluster is located."
    )
    iam: Optional[bool] = Field(
        False, description="Use IAM authentication instead of username/password."
    )
    ssl: Optional[bool] = Field(True, description="Use SSL connection to Redshift.")
    connection_pool_size: Optional[int] = Field(
        1, description="The pool size that is used for this connection."
    )

    def get_dialect(self):
        """Return the SQLAlchemy dialect for Redshift."""
        return "redshift"

    def url(self):
        """Generate SQLAlchemy connection URL for Redshift."""
        # Lazy import with helpful error message
        try:
            from sqlalchemy_redshift import dialect  # noqa: F401
        except ImportError:
            raise ImportError(
                "sqlalchemy-redshift is required for Redshift sources. "
                "Install it with: pip install sqlalchemy-redshift"
            )

        # Choose the appropriate driver based on authentication method
        if self.iam:
            # For IAM auth, use redshift_connector driver
            try:
                import redshift_connector  # noqa: F401
            except ImportError:
                raise ImportError(
                    "redshift-connector is required for IAM authentication. "
                    "Install it with: pip install redshift-connector"
                )
            # Format: redshift+redshift_connector://user@host:port/database
            return (
                f"redshift+redshift_connector://{self.username}@"
                f"{self.host}:{self.port or 5439}/{self.database}"
            )
        else:
            # For standard auth, use psycopg2 driver (comes with sqlalchemy-redshift)
            # Format: redshift+psycopg2://user:password@host:port/database
            return (
                f"redshift+psycopg2://{self.username}:{self.get_password()}@"
                f"{self.host}:{self.port or 5439}/{self.database}"
            )

    def connect_args(self):
        """Return additional connection arguments for Redshift."""
        args = {}

        # Add SSL configuration
        if self.ssl:
            args["sslmode"] = "require"

        # Add IAM-specific parameters if using IAM authentication
        if self.iam:
            args["iam"] = True
            if self.cluster_identifier:
                args["cluster_identifier"] = self.cluster_identifier
            if self.region:
                args["region"] = self.region
            # For IAM auth, we also need to specify the database and other params
            args["database"] = self.database
            args["host"] = self.host
            args["port"] = self.port or 5439

        return args

    def list_databases(self):
        """Return list of databases for Redshift cluster."""
        try:
            # Use SQLAlchemy's connection handling
            with self.connect() as connection:
                # Query to get databases in Redshift
                query = """
                SELECT datname 
                FROM pg_database 
                WHERE datistemplate = false 
                AND datallowconn = true
                ORDER BY datname
                """
                from sqlalchemy import text

                result = connection.execute(text(query))
                rows = result.fetchall()
                return [r[0] for r in rows]
        except Exception as e:
            Logger.instance().error(
                f"Error listing databases for Redshift source '{self.name}': {str(e)}"
            )
            raise e
