import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * Exploration persistence (Explore 2.0, Phase 1) — S3 wire contract
 * (specs/plan/explorer-workspace-unification/07-exploration-api-contract.md).
 * This module is a thin, shape-agnostic wire client: it neither camelCases
 * nor validates payloads — that translation lives in
 * `stores/workspaceExplorationsStore.js`.
 */

const parseErrorOr = async (response, fallback) => {
  const data = await response.json().catch(() => ({}));
  return data.error || fallback;
};

/**
 * List explorations, ordered by `updated_at` desc.
 */
export const fetchExplorations = async () => {
  const response = await apiFetch(getUrl('explorationsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error(await parseErrorOr(response, 'Failed to fetch explorations'));
};

/**
 * Create an exploration. `payload` is optional and wire-shaped:
 * `{ name?, seeded_from?, return_to?, draft? }` — the server mints `id` and
 * defaults `name` ("Scratch", "Exploration N") when omitted.
 */
export const createExploration = async (payload = {}) => {
  const response = await apiFetch(getUrl('explorationsList'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 201) {
    return await response.json();
  }
  throw new Error(await parseErrorOr(response, 'Failed to create exploration'));
};

/**
 * Fetch a single exploration by id. Returns `null` on 404 (mirrors
 * `fetchModel`'s convention) rather than throwing.
 */
export const fetchExploration = async id => {
  const response = await apiFetch(getUrl('explorationDetail', { id }));
  if (response.status === 200) {
    return await response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(await parseErrorOr(response, `Failed to fetch exploration: ${id}`));
};

/**
 * Update an exploration (POST, not PUT — matches every sibling resource
 * route). Full-document replace of the mutable fields present in `payload`
 * (`name`/`draft`/`return_to`); `id`/`created_at`/`seeded_from`/`promoted`
 * are immutable via this route regardless of what's included.
 */
export const updateExploration = async (id, payload) => {
  const response = await apiFetch(getUrl('explorationDetail', { id }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 200) {
    return await response.json();
  }
  const message = await parseErrorOr(response, 'Failed to update exploration');
  const error = new Error(message);
  // VIS-1083: lets callers (workspaceExplorationsStore.js's runSync)
  // distinguish "the record was deleted out from under this session" (404 —
  // exploration_repository.py's update() returns None for a vanished id)
  // from any other transient failure, without re-parsing `message`.
  error.status = response.status;
  throw error;
};

/**
 * Delete an exploration. Resolves `true` on success (204, no body).
 */
export const deleteExploration = async id => {
  const response = await apiFetch(getUrl('explorationDetail', { id }), {
    method: 'DELETE',
  });
  if (response.status === 204) {
    return true;
  }
  throw new Error(await parseErrorOr(response, 'Failed to delete exploration'));
};

/**
 * Atomically null `return_to` — the placement intent has been consumed.
 * Idempotent: consuming an already-null `return_to` still resolves 200.
 */
export const consumeReturnTo = async id => {
  const response = await apiFetch(getUrl('explorationConsumeReturnTo', { id }), {
    method: 'POST',
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error(await parseErrorOr(response, 'Failed to consume return_to'));
};

/**
 * Append-only promotion record (Explore 2.0 Phase 4,
 * 07-exploration-api-contract.md's record-promotion sub-action). Server
 * stamps `promoted_at`. `type`/`name` are the promoted object's kind
 * ('model'|'metric'|'dimension'|'insight'|'chart') and name.
 */
export const recordPromotion = async (id, type, name) => {
  const response = await apiFetch(getUrl('explorationRecordPromotion', { id }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name }),
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error(await parseErrorOr(response, 'Failed to record promotion'));
};
