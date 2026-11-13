/**
 * Store a source form's typed credentials and get back the config that
 * references them. Contract: docs/contracts/project-files-and-credentials.md
 */
import { getUrl } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';
import { ENV_VAR_CONTEXT_REGEX } from '../utils/contextString';

export const SECRET_FIELDS = ['password', 'credentials_base64', 'private_key_passphrase'];

// What the sources API echoes for a stored plaintext secret: "keep the current one".
export const SECRET_MASK = '**********';

/** True when a secret field holds a typed value the server has not stored yet. */
export const hasTypedSecret = config =>
  SECRET_FIELDS.some(field => {
    const value = config?.[field];
    return (
      typeof value === 'string' &&
      value !== '' &&
      value !== SECRET_MASK &&
      !ENV_VAR_CONTEXT_REGEX.test(value)
    );
  });

/** Returns `{source, credentials}`; send `source` on to test and save. */
export const prepareSourceCredentials = async (source, { projectId = null } = {}) => {
  const response = await apiFetch(withProjectId(getUrl('sourceCredentials'), projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.error || 'Could not store the credentials');
  error.code = body.code || null;
  error.status = response.status;
  throw error;
};
