import isEqual from 'lodash/isEqual';
import useStore from '../stores/store';

/**
 * formDrafts — per-object unsaved-edit persistence (localStorage).
 *
 * THE PROBLEM: every edit panel holds its in-progress edits in local component
 * state seeded from the record (`useFormBaseline`), and the right rail is a
 * SINGLE instance bound to the active object. Clicking away unmounted the form
 * and threw the edits away; a reload did the same. Users lost work by doing the
 * most natural thing in a workspace — looking at something else mid-edit.
 *
 * THE FIX: each object's unsaved values are mirrored to localStorage under its
 * own key (`type:name`, project-scoped) and restored when that object is opened
 * again — across navigation AND across reloads.
 *
 * ### Staleness rule (why a draft carries its baseline)
 *
 * A stored draft is `{ baseline, values }`: the values the user is editing AND
 * the last-saved values they were edited FROM. On restore we only re-apply the
 * draft when its `baseline` still deep-equals what the record currently seeds —
 * i.e. the saved object has not moved on underneath. If it HAS (someone else
 * saved it, a run rewrote it, the name now belongs to a different object in
 * another project), the draft is dropped rather than silently pasted over newer
 * truth. This is also what keeps same-named objects in different projects from
 * bleeding into each other beyond the project scoping below.
 *
 * ### Failure rule
 *
 * Any failure to load a draft — unreadable storage, malformed JSON, a shape
 * this version doesn't recognise — CLEARS that object's stored draft and
 * reports "no draft". A corrupt entry never surfaces as a broken form and never
 * lingers to fail again on the next open.
 */

const PREFIX = 'visivo.draft.';
const VERSION = 1;

/**
 * The localStorage handle, or null when storage is unavailable (SSR, Safari
 * private mode, storage disabled). Every access below tolerates null so a
 * missing storage engine degrades to "no drafts", never a thrown render.
 */
const storage = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    // Access itself can throw when cookies/storage are blocked.
    return null;
  }
};

/**
 * Project scope for the key. The viewer is mounted per project in cloud
 * (`/:account/:stage/:project/workspace`) on ONE origin, so an unscoped
 * `chart:revenue` would be shared by every project the user opens.
 *
 * Read lazily through `getState()` rather than a reactive selector: this is
 * called from event/effect paths, not during render, and the optional call
 * keeps the util working under the partial store mocks the form suites use.
 */
const projectScope = () => {
  try {
    return useStore.getState?.()?.project?.id || 'local';
  } catch {
    return 'local';
  }
};

/** Full storage key for an object draft key (`chart:revenue`). */
export const draftStorageKey = key => `${PREFIX}${projectScope()}.${key}`;

/** Remove an object's stored draft. Safe to call when none exists. */
export const clearDraft = key => {
  if (!key) return;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(draftStorageKey(key));
  } catch {
    // Nothing more we can do; a draft we cannot remove is one we also cannot
    // read (readDraft clears on any failure), so it stays inert.
  }
};

/**
 * Read an object's stored draft.
 *
 * @returns {{baseline: any, values: any}|null} the draft, or null when there
 *   is none. ANY problem loading — storage error, bad JSON, unknown version,
 *   wrong shape — clears the entry and returns null (never a broken form).
 */
export const readDraft = key => {
  if (!key) return null;
  const store = storage();
  if (!store) return null;
  let raw;
  try {
    raw = store.getItem(draftStorageKey(key));
  } catch {
    clearDraft(key);
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const usable =
      parsed &&
      typeof parsed === 'object' &&
      parsed.v === VERSION &&
      'baseline' in parsed &&
      'values' in parsed;
    if (!usable) {
      clearDraft(key);
      return null;
    }
    return { baseline: parsed.baseline, values: parsed.values };
  } catch {
    clearDraft(key);
    return null;
  }
};

/**
 * Mirror an object's unsaved values to storage, tagged with the saved values
 * they were edited from. A write that fails (quota, unserialisable value)
 * clears the entry rather than leaving a half-written or stale one behind.
 */
export const writeDraft = (key, baseline, values) => {
  if (!key) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(draftStorageKey(key), JSON.stringify({ v: VERSION, baseline, values }));
  } catch {
    clearDraft(key);
  }
};

/**
 * Restore a draft for a record that is seeding with `savedValues`.
 *
 * @returns {any} the draft's values when it is still valid for these saved
 *   values, otherwise `savedValues` unchanged (dropping a stale draft).
 */
export const restoreDraft = (key, savedValues) => {
  const draft = readDraft(key);
  if (!draft) return savedValues;
  if (isEqual(draft.baseline, savedValues)) return draft.values;
  // The saved record moved on underneath this draft — drop it rather than
  // paste stale edits over newer truth.
  clearDraft(key);
  return savedValues;
};

/**
 * Sync an object's draft to match its current state: stored while the values
 * differ from the last-saved baseline, removed the moment they match again
 * (a save advanced the baseline, or Discard reverted).
 */
export const syncDraft = (key, baseline, values) => {
  if (!key || baseline === undefined || baseline === null) return;
  if (isEqual(values, baseline)) clearDraft(key);
  else writeDraft(key, baseline, values);
};
