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
    is deprecated in favor of the inline Markdown model with a `content` field:

    Old (deprecated):
    ```yaml
    items:
      - markdown: "# Some text"
        align: center
    ```

    New:
    ```yaml
    items:
      - markdown:
          content: "# Some text"
          align: center
    ```
    """

    REMOVAL_VERSION = "2.0.0"
    FEATURE_NAME = "Inline markdown string on Item"
    MIGRATION_GUIDE = "Convert markdown string to inline Markdown model with 'content' field."

    # Pattern to match inline markdown with optional align/justify
    # Captures: (indent)(markdown: <value>)(optional align line)(optional justify line)
    # This handles quoted strings, literal blocks (|), and folded blocks (>)
    INLINE_MARKDOWN_PATTERN = re.compile(
        r"""
        ^(?P<indent>\s*)                           # Capture leading indent
        -\s+markdown:\s*                           # Item start with markdown key
        (?P<value>                                 # Capture the value
            (?:                                    # Either:
                [|>][-+]?\s*\n                     # Block scalar indicator
                (?:(?P=indent)\s{2,}.+\n?)*        # Followed by indented content lines
            )
            |                                      # Or:
            (?:"(?:[^"\\]|\\.)*")                  # Double-quoted string
            |                                      # Or:
            (?:'(?:[^'\\]|\\.)*')                  # Single-quoted string
            |                                      # Or:
            (?:[^\n]+)                             # Plain scalar (rest of line)
        )\n?
        (?P<align>(?P=indent)\s+align:\s*\S+\n)?   # Optional align line
        (?P<justify>(?P=indent)\s+justify:\s*\S+\n)?  # Optional justify line
        """,
        re.MULTILINE | re.VERBOSE,
    )

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
            item_path = getattr(item, "path", None) or ""

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
        Scan YAML files for deprecated inline markdown patterns and generate migrations.

        Args:
            working_dir: The directory to scan for YAML files

        Returns:
            List of migration actions to apply
        """
        migrations = []

        for root, dirs, files in os.walk(working_dir):
            # Skip hidden directories and common non-project directories
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]

            for filename in files:
                if filename.endswith((".yml", ".yaml")):
                    file_path = os.path.join(root, filename)
                    file_migrations = self._migrate_file(file_path)
                    if file_migrations:
                        migrations.extend(file_migrations)

        return migrations

    def _migrate_file(self, file_path: str) -> List[MigrationAction]:
        """
        Migrate a single file using targeted string replacements.

        Returns a list of migration actions for each inline markdown found.
        """
        try:
            with open(file_path, "r") as f:
                content = f.read()

            migrations = []
            # Process line by line to find inline markdowns
            lines = content.split("\n")
            i = 0

            while i < len(lines):
                line = lines[i]

                # Check if this line starts an item with markdown
                match = re.match(r"^(\s*)-\s+markdown:\s*(.*)$", line)
                if match:
                    indent = match.group(1)
                    value_part = match.group(2)
                    item_indent = indent + "  "  # Indent for item properties

                    # Check if it's already a Markdown model (has nested content:) or a ref
                    if value_part.strip().startswith("ref("):
                        # ref() usage should not be migrated
                        i += 1
                        continue

                    if value_part.strip() == "":
                        # Check if next line has 'content:' (already migrated or is a model)
                        if i + 1 < len(lines) and re.match(
                            rf"^{re.escape(item_indent)}\s*content:", lines[i + 1]
                        ):
                            i += 1
                            continue
                        # Empty value with no content: on next line - skip
                        i += 1
                        continue

                    # Found an inline markdown string - collect the full item
                    old_lines = [line]
                    markdown_value = value_part
                    align_value = None
                    justify_value = None

                    # Handle block scalar (| or >)
                    if value_part.strip() in ("|", ">", "|-", ">-", "|+", ">+"):
                        # Collect the block content
                        block_indent = None
                        j = i + 1
                        while j < len(lines):
                            next_line = lines[j]
                            # Empty lines are part of the block
                            if next_line.strip() == "":
                                old_lines.append(next_line)
                                j += 1
                                continue
                            # Determine block indent from first content line
                            if block_indent is None:
                                line_match = re.match(r"^(\s*)", next_line)
                                if line_match and len(line_match.group(1)) > len(item_indent):
                                    block_indent = line_match.group(1)
                                else:
                                    break
                            # Check if still in block (same or greater indent)
                            if next_line.startswith(block_indent) or next_line.strip() == "":
                                old_lines.append(next_line)
                                j += 1
                            else:
                                break
                        i = j - 1  # Will be incremented at end of loop

                    # Check for align/justify on following lines
                    j = i + 1
                    while j < len(lines):
                        next_line = lines[j]
                        # Must be at item property indent level
                        align_match = re.match(
                            rf"^{re.escape(item_indent)}align:\s*(\S+)\s*$", next_line
                        )
                        justify_match = re.match(
                            rf"^{re.escape(item_indent)}justify:\s*(\S+)\s*$", next_line
                        )

                        if align_match and align_value is None:
                            align_value = align_match.group(1)
                            old_lines.append(next_line)
                            j += 1
                        elif justify_match and justify_value is None:
                            justify_value = justify_match.group(1)
                            old_lines.append(next_line)
                            j += 1
                        else:
                            break

                    # Build the replacement
                    old_text = "\n".join(old_lines)
                    new_text = self._build_replacement(
                        indent, markdown_value, align_value, justify_value, old_lines, lines, i
                    )

                    if new_text != old_text:
                        migrations.append(
                            MigrationAction(
                                file_path=file_path,
                                old_text=old_text,
                                new_text=new_text,
                                description=f"Converted inline markdown to Markdown model",
                            )
                        )

                i += 1

            return migrations

        except (IOError, UnicodeDecodeError):
            return []

    def _build_replacement(
        self,
        indent: str,
        markdown_value: str,
        align_value: str,
        justify_value: str,
        old_lines: List[str],
        all_lines: List[str],
        start_line: int,
    ) -> str:
        """Build the replacement text for an inline markdown."""
        item_indent = indent + "  "
        prop_indent = item_indent + "  "

        # Start building new lines
        new_lines = [f"{indent}- markdown:"]

        # Handle the content value
        first_line = old_lines[0]
        value_match = re.match(r"^.*markdown:\s*(.*)$", first_line)
        value_part = value_match.group(1) if value_match else ""

        # Check if it's a block scalar
        if value_part.strip() in ("|", ">", "|-", ">-", "|+", ">+"):
            # Preserve block scalar style
            new_lines.append(f"{prop_indent}content: {value_part.strip()}")
            # Add the block content lines with adjusted indentation
            for old_line in old_lines[1:]:
                # Skip align/justify lines
                if re.match(rf"^{re.escape(item_indent)}(align|justify):", old_line):
                    continue
                # Adjust indentation: add extra indent for being inside markdown model
                if old_line.strip():
                    # Calculate how much extra indent the block content had
                    line_indent_match = re.match(r"^(\s*)", old_line)
                    original_indent = line_indent_match.group(1) if line_indent_match else ""
                    # Add 2 more spaces for being nested under content
                    new_indent = prop_indent + original_indent[len(item_indent) :]
                    new_lines.append(new_indent + old_line.lstrip())
                else:
                    new_lines.append(old_line)
        else:
            # Simple string value (quoted or plain)
            new_lines.append(f"{prop_indent}content: {value_part}")

        # Add align if present
        if align_value:
            new_lines.append(f"{prop_indent}align: {align_value}")

        # Add justify if present
        if justify_value:
            new_lines.append(f"{prop_indent}justify: {justify_value}")

        return "\n".join(new_lines)
