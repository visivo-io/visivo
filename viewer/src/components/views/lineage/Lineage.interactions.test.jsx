/* eslint-disable no-template-curly-in-string */
/**
 * Interaction-level tests for <Lineage> that the smoke suite
 * (Lineage.test.jsx) does not cover:
 *   - selector grammar graph traversal (`name+`, `+name`, `+name+`, commas),
 *   - scope-prop re-seeding vs manual override,
 *   - Escape handling (global document listener + the selector input),
 *   - drag-to-connect (onConnect) persisting a model's source ref,
 *   - edge deletion clearing a model's source,
 *   - node right-click round-trip (onNodeContextMenu),
 *   - fitView invocation after load,
 *   - computeLayout failure fallback,
 *   - MiniMap node coloring by status/object type.
 *
 * Conventions match Lineage.test.jsx: the store module and useLineageDag are
 * jest-mocked, and reactflow is replaced with a harness that exposes the
 * callbacks Lineage wires up.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Lineage from './Lineage';
import useStore from '../../../stores/store';
import { useLineageDag, computeLayout } from './useLineageDag';

jest.mock('../../../stores/store');

jest.mock('./useLineageDag', () => ({
  useLineageDag: jest.fn(),
  computeLayout: jest.fn(nodes =>
    nodes.map((node, index) => ({ ...node, position: { x: index * 200, y: 100 } }))
  ),
}));

// Reactflow harness: renders nodes/edges as testable divs and exposes the
// interaction callbacks (connect / edge delete / context menu / init) so the
// tests can drive them. The MiniMap stub invokes the nodeColor prop against
// representative nodes and renders the resolved colors for assertion.
jest.mock('reactflow', () => {
  const React = require('react');
  const fitViewSpy = jest.fn();

  const MockReactFlow = ({
    nodes,
    edges,
    onNodeClick,
    onNodeContextMenu,
    onConnect,
    onEdgesDelete,
    onInit,
    children,
  }) => {
    React.useEffect(() => {
      if (onInit) onInit({ fitView: fitViewSpy });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div data-testid="react-flow">
        {nodes.map(node => (
          <div
            key={node.id}
            data-testid={`node-${node.id}`}
            onClick={e => onNodeClick && onNodeClick(e, node)}
            onContextMenu={e => onNodeContextMenu && onNodeContextMenu(e, node)}
          >
            {node.data.name}
          </div>
        ))}
        {edges.map(edge => (
          <div key={edge.id} data-testid={`edge-${edge.id}`} />
        ))}
        <button
          data-testid="rf-connect-valid"
          onClick={() => onConnect && onConnect({ source: 'source-db', target: 'model-users' })}
        />
        <button
          data-testid="rf-connect-invalid"
          onClick={() => onConnect && onConnect({ source: 'model-users', target: 'insight-i1' })}
        />
        <button
          data-testid="rf-delete-edges"
          onClick={() =>
            onEdgesDelete &&
            onEdgesDelete([
              { id: 'e1', source: 'source-db', target: 'model-users' },
              { id: 'e2', source: 'model-users', target: 'insight-i1' },
            ])
          }
        />
        {children}
      </div>
    );
  };
  MockReactFlow.displayName = 'MockReactFlow';

  const MiniMap = ({ nodeColor }) => (
    <div data-testid="minimap">
      {nodeColor &&
        [
          { key: 'new', data: { status: 'new', objectType: 'source' } },
          { key: 'modified', data: { status: 'modified', objectType: 'source' } },
          { key: 'published-source', data: { status: 'published', objectType: 'source' } },
          { key: 'unknown-type', data: { objectType: 'not-a-type' } },
        ].map(sample => (
          <span key={sample.key} data-testid={`minimap-color-${sample.key}`}>
            {nodeColor(sample)}
          </span>
        ))}
    </div>
  );

  return {
    __esModule: true,
    default: MockReactFlow,
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    MiniMap,
    __fitViewSpy: fitViewSpy,
  };
});

const { __fitViewSpy: fitViewSpy } = jest.requireMock('reactflow');

const SELECTOR_PLACEHOLDER = "e.g., 'source_name', 'model_name', or '+name+'";

// db → users → i1, plus a dangling edge from a node that is not in the DAG
// (exercises the adjacency-list guards during traversal).
const GRAPH_NODES = [
  { id: 'source-db', data: { name: 'db', objectType: 'source' } },
  { id: 'model-users', data: { name: 'users', objectType: 'model' } },
  { id: 'insight-i1', data: { name: 'i1', objectType: 'insight' } },
];
const GRAPH_EDGES = [
  { id: 'e1', source: 'source-db', target: 'model-users' },
  { id: 'e2', source: 'model-users', target: 'insight-i1' },
  { id: 'e-ghost', source: 'ghost-x', target: 'model-users' },
];

describe('Lineage interactions', () => {
  let storeState;
  const mockSaveModel = jest.fn();
  const mockFetchModels = jest.fn();

  const setStore = overrides => {
    storeState = { ...storeState, ...overrides };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveModel.mockResolvedValue();
    mockFetchModels.mockResolvedValue();

    storeState = {
      sources: [],
      fetchSources: jest.fn().mockResolvedValue(),
      sourcesError: null,
      models: [{ name: 'users', config: { sql: 'SELECT 1' } }],
      fetchModels: mockFetchModels,
      saveModel: mockSaveModel,
      dimensions: [],
      fetchDimensions: jest.fn().mockResolvedValue(),
      metrics: [],
      fetchMetrics: jest.fn().mockResolvedValue(),
      relations: [],
      fetchRelations: jest.fn().mockResolvedValue(),
      insights: [],
      fetchInsights: jest.fn().mockResolvedValue(),
      markdowns: [],
      fetchMarkdowns: jest.fn().mockResolvedValue(),
      charts: [],
      fetchCharts: jest.fn().mockResolvedValue(),
      tables: [],
      fetchTables: jest.fn().mockResolvedValue(),
      dashboards: [{ name: 'd1' }],
      fetchDashboards: jest.fn().mockResolvedValue(),
      csvScriptModels: [],
      fetchCsvScriptModels: jest.fn().mockResolvedValue(),
      localMergeModels: [],
      fetchLocalMergeModels: jest.fn().mockResolvedValue(),
      inputs: [],
      fetchInputs: jest.fn().mockResolvedValue(),
      defaults: { source_name: 'db' },
      fetchDefaults: jest.fn().mockResolvedValue(),
    };

    useStore.mockImplementation(selector =>
      typeof selector === 'function' ? selector(storeState) : storeState
    );
    useLineageDag.mockReturnValue({ nodes: GRAPH_NODES, edges: GRAPH_EDGES });
  });

  const getSelectorInput = () => screen.getByPlaceholderText(SELECTOR_PLACEHOLDER);

  describe('selector grammar traversal', () => {
    it("'name+' shows the node and all its descendants", () => {
      render(<Lineage scopeSelector="*" />);
      fireEvent.change(getSelectorInput(), { target: { value: 'db+' } });

      expect(screen.getByTestId('node-source-db')).toBeInTheDocument();
      expect(screen.getByTestId('node-model-users')).toBeInTheDocument();
      expect(screen.getByTestId('node-insight-i1')).toBeInTheDocument();
    });

    it("'+name' shows the node and all its ancestors", () => {
      render(<Lineage scopeSelector="*" />);
      fireEvent.change(getSelectorInput(), { target: { value: '+i1' } });

      expect(screen.getByTestId('node-insight-i1')).toBeInTheDocument();
      expect(screen.getByTestId('node-model-users')).toBeInTheDocument();
      expect(screen.getByTestId('node-source-db')).toBeInTheDocument();
    });

    it("'+name+' shows ancestors and descendants of the middle node", () => {
      render(<Lineage scopeSelector="*" />);
      fireEvent.change(getSelectorInput(), { target: { value: '+users+' } });

      expect(screen.getByTestId('node-source-db')).toBeInTheDocument();
      expect(screen.getByTestId('node-model-users')).toBeInTheDocument();
      expect(screen.getByTestId('node-insight-i1')).toBeInTheDocument();
    });

    it('a plain name selects only that node and hides edges to hidden nodes', () => {
      render(<Lineage scopeSelector="*" />);

      // All edges between visible nodes render initially.
      expect(screen.getByTestId('edge-e1')).toBeInTheDocument();
      expect(screen.getByTestId('edge-e2')).toBeInTheDocument();

      fireEvent.change(getSelectorInput(), { target: { value: 'users' } });

      expect(screen.getByTestId('node-model-users')).toBeInTheDocument();
      expect(screen.queryByTestId('node-source-db')).not.toBeInTheDocument();
      expect(screen.queryByTestId('node-insight-i1')).not.toBeInTheDocument();
      // Edges touching hidden nodes are filtered out.
      expect(screen.queryByTestId('edge-e1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edge-e2')).not.toBeInTheDocument();
    });

    it('comma-separated parts union their matches', () => {
      render(<Lineage scopeSelector="*" />);
      fireEvent.change(getSelectorInput(), { target: { value: 'db, i1' } });

      expect(screen.getByTestId('node-source-db')).toBeInTheDocument();
      expect(screen.getByTestId('node-insight-i1')).toBeInTheDocument();
      expect(screen.queryByTestId('node-model-users')).not.toBeInTheDocument();
    });
  });

  describe('scope prop re-seeding', () => {
    it('re-seeds the selector when the scope prop changes, and normalises `*` to empty', () => {
      const { rerender } = render(<Lineage scopeSelector="+db" />);
      expect(getSelectorInput().value).toBe('+db');

      rerender(<Lineage scopeSelector="*" />);
      expect(getSelectorInput().value).toBe('');
    });

    it('keeps a manual override across re-renders while the scope is unchanged', () => {
      const { rerender } = render(<Lineage scopeSelector="*" />);
      fireEvent.change(getSelectorInput(), { target: { value: 'users' } });

      rerender(<Lineage scopeSelector="*" />);
      expect(getSelectorInput().value).toBe('users');
    });
  });

  describe('Escape handling', () => {
    it('clears the selector on a global Escape when focus is outside inputs', () => {
      render(<Lineage scopeSelector="*" />);
      fireEvent.change(getSelectorInput(), { target: { value: 'users' } });
      expect(screen.queryByTestId('node-source-db')).not.toBeInTheDocument();

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(getSelectorInput().value).toBe('');
      // Full graph is visible again.
      expect(screen.getByTestId('node-source-db')).toBeInTheDocument();
    });

    it('clears and blurs the selector input when Escape is pressed inside it', () => {
      render(<Lineage scopeSelector="*" />);
      const input = getSelectorInput();
      input.focus();
      fireEvent.change(input, { target: { value: 'users' } });

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(input.value).toBe('');
      expect(input).not.toHaveFocus();
    });
  });

  describe('node click + manual edit interplay', () => {
    it('clicking a node seeds `+name+` and manual typing then replaces it', () => {
      render(<Lineage scopeSelector="*" />);
      fireEvent.click(screen.getByTestId('node-source-db'));
      expect(getSelectorInput().value).toBe('+db+');

      // Manual edit takes over (and clears the fixed-node pin).
      fireEvent.change(getSelectorInput(), { target: { value: 'users' } });
      expect(getSelectorInput().value).toBe('users');
      expect(screen.getByTestId('node-model-users')).toBeInTheDocument();
    });
  });

  describe('drag-to-connect (onConnect)', () => {
    it('persists a source→model connection as a `${ref(...)}` on the model', async () => {
      setStore({
        sources: [{ name: 'db' }],
      });
      render(<Lineage scopeSelector="*" />);

      fireEvent.click(screen.getByTestId('rf-connect-valid'));

      await waitFor(() =>
        expect(mockSaveModel).toHaveBeenCalledWith('users', {
          name: 'users',
          sql: 'SELECT 1',
          source: '${ref(db)}',
        })
      );
      expect(mockFetchModels).toHaveBeenCalled();
    });

    it('ignores connections that are not source→model', () => {
      render(<Lineage scopeSelector="*" />);
      fireEvent.click(screen.getByTestId('rf-connect-invalid'));
      expect(mockSaveModel).not.toHaveBeenCalled();
    });

    it('does nothing when the target model cannot be found in the store', async () => {
      setStore({ models: [] });
      render(<Lineage scopeSelector="*" />);

      fireEvent.click(screen.getByTestId('rf-connect-valid'));

      await waitFor(() => expect(mockSaveModel).not.toHaveBeenCalled());
    });
  });

  describe('edge deletion (onEdgesDelete)', () => {
    it('clears the source on models whose incoming edge was deleted, skipping non-model targets', async () => {
      render(<Lineage scopeSelector="*" />);

      fireEvent.click(screen.getByTestId('rf-delete-edges'));

      await waitFor(() =>
        expect(mockSaveModel).toHaveBeenCalledWith('users', {
          name: 'users',
          sql: 'SELECT 1',
          source: null,
        })
      );
      // Only the model-targeted edge triggers a save; the insight edge is skipped.
      expect(mockSaveModel).toHaveBeenCalledTimes(1);
      expect(mockFetchModels).toHaveBeenCalled();
    });

    it('still refreshes models when no deleted edge matches a known model', async () => {
      setStore({ models: [] });
      render(<Lineage scopeSelector="*" />);

      fireEvent.click(screen.getByTestId('rf-delete-edges'));

      await waitFor(() => expect(mockFetchModels).toHaveBeenCalled());
      expect(mockSaveModel).not.toHaveBeenCalled();
    });
  });

  describe('node context menu round-trip', () => {
    it('prevents the default menu and hands { type, name } to the host handler', () => {
      const onNodeContextMenu = jest.fn();
      render(<Lineage scopeSelector="*" onNodeContextMenu={onNodeContextMenu} />);

      fireEvent.contextMenu(screen.getByTestId('node-source-db'));

      expect(onNodeContextMenu).toHaveBeenCalledTimes(1);
      const [event, identity] = onNodeContextMenu.mock.calls[0];
      expect(identity).toEqual({ type: 'source', name: 'db' });
      expect(event.defaultPrevented).toBe(true);
    });

    it('is a no-op when no host handler is provided', () => {
      render(<Lineage scopeSelector="*" />);
      expect(() =>
        fireEvent.contextMenu(screen.getByTestId('node-source-db'))
      ).not.toThrow();
    });
  });

  describe('layout + viewport', () => {
    it('fits the view once nodes are rendered', async () => {
      render(<Lineage scopeSelector="*" />);
      await waitFor(() =>
        expect(fitViewSpy).toHaveBeenCalledWith({ padding: 0.2, duration: 800 })
      );
    });

    it('falls back to unpositioned nodes when computeLayout throws', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      computeLayout.mockImplementationOnce(() => {
        throw new Error('dagre exploded');
      });

      render(<Lineage scopeSelector="*" />);

      // Nodes still render (unlaid-out fallback) and the error is reported.
      expect(screen.getByTestId('node-source-db')).toBeInTheDocument();
      expect(consoleError).toHaveBeenCalledWith('Error computing layout:', expect.any(Error));
      consoleError.mockRestore();
    });
  });

  describe('MiniMap node coloring', () => {
    it('colors by status first, then the object type handle color, then gray fallback', () => {
      render(<Lineage scopeSelector="*" />);

      expect(screen.getByTestId('minimap-color-new')).toHaveTextContent('#22c55e');
      expect(screen.getByTestId('minimap-color-modified')).toHaveTextContent('#f59e0b');
      // Published source falls through to the shared objectTypeConfigs handle color.
      expect(screen.getByTestId('minimap-color-published-source')).toHaveTextContent('#f97316');
      // Unknown object types get the neutral gray.
      expect(screen.getByTestId('minimap-color-unknown-type')).toHaveTextContent('#94a3b8');
    });
  });
});
