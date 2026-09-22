/**
 * The <Dashboard> ↔ canvasGridGeometry CONTRACT (M26 / VIS-1260).
 *
 * `canvasGridGeometry` exists to predict, in arithmetic, the geometry
 * <Dashboard> hands to CSS grid. Every other test in this area checks the
 * arithmetic against ITSELF: `previewItemWidthPx` vs `itemSlotWidthPx`,
 * `rowTotalForSpan` vs `setItemWidth`. None of them touch the renderer, so if
 * Dashboard.renderRow ever changes how it lays a row out — a fixed 12-track
 * grid, a different gap, a different `totalWidth` derivation — the geometry
 * module keeps agreeing with itself while the ghost quietly starts lying again.
 * That drift IS the M26 finding; this file is the test that would have caught
 * it.
 *
 * So: render the REAL <Dashboard> (item leaves mocked — we care about the row
 * container, not the charts) and read the inline styles it emits, asserting the
 * three facts the geometry module is built on:
 *
 *   1. The grid has `Σ item.width` tracks — `rowGridTotal`, not a constant.
 *   2. The gap is a real length that `readColumnGapPx` can read (0.7rem/11.2px).
 *   3. Each item is `grid-column: span <width>`, so `precedingColsInRow`
 *      predicts where the slot starts.
 *
 * jsdom does not RESOLVE grid layout — that is what
 * `e2e/tools/measure-canvas-grid.mjs` does in a real browser. What jsdom can
 * check, and what actually drifts, is the INPUT Dashboard feeds to the grid.
 *
 * This file deliberately does not import anything from Dashboard.test.jsx: it is
 * a contract test owned by the canvas overlays, not a Dashboard test.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../../../project/Dashboard';
import { futureFlags } from '../../../../router-config';
import useStore from '../../../../stores/store';
import {
  gridTrackPx,
  itemSlotWidthPx,
  precedingColsInRow,
  readColumnGapPx,
  rowGridTotal,
  spanLeftOffsetPx,
} from './canvasGridGeometry';

jest.mock('../../../../stores/store');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

// Dashboard measures its container through a ResizeObserver-backed hook; give it
// a wide, stable width so the row lays out side-by-side (below the stacking
// breakpoint it becomes a flex column and there is no relative grid at all).
jest.mock('react-cool-dimensions', () => ({
  __esModule: true,
  default: (options = {}) => {
    if (options.onResize) options.onResize({ observe: jest.fn() });
    return { observe: jest.fn(), width: 1200 };
  },
}));

jest.mock('../../../../hooks/useInsightsData', () => ({ useInsightsData: jest.fn() }));
jest.mock('../../../../hooks/useModelsData', () => ({ useModelsData: jest.fn() }));
jest.mock('../../../../hooks/useInputsData', () => ({ useInputsData: jest.fn() }));
jest.mock('../../../../hooks/useVisibleRows', () => ({
  useVisibleRows: jest.fn(() => ({ visibleRows: new Set([0]), setRowRef: jest.fn() })),
}));

jest.mock('../../../items/Chart', () => ({
  __esModule: true,
  default: () => <div data-testid="chart" />,
}));
jest.mock('../../../items/Table', () => ({
  __esModule: true,
  default: () => <div data-testid="table" />,
}));
jest.mock('../../../items/Markdown', () => ({
  __esModule: true,
  default: () => <div data-testid="markdown" />,
}));
jest.mock('../../../items/Input', () => ({
  __esModule: true,
  default: () => <div data-testid="input" />,
}));

const DASHBOARD_NAME = 'contract-dashboard';

// Deliberately NOT a 12-wide row: this is the shape a hardcoded-12 renderer and
// a sum-normalized one disagree about.
const ROW_WIDTHS = [3, 5, 1];

const mountDashboard = widths => {
  const dashboard = {
    name: DASHBOARD_NAME,
    rows: [{ height: 'medium', items: widths.map(width => ({ chart: 'c', width })) }],
  };
  useStore.mockImplementation(selector =>
    selector({
      project: { id: 'p1', name: 'P' },
      dashboards: [dashboard],
      fetchDashboards: jest.fn(),
      fetchCharts: jest.fn(),
      fetchTables: jest.fn(),
      fetchMarkdowns: jest.fn(),
      fetchInputs: jest.fn(),
      fetchModels: jest.fn(),
      models: [],
      getChartByName: jest.fn(() => ({ name: 'c', config: { name: 'c' } })),
      getTableByName: jest.fn(() => null),
      getMarkdownByName: jest.fn(() => null),
      getInputByName: jest.fn(() => null),
    })
  );
  render(
    <BrowserRouter future={futureFlags}>
      <Dashboard projectId="p1" dashboardName={DASHBOARD_NAME} />
    </BrowserRouter>
  );
  return { items: dashboard.rows[0].items };
};

describe('Dashboard.renderRow ↔ canvasGridGeometry (M26 contract)', () => {
  test('the row grid has Σ item.width tracks — exactly rowGridTotal, not a constant', () => {
    const { items } = mountDashboard(ROW_WIDTHS);
    const row = screen.getByTestId('dashboard-row-0');

    // If this regex stops matching, renderRow no longer emits the shape
    // canvasGridGeometry is built on: `repeat(Σ widths, minmax(0, 1fr))`.
    const declared = row.style.gridTemplateColumns;
    const match = /^repeat\((\d+),\s*minmax\(0,\s*1fr\)\)$/.exec(declared);
    expect(match).toBeTruthy();
    expect(Number(match[1])).toBe(rowGridTotal(items));
    // …and that total is 9 here, so a hardcoded 12 would be caught.
    expect(Number(match[1])).toBe(9);
    expect(Number(match[1])).not.toBe(12);
  });

  test('the row gap is a real length the overlay can read back', () => {
    mountDashboard(ROW_WIDTHS);
    const row = screen.getByTestId('dashboard-row-0');
    // `readColumnGapPx` reads the COMPUTED gap off the live row. jsdom does not
    // resolve `rem`, so assert the declaration the overlay's measurement depends
    // on, then prove the reader round-trips a px value on the same element.
    expect(row.style.gap).toBe('0.7rem');
    row.style.columnGap = '11.2px'; // 0.7rem at a 16px root
    expect(readColumnGapPx(row)).toBeCloseTo(11.2, 6);
  });

  test('each item is `grid-column: span <width>`, so precedingColsInRow finds its start', () => {
    const { items } = mountDashboard(ROW_WIDTHS);
    const totalCols = rowGridTotal(items);
    const rowWidth = 1200;
    const gapPx = 11.2;

    items.forEach((item, index) => {
      // Dashboard's item slots carry no testid — `data-canvas-path` IS the
      // anchor the overlays address them by, so querying it is the point.
      // eslint-disable-next-line testing-library/no-node-access
      const slot = document.querySelector(`[data-canvas-path="row.0.item.${index}"]`);
      expect(slot).toBeTruthy();
      expect(slot.style.gridColumn).toBe(`span ${item.width}`);
    });

    // Rebuild the row from the emitted spans alone and check it tiles the row
    // exactly: Σ (slot widths + gaps) === rowWidth. If Dashboard ever stopped
    // spanning by `item.width`, the reconstruction stops closing.
    const last = items.length - 1;
    const rightEdge =
      spanLeftOffsetPx({ rowWidth, totalCols, precedingCols: precedingColsInRow(items, last), gapPx }) +
      itemSlotWidthPx({ rowWidth, totalCols, spanCols: items[last].width, gapPx });
    expect(rightEdge).toBeCloseTo(rowWidth, 6);
    // And the tracks are equal `1fr` tracks, as `gridTrackPx` assumes.
    expect(gridTrackPx({ rowWidth, totalCols, gapPx })).toBeCloseTo(
      (rowWidth - (totalCols - 1) * gapPx) / totalCols,
      9
    );
  });

  test('an unset width counts as one track on BOTH sides of the contract', () => {
    const { items } = mountDashboard([2, undefined, 3]);
    const row = screen.getByTestId('dashboard-row-0');
    const [, total] = /^repeat\((\d+),/.exec(row.style.gridTemplateColumns);
    expect(Number(total)).toBe(rowGridTotal(items));
    expect(Number(total)).toBe(6);
    // eslint-disable-next-line testing-library/no-node-access
    const middle = document.querySelector('[data-canvas-path="row.0.item.1"]');
    expect(middle.style.gridColumn).toBe('span 1');
    expect(precedingColsInRow(items, 2)).toBe(3);
  });
});
