#!/usr/bin/env python3
"""
Validation script for visivo run results.

This script validates that the integration test project produces the expected
results when running 'visivo run'. It checks:

1. Schema generation - correct number of tables and columns
2. Trace data generation - correct number of trace folders
3. Model generation - correct number of model files
4. Overall structure and file existence

Run this script from the integration test project directory after running 'visivo run'.
"""

import json
import os
import sys
import yaml
from pathlib import Path
from typing import Dict, Any, List


class VisivoRunValidator:
    """Validates the results of a visivo run execution."""

    def __init__(self, target_dir: str = "target", source_name: str = None, run_id: str = "main"):
        self.target_dir = Path(target_dir)
        self.run_dir = self.target_dir / run_id
        self.source_name = source_name
        self.errors = []
        self.warnings = []

    def log_error(self, message: str):
        """Log a validation error."""
        self.errors.append(f"ERROR: {message}")
        print(f"❌ {message}")

    def log_warning(self, message: str):
        """Log a validation warning."""
        self.warnings.append(f"WARNING: {message}")
        print(f"⚠️  {message}")

    def log_success(self, message: str):
        """Log a validation success."""
        print(f"✅ {message}")

    def validate_target_directory_exists(self) -> bool:
        """Validate that the target directory exists."""
        if not self.target_dir.exists():
            self.log_error(f"Target directory '{self.target_dir}' does not exist")
            return False

        if not self.target_dir.is_dir():
            self.log_error(f"Target path '{self.target_dir}' is not a directory")
            return False

        self.log_success(f"Target directory '{self.target_dir}' exists")
        return True

    def _get_expected_sources(self) -> List[str]:
        """Determine which sources should have schema files based on project configuration."""
        # If a specific source name was provided, use only that source
        if self.source_name:
            self.log_success(f"Using specified source: {self.source_name}")
            return [self.source_name]

        try:
            # Read project configuration to find configured sources
            project_file = Path("project.visivo.yml")
            if not project_file.exists():
                self.log_warning("project.visivo.yml not found, falling back to default source")
                return ["local-duckdb"]  # fallback

            with open(project_file, "r") as f:
                project_config = yaml.safe_load(f)

            sources = project_config.get("sources", [])
            source_names = []

            for source in sources:
                source_name = source.get("name")
                if source_name:
                    source_names.append(source_name)

            if not source_names:
                self.log_warning(
                    "No sources found in project configuration, falling back to default"
                )
                return ["local-duckdb"]

            self.log_success(f"Found configured sources: {source_names}")
            return source_names

        except Exception as e:
            self.log_warning(f"Error reading project configuration: {e}, falling back to default")
            return ["local-duckdb"]

    def validate_schemas(self) -> bool:
        """Validate schema generation results."""
        schemas_dir = self.target_dir / "schemas"

        if not schemas_dir.exists():
            self.log_error(f"Schemas directory does not exist at {schemas_dir}")
            return False

        # Dynamically determine which sources should have schemas
        expected_sources = self._get_expected_sources()

        success = True
        for source_name in expected_sources:
            source_schema_file = schemas_dir / source_name / "schema.json"

            if not source_schema_file.exists():
                self.log_error(
                    f"Schema file for source '{source_name}' does not exist: {source_schema_file}"
                )
                success = False
                continue

            try:
                with open(source_schema_file, "r") as f:
                    schema_data = json.load(f)

                # Validate schema structure
                required_keys = ["source_name", "source_type", "tables", "metadata"]
                for key in required_keys:
                    if key not in schema_data:
                        self.log_error(
                            f"Missing required key '{key}' in schema for source '{source_name}'"
                        )
                        success = False

                if success:
                    # Validate schema content based on source type
                    metadata = schema_data.get("metadata", {})
                    actual_tables = metadata.get("total_tables", 0)
                    actual_columns = metadata.get("total_columns", 0)

                    # Basic validation that schema has some content
                    if actual_tables == 0:
                        self.log_error(
                            f"Source '{source_name}' has 0 tables - schema may be empty or failed to build"
                        )
                        success = False
                    else:
                        self.log_success(
                            f"Schema for {source_name}: {actual_tables} tables, {actual_columns} columns"
                        )

                    # Source-specific validations
                    if source_name == "local-duckdb":
                        success = self._validate_duckdb_schema(schema_data, source_name) and success
                    else:
                        # For other sources, just validate basic structure
                        tables = schema_data.get("tables", {})
                        if len(tables) > 0:
                            self.log_success(
                                f"Source '{source_name}' has tables with valid structure"
                            )
                        else:
                            self.log_warning(f"Source '{source_name}' has no tables in schema")

            except (json.JSONDecodeError, IOError) as e:
                self.log_error(f"Failed to read/parse schema file for source '{source_name}': {e}")
                success = False

        return success

    def _validate_duckdb_schema(self, schema_data, source_name) -> bool:
        """Validate DuckDB-specific schema expectations."""
        # Expected DuckDB schema structure for integration test
        expected_table_names = {"data", "second_test_table", "test_table"}
        expected_tables = 3
        expected_columns = 6

        tables = schema_data.get("tables", {})
        actual_table_names = set(tables.keys())

        # Check table count
        if len(tables) != expected_tables:
            self.log_error(
                f"DuckDB source '{source_name}' expected {expected_tables} tables, got {len(tables)}"
            )
            return False

        # Check table names
        if actual_table_names != expected_table_names:
            missing_tables = expected_table_names - actual_table_names
            extra_tables = actual_table_names - expected_table_names
            if missing_tables:
                self.log_error(
                    f"DuckDB source '{source_name}' missing expected tables: {missing_tables}"
                )
            if extra_tables:
                self.log_error(
                    f"DuckDB source '{source_name}' has unexpected tables: {extra_tables}"
                )
            return False

        # Check column count
        metadata = schema_data.get("metadata", {})
        actual_columns = metadata.get("total_columns", 0)
        if actual_columns != expected_columns:
            self.log_error(
                f"DuckDB source '{source_name}' expected {expected_columns} columns, got {actual_columns}"
            )
            return False

        # Check each table has expected columns (X, Y)
        for table_name in expected_table_names:
            table_info = tables.get(table_name, {})
            columns = table_info.get("columns", {})
            if set(columns.keys()) != {"X", "Y"}:
                self.log_error(
                    f"DuckDB table '{table_name}' expected columns [X, Y], got {list(columns.keys())}"
                )
                return False

        self.log_success(f"DuckDB source '{source_name}' schema validation passed")
        return True

    def validate_traces(self) -> bool:
        """Validate trace data generation results."""
        traces_dir = self.run_dir / "traces"

        if not traces_dir.exists():
            self.log_error(f"Traces directory does not exist at {traces_dir}")
            return False

        # Expected trace names based on traces.visivo.yml and inline traces
        # Names are normalized: lowercase, hyphens instead of spaces, underscore prefix for names starting with digits
        expected_traces = [
            "3d-line-one",
            "3d-line-two",
            "aggregated-line",
            "double-simple-line",
            "example-indicator",
            "fibonacci-waterfall",
            "funnel-trace",
            "indicator-trace",
            "markdown-trace-base-with-a-super-super-long-name-markdown-trace-base-even-longer-now-with-more-characters",
            "simple-line",
            "surface-trace",
        ]

        success = True
        actual_traces = []

        for item in traces_dir.iterdir():
            if item.is_dir():
                actual_traces.append(item.name)

        actual_traces.sort()
        expected_traces.sort()

        # Check if we have the expected number of traces
        if len(actual_traces) != len(expected_traces):
            self.log_error(
                f"Expected {len(expected_traces)} trace directories, found {len(actual_traces)}"
            )
            self.log_error(f"Expected: {expected_traces}")
            self.log_error(f"Actual: {actual_traces}")
            success = False
        else:
            self.log_success(f"Found {len(actual_traces)} trace directories (correct)")

        # Check if all expected traces exist
        missing_traces = set(expected_traces) - set(actual_traces)
        if missing_traces:
            self.log_error(f"Missing expected trace directories: {list(missing_traces)}")
            success = False

        unexpected_traces = set(actual_traces) - set(expected_traces)
        if unexpected_traces:
            self.log_warning(f"Found unexpected trace directories: {list(unexpected_traces)}")

        # Validate each trace directory has a data file
        for trace_name in actual_traces:
            trace_dir = traces_dir / trace_name
            data_file = trace_dir / "data.json"

            if not data_file.exists():
                self.log_error(f"Trace '{trace_name}' missing data.json file")
                success = False
            else:
                try:
                    # Verify the data file is valid JSON
                    with open(data_file, "r") as f:
                        json.load(f)
                except (json.JSONDecodeError, IOError) as e:
                    self.log_error(f"Trace '{trace_name}' has invalid data.json: {e}")
                    success = False

        if success:
            self.log_success("All trace directories have valid data.json files")

        return success

    def validate_models(self) -> bool:
        """Validate model generation results."""
        models_dir = self.run_dir / "models"

        if not models_dir.exists():
            self.log_error(f"Models directory does not exist at {models_dir}")
            return False

        # Expected models based on models.visivo.yml
        expected_models = ["csv", "join_table", "markdown-table-base", "waterfall_model"]

        success = True

        for model_name in expected_models:
            model_file = models_dir / f"{model_name}.duckdb"

            if not model_file.exists():
                self.log_error(f"Model file '{model_name}.duckdb' does not exist")
                success = False
            else:
                # Check file size is reasonable (> 0 bytes)
                file_size = model_file.stat().st_size
                if file_size == 0:
                    self.log_error(f"Model file '{model_name}.duckdb' is empty")
                    success = False

        if success:
            self.log_success(f"All {len(expected_models)} model files exist with data")

        return success

    def validate_core_files(self) -> bool:
        """Validate core project files exist."""
        required_files = ["project.json", "explorer.json", "error.json"]

        success = True

        for filename in required_files:
            file_path = self.target_dir / filename

            if not file_path.exists():
                self.log_error(f"Required file '{filename}' does not exist")
                success = False
            else:
                if filename.endswith(".json"):
                    try:
                        with open(file_path, "r") as f:
                            json.load(f)
                    except (json.JSONDecodeError, IOError) as e:
                        self.log_error(f"Invalid JSON in '{filename}': {e}")
                        success = False

        if success:
            self.log_success("All core project files exist and are valid")

        return success

    def run_validation(self) -> bool:
        """Run complete validation and return success status."""
        print("🚀 Starting visivo run results validation...\n")

        # Run all validations
        validations = [
            self.validate_target_directory_exists(),
            self.validate_core_files(),
            self.validate_schemas(),
            self.validate_traces(),
            self.validate_models(),
        ]

        overall_success = all(validations)

        print(f"\n📊 Validation Summary:")
        print(f"   Errors: {len(self.errors)}")
        print(f"   Warnings: {len(self.warnings)}")

        if self.errors:
            print(f"\n❌ Validation Failed - Errors:")
            for error in self.errors:
                print(f"   {error}")

        if self.warnings:
            print(f"\n⚠️  Warnings:")
            for warning in self.warnings:
                print(f"   {warning}")

        if overall_success:
            print(f"\n🎉 All validations passed! visivo run produced expected results.")
        else:
            print(f"\n💥 Validation failed! Please check the errors above.")

        return overall_success


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Validate visivo run results")
    parser.add_argument("--source", help="Specific source name to validate (optional)")
    parser.add_argument(
        "--target-dir", default="target", help="Target directory to validate (default: target)"
    )
    parser.add_argument("--run-id", default="main", help="Run ID to validate (default: main)")
    args = parser.parse_args()

    # Check if we're in the right directory
    if not Path("project.visivo.yml").exists():
        print(
            "❌ ERROR: project.visivo.yml not found. Please run this script from the integration test project directory."
        )
        sys.exit(1)

    validator = VisivoRunValidator(
        target_dir=args.target_dir, source_name=args.source, run_id=args.run_id
    )
    success = validator.run_validation()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
