import * as erdGeometry from './erdGeometry';
import { estimateErdNodeHeight as hookEstimate } from './useRelationErdDag';

/**
 * Step 0 — geometry single-source-of-truth.
 *
 * The card renderer, the layout engine, and the edge router must all consume the
 * SAME geometry module. These asserts lock that: the consts exist on
 * erdGeometry, and `useRelationErdDag` re-exports the *identical* function
 * (not a fork) so a future divergence is caught.
 */
describe('erdGeometry — single source of truth', () => {
  it('exports the canonical card geometry consts', () => {
    expect(erdGeometry.ERD_NODE_WIDTH).toBe(260);
    expect(erdGeometry.ERD_HEADER_H).toBe(36);
    expect(erdGeometry.ERD_ROW_H).toBe(30);
    expect(erdGeometry.ERD_EMPTY_H).toBe(30);
    expect(erdGeometry.ERD_SECTION_H).toBe(30);
    expect(erdGeometry.ERD_PILL_ROW_H).toBe(22);
    expect(erdGeometry.ERD_PILLS_PER_ROW).toBe(2);
    expect(erdGeometry.ERD_CARD_VPAD).toBe(10);
    expect(erdGeometry.ERD_GRID_GAP_X).toBe(56);
    expect(erdGeometry.ERD_GRID_GAP_Y).toBe(28);
  });

  it('useRelationErdDag re-exports the identical estimateErdNodeHeight', () => {
    // Same function identity → both modules share one geometry source.
    expect(hookEstimate).toBe(erdGeometry.estimateErdNodeHeight);
  });

  it('estimateErdNodeHeight composes from the shared consts', () => {
    const { ERD_HEADER_H, ERD_ROW_H, ERD_CARD_VPAD, estimateErdNodeHeight } = erdGeometry;
    // One column: header + one row + vpad.
    expect(estimateErdNodeHeight({ columns: ['a'] })).toBe(ERD_HEADER_H + ERD_ROW_H + ERD_CARD_VPAD);
    // Grows with columns.
    expect(estimateErdNodeHeight({ columns: ['a', 'b'] })).toBeGreaterThan(
      estimateErdNodeHeight({ columns: ['a'] })
    );
  });
});
