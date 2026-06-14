/**
 * SourceErd — the Source object's ERD Canvas lens (VIS-1005).
 *
 * Renders one node per table from the mocked `sources_metadata` feed, and shows
 * graceful loading / empty / connection-failed / unavailable states instead of
 * an infinite spinner. React-Flow + dagre are mocked (the lineage tests' pattern).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import SourceErd from './SourceErd';
import {
  setGlobalURLConfig,
  createURLConfig,
} from '../../../../contexts/URLContext';

// Mock the metadata feed.
jest.mock('../../../../api/explorer', () => ({
  fetchSourceMetadata: jest.fn(),
}));
const { fetchSourceMetadata } = require('../../../../api/explorer');

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

const SRC = 'analytics_db';

const CONNECTED = {
  sources: [
    {
      name: SRC,
      type: 'postgresql',
      status: 'connected',
      databases: [
        {
          name: 'main',
          schemas: [
            {
              name: 'public',
              tables: [
                { name: 'orders', columns: ['id', 'amount'] },
                { name: 'users', columns: ['id', 'email'] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const EMPTY_CONNECTED = {
  sources: [{ name: SRC, type: 'duckdb', status: 'connected', databases: [] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  setGlobalURLConfig(createURLConfig({ environment: 'server' }));
  fetchSourceMetadata.mockResolvedValue(CONNECTED);
});

afterEach(() => {
  setGlobalURLConfig(createURLConfig({ environment: 'server' }));
});

describe('SourceErd (VIS-1005)', () => {
  test('renders one ERD node per table from the mocked metadata', async () => {
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd')).toBeInTheDocument();
    expect(await screen.findByTestId('source-erd-node-orders')).toBeInTheDocument();
    expect(screen.getByTestId('source-erd-node-users')).toBeInTheDocument();
  });

  test('shows the empty state for a connected source with no tables', async () => {
    fetchSourceMetadata.mockResolvedValue(EMPTY_CONNECTED);
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('source-erd')).not.toBeInTheDocument();
  });

  test('shows the connection-failed state when the source is missing from the feed', async () => {
    fetchSourceMetadata.mockResolvedValue({ sources: [] });
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd-connection-failed')).toBeInTheDocument();
  });

  test('shows the connection-failed state when introspection throws', async () => {
    fetchSourceMetadata.mockRejectedValue(new Error('boom'));
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd-connection-failed')).toBeInTheDocument();
  });

  test('renders the unavailable state on the dist build (no fetch)', async () => {
    setGlobalURLConfig(createURLConfig({ environment: 'dist' }));
    render(<SourceErd activeObject={{ type: 'source', name: SRC }} />);

    expect(await screen.findByTestId('source-erd-unavailable')).toBeInTheDocument();
    expect(fetchSourceMetadata).not.toHaveBeenCalled();
  });
});
