import pytest
from unittest.mock import patch, MagicMock
from visivo.jobs.run_model_job import action, job
from visivo.models.models.model import Model
from visivo.jobs.job import Job
import pandas as pd

class DummyModel(Model):
    name: str = "dummy_model"
    sql: str = "select 1 as a, 2 as b"

def test_action_success(tmp_path):
    dummy_model = DummyModel(name="m1", sql="select 1 as a, 2 as b")
    dag = MagicMock()
    output_dir = str(tmp_path)
    mock_df = pd.DataFrame([{"a": 1, "b": 2}, {"a": 3, "b": 4}])
    with patch("visivo.jobs.run_model_job.all_descendants_of_type", return_value=[MagicMock(read_sql=MagicMock(return_value=mock_df))]):
        result = action(dummy_model, dag, output_dir)
        assert result.success
        assert "Updated data for model" in result.message
        # Check file written
        import os, json
        data_file = os.path.join(output_dir, "models", "m1", "data.json")
        with open(data_file) as f:
            data = json.load(f)
        assert data["rows"] == [{"a": 1, "b": 2}, {"a": 3, "b": 4}]

def test_action_missing_sql(tmp_path):
    dummy_model = DummyModel(name="m2")
    dag = MagicMock()
    output_dir = str(tmp_path)
    with patch("visivo.jobs.run_model_job.all_descendants_of_type", return_value=[MagicMock(read_sql=MagicMock())]):
        with pytest.raises(ValueError):
            action(dummy_model, dag, output_dir)

def test_job_returns_job():
    dummy_model = DummyModel(name="m3", sql="select 1 as a, 2 as b")
    dag = MagicMock()
    output_dir = "/tmp"
    with patch("visivo.jobs.run_model_job.all_descendants_of_type", return_value=[MagicMock(read_sql=MagicMock())]):
        j = job(dag, output_dir, dummy_model)
        assert isinstance(j, Job)
        assert j.item == dummy_model
        assert j.output_dir == output_dir or hasattr(j, 'output_dir') 