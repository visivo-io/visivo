import { apiFetch } from './utils';

/**
 * Whether this `visivo serve` holds a token for the host it is pointed at.
 *
 * One idea, read by everything that needs it. "Authorized" used to be the
 * deploy modal's private business, and the Agent tab had no notion of it at
 * all — it met a first-time user with a message about setting an environment
 * variable, for something the app can do itself.
 *
 * The token is deliberately NOT in the answer. The page has no use for it.
 */
export const fetchAuthorization = async () => {
  const response = await apiFetch('/api/auth/status/');
  if (response.status === 200) {
    const body = await response.json();
    return { authorized: Boolean(body.authorized), host: body.host || null };
  }
  throw new Error('Could not read the authorization status');
};

/**
 * Begin the device flow. Returns `{authId, url}` — the caller opens the URL
 * and polls `authorizationProgress` until it settles.
 *
 * Hosted by `serve` rather than by the CLI, which is what lets the browser
 * finish something that used to require a terminal.
 */
export const startAuthorization = async () => {
  const response = await apiFetch('/api/auth/authorize-device-token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (response.status !== 200) throw new Error('Could not start authorization');
  const body = await response.json();
  return { authId: body.auth_id, url: body.full_url };
};

/** Where the device flow has got to: `{done, failed, message}`. */
export const authorizationProgress = async authId => {
  const response = await apiFetch(`/api/cloud/job/status/${authId}/`);
  if (response.status !== 200) throw new Error('Could not read authorization progress');
  const body = await response.json();
  return {
    done: body.status === 200,
    failed: [400, 401, 500].includes(body.status),
    message: body.message || 'Authorizing…',
  };
};
