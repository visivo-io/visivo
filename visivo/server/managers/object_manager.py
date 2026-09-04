import re
from abc import ABC, abstractmethod
from enum import Enum
from threading import Lock
from typing import Any, Dict, Generic, List, Optional, TypeVar

from pydantic import BaseModel as PydanticBaseModel

from visivo.models.base.context_string import ContextString
from visivo.query.patterns import REF_FUNCTION_PATTERN, extract_ref_names

T = TypeVar("T")

# Bookkeeping fields recording where an object lives, not what it is. The parser
# stamps them on and every serializer strips them off, so a config a client sends
# back can never carry them and they must not participate in "did this change?".
LOCATION_FIELDS = {"path", "file_path"}


def strip_location_fields(instance: Any, dump: Any) -> Any:
    """``dump`` with location bookkeeping removed at EVERY depth — and nowhere else.

    The walk is guided by the MODEL INSTANCE rather than by key name because
    ``path`` is also a real Plotly property (``layout.shapes[].path`` — the SVG
    path of a drawn shape), living in free-form prop space as an extra on a
    ``JsonSchemaBase``. A key is therefore dropped only where it is a DECLARED
    field of the visivo model at that node.

    Fails safe: where the dump's shape cannot be matched back to the instance
    (a custom serializer that renames keys, ``by_alias=True``), the subtree is
    returned untouched rather than guessed at.
    """
    if isinstance(dump, dict):
        if isinstance(instance, PydanticBaseModel):
            declared = LOCATION_FIELDS.intersection(type(instance).model_fields)
            return {
                key: strip_location_fields(getattr(instance, key, None), value)
                for key, value in dump.items()
                if key not in declared
            }
        if isinstance(instance, dict):
            return {
                key: strip_location_fields(instance.get(key), value) for key, value in dump.items()
            }
        return dump
    if isinstance(dump, list):
        items = instance if isinstance(instance, (list, tuple)) else ()
        return [
            strip_location_fields(items[index] if index < len(items) else None, value)
            for index, value in enumerate(dump)
        ]
    return dump


def location_free_dump(obj: Any, **dump_kwargs) -> Any:
    """``obj.model_dump(**dump_kwargs)`` with location bookkeeping removed at every depth."""
    return strip_location_fields(obj, obj.model_dump(**dump_kwargs))


class ObjectStatus(str, Enum):
    """Status of an object in the manager."""

    NEW = "new"  # In cached_objects only (not yet published)
    MODIFIED = "modified"  # In both cached and published (cached differs)
    PUBLISHED = "published"  # In published_objects only (no cached changes)
    DELETED = "deleted"  # Marked for deletion (None in cache, exists in published)
    RENAMED = "renamed"  # Cached under a new name; the published object holds the old one


class ObjectManager(ABC, Generic[T]):
    """
    Abstract base class for managing draft/cached objects alongside published objects.

    Provides a two-tier storage model:
    - cached_objects: Draft/modified objects not yet written to YAML
    - published_objects: Objects loaded from YAML files (source of truth)

    This enables the frontend to work with objects immediately without requiring
    them to be published to disk first.
    """

    def __init__(self):
        self._cached_objects: Dict[str, T] = {}
        self._published_objects: Dict[str, T] = {}
        # {new_name: old_name} for objects renamed in the draft. Without it a
        # rename is indistinguishable from "new object, plus an untouched old
        # one", and the commit would write a duplicate instead of renaming.
        self._renames: Dict[str, str] = {}
        self._lock = Lock()

    @property
    def cached_objects(self) -> Dict[str, T]:
        """Get all cached (draft) objects."""
        return self._cached_objects

    @property
    def published_objects(self) -> Dict[str, T]:
        """Get all published objects (from YAML files)."""
        return self._published_objects

    @abstractmethod
    def validate_object(self, obj_data: dict) -> T:
        """
        Validate and parse object data into the appropriate model type.

        Should use Pydantic TypeAdapter for discriminated union validation.

        Args:
            obj_data: Dictionary containing object configuration

        Returns:
            Validated object of type T

        Raises:
            ValidationError: If the object data is invalid
        """
        raise NotImplementedError

    @abstractmethod
    def extract_from_dag(self, dag) -> None:
        """
        Extract objects of this type from a ProjectDag
        and populate published_objects.

        Args:
            dag: The ProjectDag to extract objects from
        """
        raise NotImplementedError

    def save(self, name: str, obj: T) -> None:
        """
        Save object to cache (draft state).

        Args:
            name: The unique name/identifier for the object
            obj: The object to save
        """
        with self._lock:
            self._cached_objects[name] = obj

    def load(self, dag) -> None:
        """
        Load published objects from project DAG.

        This clears existing published objects and reloads from the DAG.

        Args:
            dag: The ProjectDag to load from
        """
        self.extract_from_dag(dag)

    def get(self, name: str) -> Optional[T]:
        """
        Get object by name. Prioritizes cached over published.

        Args:
            name: The name of the object to retrieve

        Returns:
            The object if found, None otherwise
        """
        if name in self._cached_objects:
            return self._cached_objects[name]
        return self._published_objects.get(name)

    def get_all_objects(self) -> Dict[str, T]:
        """
        Get all objects (merged: cached takes priority over published).

        Returns:
            Dictionary mapping names to objects
        """
        merged = dict(self._published_objects)
        merged.update(self._cached_objects)
        return merged

    def get_all_objects_list(self) -> List[T]:
        """
        Get all objects as a list (cached takes priority over published).

        Returns:
            List of all objects
        """
        return list(self.get_all_objects().values())

    @property
    def renames(self) -> Dict[str, str]:
        """{new_name: old_name} for objects renamed in the draft."""
        return self._renames

    def record_rename(self, old_name: str, new_name: str) -> None:
        """Remember that `new_name` is `old_name` renamed.

        Chained renames collapse to the original: renaming a→b→c has to tell
        the commit to find `a` in the YAML, not the `b` that was never written.
        """
        self._renames[new_name] = self._renames.pop(old_name, old_name)

    def renamed_from(self, name: str) -> Optional[str]:
        """The published name this object was renamed from, if it was."""
        return self._renames.get(name)

    def get_status(self, name: str) -> Optional[ObjectStatus]:
        """
        Determine the status of an object by name.

        Compares actual object values, not just presence in dictionaries.
        If cached object equals published object, returns PUBLISHED.
        If cached object is None (marked for deletion), returns DELETED.

        Args:
            name: The name of the object

        Returns:
            ObjectStatus if object exists, None otherwise
        """
        in_cached = name in self._cached_objects
        in_published = name in self._published_objects

        if in_cached:
            cached_obj = self._cached_objects[name]
            # Check if marked for deletion (None in cache)
            if cached_obj is None:
                # Only return DELETED if it exists in published (something to delete)
                return ObjectStatus.DELETED if in_published else None
            elif not in_published:
                # A renamed object is also absent from published under its new
                # name; only the rename record tells it apart from a new one.
                return ObjectStatus.RENAMED if name in self._renames else ObjectStatus.NEW
            else:
                # Compare actual values to determine if truly modified
                published_obj = self._published_objects[name]
                if self.objects_equal(cached_obj, published_obj):
                    return ObjectStatus.PUBLISHED
                return ObjectStatus.MODIFIED
        elif in_published:
            return ObjectStatus.PUBLISHED
        return None

    def objects_equal(self, obj1: T, obj2: T) -> bool:
        """
        Compare two objects for equality.

        Uses model_dump() for Pydantic models, otherwise uses direct comparison.

        ``_parent_name`` is compared even though it is a ``PrivateAttr`` no
        ``model_dump`` can see: for a metric or dimension it names the model the
        field is scoped to, which ``commit_views._build_child_info`` reads to
        pick the YAML file to write it into — so it is content, not location.

        Args:
            obj1: First object
            obj2: Second object

        Returns:
            True if objects are equal, False otherwise
        """
        if obj1 is None and obj2 is None:
            return True
        if obj1 is None or obj2 is None:
            return False

        # For Pydantic models, compare serialized dictionaries
        if hasattr(obj1, "model_dump") and hasattr(obj2, "model_dump"):
            if getattr(obj1, "_parent_name", None) != getattr(obj2, "_parent_name", None):
                return False
            return location_free_dump(obj1, exclude_none=True) == location_free_dump(
                obj2, exclude_none=True
            )

        # Fallback to direct comparison
        return obj1 == obj2

    def delete_from_cache(self, name: str) -> bool:
        """
        Remove object from cache (revert to published version).

        Args:
            name: The name of the object to remove from cache

        Returns:
            True if object was in cache and removed, False otherwise
        """
        with self._lock:
            if name in self._cached_objects:
                del self._cached_objects[name]
                return True
            return False

    def mark_for_deletion(self, name: str) -> bool:
        """
        Mark an object for deletion (will be removed on publish).

        This is implemented by storing None in the cache for the object.

        Args:
            name: The name of the object to mark for deletion

        Returns:
            True if object exists (in cache or published), False otherwise
        """
        with self._lock:
            if name not in self._cached_objects and name not in self._published_objects:
                return False

            if name in self._cached_objects and name not in self._published_objects:
                # Never published: there is nothing in YAML to remove, so this
                # is not a staged change at all. Drop the entry outright rather
                # than tombstoning it — a `None` placeholder lingered in the
                # cache, kept the object in listings, and made deleting a
                # just-created object look like it had failed.
                del self._cached_objects[name]
            else:
                # Published: tombstone it so the commit knows to remove it from
                # YAML. `get_status` reads the None as DELETED.
                self._cached_objects[name] = None
            return True

    def get_objects_for_publish(self) -> Dict[str, T]:
        """
        Get all cached objects ready for publishing to YAML.

        Returns:
            Dictionary of cached objects (including None values for deletions)
        """
        return dict(self._cached_objects)

    def clear_cache(self) -> None:
        """Clear all cached objects (e.g., after successful publish)."""
        with self._lock:
            self._cached_objects.clear()

    def has_unpublished_changes(self) -> bool:
        """
        Check if there are any unpublished changes.

        Returns:
            True if any cached object has status NEW, MODIFIED, or DELETED
        """
        for name in self._cached_objects:
            status = self.get_status(name)
            if status in (ObjectStatus.NEW, ObjectStatus.MODIFIED, ObjectStatus.DELETED):
                return True
        return False

    def _serialize_object(
        self, name: str, obj: T, status: Optional[ObjectStatus]
    ) -> Dict[str, Any]:
        """
        Serialize an object with consistent structure.

        Provides a standard format for API responses:
        - id: Object identifier (locally == name; cloud may use a UUID)
        - name: Human-readable name
        - status: Object state (new, modified, published, deleted)
        - child_item_names: List of dependency names (from child_items())
        - config: Full Pydantic model dump

        Args:
            name: The object's name/identifier
            obj: The object to serialize
            status: The object's current status

        Returns:
            Dictionary with consistent structure for API response
        """
        child_names = []
        seen = set()

        def _add(name_):
            if name_ and name_ not in seen:
                seen.add(name_)
                child_names.append(name_)

        def _collect(child):
            """Walk a child_items() entry, collecting leaf names.

            Containers like ``Dashboard.rows`` / ``Row.items`` don't carry
            their own name — they exist only to group named leaves
            (chart, table, markdown, input). When we hit one, recurse so
            ``child_item_names`` ends up listing the leaves directly.
            This matches core's per-dashboard envelope shape and lets a
            consumer fetch only the resources a given dashboard needs.
            """
            if isinstance(child, ContextString):
                _add(child.get_reference())
                return
            if isinstance(child, str):
                ref_names = extract_ref_names(child)
                if ref_names:
                    for ref_name in ref_names:
                        _add(ref_name)
                    return
                match = re.match(REF_FUNCTION_PATTERN, child)
                if match:
                    _add(match.group("model_name").strip("'\""))
                return
            child_name = getattr(child, "name", None)
            if child_name:
                _add(child_name)
                return
            # Anonymous container — recurse to its named leaves.
            if hasattr(child, "child_items"):
                for grandchild in child.child_items():
                    _collect(grandchild)

        if hasattr(obj, "child_items"):
            for child in obj.child_items():
                _collect(child)

        return {
            "id": name,
            "name": name,
            "status": status.value if status else None,
            "child_item_names": child_names,
            "config": location_free_dump(obj, mode="json", exclude_none=True),
        }
