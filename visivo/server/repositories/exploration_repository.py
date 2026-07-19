"""File-backed repository for Explorations (Explore 2.0, Phase 1).

Structural precedent: the removed 2.0-era ``exploration_repository.py``
(commits ``00a83329``/``e172d91b``) — a plain repository class with
create/list/get/update/delete methods, constructed with a storage path and
handed to ``FlaskApp``. Storage diverges deliberately: that repository used
SQLite under ``target/``; explorations are user workbench data that must
survive ``rm -rf target`` (a rebuildable output dir), so this repository
writes one JSON document per exploration under a NEW project-root directory,
``.visivo/explorations/`` (already covered by the generated ``.gitignore``
template, never populated by any other code path, and ignored by the file
watcher — ``hot_reload_server.py`` only reacts to ``.yml``/``.yaml``).

The directory is created lazily (mkdir on first write), never at
construction time, so simply instantiating this repository — as ``FlaskApp``
does for every ``visivo serve`` session — never touches disk.
"""

import json
import os
import secrets
import tempfile
import threading
from datetime import datetime, timezone
from typing import List, Optional

from visivo.models.exploration import Exploration, PromotionRecord


class ExplorationRepository:
    def __init__(self, explorations_dir: str):
        self.explorations_dir = explorations_dir
        # VIS-1086: guards the "resolve a name (default or explicit,
        # including the id mint) then persist" critical section in
        # `create()`. `hot_reload_server.py` runs Flask with
        # `async_mode="threading"`, so concurrent HTTP requests are real
        # concurrent OS threads within this ONE process — a bare
        # count(existing)->name computation (`_default_name`) has no
        # serialization against a second thread doing the exact same read
        # before either has written, so two requests racing the same narrow
        # window (a double-click on "+ New exploration"/a source tile, or two
        # browser windows both landing on a fresh empty project) could mint
        # the SAME default name. This lock makes "pick a free name and
        # reserve it by writing" atomic from this process's perspective; it
        # intentionally does NOT protect against a second OS PROCESS writing
        # into the same directory (not this bug's scenario — see module
        # docstring).
        self._create_lock = threading.Lock()

    def _ensure_dir(self) -> None:
        os.makedirs(self.explorations_dir, exist_ok=True)

    def _path(self, exploration_id: str) -> str:
        return os.path.join(self.explorations_dir, f"{exploration_id}.json")

    def _existing_ids(self) -> List[str]:
        if not os.path.isdir(self.explorations_dir):
            return []
        return [
            name[: -len(".json")]
            for name in os.listdir(self.explorations_dir)
            if name.endswith(".json") and not name.startswith(".")
        ]

    def _mint_id(self) -> str:
        while True:
            candidate = f"exp_{secrets.token_hex(4)}"
            if not os.path.exists(self._path(candidate)):
                return candidate

    def _default_name(self) -> str:
        # "Scratch" for the very first exploration, "Exploration N" after
        # (resolved question 3, 03-delivery-plan.md): a one-gesture create
        # with no naming prompt.
        #
        # VIS-1086: the count-based candidate is cheap but blind — collision-
        # checked against the CURRENT set of existing names (already resident
        # from the read below, no extra I/O) and incremented until free
        # rather than minted unconditionally. Must be called with
        # `_create_lock` held (see `__init__`) for this to actually close the
        # race rather than merely narrow it — the collision check alone,
        # without the lock, still has a read-then-write gap two threads could
        # both slip through.
        existing_names = {e.name for e in self.list()}
        count = len(existing_names)
        candidate = "Scratch" if count == 0 else f"Exploration {count + 1}"
        if candidate not in existing_names:
            return candidate
        n = count + 1
        while f"Exploration {n}" in existing_names:
            n += 1
        return f"Exploration {n}"

    def _write(self, exploration: Exploration) -> None:
        self._ensure_dir()
        target_path = self._path(exploration.id)
        fd, tmp_path = tempfile.mkstemp(
            dir=self.explorations_dir, prefix=f".{exploration.id}.", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w") as f:
                f.write(exploration.model_dump_json(indent=2))
            os.replace(tmp_path, target_path)  # atomic on the same filesystem
        except Exception:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise

    def _read(self, exploration_id: str) -> Optional[Exploration]:
        path = self._path(exploration_id)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            data = json.load(f)
        return Exploration.model_validate(data)

    def list(self) -> List[Exploration]:
        explorations = [self._read(i) for i in self._existing_ids()]
        explorations = [e for e in explorations if e is not None]
        explorations.sort(key=lambda e: e.updated_at, reverse=True)
        return explorations

    def create(
        self,
        name: Optional[str] = None,
        seeded_from: Optional[dict] = None,
        return_to: Optional[dict] = None,
        draft: Optional[dict] = None,
    ) -> Exploration:
        now = datetime.now(timezone.utc)
        # VIS-1086: the whole "resolve id + name, then write" sequence is
        # serialized per-process (`_create_lock`) so two concurrent creates
        # (double-click on a create door, or two browser windows racing a
        # fresh empty project) can never both observe the same "N existing"
        # snapshot before either has written — see `__init__`'s comment.
        with self._create_lock:
            exploration = Exploration(
                id=self._mint_id(),
                name=name or self._default_name(),
                created_at=now,
                updated_at=now,
                seeded_from=seeded_from,
                return_to=return_to,
                draft=draft if draft is not None else {},
                promoted=[],
            )
            self._write(exploration)
        return exploration

    def get(self, exploration_id: str) -> Optional[Exploration]:
        return self._read(exploration_id)

    def update(self, exploration_id: str, patch: dict) -> Optional[Exploration]:
        """Full-document replace of the mutable fields (``name``, ``draft``,
        ``return_to``) present in ``patch``. ``id``/``created_at``/
        ``seeded_from``/``promoted`` are immutable via this route: any of
        those keys present in ``patch`` are silently ignored rather than
        erroring, so a client echoing the full record back never corrupts it.
        A key simply absent from ``patch`` leaves that mutable field
        unchanged (partial-update-safe); pass it explicitly (``null`` for
        ``return_to``) to clear it.
        """
        existing = self._read(exploration_id)
        if existing is None:
            return None

        data = existing.model_dump(mode="json")
        for mutable_field in ("name", "draft", "return_to"):
            if mutable_field in patch:
                data[mutable_field] = patch[mutable_field]
        data["updated_at"] = datetime.now(timezone.utc).isoformat()

        updated = Exploration.model_validate(data)
        self._write(updated)
        return updated

    def delete(self, exploration_id: str) -> bool:
        path = self._path(exploration_id)
        if not os.path.exists(path):
            return False
        os.remove(path)
        return True

    def consume_return_to(self, exploration_id: str) -> Optional[Exploration]:
        """Atomically null ``return_to`` (the placement intent is consumed).
        Idempotent: consuming an already-null ``return_to`` is a no-op that
        still returns the current record, not a 404."""
        existing = self._read(exploration_id)
        if existing is None:
            return None
        if existing.return_to is None:
            return existing
        existing.return_to = None
        existing.updated_at = datetime.now(timezone.utc)
        self._write(existing)
        return existing

    def record_promotion(
        self, exploration_id: str, promotion_type: str, name: str
    ) -> Optional[Exploration]:
        """Append-only promotion record (07-exploration-api-contract.md's
        ``record-promotion`` sub-action). ``promoted[]`` is otherwise
        immutable via the generic ``update`` route — a promotion trail is a
        fact log, never client-rewritable wholesale. Server stamps
        ``promoted_at``; always appends (never dedupes/replaces an existing
        entry for the same type+name) so re-promoting the same object after
        an edit leaves a full history, matching a run's append-only log."""
        existing = self._read(exploration_id)
        if existing is None:
            return None
        existing.promoted = [
            *existing.promoted,
            PromotionRecord(type=promotion_type, name=name, promoted_at=datetime.now(timezone.utc)),
        ]
        existing.updated_at = datetime.now(timezone.utc)
        self._write(existing)
        return existing
