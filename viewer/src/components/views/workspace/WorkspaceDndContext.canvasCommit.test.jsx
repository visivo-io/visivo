/**
 * Canvas commit-path regression tests (VIS-993 follow-up).
 *
 * USER-REPORTED REGRESSION: after the validation gate replaced
 * sanitizeDashboardConfig, canvas drag-edits (row-height resize, item-width
 * resize, reorder, cross-row move, Library drop) appeared to work but never
 * persisted. These tests drive the REAL pipeline end to end in jsdom:
 *
 *   REAL gesture transform (canvasReorder) → REAL mounted WorkspaceDndContext
 *   commit (checkLeafExclusivity + validateRecordConfigSync against the REAL
 *   bundled $defs snapshot) → store saveDashboard.
 *
 * The dashboard fixture mirrors what `/api/dashboards/` actually serves for the
 * integration project's `simple-dashboard` — `model_dump(mode='json',
 * exclude_none=True, exclude={'file_path','path'})` — including EMBEDDED chart
 * objects (name + `${ref()}` insights + a Plotly layout), `${ref()}` string
 * leaves, empty slots, level/tags/type sidecar fields, and nested container
 * rows. If the gate rejects any gesture-produced config here, the canvas
 * "works then silently never saves" — exactly the regression this pins.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import WorkspaceDndContext, { routeWorkspaceDragEnd, useWorkspaceCommit } from './WorkspaceDndContext';
import { preloadValidationSchema, validateRecordConfigSync } from './validateAgainstSchema';
import { checkLeafExclusivity } from './itemMutations';
import {
  setRowHeight,
  setItemWidth,
  resizeItemFromLeft,
  reorderTopLevelRows,
  reorderItemsInRow,
  moveItemBetweenRows,
  insertItemAtTarget,
  buildLibraryItem,
} from '../project/canvas/canvasReorder';
import useStore from '../../../stores/store';

const clone = value => JSON.parse(JSON.stringify(value));

// Capture the REAL store action at module load — earlier tests in this file
// overwrite it with jest.fn() via useStore.setState, and the full-stack
// describe below needs the genuine optimistic write.
const REAL_UPDATE_DASHBOARD_OPTIMISTIC = useStore.getState().updateDashboardConfigOptimistic;

/**
 * A dashboard config shaped EXACTLY like the local Flask `/api/dashboards/`
 * list endpoint's `config` field (DashboardManager._serialize_object →
 * model_dump(mode='json', exclude_none=True, exclude={'file_path','path'})):
 *   - `name`, `level`, `tags`, `type: 'internal'` sidecar fields present;
 *   - items with EMBEDDED chart objects (integration project pre-resolves
 *     inline charts to objects with name/insights/layout);
 *   - `${ref(...)}` context-string leaves;
 *   - an EMPTY slot ({ width } only);
 *   - a container item with nested rows.
 */
const API_SHAPED_CONFIG = {
  name: 'simple-dashboard',
  level: 0,
  tags: ['charts', 'simple'],
  type: 'internal',
  rows: [
    {
      height: 'medium',
      items: [
        {
          width: 9,
          chart: {
            name: 'a-very-fibonacci-waterfall',
            insights: ['${ref(fibonacci-waterfall)}', '${ref(example-indicator)}'], // eslint-disable-line no-template-curly-in-string
            layout: {
              title: { text: 'AAPL P&L' },
              waterfallgroupgap: 0.1,
            },
          },
        },
        {
          width: 2,
          chart: {
            name: 'aggregated-fib',
            insights: ['${ref(aggregated-line)}'], // eslint-disable-line no-template-curly-in-string
            layout: {
              title: { text: 'Aggregated Fibonacci' },
              yaxis: { title: { text: 'output' } },
              xaxis: { title: { text: 'More if x>3 Less if x<=3' } },
            },
          },
        },
        { width: 1 }, // empty slot
      ],
    },
    {
      height: 512,
      items: [
        { width: 1, table: '${ref(a-table)}' }, // eslint-disable-line no-template-curly-in-string
        { width: 2, markdown: '${ref(welcome-md)}' }, // eslint-disable-line no-template-curly-in-string
      ],
    },
    {
      height: 'small',
      items: [
        {
          width: 1,
          rows: [
            { height: 'small', items: [{ width: 1, chart: '${ref(nested-chart)}' }] }, // eslint-disable-line no-template-curly-in-string
            { height: 'small', items: [{ width: 1 }] },
          ],
        },
      ],
    },
  ],
};

const CommitProbe = ({ name, config }) => {
  const commit = useWorkspaceCommit();
  return (
    <button
      type="button"
      data-testid="commit-probe"
      onClick={() => commit && commit(name, config)}
    >
      commit
    </button>
  );
};

/** Mount the REAL provider, click-commit `config`, return the saveDashboard spy. */
const commitThroughProvider = config => {
  const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
  const updateDashboardConfigOptimistic = jest.fn();
  useStore.setState({ saveDashboard, updateDashboardConfigOptimistic });
  render(
    <WorkspaceDndContext>
      <CommitProbe name="simple-dashboard" config={config} />
    </WorkspaceDndContext>
  );
  fireEvent.click(screen.getByTestId('commit-probe'));
  return { saveDashboard, updateDashboardConfigOptimistic };
};

beforeAll(async () => {
  // Warm the bundled $defs snapshot so the gate takes its SYNC path — the same
  // steady state the production workspace reaches after the first commit.
  await preloadValidationSchema();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('gate accepts the API-shaped dashboard config itself (baseline)', () => {
  test('the untouched /api/dashboards config passes the schema gate', () => {
    const result = validateRecordConfigSync('dashboard', clone(API_SHAPED_CONFIG));
    expect(result).not.toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test('the untouched config passes leaf exclusivity', () => {
    expect(checkLeafExclusivity(clone(API_SHAPED_CONFIG)).valid).toBe(true);
  });
});

describe('canvas gestures persist through the REAL commit gate (VIS-993 regression)', () => {
  test('row-height FLUID resize (pixel int) persists byte-identical', () => {
    const next = setRowHeight(clone(API_SHAPED_CONFIG), 'row.0', 487);
    expect(next.rows[0].height).toBe(487);
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    expect(saveDashboard.mock.calls[0][0]).toBe('simple-dashboard');
    expect(saveDashboard.mock.calls[0][1]).toBe(next); // byte-identical, never repaired
  });

  test('row-height TICK resize (enum token) persists', () => {
    const next = setRowHeight(clone(API_SHAPED_CONFIG), 'row.1', 'xlarge');
    expect(next.rows[1].height).toBe('xlarge');
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    expect(saveDashboard.mock.calls[0][1]).toBe(next);
  });

  test('NESTED row-height resize (enum inside a container) persists', () => {
    const next = setRowHeight(clone(API_SHAPED_CONFIG), 'row.2.item.0.row.0', 'medium');
    expect(next.rows[2].items[0].rows[0].height).toBe('medium');
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
  });

  test('item-width resize persists byte-identical', () => {
    const next = setItemWidth(clone(API_SHAPED_CONFIG), 'row.0.item.0', 7);
    expect(next.rows[0].items[0].width).toBe(7);
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    expect(saveDashboard.mock.calls[0][1]).toBe(next);
  });

  test('LEFT-edge width resize (column transfer with neighbour) persists', () => {
    const next = resizeItemFromLeft(clone(API_SHAPED_CONFIG), 'row.0', 1, 3);
    expect(next.rows[0].items[1].width).toBe(5);
    expect(next.rows[0].items[0].width).toBe(6);
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
  });

  test('top-level row reorder persists', () => {
    const next = reorderTopLevelRows(clone(API_SHAPED_CONFIG), 0, 1);
    expect(next.rows[0].height).toBe(512);
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
  });

  test('item reorder within a row persists', () => {
    const next = reorderItemsInRow(clone(API_SHAPED_CONFIG), 'row.0', 0, 2);
    expect(next.rows[0].items[2].chart?.name).toBe('a-very-fibonacci-waterfall');
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
  });

  test('cross-row item move persists (source row may go empty)', () => {
    const next = moveItemBetweenRows(clone(API_SHAPED_CONFIG), 'row.1', 0, {
      kind: 'end-of-row',
      rowPath: 'row.0',
    });
    expect(next.rows[0].items).toHaveLength(4);
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
  });

  test('Library chart drop (between-rows insert) persists', () => {
    const item = buildLibraryItem('chart', 'indicator-chart');
    const next = insertItemAtTarget(clone(API_SHAPED_CONFIG), { kind: 'between-rows', index: 3 }, item);
    expect(next.rows[3].items[0].chart).toBe('ref(indicator-chart)');
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
  });

  test('Library markdown drop into an existing row (between-items) persists', () => {
    const item = buildLibraryItem('markdown', 'welcome-md');
    const next = insertItemAtTarget(
      clone(API_SHAPED_CONFIG),
      { kind: 'between-items', rowPath: 'row.1', index: 1 },
      item
    );
    expect(next.rows[1].items[1].markdown).toBe('ref(welcome-md)');
    const { saveDashboard } = commitThroughProvider(next);
    expect(saveDashboard).toHaveBeenCalledTimes(1);
  });
});

describe('router → REAL commit integration (drag-end payloads persist)', () => {
  const routerDeps = commitCanvasConfig => ({
    dashboards: [],
    projectDefaults: null,
    reassignDashboardLevel: jest.fn(),
    moveLevel: jest.fn(),
    commitCanvasConfig,
    emit: jest.fn(),
  });

  const RouterProbe = ({ event }) => {
    const commit = useWorkspaceCommit();
    return (
      <button
        type="button"
        data-testid="router-probe"
        onClick={() => routeWorkspaceDragEnd(event, routerDeps(commit))}
      >
        route
      </button>
    );
  };

  const driveRouter = event => {
    const saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    useStore.setState({ saveDashboard, updateDashboardConfigOptimistic: jest.fn() });
    render(
      <WorkspaceDndContext>
        <RouterProbe event={event} />
      </WorkspaceDndContext>
    );
    fireEvent.click(screen.getByTestId('router-probe'));
    return saveDashboard;
  };

  test('a real drag-end row reorder routes through the gate and saves', () => {
    const config = clone(API_SHAPED_CONFIG);
    const saveDashboard = driveRouter({
      active: {
        data: { current: { source: 'canvas', kind: 'row', rowIndex: 0, rowPath: 'row.0' } },
      },
      over: {
        data: {
          current: {
            kind: 'canvas-drop',
            dashboardName: 'simple-dashboard',
            config,
            target: { kind: 'between-rows', index: 2 },
          },
        },
      },
    });
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const persisted = saveDashboard.mock.calls[0][1];
    expect(persisted.rows[0].height).toBe(512);
  });

  test('a real drag-end Library insert routes through the gate and saves', () => {
    const config = clone(API_SHAPED_CONFIG);
    const saveDashboard = driveRouter({
      active: { data: { current: { source: 'library', type: 'chart', name: 'indicator-chart' } } },
      over: {
        data: {
          current: {
            kind: 'canvas-drop',
            dashboardName: 'simple-dashboard',
            config,
            target: { kind: 'end-of-row', rowPath: 'row.1' },
          },
        },
      },
    });
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const persisted = saveDashboard.mock.calls[0][1];
    expect(persisted.rows[1].items[2].chart).toBe('ref(indicator-chart)');
  });

  test('a real drag-end cross-row item move routes through the gate and saves', () => {
    const config = clone(API_SHAPED_CONFIG);
    const saveDashboard = driveRouter({
      active: {
        data: { current: { source: 'canvas', kind: 'item', rowPath: 'row.1', itemIndex: 0 } },
      },
      over: {
        data: {
          current: {
            kind: 'canvas-drop',
            dashboardName: 'simple-dashboard',
            config,
            target: { kind: 'end-of-row', rowPath: 'row.0' },
          },
        },
      },
    });
    expect(saveDashboard).toHaveBeenCalledTimes(1);
  });
});

describe('full-stack resize gesture → REAL provider commit (jsdom pointer drive)', () => {
  // Borrowed from CanvasResizeLayer.test.jsx, but WITHOUT mocking the commit
  // hook: the layer runs against the REAL WorkspaceDndContext provider, so a
  // resize exercises the exact production pipeline down to saveDashboard.
  /* eslint-disable global-require */
  const CanvasResizeLayer = require('../project/canvas/CanvasResizeLayer').default;
  /* eslint-enable global-require */
  const { useRef } = React;

  const makeEvt = (type, { clientX, clientY, shiftKey = false }) =>
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, shiftKey });

  const firePointer = (type, coords) => {
    act(() => {
      window.dispatchEvent(makeEvt(type, coords));
    });
  };
  const firePointerDown = (el, coords) => {
    act(() => {
      el.dispatchEvent(makeEvt('pointerdown', coords));
    });
  };

  const Host = () => {
    const rootRef = useRef(null);
    return (
      <WorkspaceDndContext>
        <div ref={rootRef} style={{ position: 'relative' }}>
          <div data-canvas-path="row.0" data-testid="r0">
            <div data-canvas-path="row.0.item.0" data-testid="r0i0" />
            <div data-canvas-path="row.0.item.1" data-testid="r0i1" />
          </div>
          <CanvasResizeLayer rootRef={rootRef} dashboardName="simple-dashboard" />
        </div>
      </WorkspaceDndContext>
    );
  };

  const BOXES = {
    r0: { top: 0, left: 0, width: 800, height: 200, bottom: 200, right: 800 },
    r0i0: { top: 0, left: 0, width: 600, height: 200, bottom: 200, right: 600 },
    r0i1: { top: 0, left: 610, width: 190, height: 200, bottom: 200, right: 800 },
    root: { top: 0, left: 0, width: 800, height: 360, bottom: 360, right: 800 },
  };

  let saveDashboard;

  beforeEach(() => {
    saveDashboard = jest.fn(() => Promise.resolve({ success: true }));
    useStore.setState({
      dashboards: [{ name: 'simple-dashboard', config: clone(API_SHAPED_CONFIG) }],
      workspaceOutlineSelectedKey: 'row.0.item.0',
      saveDashboard,
      updateDashboardConfigOptimistic: REAL_UPDATE_DASHBOARD_OPTIMISTIC,
    });
    Element.prototype.getBoundingClientRect = function () {
      const tid = this.getAttribute && this.getAttribute('data-testid');
      if (tid && BOXES[tid]) return BOXES[tid];
      return BOXES.root;
    };
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => {};
    }
  });

  test('a real width drag on the handle persists the resized config', async () => {
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');

    // 12 grid cols over an 800px row → ~66.7px/col. Drag LEFT ~2 columns.
    firePointerDown(handle, { clientX: 600, clientY: 100 });
    firePointer('pointermove', { clientX: 466, clientY: 100 });
    firePointer('pointerup', { clientX: 466, clientY: 100 });

    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(1));
    const persisted = saveDashboard.mock.calls[0][1];
    expect(persisted.rows[0].items[0].width).toBe(7);
    // The store's optimistic copy converged on the same config object.
    const entry = useStore.getState().dashboards.find(d => d.name === 'simple-dashboard');
    expect(entry.config).toBe(persisted);
  });

  test('a real Shift-fluid height drag persists an integer pixel height', async () => {
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-height-row.0.item.0');

    firePointerDown(handle, { clientX: 400, clientY: 195, shiftKey: true });
    firePointer('pointermove', { clientX: 400, clientY: 288, shiftKey: true });
    firePointer('pointerup', { clientX: 400, clientY: 288, shiftKey: true });

    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(1));
    const persisted = saveDashboard.mock.calls[0][1];
    expect(typeof persisted.rows[0].height).toBe('number');
    expect(Number.isInteger(persisted.rows[0].height)).toBe(true);
  });

  test('a tick-mode height drag persists a HeightEnum token', async () => {
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-height-row.0.item.0');

    firePointerDown(handle, { clientX: 400, clientY: 195 });
    firePointer('pointermove', { clientX: 400, clientY: 335 });
    firePointer('pointerup', { clientX: 400, clientY: 335 });

    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(1));
    const persisted = saveDashboard.mock.calls[0][1];
    expect(typeof persisted.rows[0].height).toBe('string');
    expect(['compact', 'xsmall', 'small', 'medium', 'large', 'xlarge', 'xxlarge']).toContain(
      persisted.rows[0].height
    );
  });
});
