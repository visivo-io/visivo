"""Tests for NameFormatDeprecation checker."""

import os
import tempfile

from visivo.models.deprecations.name_format_deprecation import NameFormatDeprecation
from visivo.models.project import Project
from visivo.query.patterns import is_valid_name, normalize_name
from tests.factories.model_factories import (
    SourceFactory,
    SqlModelFactory,
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
        model = SqlModelFactory(name="orders", source="${ref(my_source)}")

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
