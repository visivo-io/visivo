"""Deprecation checker for inline markdown string syntax on Item."""

import os
import re
from typing import TYPE_CHECKING, List

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.models.item import Item

if TYPE_CHECKING:
    from visivo.models.project import Project


class MarkdownDeprecation(BaseDeprecationChecker):
    """
    Warns about inline markdown string usage on Item.

    The old syntax of using `markdown: "# Some text"` directly on Item
    is deprecated in favor of the Markdown model with a `content` field:

    Old (deprecated):
    ```yaml
    items:
      - markdown: "# Some text"
        align: center
    ```

    New:
    ```yaml
    markdowns:
      - name: my-markdown
        content: "# Some text"
        align: center

    items:
      - markdown: ref(my-markdown)
    ```
    """

    REMOVAL_VERSION = "2.0.0"
    FEATURE_NAME = "Inline markdown string on Item"
    MIGRATION_GUIDE = (
        "Move markdown content to a named Markdown model with 'content' field, "
        "then reference it with ref(markdown-name)."
    )

    # Pattern to find inline markdown strings in YAML (not refs)
    # Matches: markdown: "text" or markdown: 'text' or markdown: |
    INLINE_MARKDOWN_PATTERN = re.compile(
        r'^(\s*)markdown:\s*(?!ref\()(?:"[^"]*"|\'[^\']*\'|[|>].*?)$',
        re.MULTILINE,
    )

    # Pattern to find align/justify on items (deprecated when used with markdown)
    ALIGN_PATTERN = re.compile(r"^\s*align:\s*", re.MULTILINE)
    JUSTIFY_PATTERN = re.compile(r"^\s*justify:\s*", re.MULTILINE)

    def check(self, project: "Project") -> List[DeprecationWarning]:
        """
        Check for deprecated inline markdown string usage.

        Args:
            project: The project to check

        Returns:
            List of deprecation warnings found
        """
        warnings = []

        # Find all Item nodes in the DAG
        items = project.dag().get_nodes_by_types([Item], True)

        for item in items:
            # Check if markdown is a string (inline content, not a ref or Markdown model)
            # After model_validator runs, markdown will be converted to Markdown model
            # So we need to check if the original data had inline markdown
            item_path = getattr(item, "path", None) or ""

            # If the item has both markdown content AND align/justify set at item level,
            # it's using the deprecated pattern
            if item.markdown is not None:
                from visivo.models.markdown import Markdown

                if isinstance(item.markdown, Markdown):
                    # Check if this was converted from inline (has auto-generated name)
                    if item.markdown.name and item.markdown.name.startswith("inline-markdown-"):
                        warnings.append(
                            DeprecationWarning(
                                feature=self.FEATURE_NAME,
                                message=f"Item at '{item_path}' uses deprecated inline markdown string.",
                                migration=self.MIGRATION_GUIDE,
                                removal_version=self.REMOVAL_VERSION,
                                location=item_path,
                            )
                        )

        return warnings

    def can_migrate(self) -> bool:
        """Return True - this deprecation supports automatic migration."""
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        """
        Scan YAML files for deprecated inline markdown patterns.

        This method scans files directly rather than requiring a parsed project,
        allowing migration to work even on projects with syntax errors.

        Args:
            working_dir: The directory to scan for YAML files

        Returns:
            List of migration actions to apply
        """
        migrations = []

        # Find all YAML files
        for root, dirs, files in os.walk(working_dir):
            # Skip hidden directories and common non-project directories
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]

            for filename in files:
                if filename.endswith((".yml", ".yaml")):
                    file_path = os.path.join(root, filename)
                    migrations.extend(self._scan_file(file_path))

        return migrations

    def _scan_file(self, file_path: str) -> List[MigrationAction]:
        """Scan a single file for deprecated patterns."""
        migrations = []

        try:
            with open(file_path, "r") as f:
                content = f.read()

            # Find inline markdown patterns
            for match in self.INLINE_MARKDOWN_PATTERN.finditer(content):
                indent = match.group(1)
                old_text = match.group(0)

                migrations.append(
                    MigrationAction(
                        file_path=file_path,
                        old_text=old_text,
                        new_text=f"# TODO: Migrate to Markdown model\n{old_text}",
                        description=(
                            f"Found inline markdown at {file_path}. "
                            "Consider creating a named Markdown model and using ref()."
                        ),
                    )
                )

        except (IOError, UnicodeDecodeError):
            # Skip files that can't be read
            pass

        return migrations
