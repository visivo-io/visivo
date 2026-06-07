/**
 * parityTestUtils — VIS-899 canvas ↔ editor parity harness.
 *
 * The canvas (Project Editor) and the right-rail editor forms must render the
 * SAME objects from the SAME source of truth. These helpers extract the labels
 * each surface displays for a given object type and assert they match, so a
 * regression that re-introduces a divergent source fails loudly in CI.
 *
 * The harness is intentionally object-type-agnostic: register a label extractor
 * per surface per object type and the parity assertion compares them. Today it
 * is wired for dashboard "levels" (the VIS-899 example); future object types
 * (items, inputs, …) extend `LEVELS_PARITY` → add a sibling descriptor and a
 * test that calls `assertSurfacesMatch`.
 *
 * Pure JS (no test framework imports) so it can be consumed from any Jest test.
 */

/**
 * Pull the ordered level labels the CANVAS Project Editor renders, from the
 * grouped output of `groupDashboardsByLevel`. The trailing "Unassigned" bucket
 * is NOT a configured level, so it is excluded from the level identity list.
 *
 * @param {{ levelKey: string, title: string }[]} groups
 * @param {string} unassignedKey
 * @returns {string[]} ordered level titles
 */
export const canvasLevelLabels = (groups, unassignedKey = '__unassigned__') =>
  (groups || []).filter(g => g.levelKey !== unassignedKey).map(g => g.title);

/**
 * Pull the ordered level labels the EDITOR form (ProjectDefaultsEditForm)
 * displays, from its working `levels` state (each `{ title, description }`).
 *
 * @param {{ title: string }[]} levels
 * @returns {string[]} ordered level titles
 */
export const editorLevelLabels = levels => (levels || []).map(l => l.title);

/**
 * Assert two surfaces agree on the labels they render for an object type, both
 * drawn from the SAME source of truth. Throws a descriptive Error (consumed via
 * `expect(() => …).not.toThrow` or wrapped in a custom matcher) when they
 * diverge, including BOTH lists so a failure pinpoints the mismatch.
 *
 * Two modes:
 *   - 'exact' (default): identical ordered lists. Use when both surfaces render
 *     the full source (e.g. configured levels — canvas renders every configured
 *     level as a drop target, the editor edits every one).
 *   - 'prefix': the canvas list is an in-order PREFIX/subset of the editor list
 *     AND neither is empty when the other is non-empty. Use for the no-config
 *     derived case, where the canvas applies display windowing (hides trailing
 *     empty default levels) on top of the shared source while the editor shows
 *     the whole editable set. The original VIS-899 bug — canvas non-empty while
 *     editor empty — still fails loudly under this mode.
 *
 * @param {object} params
 * @param {string} params.objectType   - e.g. 'levels' (for the failure message)
 * @param {string[]} params.canvas     - labels the canvas renders
 * @param {string[]} params.editor     - labels the editor renders
 * @param {'exact'|'prefix'} [params.mode='exact']
 */
export const assertSurfacesMatch = ({ objectType, canvas, editor, mode = 'exact' }) => {
  const a = canvas || [];
  const b = editor || [];

  let ok;
  if (mode === 'prefix') {
    // The bug being guarded: one surface shows levels while the other shows
    // none. Under windowing the canvas is a prefix of the editor's full list.
    const bothEmptyOrBothNot = a.length === 0 ? true : b.length > 0;
    const isPrefix = a.every((label, i) => label === b[i]);
    ok = bothEmptyOrBothNot && isPrefix;
  } else {
    ok = a.length === b.length && a.every((label, i) => label === b[i]);
  }

  if (!ok) {
    throw new Error(
      `canvas ↔ editor parity mismatch for "${objectType}" (mode=${mode}):\n` +
        `  canvas: ${JSON.stringify(a)}\n` +
        `  editor: ${JSON.stringify(b)}`
    );
  }
  return true;
};

export default assertSurfacesMatch;
