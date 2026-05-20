/**
 * Library behaviour (VIS-769 + VIS-773 + VIS-776 / Track C C1 + C2 + C3).
 *
 * Mounts the full Library inside a router + dnd-kit context. Pins:
 *   - The five sections rendering with the right counts.
 *   - Drag handle visibility for draggable sections (Insert / Charts /
 *     Insights) vs click-to-edit sections (Models / Sources).
 *   - "+ New X" buttons present only for the four data-editor sections.
 *   - Row click delegates to `openWorkspaceTab`.
 *   - "+ New X" delegates to the corresponding store opener.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  createMemoryRouter,
  Route,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { futureFlags } from '../../../../router-config';
import Library from './Library';
import useStore from '../../../../stores/store';
import { setWorkspaceTelemetryListener } from '../telemetry';

const renderLibrary = (entry = '/workspace') => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/workspace" element={<DndContext><Library /></DndContext>} />
        <Route
          path="/workspace/dashboard/:dashboardName"
          element={<DndContext><Library /></DndContext>}
        />
      </>
    ),
    { initialEntries: [entry], future: futureFlags }
  );
  return render(<RouterProvider router={router} future={futureFlags} />);
};

const seedStore = (extra = {}) => {
  act(() => {
    useStore.setState({
      charts: [{ name: 'waterfall' }, { name: 'fibonacci_chart' }],
      insights: [{ name: 'revenue_growth' }],
      models: [{ name: 'monthly_revenue' }],
      csvScriptModels: [],
      localMergeModels: [],
      sources: [{ name: 'local-duck', type: 'duckdb' }],
      // Stub the workspace tab actions so the test can assert on calls.
      openWorkspaceTab: jest.fn(),
      // Stub create modal openers so handleCreate doesn't throw.
      openCreateModal: jest.fn(),
      openCreateModelModal: jest.fn(),
      openCreateChartModal: jest.fn(),
      openCreateInsightModal: jest.fn(),
      ...extra,
    });
  });
};

describe('Library', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedStore();
  });

  test('renders all five sections with the correct row counts', () => {
    renderLibrary();
    expect(screen.getByTestId('library-section-insert-count')).toHaveTextContent('(4)');
    expect(screen.getByTestId('library-section-charts-count')).toHaveTextContent('(2)');
    expect(screen.getByTestId('library-section-insights-count')).toHaveTextContent('(1)');
    expect(screen.getByTestId('library-section-models-count')).toHaveTextContent('(1)');
    expect(screen.getByTestId('library-section-sources-count')).toHaveTextContent('(1)');
  });

  test('renders the four Insert primitives', () => {
    renderLibrary();
    expect(screen.getByTestId('library-row-insert-Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-insert-Row')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-insert-Item')).toBeInTheDocument();
    expect(screen.getByTestId('library-row-insert-Markdown')).toBeInTheDocument();
  });

  test('shows "+ New X" buttons only on Charts, Insights, Models, and Sources', () => {
    renderLibrary();
    expect(screen.queryByTestId('library-section-insert-create')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-section-charts-create')).toHaveTextContent('New Chart');
    expect(screen.getByTestId('library-section-insights-create')).toHaveTextContent(
      'New Insight'
    );
    expect(screen.getByTestId('library-section-models-create')).toHaveTextContent('New Model');
    expect(screen.getByTestId('library-section-sources-create')).toHaveTextContent('New Source');
  });

  test('Insert + Charts + Insights rows expose drag handles; Models + Sources do not', () => {
    renderLibrary();
    fireEvent.mouseEnter(screen.getByTestId('library-row-chart-waterfall'));
    expect(
      screen.getByTestId('library-row-chart-waterfall-drag-handle')
    ).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('library-row-insight-revenue_growth'));
    expect(
      screen.getByTestId('library-row-insight-revenue_growth-drag-handle')
    ).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('library-row-model-monthly_revenue'));
    expect(
      screen.queryByTestId('library-row-model-monthly_revenue-drag-handle')
    ).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('library-row-source-local-duck'));
    expect(
      screen.queryByTestId('library-row-source-local-duck-drag-handle')
    ).not.toBeInTheDocument();
  });

  test('clicking a chart row delegates to openWorkspaceTab', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-row-chart-waterfall'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'chart:waterfall',
      type: 'chart',
      name: 'waterfall',
    });
  });

  test('clicking an Insert primitive is a no-op (no tab opens)', () => {
    const openWorkspaceTab = jest.fn();
    seedStore({ openWorkspaceTab });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-row-insert-Dashboard'));
    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });

  test('"+ New Chart" calls the chart create-modal opener', () => {
    const openCreateChartModal = jest.fn();
    seedStore({ openCreateChartModal });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-section-charts-create'));
    expect(openCreateChartModal).toHaveBeenCalledTimes(1);
  });

  test('"+ New Source" calls the source create-modal opener', () => {
    const openCreateModal = jest.fn();
    seedStore({ openCreateModal });
    renderLibrary();
    fireEvent.click(screen.getByTestId('library-section-sources-create'));
    expect(openCreateModal).toHaveBeenCalledTimes(1);
  });

  test('shows the empty placeholder when a section has no rows', () => {
    seedStore({ charts: [], insights: [], models: [], sources: [] });
    renderLibrary();
    expect(screen.getByTestId('library-section-charts-empty')).toHaveTextContent(
      'No charts yet'
    );
    expect(screen.getByTestId('library-section-sources-empty')).toHaveTextContent(
      'No sources yet'
    );
  });

  test('fires the inline_create_used telemetry event when "+ New X" is clicked', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener((evt) => events.push(evt));
    try {
      renderLibrary();
      fireEvent.click(screen.getByTestId('library-section-charts-create'));
      const created = events.filter((e) => e.eventName === 'inline_create_used');
      expect(created).toHaveLength(1);
      expect(created[0].payload).toEqual({ source: 'library', kind: 'chart' });
    } finally {
      unsubscribe();
    }
  });
});
