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
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';
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
import { LAYOUT_TYPES, DATA_TYPES } from './library/LibraryRow';

const seedStore = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceLeftCollapsed: true,
      // Reset explicitly: these persist across tests otherwise, and a leaked
      // open popout renders a SECOND Library (so a second view switcher).
      workspaceLeftMustCollapse: false,
      workspaceLeftOverlayOpen: false,
      workspaceActiveTabId: null,
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

  // The strip's icons ran Layout-Items-first while the expanded tree renders
  // Data-Layer-first (Library.jsx composes `[...DATA_TYPES, ...LAYOUT_TYPES]`),
  // so collapsing the rail silently reordered it.
  test('type icons appear in the same order as the expanded tree', () => {
    renderRail();
    const strip = screen.getByTestId('workspace-left-rail');
    const order = within(strip)
      .getAllByRole('button')
      .map(b => b.getAttribute('data-testid'))
      .filter(id => id && id.startsWith('workspace-left-rail-collapsed-'))
      .map(id => id.replace('workspace-left-rail-collapsed-', ''))
      .filter(t => t !== 'search');

    expect(order).toEqual([...DATA_TYPES, ...LAYOUT_TYPES]);
  });

  // On a viewport too narrow to seat the rail, expanding in flow would starve
  // the canvas — the shell measured that and collapsed it again on the very
  // next effect run, so every button in the strip looked dead.
  describe('when the viewport cannot seat the rail', () => {
    const seedNarrow = (extra = {}) =>
      seedStore({ workspaceLeftMustCollapse: true, ...extra });

    test('a type button pops the Library out over the content instead of doing nothing', () => {
      seedNarrow();
      renderRail();

      fireEvent.click(screen.getByTestId('workspace-left-rail-collapsed-model'));

      expect(screen.getByTestId('workspace-left-rail-overlay')).toBeInTheDocument();
      // The strip keeps its place — the popout costs no layout width, which is
      // what stops the shell undoing it.
      expect(useStore.getState().workspaceLeftCollapsed).toBe(true);
      expect(screen.getByTestId('library-subsection-model')).toHaveAttribute(
        'data-collapsed',
        'false'
      );
    });

    test('the expand button pops out too', () => {
      seedNarrow();
      renderRail();
      fireEvent.click(screen.getByTestId('workspace-left-rail-expand'));
      expect(screen.getByTestId('workspace-left-rail-overlay')).toBeInTheDocument();
    });

    test('tapping the content beside it dismisses the popout', () => {
      seedNarrow({ workspaceLeftOverlayOpen: true });
      renderRail();

      fireEvent.click(screen.getByTestId('workspace-left-rail-overlay-backdrop'));

      expect(screen.queryByTestId('workspace-left-rail-overlay')).not.toBeInTheDocument();
    });

    test('Escape dismisses the popout', () => {
      seedNarrow({ workspaceLeftOverlayOpen: true });
      renderRail();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByTestId('workspace-left-rail-overlay')).not.toBeInTheDocument();
    });

    test('opening an object dismisses it — otherwise it covers what you just opened', () => {
      seedNarrow({ workspaceLeftOverlayOpen: true, workspaceActiveTabId: null });
      renderRail();
      expect(screen.getByTestId('workspace-left-rail-overlay')).toBeInTheDocument();

      act(() => {
        useStore.setState({ workspaceActiveTabId: 'model:orders' });
      });

      expect(screen.queryByTestId('workspace-left-rail-overlay')).not.toBeInTheDocument();
    });

    test('the popout does not close on mount just because a tab is already active', () => {
      seedNarrow({ workspaceLeftOverlayOpen: true, workspaceActiveTabId: 'model:orders' });
      renderRail();
      expect(screen.getByTestId('workspace-left-rail-overlay')).toBeInTheDocument();
    });
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
