import os
import json
from visivo.commands.aggregate import aggregate
from visivo.parsers.core_parser import PROJECT_FILE_NAME
from click.testing import CliRunner
from tests.support.utils import temp_folder

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
