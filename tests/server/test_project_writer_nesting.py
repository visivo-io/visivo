"""Tests that ProjectWriter nests metrics/dimensions under their parent model
when a `parent_model` hint is present in the named_children dict.

These cover the fix for the Explorer → Save → Publish flow where model-scoped
computed columns were being written to top-level `metrics:`/`dimensions:`
lists instead of nested under the model they were defined on.
"""

import os

import ruamel.yaml

from tests.support.utils import temp_folder, temp_yml_file
from visivo.server.project_writer import ProjectWriter


def _read_yaml(path):
    yaml = ruamel.yaml.YAML(typ="safe")
    with open(path) as f:
        return yaml.load(f)


def test_new_metric_with_parent_model_nests_under_existing_model():
    """A brand-new metric scoped to an existing model must land in that
    model's `metrics:` list, not in a top-level `metrics:` list."""
    project_dir = temp_folder()
    models_file = str(
        temp_yml_file(
            {
                "models": [
                    {
                        "name": "products",
                        "sql": "SELECT 1",
                        "metrics": [
                            {"name": "avg_price", "expression": "AVG(price)"},
                        ],
                    }
                ]
            },
            name="models.yml",
            output_dir=project_dir,
        )
    )

    named_children = {
        "new_total_price": {
            "status": "New",
            "file_path": models_file,
            "new_file_path": models_file,
            "type_key": "metrics",
            "parent_model": "products",
            "config": {"name": "new_total_price", "expression": "SUM(price)"},
        }
    }

    writer = ProjectWriter(named_children)
    writer.update_file_contents()
    writer.write()

    loaded = _read_yaml(models_file)
    products = next(m for m in loaded["models"] if m["name"] == "products")
    assert [m["name"] for m in products["metrics"]] == [
        "avg_price",
        "new_total_price",
    ]
    # Top-level metrics list must not have grown.
    assert "metrics" not in loaded or loaded.get("metrics") in (None, [])


def test_new_dimension_with_parent_model_nests_under_existing_model():
    project_dir = temp_folder()
    models_file = str(
        temp_yml_file(
            {
                "models": [
                    {
                        "name": "orders",
                        "sql": "SELECT 1",
                        "dimensions": [
                            {"name": "order_month", "expression": "date_trunc('month', date)"},
                        ],
                    }
                ]
            },
            name="models.yml",
            output_dir=project_dir,
        )
    )

    named_children = {
        "bucketed_price": {
            "status": "New",
            "file_path": models_file,
            "new_file_path": models_file,
            "type_key": "dimensions",
            "parent_model": "orders",
            "config": {"name": "bucketed_price", "expression": "ROUND(price, 0)"},
        }
    }

    writer = ProjectWriter(named_children)
    writer.update_file_contents()
    writer.write()

    loaded = _read_yaml(models_file)
    orders = next(m for m in loaded["models"] if m["name"] == "orders")
    assert [d["name"] for d in orders["dimensions"]] == [
        "order_month",
        "bucketed_price",
    ]
    assert "dimensions" not in loaded or loaded.get("dimensions") in (None, [])


def test_new_metric_without_parent_model_still_goes_to_top_level():
    """Global (unscoped) metrics must keep the old behavior: appended to the
    top-level `metrics:` list."""
    project_dir = temp_folder()
    project_file = str(
        temp_yml_file(
            {"models": [{"name": "products", "sql": "SELECT 1"}]},
            name="project.yml",
            output_dir=project_dir,
        )
    )

    named_children = {
        "global_rev": {
            "status": "New",
            "file_path": project_file,
            "new_file_path": project_file,
            "type_key": "metrics",
            "config": {
                "name": "global_rev",
                "expression": "${ref(orders).total} + ${ref(products).avg_price}",
            },
        }
    }

    writer = ProjectWriter(named_children)
    writer.update_file_contents()
    writer.write()

    loaded = _read_yaml(project_file)
    assert "metrics" in loaded
    assert [m["name"] for m in loaded["metrics"]] == ["global_rev"]
    # The existing products model must not have acquired this metric.
    products = next(m for m in loaded["models"] if m["name"] == "products")
    assert "metrics" not in products or products.get("metrics") in (None, [])


def test_new_model_with_new_nested_metric_in_same_write():
    """When a brand-new model AND a brand-new metric scoped to it are
    published together, the metric must be nested under the model in the
    resulting YAML (not appended to a top-level metrics list)."""
    project_dir = temp_folder()
    project_file = str(temp_yml_file({}, name="project.yml", output_dir=project_dir))

    named_children = {
        # Model is processed first by ProjectWriter (dict insertion order
        # mirrors the publish_views processing order: models before metrics).
        "new_orders": {
            "status": "New",
            "file_path": project_file,
            "new_file_path": project_file,
            "type_key": "models",
            "config": {"name": "new_orders", "sql": "SELECT 1 AS id"},
        },
        "orders_total": {
            "status": "New",
            "file_path": project_file,
            "new_file_path": project_file,
            "type_key": "metrics",
            "parent_model": "new_orders",
            "config": {"name": "orders_total", "expression": "SUM(id)"},
        },
    }

    writer = ProjectWriter(named_children)
    writer.update_file_contents()
    writer.write()

    loaded = _read_yaml(project_file)
    new_orders = next(m for m in loaded["models"] if m["name"] == "new_orders")
    assert [m["name"] for m in new_orders["metrics"]] == ["orders_total"]
    # No orphan top-level metric.
    assert "metrics" not in loaded or loaded.get("metrics") in (None, [])


def test_missing_parent_model_falls_back_to_top_level():
    """If ProjectWriter cannot find the parent model in the target file
    (e.g. because the YAML was authored unusually), it must not crash — it
    falls back to writing a top-level entry."""
    project_dir = temp_folder()
    project_file = str(temp_yml_file({}, name="project.yml", output_dir=project_dir))

    named_children = {
        "orphan_metric": {
            "status": "New",
            "file_path": project_file,
            "new_file_path": project_file,
            "type_key": "metrics",
            "parent_model": "does_not_exist",
            "config": {"name": "orphan_metric", "expression": "COUNT(*)"},
        }
    }

    writer = ProjectWriter(named_children)
    writer.update_file_contents()
    writer.write()

    loaded = _read_yaml(project_file)
    assert [m["name"] for m in loaded["metrics"]] == ["orphan_metric"]
