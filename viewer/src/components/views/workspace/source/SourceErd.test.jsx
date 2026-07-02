/**
 * SourceErd — the Source object's ERD Canvas lens (VIS-1005).
 *
 * Renders one node per table from the BACKEND-CACHED schema feed (the same
 * `source-schema-jobs` endpoints SourceBrowser + useSourceOutline read), and
 * shows graceful loading / no-cache / empty / unavailable states instead of an
 * infinite spinner. React-Flow + dagre are mocked (the lineage tests' pattern).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SourceErd from './SourceErd';
import {
  setGlobalURLConfig,
  createURLConfig,
} from '../../../../contexts/URLContext';

// Mock the cached-schema feed.
jest.mock('../../../../api/sourceSchemaJobs', () => ({
  fetchSourceSchemaJobs: jest.fn(),
  fetchSourceTables: jest.fn(),
  fetchTableColumns: jest.fn(),
}));
const {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
} = require('../../../../api/sourceSchemaJobs');

// Mock computeLayout (dagre) — return the nodes with dummy positions.
jest.mock('../../lineage/useLineageDag', () => ({
  computeLayout: jest.fn(nodes => nodes.map((n, i) => ({ ...n, position: { x: i * 200, y: 0 } }))),
}));
const { computeLayout } = require('../../lineage/useLineageDag');

// Mock reactflow — render each node through its registered node-type component
// so TableErdNode's `source-erd-node-<table>` testids appear. Node wrappers
// forward the context-menu gesture and `onInit` hands back a fitView spy so the
// post-load fit is observable.
const mockRfFitView = jest.fn();
jest.mock('reactflow', () => {
  const React = require('react');
  const MockReactFlow = ({ nodes, nodeTypes, children, onNodeContextMenu, onInit }) => {
    React.useEffect(() => {
      if (onInit) onInit({ fitView: mockRfFitView });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div data-testid="react-flow">
        {nodes.map(node => {
          const Cmp = nodeTypes[node.type];
          return (
            <div
              key={node.id}
              data-testid={`rf-node-wrapper-${node.id}`}
              onContextMenu={e => onNodeContextMenu && onNodeContextMenu(e, node)}
            >
              {Cmp ? <Cmp data={node.data} /> : null}
            </div>
          );
        })}
        {children}
      </div>
    );
  };
  return {
    __esModule: true,
    default: MockReactFlow,
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    MiniMap: () => <div data-testid="minimap" />,
    ReactFlowProvider: ({ children }) => <div>{children}</div>,
    Handle: () => <div data-testid="rf-handle" />,
  };
});

const SRC = 'local-duckdb';

beforeEach(() => {
  jest.clearAllMocks();
  setGlobalURLConfig(createURLConfig({ environment: 'server' }));
  // Warm (cached) source with two tables by default.
  fetchSourceSchemaJobs.mockResolvedValue([{ source_name: SRC, has_cached_schema: true }]);
  fetchSourceTables.mockResolvedValue([
    { name: 'orders', column_count: 2 },
    { name: 'users', column_count: 2 },
  ]);
  fetchTableColumns.mockResolvedValue([
    { name: 'id', type: 'INTEGER' },
    { name: 'amount', type: 'DOUBLE' },
  ]);
});

afterEach(() => {
  setGlobalURLConfig(createURLConfig({ environment: 'server' }));
});

describe('SourceErd (VIS-1005)', () => {
  test('renders one ERD node per table from the cached schema', async () => {
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd')).toBeInTheDocument();
    expect(await screen.findByTestId('source-erd-node-orders')).toBeInTheDocument();
    expect(screen.getByTestId('source-erd-node-users')).toBeInTheDocument();
    // It reads the cached feed, never the live introspect.
    expect(fetchSourceTables).toHaveBeenCalledWith(SRC);
  });

  test('passes column-aware layoutSize heights to computeLayout so tall tables do not overlap', async () => {
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);
    await screen.findByTestId('source-erd');

    // computeLayout honours node.layoutSize — each table node must carry its
    // measured height (44 header + 2 columns × 24), not a dead `__height` prop.
    const [nodes] = computeLayout.mock.calls.at(-1);
    expect(nodes).toHaveLength(2);
    nodes.forEach(node => {
      expect(node.layoutSize).toEqual({ height: 44 + 2 * 24 });
      expect(node.__height).toBeUndefined();
    });
  });

  test('clears the previous source ERD while the next source loads (no stale nodes)', async () => {
    const { rerender } = render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);
    expect(await screen.findByTestId('source-erd-node-orders')).toBeInTheDocument();

    // Switch to another source whose load never resolves — the OLD source's
    // ERD must NOT keep rendering through the load window (its nodes would be
    // stamped with the new sourceName, mis-targeting the context menu).
    fetchSourceSchemaJobs.mockImplementation(() => new Promise(() => {}));
    rerender(<SourceErd activeObject={{ type: 'source', name: 'other-source' }} />);

    expect(await screen.findByTestId('source-erd-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('source-erd-node-orders')).not.toBeInTheDocument();
  });

  test('shows the empty state for a cached source with no tables', async () => {
    fetchSourceTables.mockResolvedValue([]);
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('source-erd')).not.toBeInTheDocument();
  });

  test('shows the no-cache state when the source has no cached schema', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: SRC, has_cached_schema: false }]);
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd-connection-failed')).toBeInTheDocument();
    // It never fetches tables for a source with no cached schema.
    expect(fetchSourceTables).not.toHaveBeenCalled();
  });

  test('shows the connection-failed state when the cached load throws', async () => {
    fetchSourceSchemaJobs.mockRejectedValue(new Error('boom'));
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd-connection-failed')).toBeInTheDocument();
  });

  test('renders the unavailable state on the dist build (no fetch)', async () => {
    setGlobalURLConfig(createURLConfig({ environment: 'dist' }));
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd-unavailable')).toBeInTheDocument();
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
  });

  test('a broken availability check degrades to "available" (bare-mount fallback)', async () => {
    // No usable global URL config (e.g. a bare unit-test mount) → isAvailable
    // throws → the canvas still renders from the (mocked) feed.
    setGlobalURLConfig({
      isAvailable: () => {
        throw new Error('no global config');
      },
    });
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);
    expect(await screen.findByTestId('source-erd')).toBeInTheDocument();
    expect(fetchSourceSchemaJobs).toHaveBeenCalled();
  });

  test('a per-table column fetch failure degrades that table to zero columns', async () => {
    fetchTableColumns.mockImplementation((_src, table) =>
      table === 'orders'
        ? Promise.reject(new Error('cols boom'))
        : Promise.resolve([{ name: 'id', type: 'INTEGER' }])
    );
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    // Both tables still diagram; the failed one just has no column rows.
    expect(await screen.findByTestId('source-erd-node-orders')).toBeInTheDocument();
    expect(screen.getByTestId('source-erd-node-users')).toBeInTheDocument();
    const [nodes] = computeLayout.mock.calls.at(-1);
    const orders = nodes.find(n => n.data.table === 'orders');
    const users = nodes.find(n => n.data.table === 'users');
    expect(orders.data.columns).toEqual([]);
    expect(users.data.columns).toHaveLength(1);
  });

  test('falls back to a simple grid layout when dagre throws', async () => {
    computeLayout.mockImplementation(() => {
      throw new Error('dagre exploded');
    });
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    // The ERD still renders every table instead of crashing the canvas.
    expect(await screen.findByTestId('source-erd-node-orders')).toBeInTheDocument();
    expect(screen.getByTestId('source-erd-node-users')).toBeInTheDocument();
  });

  test('fits the view shortly after the nodes load', async () => {
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);
    await screen.findByTestId('source-erd');
    await waitFor(() =>
      expect(mockRfFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 600 })
    );
  });

  test('right-clicking a table opens the table context menu; outside click dismisses it', async () => {
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);
    await screen.findByTestId('source-erd-node-orders');

    fireEvent.contextMenu(
      screen.getByTestId(`rf-node-wrapper-source-erd::${SRC}::orders`),
      { clientX: 120, clientY: 80 }
    );
    expect(screen.getByTestId('erd-table-ctx-menu')).toBeInTheDocument();
    // The menu targets the right-clicked table.
    expect(screen.getByTestId('erd-table-ctx-menu')).toHaveTextContent(/orders/);

    // The OpenObjectContextMenu dismiss contract: outside pointer-down closes it.
    act(() => {
      document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(screen.queryByTestId('erd-table-ctx-menu')).not.toBeInTheDocument();
  });
});
