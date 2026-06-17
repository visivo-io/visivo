/**
 * SourceErd — the Source object's ERD Canvas lens (VIS-1005).
 *
 * Renders one node per table from the BACKEND-CACHED schema feed (the same
 * `source-schema-jobs` endpoints SourceBrowser + useSourceOutline read), and
 * shows graceful loading / no-cache / empty / unavailable states instead of an
 * infinite spinner. React-Flow + dagre are mocked (the lineage tests' pattern).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
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

// Mock reactflow — render each node through its registered node-type component
// so TableErdNode's `source-erd-node-<table>` testids appear.
jest.mock('reactflow', () => {
  const React = require('react');
  const MockReactFlow = ({ nodes, nodeTypes, children }) => (
    <div data-testid="react-flow">
      {nodes.map(node => {
        const Cmp = nodeTypes[node.type];
        return <div key={node.id}>{Cmp ? <Cmp data={node.data} /> : null}</div>;
      })}
      {children}
    </div>
  );
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
});
