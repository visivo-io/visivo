"""
Model schema aggregation utilities for persisting a model's resolved output
column schema as a run-phase job artifact.

This is the model-side parallel of ``SchemaAggregator`` (which is source-shaped:
``source_name`` / ``source_type`` / ``tables`` / ``sqlglot_schema``). Models and
sources share the ``{output_dir}/{run_id}/schemas/{name}/schema.json`` namespace,
so the two aggregators are intentionally kept separate (and independently
testable) rather than overloaded.

The model artifact keeps the legacy thin ``{name_hash: {col: type_string}}``
block (the field resolver depends on it) and adds a richer envelope mirroring the
source artifact's metadata: ``model_name`` / ``model_type`` / ``generated_at`` /
``columns`` (``{col: {type, nullable}}``) / ``metadata``.
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional

from visivo.constants import DEFAULT_RUN_ID
from visivo.logger.logger import Logger


class ModelSchemaAggregator:
    """Build, store, and load model output-column schemas."""

    @staticmethod
    def build_envelope(
        name_hash: str,
        model_name: str,
        model_type: str,
        columns: Dict[str, Any],
        source_dialect: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Build the full dict to ``json.dump`` for a model's schema artifact.

        The artifact keeps the legacy ``{name_hash: {col: type_string}}`` block
        first (the field resolver reads it), then adds an envelope that mirrors
        the source schema's metadata richness.

        Args:
            name_hash: The model's ``name_hash()`` (alpha hash of its name).
            model_name: The model's plain name (so consumers never hash).
            model_type: The kind of model the schema describes, e.g. ``"sql"``.
            columns: Either ``{col_name: type_string}`` (SqlModel / DuckDB
                ``information_schema``) or ``{col_name: {"type", "nullable"}}``.
                ``type`` values may be ``None`` (SQLGlot annotation can fail);
                they are normalized to the string ``"UNKNOWN"``.
            source_dialect: The engine dialect the types came from, recorded in
                ``metadata.source_dialect`` so a future consumer can interpret
                the (opaque) type strings.

        Returns:
            The full schema dict (legacy hash block + envelope).
        """
        legacy_block: Dict[str, str] = {}
        normalized_columns: Dict[str, Dict[str, Any]] = {}

        for col_name, col_info in (columns or {}).items():
            if isinstance(col_info, dict):
                type_value = col_info.get("type")
                nullable = col_info.get("nullable", True)
            else:
                type_value = col_info
                nullable = True

            type_string = str(type_value) if type_value is not None else "UNKNOWN"
            legacy_block[col_name] = type_string
            normalized_columns[col_name] = {"type": type_string, "nullable": nullable}

        envelope: Dict[str, Any] = {name_hash: legacy_block}
        envelope["model_name"] = model_name
        envelope["model_type"] = model_type
        envelope["generated_at"] = datetime.now().isoformat()
        envelope["columns"] = normalized_columns
        envelope["metadata"] = {
            "total_columns": len(normalized_columns),
            "source_dialect": source_dialect,
        }

        return envelope

    @staticmethod
    def load_model_schema(
        model_name: str, output_dir: str, run_id: str = DEFAULT_RUN_ID
    ) -> Optional[Dict[str, Any]]:
        """Load a stored model schema artifact.

        Byte-for-byte parallel to ``SchemaAggregator.load_source_schema``.

        Args:
            model_name: Name of the model.
            output_dir: Output directory where schemas are stored.
            run_id: Run identifier for schema storage location.

        Returns:
            Schema data dictionary or None if not found.
        """
        try:
            schema_file = f"{output_dir}/{run_id}/schemas/{model_name}/schema.json"
            if not os.path.exists(schema_file):
                return None

            with open(schema_file, "r") as fp:
                return json.load(fp)

        except Exception as e:
            Logger.instance().debug(f"Error loading schema for model {model_name}: {e}")
            return None

    @staticmethod
    def list_stored_model_schemas(
        output_dir: str, run_id: str = DEFAULT_RUN_ID
    ) -> List[Dict[str, Any]]:
        """List stored model schemas with basic metadata.

        Sources and models share the ``schemas/`` directory (namespaced by object
        name). A model schema is distinguished from a source schema by the
        presence of the ``"model_name"`` key (source schemas carry
        ``"source_name"`` instead), so source ``schema.json`` files in the same
        dir are skipped.

        Args:
            output_dir: Output directory where schemas are stored.
            run_id: Run identifier for schema storage location.

        Returns:
            List of model schema metadata dictionaries.
        """
        schemas: List[Dict[str, Any]] = []
        schemas_dir = f"{output_dir}/{run_id}/schemas"

        if not os.path.exists(schemas_dir):
            return schemas

        try:
            for entry_name in os.listdir(schemas_dir):
                entry_dir = os.path.join(schemas_dir, entry_name)
                if not os.path.isdir(entry_dir):
                    continue
                schema_file = os.path.join(entry_dir, "schema.json")
                if not os.path.exists(schema_file):
                    continue
                try:
                    with open(schema_file, "r") as fp:
                        schema_data = json.load(fp)
                except Exception as e:
                    Logger.instance().debug(f"Error reading schema file {schema_file}: {e}")
                    continue

                if "model_name" not in schema_data:
                    continue

                schemas.append(
                    {
                        "model_name": schema_data.get("model_name", entry_name),
                        "model_type": schema_data.get("model_type", "unknown"),
                        "generated_at": schema_data.get("generated_at"),
                        "total_columns": schema_data.get("metadata", {}).get("total_columns", 0),
                    }
                )

        except Exception as e:
            Logger.instance().debug(f"Error listing model schemas: {e}")

        return schemas
