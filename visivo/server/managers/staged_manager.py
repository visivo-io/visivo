"""StagedManager — which resources currently need a run, for local serve.

The cloud answers this from two columns on every resource row (``data_hash`` vs
``last_built_data_hash``). Local serve has no such storage: ``run_on_save``
fingerprints a resource before and after each write, notices the difference, and
fires — recording nothing. That was enough while every data edit ran
immediately, but a manual trigger needs somewhere to *hold* the change until the
user presses Run, and the Run view needs to list it.

So this keeps two maps, mirroring the cloud's two columns:

* ``current`` — the resource's data fingerprint as of its last save.
* ``built``   — the fingerprint the last successful run actually built.

A resource is staged when those differ, which gives the same revert behavior the
cloud gets for free: edit a model and change it back, and the fingerprint returns
to the built value, so it un-stages instead of leaving the Runs tab lit forever.
"""

import threading


class StagedManager:
    """Thread-safe registry of un-run changes (one per Flask process)."""

    _instance = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._init()
        return cls._instance

    def _init(self):
        self._current = {}  # (type, name) -> fingerprint as last saved
        self._built = {}  # (type, name) -> fingerprint last successfully built
        self._status = {}  # (type, name) -> "new" | "modified" | "deleted"
        self._lock = threading.Lock()

    @classmethod
    def instance(cls):
        return cls()

    def record(self, type_name, name, fingerprint, status="modified"):
        """Note a resource's current data fingerprint after a save or delete."""
        key = (type_name, name)
        with self._lock:
            self._current[key] = fingerprint
            self._status[key] = status

    def mark_built(self, names=None):
        """Record that a run built these resources (all of them if ``names`` is
        None, which is what a full rebuild does).

        A deleted resource drops out entirely once built — there is no row left
        to be dirty.
        """
        with self._lock:
            keys = [key for key in self._current if names is None or key[1] in names]
            for key in keys:
                if self._status.get(key) == "deleted":
                    self._current.pop(key, None)
                    self._built.pop(key, None)
                    self._status.pop(key, None)
                else:
                    self._built[key] = self._current[key]

    def list(self):
        """The staged set as ``[{name, type, status}]``, sorted for a stable UI.

        Matches the cloud's ``unbuilt_changes`` shape exactly so the viewer needs
        no branch.
        """
        with self._lock:
            staged = [
                {
                    "name": name,
                    "type": type_name,
                    "status": self._status.get((type_name, name), "modified"),
                }
                for (type_name, name), fingerprint in self._current.items()
                if self._built.get((type_name, name)) != fingerprint
            ]
        return sorted(staged, key=lambda item: (item["type"], item["name"]))

    def dag_filter(self):
        """The visivo selector covering the staged set — the same rules the
        cloud's ``run_dag_filter`` uses, so the list and the run agree.

        Empty (a full rebuild) when a data resource was deleted (its node is gone
        and its consumers must recompute) or when nothing is staged (an explicit
        run with no delta means "rebuild everything").
        """
        staged = self.list()
        if not staged:
            return ""
        if any(item["status"] == "deleted" for item in staged):
            return ""
        return ",".join(f"+{name}+" for name in sorted({item["name"] for item in staged}))

    def clear(self):
        with self._lock:
            self._current.clear()
            self._built.clear()
            self._status.clear()
