/**
 * Canvas commit-path regression tests (VIS-993 follow-up; #46).
 *
 * USER-REPORTED REGRESSION: after the validation gate replaced
 * sanitizeDashboardConfig, canvas drag-edits (row-height resize, item-width
 * resize, reorder, cross-row move, Library drop) appeared to work but never
 * reached the store. These tests drive the REAL pipeline end to end in jsdom:
 *
 *   REAL gesture transform (canvasReorder) → REAL mounted WorkspaceDndContext
 *   commit → the dashboard WORKING COPY (updateDashboardConfigOptimistic).
 *
 * #46: a canvas commit no longer auto-persists. `commitCanvasConfig` captures
 * the pre-edit baseline once and writes the gesture-produced config into the
 * working copy optimistically; the dashboard's Save footer persists it. So
 * these tests assert the config reaches the OPTIMISTIC committer byte-identical
 * (the transform is still what's under test), not a `saveDashboard` call.
 *
 * The dashboard fixture mirrors what `/api/dashboards/` actually serves for the
 * integration project's `simple-dashboard` — `model_dump(mode='json',
 * exclude_none=True, exclude={'file_path','path'})` — including EMBEDDED chart
 * objects (name + `${ref()}` insights + a Plotly layout), `${ref()}` string
 * leaves, empty slots, level/tags/type sidecar fields, and nested container
 * rows.
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
import { generateUniqueName } from '../../../utils/uniqueName';

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

/**
 * Mount the REAL provider and click-commit `config`. #46: the spy that receives
 * the committed config is the optimistic committer (`updateDashboardConfigOptimistic`),
 * returned as `committed` — a canvas commit writes the working copy, it does not
 * persist.
 */
const commitThroughProvider = config => {
  const committed = jest.fn();
  useStore.setState({ updateDashboardConfigOptimistic: committed });
  render(
    <WorkspaceDndContext>
      <CommitProbe name="simple-dashboard" config={config} />
    </WorkspaceDndContext>
  );
  fireEvent.click(screen.getByTestId('commit-probe'));
  return { committed };
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

describe('canvas gestures commit byte-identically to the dashboard working copy (#46)', () => {
  test('row-height FLUID resize (pixel int) commits byte-identical', () => {
    const next = setRowHeight(clone(API_SHAPED_CONFIG), 'row.0', 487);
    expect(next.rows[0].height).toBe(487);
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(committed.mock.calls[0][0]).toBe('simple-dashboard');
    expect(committed.mock.calls[0][1]).toBe(next); // byte-identical, never repaired
  });

  test('row-height TICK resize (enum token) commits', () => {
    const next = setRowHeight(clone(API_SHAPED_CONFIG), 'row.1', 'xlarge');
    expect(next.rows[1].height).toBe('xlarge');
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(committed.mock.calls[0][1]).toBe(next);
  });

  test('NESTED row-height resize (enum inside a container) commits', () => {
    const next = setRowHeight(clone(API_SHAPED_CONFIG), 'row.2.item.0.row.0', 'medium');
    expect(next.rows[2].items[0].rows[0].height).toBe('medium');
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
  });

  test('item-width resize commits byte-identical', () => {
    const next = setItemWidth(clone(API_SHAPED_CONFIG), 'row.0.item.0', 7);
    expect(next.rows[0].items[0].width).toBe(7);
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(committed.mock.calls[0][1]).toBe(next);
  });

  test('LEFT-edge width resize (column transfer with neighbour) commits', () => {
    const next = resizeItemFromLeft(clone(API_SHAPED_CONFIG), 'row.0', 1, 3);
    expect(next.rows[0].items[1].width).toBe(5);
    expect(next.rows[0].items[0].width).toBe(6);
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
  });

  test('top-level row reorder commits', () => {
    const next = reorderTopLevelRows(clone(API_SHAPED_CONFIG), 0, 1);
    expect(next.rows[0].height).toBe(512);
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
  });

  test('item reorder within a row commits', () => {
    const next = reorderItemsInRow(clone(API_SHAPED_CONFIG), 'row.0', 0, 2);
    expect(next.rows[0].items[2].chart?.name).toBe('a-very-fibonacci-waterfall');
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
  });

  test('cross-row item move commits (source row may go empty)', () => {
    const next = moveItemBetweenRows(clone(API_SHAPED_CONFIG), 'row.1', 0, {
      kind: 'end-of-row',
      rowPath: 'row.0',
    });
    expect(next.rows[0].items).toHaveLength(4);
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
  });

  test('Library chart drop (between-rows insert) commits', () => {
    const item = buildLibraryItem('chart', 'indicator-chart');
    const next = insertItemAtTarget(clone(API_SHAPED_CONFIG), { kind: 'between-rows', index: 3 }, item);
    expect(next.rows[3].items[0].chart).toBe('ref(indicator-chart)');
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
  });

  test('Library markdown drop into an existing row (between-items) commits', () => {
    const item = buildLibraryItem('markdown', 'welcome-md');
    const next = insertItemAtTarget(
      clone(API_SHAPED_CONFIG),
      { kind: 'between-items', rowPath: 'row.1', index: 1 },
      item
    );
    expect(next.rows[1].items[1].markdown).toBe('ref(welcome-md)');
    const { committed } = commitThroughProvider(next);
    expect(committed).toHaveBeenCalledTimes(1);
  });
});

describe('router → REAL commit integration (drag-end payloads commit to the working copy)', () => {
  const routerDeps = commitCanvasConfig => ({
    dashboards: [],
    projectDefaults: null,
    reassignDashboardLevel: jest.fn(),
    moveLevel: jest.fn(),
    commitCanvasConfig,
    emit: jest.fn(),
    // Mirrors the component's wrapInsight dep (auto-wrap on insight drop):
    // fresh store reads, same naming + save path as Library "Wrap in Chart…".
    wrapInsight: {
      mintChartName: insightName => {
        const existing = (useStore.getState().charts || []).map(c => c.name);
        return generateUniqueName(`${insightName}-chart`, existing, { separator: '-' });
      },
      createChart: (chartName, insightName) => {
        const save = useStore.getState().saveChart;
        if (save) save(chartName, { insights: [`ref(${insightName})`] });
      },
    },
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
    const committed = jest.fn();
    useStore.setState({ updateDashboardConfigOptimistic: committed });
    render(
      <WorkspaceDndContext>
        <RouterProbe event={event} />
      </WorkspaceDndContext>
    );
    fireEvent.click(screen.getByTestId('router-probe'));
    return committed;
  };

  test('a real drag-end row reorder routes through and commits', () => {
    const config = clone(API_SHAPED_CONFIG);
    const committed = driveRouter({
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
    expect(committed).toHaveBeenCalledTimes(1);
    const persisted = committed.mock.calls[0][1];
    expect(persisted.rows[0].height).toBe(512);
  });

  test('a real drag-end Library insert routes through and commits', () => {
    const config = clone(API_SHAPED_CONFIG);
    const committed = driveRouter({
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
    expect(committed).toHaveBeenCalledTimes(1);
    const persisted = committed.mock.calls[0][1];
    expect(persisted.rows[1].items[2].chart).toBe('ref(indicator-chart)');
  });

  test('an insight drop AUTO-WRAPS: mints a chart, saves it, places chart: ref(...) (B2)', () => {
    // Decision 27 Aug: items never take a bare insight — the drop mints a
    // wrapper chart and places THAT. Same naming/save path as Library
    // "Wrap in Chart…" (#632).
    const config = clone(API_SHAPED_CONFIG);
    const saveChart = jest.fn().mockResolvedValue({ success: true });
    useStore.setState({ charts: [], saveChart });
    const committed = driveRouter({
      active: { data: { current: { source: 'library', type: 'insight', name: 'rev-insight' } } },
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
    expect(committed).toHaveBeenCalledTimes(1);
    const persisted = committed.mock.calls[0][1];
    expect(persisted.rows[1].items[2].chart).toBe('ref(rev-insight-chart)');
    expect(persisted.rows[1].items[2].insight).toBeUndefined();
    expect(saveChart).toHaveBeenCalledWith('rev-insight-chart', {
      insights: ['ref(rev-insight)'],
    });
  });

  test('an insight drop disambiguates the wrapper name against existing charts', () => {
    const config = clone(API_SHAPED_CONFIG);
    const saveChart = jest.fn().mockResolvedValue({ success: true });
    useStore.setState({ charts: [{ name: 'rev-insight-chart' }], saveChart });
    const committed = driveRouter({
      active: { data: { current: { source: 'library', type: 'insight', name: 'rev-insight' } } },
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
    const persisted = committed.mock.calls[0][1];
    expect(persisted.rows[1].items[2].chart).toBe('ref(rev-insight-chart-2)');
    expect(saveChart).toHaveBeenCalledWith('rev-insight-chart-2', {
      insights: ['ref(rev-insight)'],
    });
  });

  test('a rejected insight drop mints NO chart (no orphan drafts)', () => {
    const config = clone(API_SHAPED_CONFIG);
    const saveChart = jest.fn();
    useStore.setState({ charts: [], saveChart });
    const committed = driveRouter({
      active: { data: { current: { source: 'library', type: 'insight', name: 'rev-insight' } } },
      over: {
        data: {
          current: {
            kind: 'canvas-drop',
            dashboardName: 'simple-dashboard',
            config,
            // A malformed target path → insertItemAtTarget returns the SAME
            // config reference, which the router treats as a rejected drop.
            target: { kind: 'on-item', rowPath: 'not-a-row-path' },
          },
        },
      },
    });
    expect(committed).not.toHaveBeenCalled();
    expect(saveChart).not.toHaveBeenCalled();
  });

  test('non-insight exploration drag types (metric) still never insert on the canvas', () => {
    const config = clone(API_SHAPED_CONFIG);
    const saveChart = jest.fn();
    useStore.setState({ charts: [], saveChart });
    const committed = driveRouter({
      active: { data: { current: { source: 'library', type: 'metric', name: 'churn_rate' } } },
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
    expect(committed).not.toHaveBeenCalled();
    expect(saveChart).not.toHaveBeenCalled();
  });

  test('a real drag-end cross-row item move routes through and commits', () => {
    const config = clone(API_SHAPED_CONFIG);
    const committed = driveRouter({
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
    expect(committed).toHaveBeenCalledTimes(1);
  });
});

describe('full-stack resize gesture → REAL provider commit (jsdom pointer drive)', () => {
  // Borrowed from CanvasResizeLayer.test.jsx, but WITHOUT mocking the commit
  // hook: the layer runs against the REAL WorkspaceDndContext provider with the
  // REAL optimistic write, so a resize exercises the exact production pipeline
  // down to the dashboard working copy (#46: no auto-persist — assert the store).
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

  const currentConfig = () =>
    useStore.getState().dashboards.find(d => d.name === 'simple-dashboard').config;

  beforeEach(() => {
    useStore.setState({
      dashboards: [{ name: 'simple-dashboard', config: clone(API_SHAPED_CONFIG) }],
      dashboardBaselines: {},
      workspaceOutlineSelectedKey: 'row.0.item.0',
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

  test('a real width drag on the handle commits the resized config to the working copy', async () => {
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-width-row.0.item.0');

    // 12 grid cols over an 800px row → ~66.7px/col. Drag LEFT ~2 columns.
    firePointerDown(handle, { clientX: 600, clientY: 100 });
    firePointer('pointermove', { clientX: 466, clientY: 100 });
    firePointer('pointerup', { clientX: 466, clientY: 100 });

    await waitFor(() => expect(currentConfig().rows[0].items[0].width).toBe(7));
    // #46: the pre-edit baseline was captured so the Save footer knows it's dirty.
    expect(useStore.getState().dashboardBaselines['simple-dashboard']).toBeDefined();
  });

  test('a real Shift-fluid height drag commits an integer pixel height', async () => {
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-height-row.0.item.0');

    firePointerDown(handle, { clientX: 400, clientY: 195, shiftKey: true });
    firePointer('pointermove', { clientX: 400, clientY: 288, shiftKey: true });
    firePointer('pointerup', { clientX: 400, clientY: 288, shiftKey: true });

    await waitFor(() => expect(typeof currentConfig().rows[0].height).toBe('number'));
    expect(Number.isInteger(currentConfig().rows[0].height)).toBe(true);
  });

  test('a tick-mode height drag commits a HeightEnum token', async () => {
    render(<Host />);
    const handle = screen.getByTestId('canvas-resize-height-row.0.item.0');

    firePointerDown(handle, { clientX: 400, clientY: 195 });
    firePointer('pointermove', { clientX: 400, clientY: 335 });
    firePointer('pointerup', { clientX: 400, clientY: 335 });

    await waitFor(() => expect(typeof currentConfig().rows[0].height).toBe('string'));
    expect(['compact', 'xsmall', 'small', 'medium', 'large', 'xlarge', 'xxlarge']).toContain(
      currentConfig().rows[0].height
    );
  });
});
