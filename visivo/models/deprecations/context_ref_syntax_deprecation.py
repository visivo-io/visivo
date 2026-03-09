"""Deprecation checker for ${ref(name)} syntax in favor of ${name} dot syntax."""

import re
from typing import TYPE_CHECKING, List, Any

from pydantic import BaseModel as PydanticBaseModel

from visivo.models.deprecations.base_deprecation import (
    BaseDeprecationChecker,
    DeprecationWarning,
    MigrationAction,
)
from visivo.query.patterns import LEGACY_CONTEXT_STRING_REF_PATTERN
from visivo.utils import list_all_ymls_in_dir

if TYPE_CHECKING:
    from visivo.models.project import Project


class ContextRefSyntaxDeprecation(BaseDeprecationChecker):
    """
    Warns about ${ref(name)} syntax usage.

    The old syntax `${ref(model_name)}` is deprecated in favor of
    the simpler dot syntax `${model_name}` which is more concise.
    """

    REMOVAL_VERSION = "2.0.0"
    FEATURE_NAME = "${ref()} syntax"
    MIGRATION_GUIDE = "Replace ${ref(name)} with ${name} format."

    # Pattern to find ${ref(...)} in text
    _CONTEXT_REF_PATTERN = re.compile(LEGACY_CONTEXT_STRING_REF_PATTERN)

    # Pattern for migration: captures ref(name) inside ${...}
    # Handles: ${ref(name)}, ${ref(name).prop}, ${ ref( name ).prop }
    _MIGRATION_PATTERN = re.compile(r"\$\{\s*ref\(\s*([^)]+?)\s*\)([\.\d\w\[\]]*?)\s*\}")

    def check(self, project: "Project") -> List[DeprecationWarning]:
        warnings = []
        self._check_recursive(project, warnings, "project")
        return warnings

    def _check_recursive(
        self,
        data: Any,
        warnings: List[DeprecationWarning],
        path: str,
    ) -> None:
        if isinstance(data, PydanticBaseModel):
            for key, value in data.__dict__.items():
                if value is None:
                    continue
                new_path = f"{path}.{key}"
                self._check_recursive(value, warnings, new_path)
        elif isinstance(data, dict):
            for key, value in data.items():
                new_path = f"{path}.{key}"
                self._check_recursive(value, warnings, new_path)
        elif isinstance(data, list):
            for idx, item in enumerate(data):
                new_path = f"{path}[{idx}]"
                self._check_recursive(item, warnings, new_path)
        elif isinstance(data, str) and self._CONTEXT_REF_PATTERN.search(data):
            warnings.append(self._create_warning(data, path))

    def _create_warning(self, ref_value: str, location: str = None) -> DeprecationWarning:
        return DeprecationWarning(
            feature=self.FEATURE_NAME,
            message=f"'{ref_value}' uses deprecated ${{ref()}} syntax.",
            migration=self.MIGRATION_GUIDE,
            removal_version=self.REMOVAL_VERSION,
            location=location or "",
        )

    def can_migrate(self) -> bool:
        return True

    def get_migrations_from_files(self, working_dir: str) -> List[MigrationAction]:
        migrations = []

        for file_path in list_all_ymls_in_dir(working_dir):
            try:
                with open(file_path, "r") as f:
                    content = f.read()

                for match in self._MIGRATION_PATTERN.finditer(content):
                    old_text = match.group(0)
                    name = match.group(1).strip().strip("'\"")
                    prop_path = match.group(2) or ""

                    new_text = f"${{{name}{prop_path}}}"

                    migrations.append(
                        MigrationAction(
                            file_path=str(file_path),
                            old_text=old_text,
                            new_text=new_text,
                            description="context ref to dot syntax",
                        )
                    )

            except Exception:
                continue

        return migrations
