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
