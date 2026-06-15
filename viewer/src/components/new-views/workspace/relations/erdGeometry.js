/**
 * erdGeometry.js — the SINGLE source of truth for ERD model-card geometry.
 *
 * `useRelationErdDag.js` and `ErdModelNode.jsx` import these consts from here so
 * the layout engine (dagre via `layoutSize`) and the card renderer agree on the
 * exact pixel geometry of a card. (Edges no longer estimate geometry — React Flow
 * gives the link edge the real handle positions.) Nothing re-declares these.
 *
 * The pixel values must track the rendered card markup:
 *   - header  : `px-3 py-2`   = 36px  (ERD_HEADER_H)
 *   - one row : `px-3 py-1.5` = 30px  (ERD_ROW_H)
 *   - empty   : "No columns loaded" row (ERD_EMPTY_H)
 *   - section : a field section's border + label + padding (ERD_SECTION_H)
 *   - pill row: one wrapped row of field pills (ERD_PILL_ROW_H)
 */

export const ERD_NODE_WIDTH = 260; // cards are min-w-[200] max-w-[280]
export const ERD_HEADER_H = 36; // tinted model header (px-3 py-2)
export const ERD_ROW_H = 30; // one column row (px-3 py-1.5)
export const ERD_EMPTY_H = 30; // "No columns loaded" row
export const ERD_SECTION_H = 30; // a field section's border + label + padding
export const ERD_PILL_ROW_H = 22; // one wrapped row of field pills
export const ERD_PILLS_PER_ROW = 2; // ~2 max-w-[120] pills per ~260px card
export const ERD_CARD_VPAD = 10; // 2px borders + rounding slack

export const ERD_GRID_GAP_X = 56; // horizontal gutter between card columns
export const ERD_GRID_GAP_Y = 28; // vertical gutter between stacked cards

/**
 * Estimate a model card's rendered height so dagre / the router can space and
 * route around cards without overlap. Counts the header, every column row (or
 * the empty-state row), and a field section per non-empty metrics / dimensions
 * group (label + wrapped pill rows). Deliberately a touch generous — over-spacing
 * beats overlap.
 */
export const estimateErdNodeHeight = ({ columns = [], metrics = [], dimensions = [] } = {}) => {
  let height = ERD_HEADER_H;
  height += columns.length > 0 ? columns.length * ERD_ROW_H : ERD_EMPTY_H;
  const sectionHeight = names =>
    names.length > 0
      ? ERD_SECTION_H + Math.ceil(names.length / ERD_PILLS_PER_ROW) * ERD_PILL_ROW_H
      : 0;
  height += sectionHeight(metrics);
  height += sectionHeight(dimensions);
  return height + ERD_CARD_VPAD;
};
