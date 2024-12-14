from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field, SecretStr

BigQueryType = Literal["bigquery"]


class BigQuerySource(SqlalchemySource):
    """
    BigQuerySources hold the connection information to Google BigQuery instances. 

    !!! info "BigQuery Authentication"

        To authenticate BigQuery without logging into Google Cloud Console each time, you'll need to:

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
    
    credentials_base64: SecretStr = Field(
        description="The Google Cloud service account credentials JSON string base64 encoded. Turn your JSON into a base64 string in the command line with `python -m base64 < credentials.json > encoded.txt`. ",
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

        credentials = self.credentials_base64.get_secret_value() if self.credentials_base64 else None
        if not credentials:
            raise ValueError("Base64 Credentials are required for BigQuery sources. You can get your client_secrets.json file from the Google Cloud Console ([docs](https://cloud.google.com/bigquery/docs/authentication/end-user-installed#bigquery_auth_user_query-python)) and turn it into a base64 string with `python -m base64 < credentials.json > encoded.txt`.")
        return f"{base_url}?credentials_base64={credentials}"
