import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

/**
 * The requesting user's own preferences.
 *
 * Also split out of branching.js — a preference belongs to the person, not to
 * the project being branched. Each server keeps them in its own place (the User
 * row in cloud, ~/.visivo/config.yml locally) behind the same endpoint, which is
 * how the viewer avoids caring which one it is talking to.
 */

/**
 * The requesting user's own preferences. GET /api/me/preferences/ ->
 * {run_trigger}. Returns null where there's no such endpoint (dist), so the
 * caller can simply not render the control.
 */
export const fetchPreferences = async () => {
  try {
    const response = await apiFetch(getUrl('mePreferences'));
    if (response.status === 200) {
      return await response.json();
    }
  } catch {
    // No URL configured for this environment — same as "not available".
  }
  return null;
};

/**
 * PUT /api/me/preferences/ -> the saved {run_trigger}. Returns null on failure;
 * the caller reverts its optimistic update.
 */
export const savePreferences = async preferences => {
  try {
    const response = await apiFetch(getUrl('mePreferences'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    });
    if (response.status === 200) {
      return await response.json();
    }
  } catch {
    // fall through
  }
  return null;
};
