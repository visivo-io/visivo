import { defaultLevels } from './dashboardUtils';

/**
 * effectiveLevels — VIS-899 single source of truth for dashboard levels.
 *
 * The canvas Project Editor and the right-rail Project-Settings form used to
 * read DIFFERENT representations of the same level list, which produced a
 * mismatch: the canvas rendered groups derived from the shared `defaultLevels`
 * fallback ("Organization" / "Department" …) when no levels were configured,
 * while the settings form read the LITERAL `defaults.levels` (empty) and showed
 * "No dashboard levels defined."
 *
 * `getEffectiveLevels` is the ONE function both surfaces (and the level-CRUD
 * store actions) call to answer "which levels should we display/edit?". It
 * returns the configured `defaults.levels` when the project defines any, and
 * otherwise the shared `defaultLevels` fallback — exactly the list the canvas
 * Project Editor derives. Because both the canvas and the editor read through
 * this helper, they can never diverge.
 *
 * Returns a fresh array of `{ title, description }` copies so callers can mutate
 * their working list without aliasing the canonical defaults.
 *
 * @param {object|null|undefined} defaults - the project `defaults` record.
 * @returns {{title: string, description: string}[]}
 */
export const getEffectiveLevels = defaults => {
  const configured = defaults?.levels;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map(l => ({ ...l }));
  }
  return defaultLevels.map(l => ({ ...l }));
};

/**
 * Whether the project has EXPLICITLY configured its own levels (vs. falling
 * back to the shared defaults). Surfaces use this to label/treat configured
 * levels as real, user-created buckets.
 *
 * @param {object|null|undefined} defaults - the project `defaults` record.
 * @returns {boolean}
 */
export const hasConfiguredLevels = defaults =>
  Array.isArray(defaults?.levels) && defaults.levels.length > 0;

export default getEffectiveLevels;
