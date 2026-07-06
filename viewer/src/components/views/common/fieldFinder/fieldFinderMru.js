/**
 * fieldFinderMru.js (VIS-1021)
 *
 * Per-chart-type most-recently-used prop list for the Field Finder, persisted
 * in localStorage. Editing a prop from the palette bumps it to the front, so
 * the next empty-query open surfaces "what you last reached for" first.
 *
 * Follows the viewer's versioned-key + try/catch + same-tab CustomEvent
 * convention (mirrors `onboarding/onboardingState.js`): a `storage` event does
 * NOT fire in the tab that wrote the value, so we dispatch a custom event for
 * same-tab subscribers to re-read.
 */

const STORAGE_KEY = 'visivo.fieldFinder.mru.v1';
const CHANGE_EVENT = 'visivo:field-finder-mru-changed';
const MAX_PER_TYPE = 8;

/** Read the whole `{ [type]: string[] }` MRU map, tolerating any corruption. */
function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    // Same-tab subscribers (the open palette) re-read on this event.
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Storage unavailable / quota — the MRU is a nicety, never a hard failure.
  }
}

/**
 * The ordered MRU paths for a chart type (most-recent first), or `[]`.
 * @param {string} type
 * @returns {string[]}
 */
export function readMru(type) {
  if (!type) return [];
  const list = readAll()[type];
  return Array.isArray(list) ? list.slice(0, MAX_PER_TYPE) : [];
}

/**
 * Bump `path` to the front of `type`'s MRU (dedup, cap at MAX_PER_TYPE).
 * @param {string} type
 * @param {string} path
 */
export function bumpMru(type, path) {
  if (!type || !path) return;
  const all = readAll();
  const prev = Array.isArray(all[type]) ? all[type] : [];
  const next = [path, ...prev.filter(p => p !== path)].slice(0, MAX_PER_TYPE);
  all[type] = next;
  writeAll(all);
}

/** Subscribe to same-tab MRU changes; returns an unsubscribe fn. */
export function subscribeMru(handler) {
  const onChange = () => handler();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange); // cross-tab
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Test seam — clear all persisted MRU. */
export function clearMru() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

export const __TEST__ = { STORAGE_KEY, CHANGE_EVENT, MAX_PER_TYPE };
