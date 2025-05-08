from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field, SecretStr
import os

BigQueryType = Literal["bigquery"]


class BigQuerySource(SqlalchemySource):
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

    project: str = Field(
        description="The Google Cloud project ID that contains your BigQuery dataset."
    )

    credentials_base64: Optional[SecretStr] = Field(
        None,
        description="The Google Cloud service account credentials JSON string base64 encoded. Turn your JSON into a base64 string in the command line with `python -m base64 < credentials.json > encoded.txt`. Not required if GOOGLE_APPLICATION_CREDENTIALS environment variable is set. ",
    )

    database: Optional[str] = Field(
        None,
        description="The default BigQuery dataset to use for queries.",
    )

    type: BigQueryType
    connection_pool_size: Optional[int] = Field(
        8, description="The pool size that is used for this connection."
    )

    def get_dialect(self):
        return "bigquery"

    def url(self):
        base_url = f"bigquery://{self.project}"
        if self.database:
            base_url += f"/{self.database}"

        credentials = (
            self.credentials_base64.get_secret_value() if self.credentials_base64 else None
        )

        # Check for either credentials_base64 or GOOGLE_APPLICATION_CREDENTIALS
        if not credentials and not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            raise ValueError(
                "Authentication credentials not found. Either provide credentials_base64 or set GOOGLE_APPLICATION_CREDENTIALS environment variable."
            )

        # Only append credentials to URL if using base64 method
        if credentials:
            base_url += f"?credentials_base64={credentials}"

        return base_url
