import os
from visivo.commands.list import list
from visivo.parsers.file_names import PROJECT_FILE_NAME
from tests.support.utils import temp_yml_file
import json
import yaml
from click.testing import CliRunner
from tests.factories.model_factories import (
    InsightFactory,
    ProjectFactory,
    SourceFactory,
    SqlModelFactory,
)

runner = CliRunner()


def test_list():
    """Test the list command with different object types"""
    source = SourceFactory(name="test_source")
    model = SqlModelFactory(name="test_model", source="${ ref(test_source) }")
    insight = InsightFactory(name="test_insight", model="ref(test_model)")
    project = ProjectFactory(sources=[source], models=[model], insights=[insight], dashboards=[])

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    # Test listing sources
    response = runner.invoke(list, ["sources", "-w", working_dir])
    assert "sources:" in response.output
    assert " - test_source" in response.output
    assert response.exit_code == 0

    # Test listing models
    response = runner.invoke(list, ["models", "-w", working_dir])
    assert "models:" in response.output
    assert " - test_model" in response.output
    assert response.exit_code == 0

    # Test listing insights
    response = runner.invoke(list, ["insights", "-w", working_dir])
    assert "insights:" in response.output
    assert " - test_insight" in response.output
    assert response.exit_code == 0


def test_list_choices_are_the_registry_types():
    from visivo.server.rename_service import TYPE_TO_MANAGER

    choices = list.params[0].type.choices
    assert set(choices) == set(TYPE_TO_MANAGER)
    assert {"metrics", "dimensions", "relations", "charts", "tables"} <= set(choices)
    assert {"markdowns", "inputs", "dashboards"} <= set(choices)


def test_list_every_object_type():
    project_yaml = """
name: listing
sources:
  - name: src
    type: sqlite
    database: local.db
models:
  - name: mdl
    sql: select 1 as x, 2 as y
    source: ${ref(src)}
    metrics:
      - name: nested_metric
        expression: sum(x)
    dimensions:
      - name: nested_dimension
        expression: x
  - name: other
    sql: select 1 as x
    source: ${ref(src)}
metrics:
  - name: top_metric
    expression: sum(${ref(mdl).y})
dimensions:
  - name: top_dimension
    expression: ${ref(mdl).y}
relations:
  - name: rel
    join_type: inner
    condition: ${ref(mdl).x} = ${ref(other).x}
insights:
  - name: ins
    props:
      type: scatter
      x: ?{${ref(mdl).x}}
      y: ?{${ref(mdl).y}}
charts:
  - name: cht
    insights:
      - ${ref(ins)}
tables:
  - name: tbl
    data: ${ref(mdl)}
markdowns:
  - name: mkd
    content: hello
inputs:
  - name: inp
    type: single-select
    options: ["a", "b"]
dashboards:
  - name: dash
    rows:
      - height: medium
        items:
          - chart: ${ref(cht)}
"""
    tmp = temp_yml_file(
        dict=json.loads(json.dumps(yaml.safe_load(project_yaml))), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)
    expected = {
        "sources": ["src"],
        "models": ["mdl", "other"],
        "metrics": ["nested_metric", "top_metric"],
        "dimensions": ["nested_dimension", "top_dimension"],
        "relations": ["rel"],
        "insights": ["ins"],
        "charts": ["cht"],
        "tables": ["tbl"],
        "markdowns": ["mkd"],
        "inputs": ["inp"],
        "dashboards": ["dash"],
    }
    for object_type, names in expected.items():
        response = runner.invoke(list, [object_type, "-w", working_dir])
        assert response.exit_code == 0, (object_type, response.output)
        listed = sorted(line[3:] for line in response.output.splitlines() if line.startswith(" - "))
        assert f"{object_type}:" in response.output
        assert listed == names, (object_type, response.output)
