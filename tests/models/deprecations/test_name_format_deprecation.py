"""Tests for NameFormatDeprecation checker."""

import os
import tempfile

from visivo.models.deprecations.name_format_deprecation import NameFormatDeprecation
from visivo.models.project import Project
from visivo.query.patterns import is_valid_name, normalize_name
from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
    ChartFactory,
    DashboardFactory,
)


class TestIsValidName:
    """Tests for is_valid_name function."""

    def test_valid_lowercase_name(self):
        """Test that valid lowercase names pass."""
        assert is_valid_name("orders")
        assert is_valid_name("my_model")
        assert is_valid_name("my-model")
        assert is_valid_name("orders_2024")
        assert is_valid_name("_private")

    def test_invalid_uppercase_name(self):
        """Test that uppercase names fail."""
        assert not is_valid_name("Orders")
        assert not is_valid_name("MyModel")
        assert not is_valid_name("ORDERS")

    def test_invalid_special_characters(self):
        """Test that names with special characters fail."""
        assert not is_valid_name("my model")
        assert not is_valid_name("my.model")
        assert not is_valid_name("orders(2024)")
        assert not is_valid_name("user@name")

    def test_invalid_starting_with_digit(self):
        """Test that names starting with digits fail."""
        assert not is_valid_name("123orders")
        assert not is_valid_name("2024_orders")


class TestNormalizeName:
    """Tests for normalize_name function."""

    def test_lowercase_conversion(self):
        """Test that names are lowercased."""
        assert normalize_name("Orders") == "orders"
        assert normalize_name("MyModel") == "my_model"
        assert normalize_name("ORDERS") == "orders"

    def test_space_replacement(self):
        """Test that spaces are replaced with hyphens."""
        assert normalize_name("my model") == "my-model"
        assert normalize_name("My Model Name") == "my-model-name"

    def test_special_character_replacement(self):
        """Test that special characters are replaced with hyphens."""
        assert normalize_name("orders(2024)") == "orders-2024"
        assert normalize_name("Orders (2024)") == "orders-2024"
        assert normalize_name("user.name") == "user-name"
        assert normalize_name("user@email") == "user-email"

    def test_digit_prefix(self):
        """Test that names starting with digits get underscore prefix."""
        assert normalize_name("123orders") == "_123orders"
        assert normalize_name("2024_orders") == "_2024_orders"

    def test_preserve_valid_characters(self):
        """Test that valid characters are preserved."""
        assert normalize_name("my-model") == "my-model"
        assert normalize_name("my_model") == "my_model"
        assert normalize_name("orders123") == "orders123"


class TestNameFormatDeprecation:
    """Tests for NameFormatDeprecation checker."""

    def test_no_warning_for_valid_names(self):
        """Test that valid names don't trigger warnings."""
        source = SourceFactory(name="my_source")
        model = SqlModelFactory(name="orders", source="${refs.my_source}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        checker = NameFormatDeprecation()
        warnings = checker.check(project)

        # Filter to only name format warnings
        name_warnings = [w for w in warnings if w.feature == "Invalid name format"]
        assert len(name_warnings) == 0

    def test_warns_on_uppercase_name(self):
        """Test that uppercase names trigger warning."""
        source = SourceFactory(name="MySource")

        project = Project(
            name="test_project",
            sources=[source],
            dashboards=[],
        )

        checker = NameFormatDeprecation()
        warnings = checker.check(project)

        name_warnings = [w for w in warnings if w.feature == "Invalid name format"]
        assert len(name_warnings) == 1
        assert "MySource" in name_warnings[0].message
        assert "my_source" in name_warnings[0].migration  # CamelCase uses underscore

    def test_warns_on_name_with_spaces(self):
        """Test that names with spaces trigger warning."""
        source = SourceFactory(name="my source")

        project = Project(
            name="test_project",
            sources=[source],
            dashboards=[],
        )

        checker = NameFormatDeprecation()
        warnings = checker.check(project)

        name_warnings = [w for w in warnings if w.feature == "Invalid name format"]
        assert len(name_warnings) == 1
        assert "my source" in name_warnings[0].message
        assert "my-source" in name_warnings[0].migration  # Spaces become hyphens

    def test_warns_on_multiple_invalid_names(self):
        """Test that multiple invalid names each trigger warnings."""
        source = SourceFactory(name="My Source")
        # Use legacy ref syntax since 'My Source' contains a space
        model = SqlModelFactory(name="Orders 2024", source="${ref(My Source)}")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        checker = NameFormatDeprecation()
        warnings = checker.check(project)

        name_warnings = [w for w in warnings if w.feature == "Invalid name format"]
        assert len(name_warnings) == 2

    def test_can_migrate_returns_true(self):
        """Test that checker supports migration."""
        checker = NameFormatDeprecation()
        assert checker.can_migrate() is True

    def test_get_migrations_from_files(self):
        """Test that migrations are generated from YAML files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a test YAML file with invalid names
            yaml_content = """
sources:
  - name: My Source
    database: test.db

models:
  - name: Orders 2024
    sql: SELECT * FROM orders
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 2

            # Check first migration
            source_migration = next((m for m in migrations if "My Source" in m.description), None)
            assert source_migration is not None
            assert "my-source" in source_migration.new_text  # Spaces become hyphens

            # Check second migration
            model_migration = next((m for m in migrations if "Orders 2024" in m.description), None)
            assert model_migration is not None
            assert "orders-2024" in model_migration.new_text  # Spaces become hyphens

    def test_get_migrations_skips_valid_names(self):
        """Test that valid names don't generate migrations."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
sources:
  - name: my_source
    database: test.db

models:
  - name: orders
    sql: SELECT * FROM orders
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 0

    def test_get_migrations_updates_references(self):
        """Test that references to renamed items are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
traces:
  - name: Indicator Trace
    model:
      sql: SELECT 1 as value

charts:
  - name: indicator_chart
    traces:
      - ${ ref(Indicator Trace) }
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: rename + reference update
            assert len(migrations) == 2

            # Check name migration
            name_migration = next(
                (m for m in migrations if "'Indicator Trace'" in m.description), None
            )
            assert name_migration is not None
            assert "indicator-trace" in name_migration.new_text

            # Check reference migration
            ref_migration = next(
                (m for m in migrations if "ref 'Indicator Trace'" in m.description), None
            )
            assert ref_migration is not None
            assert "${refs.indicator-trace}" in ref_migration.new_text

    def test_get_migrations_updates_references_with_properties(self):
        """Test that references with property paths are migrated correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
traces:
  - name: Simple Line
    model:
      sql: SELECT x, y FROM test

charts:
  - name: test_chart
    traces:
      - name: derived
        props:
          x: ${ref(Simple Line).props.x}
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: rename + reference update
            assert len(migrations) == 2

            # Check reference migration preserves property path
            ref_migration = next(
                (m for m in migrations if "ref 'Simple Line'" in m.description), None
            )
            assert ref_migration is not None
            assert "${refs.simple-line.props.x}" in ref_migration.new_text

    def test_get_migrations_handles_multiple_references(self):
        """Test that multiple references to the same name are all migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
traces:
  - name: Fibonacci Waterfall
    model:
      sql: SELECT x, y FROM fib

charts:
  - name: chart_1
    traces:
      - ${ ref(Fibonacci Waterfall) }
  - name: chart_2
    traces:
      - ${ ref(Fibonacci Waterfall) }
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 3 migrations: 1 name rename + 2 reference updates
            assert len(migrations) == 3

            ref_migrations = [m for m in migrations if "ref 'Fibonacci Waterfall'" in m.description]
            assert len(ref_migrations) == 2

    def test_get_migrations_handles_bare_refs(self):
        """Test that bare ref() syntax is also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
models:
  - name: My Model
    sql: SELECT 1

  - name: derived_model
    source: ref(My Model)
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: rename + bare ref update
            assert len(migrations) == 2

            ref_migration = next((m for m in migrations if "ref 'My Model'" in m.description), None)
            assert ref_migration is not None
            assert "${refs.my-model}" in ref_migration.new_text

    def test_get_migrations_handles_refs_to_external_names(self):
        """Test that refs to names defined externally (includes) are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # This simulates a reference to "test table" which is defined in an include
            # but not in the local YAML files
            yaml_content = """
traces:
  - name: funnel_trace
    model: ${ ref(test table) }
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 1 migration for the ref (no name: field for "test table")
            assert len(migrations) == 1

            ref_migration = migrations[0]
            assert "ref 'test table'" in ref_migration.description
            assert "${refs.test-table}" in ref_migration.new_text

    def test_get_migrations_requires_project_file(self):
        """Test that migrations are skipped if no project.visivo.yml exists."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a YAML file with invalid names but NOT named project.visivo.yml
            yaml_content = """
sources:
  - name: My Source
    database: test.db
"""
            yaml_path = os.path.join(tmpdir, "models.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 0 migrations because there's no project.visivo.yml
            assert len(migrations) == 0

    def test_get_migrations_updates_trace_name_references(self):
        """Test that trace_name fields referencing renamed items are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
traces:
  - name: Fibonacci Waterfall
    model:
      sql: SELECT x, y FROM fib

tables:
  - name: my_table
    column_defs:
      - trace_name: Fibonacci Waterfall
        columns:
          - key: x
            header: X Value
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: name rename + trace_name update
            assert len(migrations) == 2

            # Check name migration
            name_migration = next(
                (
                    m
                    for m in migrations
                    if "'Fibonacci Waterfall'" in m.description
                    and "trace_name" not in m.description
                ),
                None,
            )
            assert name_migration is not None
            assert "fibonacci-waterfall" in name_migration.new_text

            # Check trace_name migration
            trace_name_migration = next(
                (m for m in migrations if "trace_name" in m.description), None
            )
            assert trace_name_migration is not None
            assert "trace_name: fibonacci-waterfall" in trace_name_migration.new_text

    def test_get_migrations_updates_quoted_trace_name(self):
        """Test that quoted trace_name fields are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
traces:
  - name: "My Trace Name"
    model:
      sql: SELECT 1

tables:
  - name: my_table
    column_defs:
      - trace_name: "My Trace Name"
        columns:
          - key: x
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: name rename + trace_name update
            assert len(migrations) == 2

            trace_name_migration = next(
                (m for m in migrations if "trace_name" in m.description), None
            )
            assert trace_name_migration is not None
            assert "my-trace-name" in trace_name_migration.new_text

    def test_get_migrations_updates_insight_name_references(self):
        """Test that insight_name fields referencing renamed items are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
insights:
  - name: My Insight
    props:
      type: scatter
      x: ?{x}
      y: ?{y}

tables:
  - name: my_table
    column_defs:
      - insight_name: My Insight
        columns:
          - key: x
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: name rename + insight_name update
            assert len(migrations) == 2

            insight_name_migration = next(
                (m for m in migrations if "insight_name" in m.description), None
            )
            assert insight_name_migration is not None
            assert "insight_name: my-insight" in insight_name_migration.new_text

    def test_get_migrations_updates_source_name_references(self):
        """Test that source_name fields referencing renamed items are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
sources:
  - name: My Source
    database: test.db

defaults:
  source_name: My Source
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: name rename + source_name update
            assert len(migrations) == 2

            # Check name migration
            name_migration = next(
                (
                    m
                    for m in migrations
                    if "'My Source'" in m.description and "source_name" not in m.description
                ),
                None,
            )
            assert name_migration is not None
            assert "my-source" in name_migration.new_text

            # Check source_name migration
            source_name_migration = next(
                (m for m in migrations if "source_name" in m.description), None
            )
            assert source_name_migration is not None
            assert "source_name: my-source" in source_name_migration.new_text

    def test_get_migrations_updates_quoted_source_name(self):
        """Test that quoted source_name fields are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
sources:
  - name: "Test Source"
    database: test.db

defaults:
  source_name: "Test Source"
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: name rename + source_name update
            assert len(migrations) == 2

            source_name_migration = next(
                (m for m in migrations if "source_name" in m.description), None
            )
            assert source_name_migration is not None
            assert "test-source" in source_name_migration.new_text

    def test_get_migrations_updates_alert_name_references(self):
        """Test that alert_name fields referencing renamed items are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
alerts:
  - name: My Alert
    threshold: 100

defaults:
  alert_name: My Alert
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: name rename + alert_name update
            assert len(migrations) == 2

            # Check name migration
            name_migration = next(
                (
                    m
                    for m in migrations
                    if "'My Alert'" in m.description and "alert_name" not in m.description
                ),
                None,
            )
            assert name_migration is not None
            assert "my-alert" in name_migration.new_text

            # Check alert_name migration
            alert_name_migration = next(
                (m for m in migrations if "alert_name" in m.description), None
            )
            assert alert_name_migration is not None
            assert "alert_name: my-alert" in alert_name_migration.new_text

    def test_get_migrations_updates_quoted_alert_name(self):
        """Test that quoted alert_name fields are also migrated."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yaml_content = """
alerts:
  - name: "Test Alert"
    threshold: 50

defaults:
  alert_name: "Test Alert"
"""
            yaml_path = os.path.join(tmpdir, "project.visivo.yml")
            with open(yaml_path, "w") as f:
                f.write(yaml_content)

            checker = NameFormatDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            # Should have 2 migrations: name rename + alert_name update
            assert len(migrations) == 2

            alert_name_migration = next(
                (m for m in migrations if "alert_name" in m.description), None
            )
            assert alert_name_migration is not None
            assert "test-alert" in alert_name_migration.new_text
