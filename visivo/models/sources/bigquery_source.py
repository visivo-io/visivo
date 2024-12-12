from typing import Literal, Optional
from visivo.models.sources.sqlalchemy_source import SqlalchemySource
from pydantic import Field

BigQueryType = Literal["bigquery"]


class BigQuerySource(SqlalchemySource):
    """
    BigQuerySources hold the connection information to Google BigQuery data sources.

    !!! example

        === "Simple"

            ``` yaml
                sources:
                  - name: bigquery_source
                    type: bigquery
                    project: my-project-id
                    dataset: my_dataset
                    credentials_base64: {% raw %}{{ env_var('BIGQUERY_BASE64_ENCODED_CREDENTIALS') }}{% endraw %}
            ```

    Note: Recommended environment variable use is covered in the [sources overview.](/topics/sources/)
    """

    project: str = Field(
        description="The Google Cloud project ID that contains your BigQuery dataset."
    )
    
    credentials_base64: str = Field(
        description="The Google Cloud service account credentials JSON string base64 encoded. Turn your JSON into a base64 string in the commmand line with `python -m base64 < credentials.json > encoded.txt`. ",
    )

    dataset: Optional[str] = Field(
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
        if self.dataset:
            base_url += f"/{self.dataset}"

        credentials = self.credentials_base64 if self.credentials_base64 else None
        if not credentials:
            raise ValueError("Base64 Credentials are required for BigQuery sources. You can get your client_secrets.json file from the Google Cloud Console ([docs](https://cloud.google.com/bigquery/docs/authentication/end-user-installed#bigquery_auth_user_query-python)) and turn it into a base64 string with `python -m base64 < credentials.json > encoded.txt`.")
        
        return f"{base_url}?credentials_base64={credentials}"
