from visivo.models.sources.bigquery_source import BigQuerySource


def test_BigQuerySource_simple_data():
    data = {
        "name": "source",
        "database": "database",
        "type": "bigquery",
        "credentials_base64": "base64string", 
        "project": "project"
    }
    source = BigQuerySource(**data)
    assert source.name == "source"

def test_Source_password_json():
    data = {
        "name": "source",
        "database": "database",
        "type": "bigquery",
        "credentials_base64": "base64string", 
        "project": "project-project"
    }
    source = BigQuerySource(**data)
    assert source.credentials_base64 is not None
    assert "**********" in source.model_dump_json()
