"""Deprecation checker for invalid name formats."""

import os
import re
from typing import TYPE_CHECKING, List, Dict

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
# Matches: name: value (unquoted) - value must start with non-quote/non-space char
NAME_FIELD_UNQUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?name:\s+([^"\'\s#][^\n#]*?)\s*$', re.MULTILINE
)
# Matches: name: "value" or name: 'value' (quoted)
NAME_FIELD_QUOTED_PATTERN = re.compile(r'^(\s*)(- )?name:\s*(["\'])(.+?)\3\s*$', re.MULTILINE)

# Pattern to find trace_name fields in YAML files (used in column_defs)
# Matches: trace_name: value (unquoted) - value must start with non-quote/non-space char
TRACE_NAME_FIELD_UNQUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?trace_name:\s+([^"\'\s#][^\n#]*?)\s*$', re.MULTILINE
)
# Matches: trace_name: "value" or trace_name: 'value' (quoted)
TRACE_NAME_FIELD_QUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?trace_name:\s*(["\'])(.+?)\3\s*$', re.MULTILINE
)

# Pattern to find insight_name fields in YAML files (used in column_defs)
# Matches: insight_name: value (unquoted) - value must start with non-quote/non-space char
INSIGHT_NAME_FIELD_UNQUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?insight_name:\s+([^"\'\s#][^\n#]*?)\s*$', re.MULTILINE
)
# Matches: insight_name: "value" or insight_name: 'value' (quoted)
INSIGHT_NAME_FIELD_QUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?insight_name:\s*(["\'])(.+?)\3\s*$', re.MULTILINE
)

# Pattern to find source_name fields in YAML files (used in defaults)
# Matches: source_name: value (unquoted) - value must start with non-quote/non-space char
SOURCE_NAME_FIELD_UNQUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?source_name:\s+([^"\'\s#][^\n#]*?)\s*$', re.MULTILINE
)
# Matches: source_name: "value" or source_name: 'value' (quoted)
SOURCE_NAME_FIELD_QUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?source_name:\s*(["\'])(.+?)\3\s*$', re.MULTILINE
)

# Pattern to find alert_name fields in YAML files (used in defaults)
# Matches: alert_name: value (unquoted) - value must start with non-quote/non-space char
ALERT_NAME_FIELD_UNQUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?alert_name:\s+([^"\'\s#][^\n#]*?)\s*$', re.MULTILINE
)
# Matches: alert_name: "value" or alert_name: 'value' (quoted)
ALERT_NAME_FIELD_QUOTED_PATTERN = re.compile(
    r'^(\s*)(- )?alert_name:\s*(["\'])(.+?)\3\s*$', re.MULTILINE
)

# Pattern to find all ref() calls and extract the name
# Matches: ${ref(Name)}, ${ ref(Name) }, ${ref('Name')}, ${ref("Name")}, ref(Name)
# Captures the name (with optional quotes that we'll strip)
REF_CALL_PATTERN = re.compile(
    r'(?:\$\{\s*)?ref\(\s*(?P<quote>["\'])?(?P<name>[^"\')]+)(?P=quote)?\s*\)(?:\s*\})?'
)


def build_ref_pattern(name: str) -> re.Pattern:
    """
    Build a pattern to find all references to a given name.

    Matches:
    - ${ref(Name)} or ${ ref(Name) } or ${ref('Name')} or ${ref("Name")}
    - ${refs.Name} (if name has no spaces)
    - ref(Name) or ref('Name') or ref("Name") (bare ref)
    """
    # Escape special regex characters in the name
    escaped = re.escape(name)

    # Pattern for ${ref(Name)} with optional quotes and whitespace
    context_ref = rf'\$\{{\s*ref\(\s*["\']?{escaped}["\']?\s*\)[^}}]*\}}'

    # Pattern for bare ref(Name) with optional quotes
    bare_ref = rf'(?<!\$\{{)\bref\(\s*["\']?{escaped}["\']?\s*\)'

    # Combine patterns
    combined = rf"({context_ref}|{bare_ref})"

    return re.compile(combined)


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
        - Replace special characters with hyphen
        - Also updates all references to renamed items

        Only runs in valid Visivo project folders (containing project.visivo.yml).
        """
        # Check if this is a valid Visivo project folder
        project_file = os.path.join(working_dir, "project.visivo.yml")
        if not os.path.exists(project_file):
            return []

        migrations = []
        # Track name renames: old_name -> normalized_name
        name_renames: Dict[str, str] = {}

        # First pass: collect all invalid names and their normalized versions
        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Find unquoted name: value patterns
                for match in NAME_FIELD_UNQUOTED_PATTERN.finditer(content):
                    indent = match.group(1)
                    list_prefix = match.group(2) or ""
                    name_value = match.group(3).strip()

                    if not is_valid_name(name_value):
                        normalized = normalize_name(name_value)
                        if normalized != name_value:
                            name_renames[name_value] = normalized
                            migrations.append(
                                MigrationAction(
                                    file_path=str(file_path),
                                    old_text=match.group(0),
                                    new_text=f"{indent}{list_prefix}name: {normalized}",
                                    description=f"'{name_value}' -> '{normalized}'",
                                )
                            )

                # Find quoted name: "value" or name: 'value' patterns
                for match in NAME_FIELD_QUOTED_PATTERN.finditer(content):
                    indent = match.group(1)
                    list_prefix = match.group(2) or ""
                    name_value = match.group(4)  # Group 3 is the quote char

                    if not is_valid_name(name_value):
                        normalized = normalize_name(name_value)
                        if normalized != name_value:
                            name_renames[name_value] = normalized
                            migrations.append(
                                MigrationAction(
                                    file_path=str(file_path),
                                    old_text=match.group(0),
                                    new_text=f"{indent}{list_prefix}name: {normalized}",
                                    description=f"'{name_value}' -> '{normalized}'",
                                )
                            )

            except Exception:
                # Skip files that can't be read
                continue

        # Second pass: find all references to renamed items and update them
        # Also find any ref() calls with invalid names that weren't found as name: fields
        # (e.g., names defined in includes or external files)
        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # First handle known renames from name: fields
                for old_name, new_name in name_renames.items():
                    ref_pattern = build_ref_pattern(old_name)
                    for match in ref_pattern.finditer(content):
                        old_ref = match.group(0)
                        # Convert to new refs syntax: ${refs.new_name}
                        # Check if this ref has a property path
                        new_ref = self._build_new_ref(old_ref, old_name, new_name)
                        if new_ref and new_ref != old_ref:
                            migrations.append(
                                MigrationAction(
                                    file_path=str(file_path),
                                    old_text=old_ref,
                                    new_text=new_ref,
                                    description=f"ref '{old_name}' -> ref '{new_name}'",
                                )
                            )

                # Also find any ref() calls with invalid names not in name_renames
                # These might reference names defined in includes or external files
                for match in REF_CALL_PATTERN.finditer(content):
                    ref_name = match.group("name").strip()
                    # Skip if already handled or if the name is valid
                    if ref_name in name_renames or is_valid_name(ref_name):
                        continue

                    normalized = normalize_name(ref_name)
                    if normalized != ref_name:
                        # Find the full ref pattern for this name
                        ref_pattern = build_ref_pattern(ref_name)
                        for ref_match in ref_pattern.finditer(content):
                            old_ref = ref_match.group(0)
                            new_ref = self._build_new_ref(old_ref, ref_name, normalized)
                            if new_ref and new_ref != old_ref:
                                migrations.append(
                                    MigrationAction(
                                        file_path=str(file_path),
                                        old_text=old_ref,
                                        new_text=new_ref,
                                        description=f"ref '{ref_name}' -> ref '{normalized}'",
                                    )
                                )
                        # Add to name_renames to avoid duplicate processing
                        name_renames[ref_name] = normalized

            except Exception:
                # Skip files that can't be read
                continue

        # Third pass: update trace_name, insight_name, source_name, and alert_name fields
        # that reference renamed items
        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                # Update trace_name fields
                migrations.extend(
                    self._migrate_reference_field(
                        content,
                        file_path,
                        name_renames,
                        "trace_name",
                        TRACE_NAME_FIELD_UNQUOTED_PATTERN,
                        TRACE_NAME_FIELD_QUOTED_PATTERN,
                    )
                )

                # Update insight_name fields
                migrations.extend(
                    self._migrate_reference_field(
                        content,
                        file_path,
                        name_renames,
                        "insight_name",
                        INSIGHT_NAME_FIELD_UNQUOTED_PATTERN,
                        INSIGHT_NAME_FIELD_QUOTED_PATTERN,
                    )
                )

                # Update source_name fields (used in defaults)
                migrations.extend(
                    self._migrate_reference_field(
                        content,
                        file_path,
                        name_renames,
                        "source_name",
                        SOURCE_NAME_FIELD_UNQUOTED_PATTERN,
                        SOURCE_NAME_FIELD_QUOTED_PATTERN,
                    )
                )

                # Update alert_name fields (used in defaults)
                migrations.extend(
                    self._migrate_reference_field(
                        content,
                        file_path,
                        name_renames,
                        "alert_name",
                        ALERT_NAME_FIELD_UNQUOTED_PATTERN,
                        ALERT_NAME_FIELD_QUOTED_PATTERN,
                    )
                )

            except Exception:
                # Skip files that can't be read
                continue

        return migrations

    def _migrate_reference_field(
        self,
        content: str,
        file_path: str,
        name_renames: Dict[str, str],
        field_name: str,
        unquoted_pattern: re.Pattern,
        quoted_pattern: re.Pattern,
    ) -> List[MigrationAction]:
        """
        Migrate a reference field (like trace_name or insight_name) that references renamed items.

        Args:
            content: File content
            file_path: Path to the file
            name_renames: Dict mapping old names to new names
            field_name: The field name (e.g., "trace_name", "insight_name")
            unquoted_pattern: Pattern for unquoted field values
            quoted_pattern: Pattern for quoted field values

        Returns:
            List of migration actions
        """
        migrations = []

        # Check unquoted patterns
        for match in unquoted_pattern.finditer(content):
            indent = match.group(1)
            list_prefix = match.group(2) or ""
            ref_value = match.group(3).strip()

            # Check if this references a renamed item
            if ref_value in name_renames:
                new_value = name_renames[ref_value]
                migrations.append(
                    MigrationAction(
                        file_path=str(file_path),
                        old_text=match.group(0),
                        new_text=f"{indent}{list_prefix}{field_name}: {new_value}",
                        description=f"{field_name} '{ref_value}' -> '{new_value}'",
                    )
                )
            # Also handle cases where the reference itself has an invalid name format
            # (might be defined in includes)
            elif not is_valid_name(ref_value):
                normalized = normalize_name(ref_value)
                if normalized != ref_value:
                    # Add to name_renames so we track it
                    name_renames[ref_value] = normalized
                    migrations.append(
                        MigrationAction(
                            file_path=str(file_path),
                            old_text=match.group(0),
                            new_text=f"{indent}{list_prefix}{field_name}: {normalized}",
                            description=f"{field_name} '{ref_value}' -> '{normalized}'",
                        )
                    )

        # Check quoted patterns
        for match in quoted_pattern.finditer(content):
            indent = match.group(1)
            list_prefix = match.group(2) or ""
            ref_value = match.group(4)  # Group 3 is the quote char

            # Check if this references a renamed item
            if ref_value in name_renames:
                new_value = name_renames[ref_value]
                migrations.append(
                    MigrationAction(
                        file_path=str(file_path),
                        old_text=match.group(0),
                        new_text=f"{indent}{list_prefix}{field_name}: {new_value}",
                        description=f"{field_name} '{ref_value}' -> '{new_value}'",
                    )
                )
            # Also handle cases where the reference itself has an invalid name format
            elif not is_valid_name(ref_value):
                normalized = normalize_name(ref_value)
                if normalized != ref_value:
                    name_renames[ref_value] = normalized
                    migrations.append(
                        MigrationAction(
                            file_path=str(file_path),
                            old_text=match.group(0),
                            new_text=f"{indent}{list_prefix}{field_name}: {normalized}",
                            description=f"{field_name} '{ref_value}' -> '{normalized}'",
                        )
                    )

        return migrations

    def _build_new_ref(self, old_ref: str, old_name: str, new_name: str) -> str:
        """
        Update ref pattern to use the normalized name while preserving ref() syntax.

        Handles:
        - ${ref(Name)} -> ${ ref(new_name) }
        - ${ ref(Name) } -> ${ ref(new_name) }
        - ${ref(Name).property} -> ${ ref(new_name).property }
        - ref(Name) -> ${ ref(new_name) }
        """
        # Check if this is a context ref ${ref(...)}
        context_pattern = re.compile(
            rf'\$\{{\s*ref\(\s*["\']?{re.escape(old_name)}["\']?\s*\)(?P<props>[^}}]*)\}}'
        )
        context_match = context_pattern.match(old_ref)
        if context_match:
            props = context_match.group("props") or ""
            # Strip whitespace from props (the old syntax might have spaces)
            props = props.strip()
            # props might be ".property" or empty
            if props:
                return f"${{ref({new_name}){props}}}"
            return f"${{ref({new_name})}}"

        # Check if this is a bare ref ref(...)
        bare_pattern = re.compile(rf'ref\(\s*["\']?{re.escape(old_name)}["\']?\s*\)')
        if bare_pattern.match(old_ref):
            return f"${{ref({new_name})}}"

        return None
