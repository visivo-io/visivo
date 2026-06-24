import { json } from 'react-router';

export const throwError = (message, status) => {
  throw json({ message: message }, { status: status });
};

// ---------------------------------------------------------------------------
// Auth-header injection
//
// Visivo Studio's Flask backend is single-user and unauthenticated, so the
// default provider returns an empty header set and ``apiFetch`` becomes a
// transparent passthrough.
//
// Core (or any consumer that needs auth) calls ``setAuthHeaderProvider`` at
// boot with a function returning the headers to inject — typically a JWT:
//
//   setAuthHeaderProvider(() => ({ Authorization: `JWT ${getAccessToken()}` }));
//
// ``apiFetch`` only injects headers on same-origin ``/api/*`` requests so
// fetches of external signed URLs (e.g. GCS) aren't tagged with our auth.
// ---------------------------------------------------------------------------

let authHeaderProvider = () => ({});

export const setAuthHeaderProvider = provider => {
  authHeaderProvider = typeof provider === 'function' ? provider : () => provider || {};
};

export const authHeaders = () => {
  const result = authHeaderProvider();
  return result && typeof result === 'object' ? result : {};
};

// Optional async hook invoked once when an authenticated /api/* request returns
// 401. It should attempt a token refresh and resolve truthy when the request is
// worth retrying (a fresh token is now available). Visivo Studio (unauthed)
// never sets one, so its behavior is unchanged.
let unauthorizedHandler = null;

export const setUnauthorizedHandler = handler => {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
};

const looksLikeOurApi = url => {
  if (typeof url !== 'string') return false;
  if (url.startsWith('/api/')) return true;
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

/**
 * fetch() wrapper that merges authHeaders() into the request when the URL
 * targets our own /api/* surface. Use this in place of fetch() in viewer
 * api/*.js modules.
 *
 * If an authenticated /api/* call returns 401 and an unauthorized handler is
 * registered (core wires it to a JWT refresh), the token is refreshed once and
 * the request is retried with the fresh token — so a long edit session doesn't
 * fail the moment the access token expires.
 */
export const apiFetch = async (url, init = {}) => {
  if (!looksLikeOurApi(url)) {
    return fetch(url, init);
  }
  const doFetch = () => {
    const auth = authHeaders();
    if (!auth || Object.keys(auth).length === 0) {
      return fetch(url, init);
    }
    const headers = new Headers(init.headers || {});
    for (const [k, v] of Object.entries(auth)) {
      if (!headers.has(k)) headers.set(k, v);
    }
    return fetch(url, { ...init, headers });
  };

  let response = await doFetch();
  if (response.status === 401 && unauthorizedHandler) {
    let refreshed = false;
    try {
      refreshed = await unauthorizedHandler();
    } catch {
      refreshed = false;
    }
    if (refreshed) {
      response = await doFetch(); // retry once with the refreshed token
    }
  }
  return response;
};
