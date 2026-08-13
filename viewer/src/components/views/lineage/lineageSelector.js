/**
 * Lineage selector grammar helpers.
 *
 * Visivo's selector syntax is `[+N]name[+M]`: a leading `+` pulls in ancestors,
 * a trailing `+` pulls in descendants, and a digit outside either `+` bounds
 * that direction (`2+name` = two levels up). A bare `name` is the object alone.
 *
 * This lives in its own module because two surfaces derive the selector for
 * "show me this object's lineage" independently — `useWorkspaceScope` for the
 * main canvas and `MiniLineageCard` for the small one — and they disagreed:
 * the main canvas asked for `+name` and so rendered an object with its
 * upstream but nothing downstream, while the mini card asked for `+name+`
 * (VIS-1213). Same question, two answers, because the grammar was inline in
 * both.
 */

/**
 * The selector for "this object and everything connected to it", in both
 * directions and unbounded.
 *
 * This is what opening an object's lineage should ask for. An object rendered
 * with only its ancestors looks like a leaf even when it feeds a dozen things,
 * which is the opposite of what a lineage view is for.
 */
export function neighborhoodSelector(name) {
  return `+${name}+`;
}

export const UNBOUNDED = Number.POSITIVE_INFINITY;

/**
 * Parse a Visivo selector string into `{ name, ancestors, descendants }`.
 *
 * Syntax: depth digits sit OUTSIDE the `+`, the `+` always touches the
 * object name. `+` alone means "unbounded in that direction", a missing
 * `+` means "no traversal in that direction", and `N+` / `+N` clamps to
 * N levels.
 *
 *   "+revenue_chart+"    → unbounded ancestors + unbounded descendants
 *   "2+revenue_chart+1"  → 2 ancestor levels, 1 descendant level
 *   "+revenue_chart"     → unbounded ancestors, no descendants
 *   "2+revenue_chart"    → 2 ancestor levels, no descendants
 *   "revenue_chart"      → just the subject row
 *   "+monthly_revenue+"  → SWAPS the subject to `monthly_revenue` and
 *                          shows its full upstream + downstream
 */
export function parseSelector(text, fallbackName) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { name: fallbackName, ancestors: 0, descendants: 0 };
  }
  // ((\d+)?\+)?   optional leading-depth + `+`
  // ([^+]+?)      the object name (non-greedy, no `+`)
  // (\+(\d+)?)?   optional trailing `+` + descendant-depth
  const re = /^((\d+)?\+)?([^+]+?)(\+(\d+)?)?$/;
  const m = trimmed.match(re);
  if (!m) {
    return { name: fallbackName, ancestors: 0, descendants: 0 };
  }
  const ancHasPlus = Boolean(m[1]);
  const ancDigits = m[2] || '';
  const subjName = (m[3] || '').trim() || fallbackName;
  const desHasPlus = Boolean(m[4]);
  const desDigits = m[5] || '';

  const depth = (hasPlus, digits) => {
    if (!hasPlus) return 0;
    if (!digits) return UNBOUNDED;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) && n >= 0 ? n : UNBOUNDED;
  };

  return {
    name: subjName,
    ancestors: depth(ancHasPlus, ancDigits),
    descendants: depth(desHasPlus, desDigits),
  };
}

/**
 * The object a selector is centred on, or `''` when it names none (`*`, empty).
 *
 * The lineage canvas uses this to decide what to frame: a selector that names
 * a subject should bring THAT object into view, where an unscoped one should
 * fit the whole graph.
 */
export function subjectOf(selector) {
  const trimmed = String(selector || '').trim();
  if (!trimmed || trimmed === '*') return '';
  return parseSelector(trimmed, '').name || '';
}
