from visivo.commands.aggregate import aggregate
from tests.support.utils import temp_yml_file
from pathlib import Path
from click.testing import CliRunner
from tests.factories.model_factories import ProjectFactory
from visivo.parsers.core_parser import PROJECT_FILE_NAME
import os
from tests.support.utils import temp_folder, create_file_database
import json

runner = CliRunner()


def test_aggregate():
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    json_file = open(f"{output_dir}/temp.json", "w")
    json_file.write(
        json.dumps(
            [
                {"x": 1, "y": 1, "cohort_on": "values"},
                {"x": 2, "y": 3, "cohort_on": "values"},
            ]
        )
    )
    json_file.close()

    response = runner.invoke(
        aggregate, ["-j", f"{output_dir}/temp.json", "-o", output_dir]
    )

    assert "Aggregating data by cohorts" in response.output
    assert response.exit_code == 0
