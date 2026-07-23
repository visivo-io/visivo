/**
 * LeftRail collapsed-strip tests.
 *
 * The collapsed 48-px icon strip renders interactive-looking buttons
 * (hover/title/testid). They must not be dead affordances: clicking one
 * expands the rail AND applies the selection — a type button lands on that
 * type's Library subsection (section + subsection expanded), the search
 * button focuses the Library search input.
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import {
  createMemoryRouter,
  Route,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { futureFlags } from '../../../router-config';
import LeftRail from './LeftRail';
import useStore from '../../../stores/store';

const seedStore = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceLeftCollapsed: true,
      workspaceActiveObject: null,
      libraryCollapsedSections: {},
      libraryCollapsedSubsections: {},
      charts: [],
      tables: [],
      markdowns: [],
      inputs: [],
      dashboards: [],
      sources: [],
      models: [],
      csvScriptModels: [],
      localMergeModels: [],
      dimensions: [],
      metrics: [],
      relations: [],
      insights: [],
      openWorkspaceTab: jest.fn(),
      createWorkspaceObject: jest.fn().mockResolvedValue({ success: true, name: 'stub' }),
      ...extra,
    });
  });
};

const renderRail = () => {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <Route
        path="/workspace"
        element={
          <DndContext>
            <LeftRail />
          </DndContext>
        }
      />
    ),
    { initialEntries: ['/workspace'], future: futureFlags }
  );
  return render(<RouterProvider router={router} future={futureFlags} />);
};

describe('LeftRail collapsed strip', () => {
  beforeEach(() => {
    seedStore();
  });

  test('clicking a collapsed Data-Layer type button expands the rail and opens that subsection (dead-affordance regression)', () => {
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-left-rail-collapsed-model'));
    expect(useStore.getState().workspaceLeftCollapsed).toBe(false);
    // The Library mounts (flat list) with the Models subsection open.
    expect(screen.getByTestId('library-subsection-model')).toHaveAttribute(
      'data-collapsed',
      'false'
    );
  });

  test('clicking a collapsed Layout-Items type button opens its subsection', () => {
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-left-rail-collapsed-chart'));
    expect(useStore.getState().workspaceLeftCollapsed).toBe(false);
    expect(screen.getByTestId('library-subsection-chart')).toHaveAttribute(
      'data-collapsed',
      'false'
    );
  });

  test('clicking the collapsed search button expands the rail and focuses the Library search', async () => {
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-left-rail-collapsed-search'));
    expect(useStore.getState().workspaceLeftCollapsed).toBe(false);
    await waitFor(() => expect(screen.getByTestId('library-search')).toHaveFocus());
  });

  test('renders the collapsed destination switcher above the type-button strip (D1, Explore 2.0 Phase 0)', () => {
    seedStore({ workspaceActiveView: 'project' });
    renderRail();
    const switcher = screen.getByTestId('workspace-view-switcher');
    expect(switcher).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByTestId('workspace-view-switcher-project')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-view-switcher-semantic-layer')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-view-switcher-explorer')).toBeInTheDocument();
  });
});
