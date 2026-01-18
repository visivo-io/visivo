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
                    # Check if this was converted from legacy inline string
                    if getattr(item.markdown, "_converted_from_legacy_string", False):
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

                # Case 1: Item starts with markdown (- markdown: ...)
                match_item_start = re.match(r"^(\s*)-\s+markdown:\s*(.*)$", line)
                # Case 2: markdown is a property within an item (  markdown: ...)
                match_property = re.match(r"^(\s+)markdown:\s*(.*)$", line)

                if match_item_start:
                    indent = match_item_start.group(1)
                    value_part = match_item_start.group(2)
                    item_indent = indent + "  "  # Indent for item properties
                    is_item_start = True
                elif match_property:
                    # This is markdown as a property, not starting the item
                    prop_indent_str = match_property.group(1)
                    value_part = match_property.group(2)

                    # Validate this is actually an item's markdown property
                    # by checking if it's a sibling to item-specific properties
                    if not self._is_item_markdown_property(lines, i, prop_indent_str):
                        i += 1
                        continue

                    # The item indent is the same as the property indent
                    item_indent = prop_indent_str
                    is_item_start = False
                else:
                    i += 1
                    continue

                # Check if it's already a Markdown model (has nested content:) or a ref
                if value_part.strip().startswith("ref("):
                    # ref() usage should not be migrated
                    i += 1
                    continue

                if value_part.strip() == "":
                    # Check if next line has 'content:' (already migrated or is a model)
                    content_indent = item_indent + "  " if is_item_start else item_indent + "  "
                    if i + 1 < len(lines) and re.match(
                        rf"^{re.escape(content_indent)}content:", lines[i + 1]
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

                # Handle block scalar (| or >) - including those with indentation indicators like |2, >2
                block_scalar_match = re.match(r"^[|>][-+]?\d*$", value_part.strip())
                if block_scalar_match:
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
                    item_indent,
                    markdown_value,
                    align_value,
                    justify_value,
                    old_lines,
                    is_item_start,
                )

                if new_text != old_text:
                    migrations.append(
                        MigrationAction(
                            file_path=file_path,
                            old_text=old_text,
                            new_text=new_text,
                            description="Converted inline markdown to Markdown model",
                        )
                    )

                i += 1

            return migrations

        except (IOError, UnicodeDecodeError):
            return []

    def _build_replacement(
        self,
        item_indent: str,
        markdown_value: str,
        align_value: str,
        justify_value: str,
        old_lines: List[str],
        is_item_start: bool,
    ) -> str:
        """Build the replacement text for an inline markdown."""
        # For item start (- markdown:), the content indent is item_indent + 2
        # For property (  markdown:), the content indent is item_indent + 2
        content_indent = item_indent + "  "

        # Handle the content value
        first_line = old_lines[0]
        value_match = re.match(r"^.*markdown:\s*(.*)$", first_line)
        value_part = value_match.group(1) if value_match else ""

        if is_item_start:
            # Item starts with markdown: - markdown:
            indent = item_indent[:-2] if len(item_indent) >= 2 else ""
            new_lines = [f"{indent}- markdown:"]
        else:
            # markdown is a property within the item
            new_lines = [f"{item_indent}markdown:"]

        # Check if it's a block scalar (including those with indentation indicators like |2)
        block_scalar_match = re.match(r"^[|>][-+]?\d*$", value_part.strip())
        if block_scalar_match:
            # Preserve block scalar style
            new_lines.append(f"{content_indent}content: {value_part.strip()}")
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
                    new_indent = content_indent + original_indent[len(item_indent) :]
                    new_lines.append(new_indent + old_line.lstrip())
                else:
                    new_lines.append(old_line)
        else:
            # Simple string value (quoted or plain)
            new_lines.append(f"{content_indent}content: {value_part}")

        # Add align if present
        if align_value:
            new_lines.append(f"{content_indent}align: {align_value}")

        # Add justify if present
        if justify_value:
            new_lines.append(f"{content_indent}justify: {justify_value}")

        return "\n".join(new_lines)

    def _is_item_markdown_property(self, lines: List[str], line_idx: int, prop_indent: str) -> bool:
        """
        Check if a markdown property line is actually part of an Item.

        An Item markdown property should:
        1. Be preceded by a list item start (- ) at the correct indent level
        2. Have sibling properties that are item-specific (width, chart, table, etc.)

        This helps avoid matching markdown properties in other contexts like
        table column configs or trace column mappings.
        """
        # Item-specific properties that only appear on Item objects
        item_properties = {"width", "chart", "table", "selector", "input", "align", "justify"}

        # Calculate the expected list item indent (2 spaces less than property indent)
        if len(prop_indent) < 2:
            return False
        list_item_indent = prop_indent[:-2]

        # Look backwards to find the list item start
        list_item_line_idx = None
        for j in range(line_idx - 1, -1, -1):
            prev_line = lines[j]
            # Skip empty lines
            if not prev_line.strip():
                continue
            # Check if this is the list item start at the right indent
            if re.match(rf"^{re.escape(list_item_indent)}-\s+", prev_line):
                list_item_line_idx = j
                break
            # If we hit a line with less indent, we've gone too far
            line_indent_match = re.match(r"^(\s*)", prev_line)
            if line_indent_match:
                line_indent = line_indent_match.group(1)
                if len(line_indent) < len(prop_indent):
                    break

        if list_item_line_idx is None:
            return False

        # Check the list item start line itself for an item property
        # e.g., "- width: 1" has width as the first property
        list_item_line = lines[list_item_line_idx]
        first_prop_match = re.match(rf"^{re.escape(list_item_indent)}-\s+(\w+):", list_item_line)
        if first_prop_match:
            first_prop = first_prop_match.group(1)
            if first_prop in item_properties:
                return True

        # Look for sibling properties that indicate this is an Item
        # Check lines before the markdown line (after the list item start)
        for j in range(line_idx - 1, list_item_line_idx, -1):
            prev_line = lines[j]
            if not prev_line.strip():
                continue
            # Check if this line is at the same indent level (sibling property)
            prop_match = re.match(rf"^{re.escape(prop_indent)}(\w+):", prev_line)
            if prop_match:
                prop_name = prop_match.group(1)
                if prop_name in item_properties:
                    return True

        # Check lines after the markdown line
        for j in range(line_idx + 1, len(lines)):
            next_line = lines[j]
            if not next_line.strip():
                continue
            # Check if this line is at the same indent level (sibling property)
            prop_match = re.match(rf"^{re.escape(prop_indent)}(\w+):", next_line)
            if prop_match:
                prop_name = prop_match.group(1)
                if prop_name in item_properties:
                    return True
            # If we've moved to a different indent level, stop
            line_indent_match = re.match(r"^(\s*)", next_line)
            if line_indent_match:
                line_indent = line_indent_match.group(1)
                if len(line_indent) < len(prop_indent):
                    break
                # Also stop if we hit a new list item at the same level
                if re.match(rf"^{re.escape(list_item_indent)}-\s+", next_line):
                    break

        # No item-specific properties found - this might not be an Item markdown
        return False
