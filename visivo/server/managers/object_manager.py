from abc import ABC, abstractmethod
from enum import Enum
from threading import Lock
from typing import Dict, Generic, List, Optional, TypeVar

T = TypeVar("T")


class ObjectStatus(str, Enum):
    """Status of an object in the manager."""

    NEW = "New"  # In cached_objects only (not yet published)
    MODIFIED = "Modified"  # In both cached and published (cached differs)
    PUBLISHED = "Published"  # In published_objects only (no cached changes)


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
    def extract_from_project(self, project) -> None:
        """
        Extract objects of this type from a Project instance
        and populate published_objects.

        Args:
            project: The Project instance to extract from
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

    def load(self, project) -> None:
        """
        Load published objects from project.

        This clears existing published objects and reloads from the project.

        Args:
            project: The Project instance to load from
        """
        self.extract_from_project(project)

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

        Args:
            name: The name of the object

        Returns:
            ObjectStatus if object exists, None otherwise
        """
        in_cached = name in self._cached_objects
        in_published = name in self._published_objects

        if in_cached and not in_published:
            return ObjectStatus.NEW
        elif in_cached and in_published:
            return ObjectStatus.MODIFIED
        elif in_published and not in_cached:
            return ObjectStatus.PUBLISHED
        return None

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
            True if cache has objects, False otherwise
        """
        return len(self._cached_objects) > 0
