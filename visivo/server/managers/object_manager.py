import re
from abc import ABC, abstractmethod
from enum import Enum
from threading import Lock
from typing import Any, Dict, Generic, List, Optional, TypeVar

from visivo.models.base.context_string import ContextString
from visivo.query.patterns import REF_FUNCTION_PATTERN, extract_ref_names

T = TypeVar("T")


class ObjectStatus(str, Enum):
    """Status of an object in the manager."""

    NEW = "new"  # In cached_objects only (not yet published)
    MODIFIED = "modified"  # In both cached and published (cached differs)
    PUBLISHED = "published"  # In published_objects only (no cached changes)
    DELETED = "deleted"  # Marked for deletion (None in cache, exists in published)


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
                return ObjectStatus.NEW
            else:
                # Compare actual values to determine if truly modified
                published_obj = self._published_objects[name]
                if self._objects_equal(cached_obj, published_obj):
                    return ObjectStatus.PUBLISHED
                return ObjectStatus.MODIFIED
        elif in_published:
            return ObjectStatus.PUBLISHED
        return None

    def _objects_equal(self, obj1: T, obj2: T) -> bool:
        """
        Compare two objects for equality.

        Uses model_dump() for Pydantic models, otherwise uses direct comparison.

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
            return obj1.model_dump(exclude_none=True) == obj2.model_dump(exclude_none=True)

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
            if name in self._cached_objects or name in self._published_objects:
                self._cached_objects[name] = None
                return True
            return False

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
        - name: Object identifier
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
        if hasattr(obj, "child_items"):
            for child in obj.child_items():
                if hasattr(child, "name") and child.name:
                    # Child is an object with a name attribute
                    child_names.append(child.name)
                elif isinstance(child, ContextString):
                    # Child is a ContextString like ${ref(source_name)}
                    ref_name = child.get_reference()
                    if ref_name:
                        child_names.append(ref_name)
                elif isinstance(child, str):
                    # Child could be a ref string in two formats:
                    # 1. ${ref(source_name)} - context string format
                    # 2. ref(source_name) - simple ref format
                    ref_names = extract_ref_names(child)
                    if ref_names:
                        child_names.extend(ref_names)
                    else:
                        # Try simple ref() format: ref(name)
                        match = re.match(REF_FUNCTION_PATTERN, child)
                        if match:
                            model_name = match.group("model_name").strip("'\"")
                            child_names.append(model_name)

        return {
            "name": name,
            "status": status.value if status else None,
            "child_item_names": child_names,
            "config": obj.model_dump(mode="json", exclude_none=True, exclude={"file_path", "path"}),
        }
