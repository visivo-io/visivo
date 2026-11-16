"""Uploads into a served project's files/ folder (docs/contracts/project-files-and-credentials.md)."""

import hashlib
import os
import re
import shutil
import tempfile
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from visivo.server.project_files import MAX_BYTES

FILES_DIR = "files"
UPLOAD_TTL = timedelta(hours=1)
CHUNK_BYTES = 1024 * 1024
MAX_FILENAME = 120

FORMATS = [
    {
        "format": "csv",
        "label": "CSV",
        "extensions": [".csv", ".tsv"],
        "source_type": "csv",
        "options": ["header", "delimiter", "encoding"],
    },
]


class UploadError(Exception):
    def __init__(self, message, code, status):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


def format_for(filename: str) -> Optional[dict]:
    extension = os.path.splitext(filename)[1].lower()
    return next((f for f in FORMATS if extension in f["extensions"]), None)


def sanitize_filename(filename: str) -> str:
    name = os.path.basename(str(filename).replace("\\", "/"))
    stem, extension = os.path.splitext(name)
    stem = re.sub(r"[^A-Za-z0-9._-]", "_", stem).lstrip(".") or "file"
    extension = re.sub(r"[^A-Za-z0-9.]", "_", extension.lower())
    return stem[: MAX_FILENAME - len(extension)] + extension


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class _Upload:
    def __init__(self, filename, original_filename, path, size, sha256, content_type):
        self.upload_id = f"up_{uuid.uuid4().hex}"
        self.version_id = f"fv_{uuid.uuid4().hex}"
        self.filename = filename
        self.original_filename = original_filename
        self.path = path
        self.size = size
        self.sha256 = sha256
        self.content_type = content_type
        self.created_at = datetime.now(timezone.utc)
        self.expires_at = self.created_at + UPLOAD_TTL
        self.part_path: Optional[str] = None
        self.received = 0
        self.received_sha256: Optional[str] = None
        self.file: Optional[dict] = None

    @property
    def expired(self):
        return self.file is None and datetime.now(timezone.utc) > self.expires_at


class ProjectFileStore:
    """Upload lifecycle for one served project. Studio serves one project per process,
    so uploads and file versions live in memory; completed files live in ``files/``."""

    def __init__(self, project_root: str):
        self.root = os.path.realpath(project_root)
        self._uploads: Dict[str, _Upload] = {}
        self._versions: Dict[str, dict] = {}
        self._lock = threading.Lock()
        self._parts = tempfile.mkdtemp(prefix="visivo-uploads-")

    def version_at(self, path: str) -> Optional[dict]:
        return self._versions.get(path)

    def _files_dir(self) -> str:
        files_dir = os.path.join(self.root, FILES_DIR)
        real = os.path.realpath(files_dir)
        if os.path.commonpath([self.root, real]) != self.root:
            raise UploadError(
                "The project's files folder points outside the project.", "invalid_request", 400
            )
        return files_dir

    def _reserved_paths(self):
        return {u.path for u in self._uploads.values() if u.file is None and not u.expired}

    def _free_path(self, filename: str) -> str:
        stem, extension = os.path.splitext(filename)
        reserved = self._reserved_paths()
        files_dir = self._files_dir()
        candidate, number = filename, 1
        while (
            os.path.lexists(os.path.join(files_dir, candidate))
            or f"{FILES_DIR}/{candidate}" in reserved
        ):
            number += 1
            candidate = f"{stem}-{number}{extension}"
        return f"{FILES_DIR}/{candidate}"

    def _sweep(self):
        for upload_id, upload in list(self._uploads.items()):
            if upload.expired:
                self._discard_part(upload)
                del self._uploads[upload_id]

    def _get(self, upload_id: str) -> _Upload:
        upload = self._uploads.get(upload_id)
        if upload is None:
            raise UploadError("This upload does not exist.", "not_found", 404)
        return upload

    @staticmethod
    def _discard_part(upload: _Upload):
        if upload.part_path and os.path.exists(upload.part_path):
            os.remove(upload.part_path)
        upload.part_path = None
        upload.received = 0
        upload.received_sha256 = None

    def create(self, filename, size, content_type=None, sha256=None) -> dict:
        if not isinstance(filename, str) or not filename.strip():
            raise UploadError("Send the file's name.", "invalid_request", 400)
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise UploadError("Send the file's size in bytes.", "invalid_request", 400)
        if sha256 is not None and not re.fullmatch(r"[0-9a-fA-F]{64}", str(sha256)):
            raise UploadError("sha256 must be 64 hexadecimal characters.", "invalid_request", 400)
        if format_for(filename) is None:
            raise UploadError(
                f"Visivo cannot import {os.path.basename(filename)} yet. Use a CSV file.",
                "unsupported_format",
                400,
            )
        if size > MAX_BYTES:
            raise UploadError("The file is larger than 100 MB.", "too_large", 413)

        clean = sanitize_filename(filename)
        with self._lock:
            self._sweep()
            path = self._free_path(clean)
            upload = _Upload(
                filename=os.path.basename(path),
                original_filename=os.path.basename(str(filename).replace("\\", "/")),
                path=path,
                size=size,
                sha256=sha256.lower() if sha256 else None,
                content_type=content_type,
            )
            self._uploads[upload.upload_id] = upload

        headers = {"Content-Type": content_type} if content_type else {}
        return {
            "upload_id": upload.upload_id,
            "version_id": upload.version_id,
            "path": upload.path,
            "expires_at": _iso(upload.expires_at),
            "transfer": {
                "method": "PUT",
                "url": f"/api/project-files/uploads/{upload.upload_id}/content/",
                "headers": headers,
            },
        }

    def write_content(self, upload_id: str, stream) -> None:
        with self._lock:
            upload = self._get(upload_id)
            if upload.file is not None or upload.expired:
                raise UploadError("This upload is closed. Start a new one.", "upload_closed", 409)
            self._discard_part(upload)
            part_path = os.path.join(self._parts, upload.upload_id)
            upload.part_path = part_path

        digest = hashlib.sha256()
        received = 0
        try:
            with open(part_path, "wb") as part:
                while True:
                    chunk = stream.read(CHUNK_BYTES)
                    if not chunk:
                        break
                    received += len(chunk)
                    if received > MAX_BYTES:
                        raise UploadError("The file is larger than 100 MB.", "too_large", 413)
                    digest.update(chunk)
                    part.write(chunk)
        except UploadError:
            with self._lock:
                self._discard_part(upload)
            raise

        with self._lock:
            upload.received = received
            upload.received_sha256 = digest.hexdigest()

    def complete(self, upload_id: str) -> dict:
        with self._lock:
            upload = self._get(upload_id)
            if upload.file is not None:
                return upload.file
            if upload.expired:
                raise UploadError("This upload is closed. Start a new one.", "upload_closed", 409)
            if not upload.part_path or not os.path.exists(upload.part_path):
                raise UploadError("The file's content has not arrived.", "content_missing", 409)
            if upload.received != upload.size:
                self._discard_part(upload)
                raise UploadError(
                    f"Received {upload.received} bytes, but the upload declared {upload.size}.",
                    "size_mismatch",
                    422,
                )
            if upload.sha256 and upload.received_sha256 != upload.sha256:
                self._discard_part(upload)
                raise UploadError(
                    "The received file does not match its checksum.", "checksum_mismatch", 422
                )

            files_dir = self._files_dir()
            os.makedirs(files_dir, exist_ok=True)
            destination = os.path.join(self.root, *upload.path.split("/"))
            if os.path.lexists(destination):
                upload.path = self._free_path(upload.filename)
                upload.filename = os.path.basename(upload.path)
                destination = os.path.join(self.root, *upload.path.split("/"))
            with open(upload.part_path, "rb") as source, open(destination, "xb") as target:
                shutil.copyfileobj(source, target, CHUNK_BYTES)
            os.remove(upload.part_path)
            upload.part_path = None

            upload.file = {
                "path": upload.path,
                "filename": upload.filename,
                "original_filename": upload.original_filename,
                "version_id": upload.version_id,
                "format": format_for(upload.filename)["format"],
                "size": upload.size,
                "sha256": upload.received_sha256,
                "created_at": _iso(datetime.now(timezone.utc)),
            }
            self._versions[upload.path] = upload.file
            return upload.file
