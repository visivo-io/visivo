/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * ExplorerHomePane (Explore 2.0 Phase 2 — replaces the Phase 0 placeholder):
 * header + "+ New exploration", "Start from a source" tiles, "Recent
 * explorations" gallery, lazy "Scratch" seeding, and the delete confirm ->
 * force-close-with-toast flow (delete itself lives in the slice; this pane
 * just has to call it after confirming).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ExplorerHomePane from './ExplorerHomePane';
import useStore from '../../../../stores/store';

const explorationRecord = overrides => ({
  id: 'exp_1',
  name: 'Churn dig',
  updatedAt: new Date().toISOString(),
  seededFrom: null,
  draft: { queries: [], insights: [], chart: null, computedColumns: [] },
  ...overrides,
});

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceExplorations: { byId: {}, order: [] },
      workspaceExplorationsFetched: true,
      sources: [],
      createExploration: jest.fn().mockResolvedValue({ success: true, id: 'exp_new' }),
      duplicateExploration: jest.fn().mockResolvedValue({ success: true, id: 'exp_copy' }),
      renameExploration: jest.fn(),
      deleteExploration: jest.fn().mockResolvedValue({ success: true }),
      openWorkspaceTab: jest.fn(),
      ...extra,
    });
  });
};

describe('ExplorerHomePane — header + new exploration', () => {
  test('renders the header and "+ New exploration" affordance', () => {
    seed();
    render(<ExplorerHomePane />);
    expect(screen.getByTestId('workspace-middle-explorer')).toBeInTheDocument();
    expect(screen.getByText('Explore your data')).toBeInTheDocument();
    expect(screen.getByTestId('explorer-home-new-exploration')).toBeInTheDocument();
  });

  test('clicking "+ New exploration" creates and opens a tab', async () => {
    const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_new' });
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      createExploration,
      openWorkspaceTab,
    });
    render(<ExplorerHomePane />);

    fireEvent.click(screen.getByTestId('explorer-home-new-exploration'));
    await waitFor(() => expect(openWorkspaceTab).toHaveBeenCalled());

    expect(createExploration).toHaveBeenCalledWith();
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'exploration:exp_new',
      type: 'exploration',
      name: 'exp_new',
    });
  });
});

// VIS-1084: switching destinations while a create is in flight (unmounting
// THIS pane) must never let the completion force-navigate afterward.
describe('ExplorerHomePane — VIS-1084 stale create-completion navigation', () => {
  test('"+ New exploration": does not navigate if the pane unmounted before the create resolved', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      createExploration,
      openWorkspaceTab,
    });
    const { unmount } = render(<ExplorerHomePane />);

    fireEvent.click(screen.getByTestId('explorer-home-new-exploration'));
    await waitFor(() => expect(createExploration).toHaveBeenCalled());

    // The user switches destinations before the create resolves — MiddlePane
    // would unmount this pane in favor of a different Home/document.
    unmount();

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_new' });
      await Promise.resolve();
    });

    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });

  test('"+ New exploration": still navigates when the pane is still mounted (baseline, unchanged)', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      createExploration,
      openWorkspaceTab,
    });
    render(<ExplorerHomePane />);

    fireEvent.click(screen.getByTestId('explorer-home-new-exploration'));
    await waitFor(() => expect(createExploration).toHaveBeenCalled());

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_new' });
    });

    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'exploration:exp_new',
      type: 'exploration',
      name: 'exp_new',
    });
  });

  test('a source tile: does not navigate if the pane unmounted before the create resolved', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      sources: [{ name: 'warehouse' }],
      createExploration,
      openWorkspaceTab,
    });
    const { unmount } = render(<ExplorerHomePane />);

    fireEvent.click(screen.getByTestId('explorer-home-source-tile-warehouse'));
    await waitFor(() => expect(createExploration).toHaveBeenCalled());

    unmount();

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_seeded' });
      await Promise.resolve();
    });

    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });
});

// VIS-1086: every create door needs an in-flight guard — a rapid double
// click (or two different doors clicked in quick succession) must never
// mint two records.
describe('ExplorerHomePane — VIS-1086 double-click guard', () => {
  test('double-clicking "+ New exploration" only calls createExploration once', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      createExploration,
      openWorkspaceTab,
    });
    render(<ExplorerHomePane />);

    const button = screen.getByTestId('explorer-home-new-exploration');
    fireEvent.click(button);
    fireEvent.click(button); // fires before the first call resolves

    expect(createExploration).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_new' });
    });
    expect(button).not.toBeDisabled();
  });

  test('double-clicking a source tile only calls createExploration once', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      sources: [{ name: 'warehouse' }],
      createExploration,
    });
    render(<ExplorerHomePane />);

    const tile = screen.getByTestId('explorer-home-source-tile-warehouse');
    fireEvent.click(tile);
    fireEvent.click(tile);

    expect(createExploration).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_seeded' });
    });
  });

  test('clicking "+ New exploration" while a source-tile create is in flight is also blocked (shared guard across doors)', async () => {
    let resolveCreate;
    const createExploration = jest.fn(
      () =>
        new Promise(resolve => {
          resolveCreate = resolve;
        })
    );
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      sources: [{ name: 'warehouse' }],
      createExploration,
    });
    render(<ExplorerHomePane />);

    fireEvent.click(screen.getByTestId('explorer-home-source-tile-warehouse'));
    fireEvent.click(screen.getByTestId('explorer-home-new-exploration'));

    expect(createExploration).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ success: true, id: 'exp_seeded' });
    });
  });
});

describe('ExplorerHomePane — start from a source', () => {
  test('renders one tile per source', () => {
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      sources: [{ name: 'warehouse' }, { name: 'events.duckdb' }],
    });
    render(<ExplorerHomePane />);
    expect(screen.getByTestId('explorer-home-source-tile-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('explorer-home-source-tile-events.duckdb')).toBeInTheDocument();
  });

  test('clicking a source tile seeds an exploration from that source and opens it', async () => {
    const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_seeded' });
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      sources: [{ name: 'warehouse' }],
      createExploration,
      openWorkspaceTab,
    });
    render(<ExplorerHomePane />);

    fireEvent.click(screen.getByTestId('explorer-home-source-tile-warehouse'));
    await waitFor(() => expect(openWorkspaceTab).toHaveBeenCalled());

    expect(createExploration).toHaveBeenCalledWith({ type: 'source', name: 'warehouse' });
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'exploration:exp_seeded',
      type: 'exploration',
      name: 'exp_seeded',
    });
  });

  test('no "Start from a source" section when there are no sources', () => {
    seed({ workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] } });
    render(<ExplorerHomePane />);
    expect(screen.queryByText(/start from a source/i)).not.toBeInTheDocument();
  });
});

describe('ExplorerHomePane — recent explorations gallery', () => {
  test('renders one card per exploration, in server (recency) order', () => {
    seed({
      workspaceExplorations: {
        byId: {
          exp_a: explorationRecord({ id: 'exp_a', name: 'A' }),
          exp_b: explorationRecord({ id: 'exp_b', name: 'B' }),
        },
        order: ['exp_b', 'exp_a'],
      },
    });
    render(<ExplorerHomePane />);
    screen.getByTestId('explorer-home-gallery');
    const nameEls = screen.getAllByTestId(
      (_content, element) => !!element.getAttribute('data-testid')?.endsWith('-name')
    );
    expect(nameEls.map(el => el.textContent)).toEqual(['B', 'A']);
  });

  test('opening a card calls openWorkspaceTab for that exploration', () => {
    const openWorkspaceTab = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      openWorkspaceTab,
    });
    render(<ExplorerHomePane />);
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-open'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'exploration:exp_1',
      type: 'exploration',
      name: 'exp_1',
    });
  });
});

describe('ExplorerHomePane — lazy Scratch seeding', () => {
  test('seeds a "Scratch" exploration once the list is fetched and genuinely empty', async () => {
    const createExploration = jest.fn().mockResolvedValue({ success: true, id: 'exp_scratch' });
    seed({
      workspaceExplorations: { byId: {}, order: [] },
      workspaceExplorationsFetched: true,
      createExploration,
    });
    render(<ExplorerHomePane />);
    await waitFor(() => expect(createExploration).toHaveBeenCalledTimes(1));
    expect(createExploration).toHaveBeenCalledWith();
  });

  test('does NOT seed while the list is still loading (fetched:false)', () => {
    const createExploration = jest.fn();
    seed({
      workspaceExplorations: { byId: {}, order: [] },
      workspaceExplorationsFetched: false,
      createExploration,
    });
    render(<ExplorerHomePane />);
    expect(createExploration).not.toHaveBeenCalled();
    expect(screen.getByTestId('explorer-home-empty')).toBeInTheDocument();
  });

  test('does NOT seed when explorations already exist', () => {
    const createExploration = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      createExploration,
    });
    render(<ExplorerHomePane />);
    expect(createExploration).not.toHaveBeenCalled();
  });
});

describe('ExplorerHomePane — delete flow', () => {
  test('delete asks for confirmation before calling deleteExploration', async () => {
    const deleteExploration = jest.fn().mockResolvedValue({ success: true });
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      deleteExploration,
    });
    render(<ExplorerHomePane />);

    fireEvent.click(screen.getByTestId('exploration-card-exp_1-menu'));
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-delete-action'));

    // The confirm dialog is up; delete has not fired yet.
    expect(screen.getByTestId('exploration-delete-confirm')).toBeInTheDocument();
    expect(deleteExploration).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('exploration-delete-confirm-confirm'));
    await waitFor(() => expect(deleteExploration).toHaveBeenCalledWith('exp_1'));
  });

  test('canceling the confirm dialog never calls deleteExploration', () => {
    const deleteExploration = jest.fn();
    seed({
      workspaceExplorations: { byId: { exp_1: explorationRecord() }, order: ['exp_1'] },
      deleteExploration,
    });
    render(<ExplorerHomePane />);

    fireEvent.click(screen.getByTestId('exploration-card-exp_1-menu'));
    fireEvent.click(screen.getByTestId('exploration-card-exp_1-delete-action'));
    fireEvent.click(screen.getByTestId('exploration-delete-confirm-cancel'));

    expect(deleteExploration).not.toHaveBeenCalled();
  });
});

// VIS-1070 — the gallery computes staleness once per card (via
// computeExplorationStaleness) and passes it down; this pins the wiring,
// not the detection logic itself (covered by explorationStaleness.test.js).
describe('ExplorerHomePane — staleness badges (VIS-1070)', () => {
  test('flags a card whose draft references a deleted object, leaves an unaffected card clean', () => {
    seed({
      models: [{ name: 'orders_q' }],
      workspaceExplorations: {
        byId: {
          exp_1: explorationRecord({
            id: 'exp_1',
            name: 'Stale one',
            draft: {
              queries: [],
              insights: [{ name: 'a', props: { x: '?{${ref(deleted_model).col}}' } }],
              chart: null,
              computedColumns: [],
            },
          }),
          exp_2: explorationRecord({
            id: 'exp_2',
            name: 'Clean one',
            draft: {
              queries: [{ name: 'orders_q', sql: 'SELECT 1', source: 'warehouse' }],
              insights: [{ name: 'b', props: { x: '?{${ref(orders_q).col}}' } }],
              chart: null,
              computedColumns: [],
            },
          }),
        },
        order: ['exp_1', 'exp_2'],
      },
    });
    render(<ExplorerHomePane />);
    expect(screen.getByTestId('exploration-card-exp_1-stale')).toBeInTheDocument();
    expect(screen.queryByTestId('exploration-card-exp_2-stale')).not.toBeInTheDocument();
  });
});
