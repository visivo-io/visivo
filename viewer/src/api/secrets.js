/**
 * Store one secret value under a name. Contract:
 * docs/contracts/project-files-and-credentials.md
 */
import { getUrl } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';
import { ENV_VAR_CONTEXT_REGEX, toEnvRef } from '../utils/contextString';

/** Resolves to the created secret's metadata. A failure carries `status` (409: the key exists). */
export const createSecret = async (key, value, { projectId = null } = {}) => {
  const response = await apiFetch(withProjectId(getUrl('secrets'), projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  const detail = body.error || body.errors;
  const error = new Error(typeof detail === 'string' ? detail : 'Could not store the secret');
  error.status = response.status;
  throw error;
};

export const SECRET_FIELDS = ['password', 'credentials_base64', 'private_key_passphrase'];

// What the sources API echoes for a stored plaintext secret: "keep the current one".
export const SECRET_MASK = '**********';

const isTyped = value =>
  typeof value === 'string' &&
  value !== '' &&
  value !== SECRET_MASK &&
  !ENV_VAR_CONTEXT_REGEX.test(value);

const upperSnake = text =>
  (text || '')
    .replace(/[^A-Za-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

/** `warehouse` + `password` -> `WAREHOUSE_PASSWORD`; always a valid variable name. */
export const secretKeyFor = (sourceName, field) => {
  const prefix = upperSnake(sourceName);
  const name = prefix ? `${prefix}_${upperSnake(field)}` : upperSnake(field);
  return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
};

const MAX_ATTEMPTS = 100;

/**
 * Store each typed secret in `config` and swap in its `${env.NAME}` reference.
 * `taken` is the names already in use, from the capabilities' `secret_keys`.
 * Returns `{source, credentials: [{field, reference}]}`.
 */
export const storeTypedSecrets = async (config, { taken = [], projectId = null } = {}) => {
  const names = new Set(taken);
  const source = { ...config };
  const credentials = [];
  for (const field of SECRET_FIELDS) {
    if (!isTyped(config[field])) continue;
    const base = secretKeyFor(config.name, field);
    for (let n = 1; ; n += 1) {
      const key = n === 1 ? base : `${base}_${n}`;
      if (names.has(key)) continue;
      names.add(key);
      try {
        await createSecret(key, config[field], { projectId });
      } catch (error) {
        if (error.status === 409 && n < MAX_ATTEMPTS) continue;
        if (error.status === 403 || error.status === 404) {
          error.message = 'Your role cannot add a secret. Choose an existing one instead.';
        }
        throw error;
      }
      source[field] = toEnvRef(key);
      credentials.push({ field, reference: source[field] });
      break;
    }
  }
  return { source, credentials };
};
