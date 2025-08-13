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
        return "redshift+redshift_connector"

    def connect_args(self):
        """Return additional connection arguments for Redshift."""
        args = {}

        if self.ssl:
            args["sslmode"] = "require"

        if self.iam and self.cluster_identifier and self.region:
            args["iam"] = True
            args["cluster_identifier"] = self.cluster_identifier
            args["region"] = self.region

        return args

    def url(self):
        """Build the connection URL for Redshift."""
        from sqlalchemy.engine import make_url

        # Base URL construction
        url_string = f"{self.get_dialect()}://"

        # Add credentials
        if self.username:
            url_string += self.username
            if self.password and not self.iam:
                url_string += f":{self.get_password()}"
            url_string += "@"

        # Add host and port
        if self.host:
            url_string += self.host
            if self.port:
                url_string += f":{self.port}"

        # Add database
        if self.database:
            url_string += f"/{self.database}"

        url = make_url(url_string)

        return url

    def list_databases(self):
        """Return list of databases for Redshift cluster."""
        try:
            with self.get_connection() as connection:
                from sqlalchemy import text

                # Query to get databases in Redshift
                query = """
                SELECT datname 
                FROM pg_database 
                WHERE datistemplate = false 
                AND datallowconn = true
                ORDER BY datname
                """

                rows = connection.execute(text(query)).fetchall()
                return [r[0] for r in rows]
        except Exception as e:
            Logger.instance().error(
                f"Error listing databases for Redshift source '{self.name}': {str(e)}"
            )
            # Re-raise to allow proper error handling in UI
            raise e
