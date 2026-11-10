/**
 * Project files: list, upload, inspect and import.
 * Contract: docs/contracts/project-files-and-credentials.md
 */
import { getUrl } from '../contexts/URLContext';
import { runOnDemandJob } from './jobs';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';

export class ProjectFileError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = 'ProjectFileError';
    this.code = code;
    this.status = status;
  }
}

const failure = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return new ProjectFileError(body.error || fallback, {
    code: body.code || null,
    status: response.status,
  });
};

const postJson = (url, body) =>
  apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** `{files, formats, max_bytes}`. `extensions` is a list without dots, e.g. ['csv', 'xlsx']. */
export const listProjectFiles = async ({ extensions = [], projectId = null } = {}) => {
  let url = getUrl('projectFiles');
  if (extensions.length) url += `?ext=${encodeURIComponent(extensions.join(','))}`;
  const response = await apiFetch(withProjectId(url, projectId));
  if (response.ok) return response.json();
  throw await failure(response, 'Could not list project files');
};

/** Reserve a path for `file`. Returns `{upload_id, version_id, path, expires_at, transfer}`. */
export const createUpload = async (file, { sha256 = null, projectId = null } = {}) => {
  const body = { filename: file.name, size: file.size };
  if (file.type) body.content_type = file.type;
  if (sha256) body.sha256 = sha256;
  const response = await postJson(withProjectId(getUrl('projectFileUploads'), projectId), body);
  if (response.status === 201) return response.json();
  throw await failure(response, 'Could not start the upload');
};

/** Send the bytes where the upload said to: our server locally, signed storage in cloud. */
export const sendUploadContent = async (transfer, file, { signal } = {}) => {
  const response = await apiFetch(transfer.url, {
    method: transfer.method || 'PUT',
    headers: transfer.headers || {},
    body: file,
    signal,
  });
  if (response.ok) return;
  throw await failure(response, 'Could not upload the file');
};

/** Returns the completed FileVersion. */
export const completeUpload = async (uploadId, { projectId = null } = {}) => {
  const url = withProjectId(getUrl('projectFileUploadComplete', { uploadId }), projectId);
  const response = await postJson(url, {});
  if (response.ok) return (await response.json()).file;
  throw await failure(response, 'Could not finish the upload');
};

/** Reserve, send and complete. Returns the FileVersion. */
export const uploadProjectFile = async (file, { sha256 = null, projectId = null, signal } = {}) => {
  const upload = await createUpload(file, { sha256, projectId });
  await sendUploadContent(upload.transfer, file, { signal });
  return completeUpload(upload.upload_id, { projectId });
};

const runImportJob = async (body, projectId) => {
  const response = await postJson(withProjectId(getUrl('projectFileImports'), projectId), body);
  return runOnDemandJob(
    jobId => withProjectId(getUrl('projectFileImportJob', { jobId }), projectId),
    response
  );
};

/** Preview a file without creating anything. Resolves `{ok, result: {file, tables}, error}`. */
export const inspectProjectFile = ({ path, versionId = null, options = {}, projectId = null }) =>
  runImportJob(
    { action: 'inspect', path, ...(versionId && { version_id: versionId }), options },
    projectId
  );

/** Create a draft source from a file. Resolves `{ok, result: {file, source, tables}, error}`. */
export const importProjectFile = ({
  path,
  versionId = null,
  sourceName,
  options = {},
  projectId = null,
}) =>
  runImportJob(
    {
      action: 'import',
      path,
      ...(versionId && { version_id: versionId }),
      source_name: sourceName,
      options,
    },
    projectId
  );
