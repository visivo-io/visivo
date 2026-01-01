"""Deprecation checker for invalid name formats."""

import re
from typing import TYPE_CHECKING, List

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.query.patterns import is_valid_name, normalize_name
from visivo.utils import list_all_ymls_in_dir

if TYPE_CHECKING:
    from visivo.models.project import Project


# Pattern to find name fields in YAML files
# Matches: name: value or name: "value" or name: 'value'
# Handles both quoted and unquoted names
NAME_FIELD_UNQUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?name:\s*([^"\'\n#][^\n#]*?)\s*$', re.MULTILINE
)
NAME_FIELD_QUOTED_PATTERN = re.compile(r'^(\s*)(- )?name:\s*(["\'])(.+?)\3\s*$', re.MULTILINE)


class NameFormatDeprecation(BaseDeprecationChecker):
    """
    Warns about names that don't conform to the new naming conventions.

    Valid names must:
    - Be lowercase
    - Start with a letter or underscore
    - Contain only alphanumeric characters, underscores, and hyphens

    Examples of invalid names:
    - "My Model" (uppercase, spaces)
    - "Orders (2024)" (parentheses)
    - "user.name" (dots)
    - "123abc" (starts with digit)
    """

    REMOVAL_VERSION = "2.0.0"
    FEATURE_NAME = "Invalid name format"
    MIGRATION_GUIDE = (
        "Names must be lowercase with only alphanumeric, underscore, and hyphen characters."
    )

    def check(self, project: "Project") -> List[DeprecationWarning]:
        """
        Check for names that don't conform to the new naming conventions.

        Args:
            project: The project to check

        Returns:
            List of deprecation warnings found
        """
        warnings = []

        # Dump entire project to dict and recursively check all name fields
        project_data = project.model_dump(exclude_none=True)
        self._check_recursive(project_data, warnings, "project")

        return warnings

    def _check_recursive(
        self,
        data,
        warnings: List[DeprecationWarning],
        path: str,
    ) -> None:
        """Recursively check data structure for invalid name values."""
        if isinstance(data, dict):
            # Check if this dict has a name field
            if "name" in data:
                name_value = data["name"]
                if isinstance(name_value, str) and not is_valid_name(name_value):
                    warnings.append(self._create_warning(name_value, f"{path}.name"))

            # Recurse into all values
            for key, value in data.items():
                new_path = f"{path}.{key}"
                self._check_recursive(value, warnings, new_path)
        elif isinstance(data, list):
            for idx, item in enumerate(data):
                new_path = f"{path}[{idx}]"
                self._check_recursive(item, warnings, new_path)

    def _create_warning(self, name_value: str, location: str = None) -> DeprecationWarning:
        """Create a deprecation warning for an invalid name."""
        normalized = normalize_name(name_value)

        return DeprecationWarning(
            feature=self.FEATURE_NAME,
            message=f"Name '{name_value}' contains invalid characters.",
            migration=f"Rename to '{normalized}'",
            removal_version=self.REMOVAL_VERSION,
            location=location or "",
        )

    def can_migrate(self) -> bool:
        """This checker supports automatic migration."""
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        """
        Scan YAML files for invalid names and return migrations.

        Converts names to valid format:
        - Lowercase
        - Replace special characters with underscore
        """
        migrations = []

        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Find unquoted name: value patterns
                for match in NAME_FIELD_UNQUOTED_PATTERN.finditer(content):
                    indent = match.group(1)
                    list_prefix = match.group(2) or ""
                    name_value = match.group(3).strip()

                    migration = self._create_migration_action(
                        file_path, match.group(0), indent, list_prefix, name_value
                    )
                    if migration:
                        migrations.append(migration)

                # Find quoted name: "value" or name: 'value' patterns
                for match in NAME_FIELD_QUOTED_PATTERN.finditer(content):
                    indent = match.group(1)
                    list_prefix = match.group(2) or ""
                    name_value = match.group(4)  # Group 3 is the quote char

                    migration = self._create_migration_action(
                        file_path, match.group(0), indent, list_prefix, name_value
                    )
                    if migration:
                        migrations.append(migration)

            except Exception:
                # Skip files that can't be read
                continue

        return migrations

    def _create_migration_action(
        self,
        file_path: str,
        old_text: str,
        indent: str,
        list_prefix: str,
        name_value: str,
    ) -> MigrationAction:
        """Create a migration action for a name field if needed."""
        # Skip if already valid
        if is_valid_name(name_value):
            return None

        # Normalize the name
        normalized = normalize_name(name_value)

        # Skip if normalization produces the same result
        if normalized == name_value:
            return None

        new_text = f"{indent}{list_prefix}name: {normalized}"

        return MigrationAction(
            file_path=str(file_path),
            old_text=old_text,
            new_text=new_text,
            description=f"'{name_value}' -> '{normalized}'",
        )
