from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from visivo.models.sources.source import ServerSource
from visivo.models.base.base_model import SecretStrOrEnvVar, StringOrEnvVar
from visivo.models.base.env_var_string import EnvVarString
from pydantic import Field, SecretStr
import os

BigQueryType = Literal["bigquery"]


class BigQuerySource(ServerSource, SqlalchemySource):
    """
    BigQuerySources hold the connection information to Google BigQuery instances.

    !!! info "BigQuery Authentication"
        You can authenticate BigQuery in one of two ways:
         1. Pass a base64 encoded service account key to the `credentials_base64` field.
         2. Set the absolute file path to the credentials file in a environment variable named `GOOGLE_APPLICATION_CREDENTIALS`.

        === "Base64 Encoded Credentials"
            Using encoding the service key json credential file to base64 can be a useful way to authenticate BigQuery
            without logging into Google Cloud Console each time and makes it easier to manage credentials in CI/CD pipelines.

            However utilizing base64 encoding requires a few extra steps:

            1. Create a Google Cloud Service Account
                1. Go to the [Google Cloud Console](https://console.cloud.google.com)
                2. Select your project
                3. Navigate to "IAM & Admin" > "Service Accounts"
                4. Click "Create Service Account"
                5. Give it a name and description
                6. Grant it the "BigQuery Admin" role (or more restrictive custom role)
                7. Click "Done"
            2. Create and download credentials
                1. Find your service account in the list
                2. Click the three dots menu > "Manage keys"
                3. Click "Add Key" > "Create new key"
                4. Choose JSON format
                5. Click "Create" - this downloads your credentials file
            3. Convert credentials to base64
                ```bash
                # On Linux/Mac
                python -m base64 < credentials.json > encoded.txt

                # On Windows PowerShell
                [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("credentials.json")) > encoded.txt
                ```
            4. Use the contents of encoded.txt as your credentials_base64 value. You can store the single line key in your untracked env file and use the `{% raw %}{{ env_var('VAR_NAME') }}{% endraw %}` syntax to reference the environment variable in your Visivo config.

        === "`GOOGLE_APPLICATION_CREDENTIALS` Environment Variable"
            If you use gcloud locally you probably have this environment variable configured already.

            Run `echo $GOOGLE_APPLICATION_CREDENTIALS` in your terminal. If it returns your crendetials then
            you're all set. and can configure a BigQuerySource without the `credentials_base64` field.

            If you don't have the environment variable, follow these steps:

            1. Create a Google Cloud Service Account
                1. Go to the [Google Cloud Console](https://console.cloud.google.com)
                2. Select your project
                3. Navigate to "IAM & Admin" > "Service Accounts"
                4. Click "Create Service Account"
                5. Give it a name and description
                6. Grant it the "BigQuery Admin" role (or more restrictive custom role)
                7. Click "Done"
            2. Create and download credentials
                1. Find your service account in the list
                2. Click the three dots menu > "Manage keys"
                3. Click "Add Key" > "Create new key"
                4. Choose JSON format
                5. Click "Create" - this downloads your credentials file
            3. Set the environment variable
                You can set the environment variable in your shell profile file.
                ```bash
                export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/credentials.json"
                ```
                or in your untracked .env file.
                ```
                GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials.json
                ```
            This method is easier to manage and does not require any extra steps to authenticate.

        The service account needs at minimum the "BigQuery User" role to execute queries.
        For more restricted access, you can create a custom role with just the required permissions:

        - bigquery.jobs.create
        - bigquery.tables.get
        - bigquery.tables.getData
        - bigquery.tables.list

    !!! example

        === "Simple"

            ``` yaml
                sources:
                  - name: bigquery_source
                    type: bigquery
                    project: my-project-id
                    database: my_dataset
                    credentials_base64: {% raw %}{{ env_var('BIGQUERY_BASE64_ENCODED_CREDENTIALS') }}{% endraw %}
            ```

    Note: Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    project: StringOrEnvVar = Field(
        description="The Google Cloud project ID that contains your BigQuery dataset."
    )

    credentials_base64: Optional[SecretStrOrEnvVar] = Field(
        None,
        description="The Google Cloud service account credentials JSON string base64 encoded. Turn your JSON into a base64 string in the command line with `python -m base64 < credentials.json > encoded.txt`. Not required if GOOGLE_APPLICATION_CREDENTIALS environment variable is set. ",
    )

    database: Optional[StringOrEnvVar] = Field(
        None,
        description="The default BigQuery dataset to use for queries.",
    )

    type: BigQueryType
    connection_pool_size: Optional[int] = Field(
        8, description="The pool size that is used for this connection."
    )

    def get_project(self) -> str:
        """Get the resolved project value."""
        return self._resolve_field(self.project)

    def get_credentials_base64(self) -> Optional[str]:
        """Get the resolved credentials_base64 value."""
        return self._resolve_field(self.credentials_base64)

    def get_connection_dialect(self):
        return "bigquery"

    def get_dialect(self):
        return "bigquery"

    def url(self):
        project = self.get_project()
        database = self.get_database()
        credentials = self.get_credentials_base64()

        base_url = f"bigquery://{project}"
        if database:
            base_url += f"/{database}"

        # Check for either credentials_base64 or GOOGLE_APPLICATION_CREDENTIALS
        if not credentials and not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            raise ValueError(
                "Authentication credentials not found. Either provide credentials_base64 or set GOOGLE_APPLICATION_CREDENTIALS environment variable."
            )

        # Only append credentials to URL if using base64 method
        if credentials:
            base_url += f"?credentials_base64={credentials}"

        return base_url

    def list_databases(self):
        """List all datasets in the BigQuery project.

        For BigQuery, datasets are equivalent to databases.
        This method will test the connection by actually querying for datasets.
        """
        project = self.get_project()
        database = self.get_database()

        try:
            # Query to list all datasets in the project
            query = f"""
            SELECT schema_name
            FROM `{project}.INFORMATION_SCHEMA.SCHEMATA`
            ORDER BY schema_name
            """

            result = self.read_sql(query)
            datasets = result["schema_name"].to_list() if result.height > 0 else []

            # If no datasets found but query succeeded, connection is valid
            if not datasets and database:
                # Return configured dataset if query returns empty but connection works
                return [database]

            return datasets if datasets else []

        except Exception as e:
            # If we can't list datasets, try to verify the configured dataset exists
            if database:
                try:
                    # Test if we can query the configured dataset
                    test_query = f"""
                    SELECT 1
                    FROM `{project}.{database}.INFORMATION_SCHEMA.TABLES`
                    LIMIT 1
                    """
                    self.read_sql(test_query)
                    # If query succeeds, the dataset exists and is accessible
                    return [database]
                except Exception:
                    # Dataset doesn't exist or isn't accessible
                    pass

            # Re-raise the original exception for proper error handling
            raise e
