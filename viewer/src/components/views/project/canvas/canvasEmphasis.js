/**
 * canvasEmphasis — the canvas's "there is exactly ONE emphasized outline"
 * contract (M26 / VIS-1260).
 *
 * The dashboard canvas stacks several sibling overlays over the render-only
 * <Dashboard> (selection, DnD, resize, add-row, context menu, keyboard, flip).
 * More than one of them can want to draw a strong mulberry ring, and because
 * they are SIBLINGS none of them can see — or dim — another's ring. The failure
 * that produced this module: during a resize gesture <CanvasSelectionOverlay>
 * kept a full-strength 2px ring at the PRE-DRAG geometry while
 * <CanvasResizeLayer> painted an identical one at the target, so the canvas
 * showed two equally-emphasized boxes and the drop landed on neither obviously.
 *
 * Every overlay that paints a strong (2px, `primary`) outline stamps
 * `EMPHASIZED_OUTLINE_PROPS` on it. That turns "how many emphasized outlines are
 * on screen?" into a question the DOM can answer — a real invariant a test can
 * FALSIFY, rather than a private marker only one component ever sets.
 *
 * Subtle rings (hover hints, insertion bars, 1px tints) are deliberately NOT
 * marked: the invariant is about the strong "this is the thing" outline.
 */

/** The attribute every strong canvas outline carries. */
export const EMPHASIZED_OUTLINE_ATTR = 'data-canvas-outline';

/** Its value. Spread `EMPHASIZED_OUTLINE_PROPS` onto the element instead. */
export const EMPHASIZED_OUTLINE_VALUE = 'emphasized';

/** Spread onto the outline element: `<div {...EMPHASIZED_OUTLINE_PROPS} …>`. */
export const EMPHASIZED_OUTLINE_PROPS = {
  [EMPHASIZED_OUTLINE_ATTR]: EMPHASIZED_OUTLINE_VALUE,
};

/** `querySelectorAll` selector for the invariant's assertions (unit + e2e). */
export const EMPHASIZED_OUTLINE_SELECTOR = `[${EMPHASIZED_OUTLINE_ATTR}="${EMPHASIZED_OUTLINE_VALUE}"]`;
