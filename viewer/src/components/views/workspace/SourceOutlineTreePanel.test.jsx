/**
 * SourceOutlineTreePanel tests (VIS-1004 / Canvas Object Surfaces, Track N).
 *
 * The panel renders a source's database → table → column tree from the
 * BACKEND-CACHED schema feed (the same `source-schema-jobs` endpoints the
 * Explorer's SourceBrowser uses), NOT the live introspect. Selection dispatches
 * through the DISJOINT `workspaceSourceOutlineSelectedKey` store slice, expand /
 * collapse persists per source, columns lazy-load on expand, a cold source
 * offers a "Generate schema" affordance, the loaded tree is cached so re-select
 * is instant, and the panel degrades to an empty state when the source endpoints
 * are null (dist/cloud).
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import SourceOutlineTreePanel from './SourceOutlineTreePanel';
import useStore from '../../../stores/store';
import {
  setGlobalURLConfig,
  createURLConfig,
} from '../../../contexts/URLContext';

jest.mock('../../../api/sourceSchemaJobs', () => ({
  fetchSourceSchemaJobs: jest.fn(),
  generateSourceSchema: jest.fn(),
  fetchSchemaGenerationStatus: jest.fn(),
  fetchSourceTables: jest.fn(),
  fetchTableColumns: jest.fn(),
}));

const {
  fetchSourceSchemaJobs,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
  fetchSourceTables,
  fetchTableColumns,
} = require('../../../api/sourceSchemaJobs');

const SRC = 'local-duckdb';
const DB_KEY = `source-outline::${SRC}::db::${SRC}`;

const resetStore = () => {
  act(() => {
    useStore.setState({
      workspaceSourceOutlineSelectedKey: null,
      workspaceSourceOutlineExpanded: {},
      workspaceSourceOutlineDataCache: {},
    });
  });
};

const setServerEnv = () => {
  setGlobalURLConfig(createURLConfig({ environment: 'server' }));
};
const setDistEnv = () => {
  setGlobalURLConfig(createURLConfig({ environment: 'dist' }));
};

describe('SourceOutlineTreePanel (VIS-1004)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    setServerEnv();
    // Warm (cached) source by default: the cached-schema feed drives the tree.
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: SRC, has_cached_schema: true },
    ]);
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
    setServerEnv();
  });

  test('renders the cached db → table tree from the source-schema-jobs feed', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);

    // Source root renders immediately; the tree fills after the cached load.
    expect(screen.getByTestId('workspace-source-outline')).toBeInTheDocument();
    expect(await screen.findByTestId('source-outline-node-root')).toBeInTheDocument();

    // The (pseudo) database grouping node renders under the default-expanded root.
    expect(await screen.findByTestId(`source-outline-node-${DB_KEY}`)).toBeInTheDocument();

    // Tables are children of the db node; expanding the db reveals them.
    fireEvent.click(screen.getByTestId(`source-outline-node-${DB_KEY}-toggle`));
    expect(
      await screen.findByTestId(`source-outline-node-${DB_KEY}::table::orders`)
    ).toBeInTheDocument();
    // It reads from the cached feed, never the live introspect.
    expect(fetchSourceTables).toHaveBeenCalledWith(SRC);
  });

  test('expanding a table lazy-loads its columns from the cached feed', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    const tableKey = `${DB_KEY}::table::orders`;

    fireEvent.click(await screen.findByTestId(`source-outline-node-${DB_KEY}-toggle`));
    const tableToggle = await screen.findByTestId(
      `source-outline-node-${tableKey}-toggle`
    );
    // Columns are NOT fetched until the table expands.
    expect(fetchTableColumns).not.toHaveBeenCalled();

    fireEvent.click(tableToggle);
    await waitFor(() => expect(fetchTableColumns).toHaveBeenCalledWith(SRC, 'orders'));
    expect(
      await screen.findByTestId(`source-outline-node-${tableKey}::col::id`)
    ).toBeInTheDocument();
  });

  test('expand/collapse persists per source in the store', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    const dbToggle = await screen.findByTestId(`source-outline-node-${DB_KEY}-toggle`);
    fireEvent.click(dbToggle);
    expect(useStore.getState().workspaceSourceOutlineExpanded[SRC]).toContain(DB_KEY);
  });

  test('clicking a node writes the disjoint source-outline selection key', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    const dbNode = await screen.findByTestId(`source-outline-node-${DB_KEY}`);
    fireEvent.click(dbNode);
    expect(useStore.getState().workspaceSourceOutlineSelectedKey).toBe(DB_KEY);
    // The dashboard outline key is never touched.
    expect(useStore.getState().workspaceOutlineSelectedKey).not.toContain('source-outline');
  });

  test('re-selecting a source reads the cached tree without re-fetching', async () => {
    const { unmount } = render(<SourceOutlineTreePanel sourceName={SRC} />);
    expect(await screen.findByTestId(`source-outline-node-${DB_KEY}`)).toBeInTheDocument();
    expect(fetchSourceTables).toHaveBeenCalledTimes(1);

    unmount();
    jest.clearAllMocks();
    // Re-mounting the same source hydrates from the store cache — no re-fetch.
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    expect(await screen.findByTestId(`source-outline-node-${DB_KEY}`)).toBeInTheDocument();
    expect(fetchSourceTables).not.toHaveBeenCalled();
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
  });

  test('cold source offers Generate schema and fills the tree after polling', async () => {
    // The API authoritatively reports no cached schema for this source → cold.
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: SRC, has_cached_schema: false },
    ]);
    generateSourceSchema.mockResolvedValue({ run_id: 'run-1' });
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'completed', progress: 1 });
    fetchSourceTables.mockResolvedValue([{ name: 'events', column_count: 3 }]);

    render(<SourceOutlineTreePanel sourceName={SRC} />);

    const generateBtn = await screen.findByTestId('source-outline-generate');
    expect(screen.getByTestId('source-outline-cold')).toBeInTheDocument();
    // Cold sources never fetch tables until Generate runs.
    expect(fetchSourceTables).not.toHaveBeenCalled();

    fireEvent.click(generateBtn);

    await waitFor(() => expect(generateSourceSchema).toHaveBeenCalledWith(SRC));
    // After generation completes the db node renders; expanding it reveals the
    // newly-cached `events` table.
    const dbNode = await screen.findByTestId(`source-outline-node-${DB_KEY}`);
    expect(dbNode).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`source-outline-node-${DB_KEY}-toggle`));
    expect(
      await screen.findByTestId(`source-outline-node-${DB_KEY}::table::events`)
    ).toBeInTheDocument();
  });

  test('a transient schema-jobs failure shows a Retry affordance and recovers (no cache poisoning)', async () => {
    // The listing fails once, then succeeds. The failed read must NOT be
    // cached as a 'ready' entry (which dead-ended the panel on a bare "0 dbs"
    // root with no Generate prompt for the rest of the session) — it renders
    // a retryable error state instead.
    fetchSourceSchemaJobs
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue([{ source_name: SRC, has_cached_schema: true }]);

    render(<SourceOutlineTreePanel sourceName={SRC} />);

    expect(await screen.findByTestId('source-outline-error')).toBeInTheDocument();
    // No poisoned session-cache entry was written.
    expect(useStore.getState().workspaceSourceOutlineDataCache[SRC]).toBeUndefined();
    // No dead-end: neither the bare tree nor the cold prompt renders.
    expect(screen.queryByTestId('source-outline-tree')).not.toBeInTheDocument();
    expect(screen.queryByTestId('source-outline-cold')).not.toBeInTheDocument();

    // Retry re-fetches and the real tree renders.
    fireEvent.click(screen.getByTestId('source-outline-retry'));
    expect(await screen.findByTestId(`source-outline-node-${DB_KEY}`)).toBeInTheDocument();
    expect(useStore.getState().workspaceSourceOutlineDataCache[SRC]).toMatchObject({
      hasCachedSchema: true,
    });
  });

  test('degrades to the visivo serve empty state when endpoints are null (dist)', async () => {
    setDistEnv();
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    expect(screen.getByTestId('source-outline-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/visivo serve/i)).toBeInTheDocument();
    // The cached feed is never called when unavailable.
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
    expect(fetchSourceTables).not.toHaveBeenCalled();
  });

  test('search filters tables and keeps ancestor groups whose CHILDREN match', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    fireEvent.click(await screen.findByTestId(`source-outline-node-${DB_KEY}-toggle`));
    await screen.findByTestId(`source-outline-node-${DB_KEY}::table::orders`);

    // 'users' matches one table only; the db group node (named after the source,
    // which does NOT match) stays visible because a descendant matches.
    fireEvent.change(screen.getByTestId('source-outline-search'), {
      target: { value: 'users' },
    });
    expect(screen.getByTestId(`source-outline-node-${DB_KEY}`)).toBeInTheDocument();
    expect(
      screen.getByTestId(`source-outline-node-${DB_KEY}::table::users`)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`source-outline-node-${DB_KEY}::table::orders`)
    ).not.toBeInTheDocument();

    // No match anywhere → the whole group disappears.
    fireEvent.change(screen.getByTestId('source-outline-search'), {
      target: { value: 'zzz-no-match' },
    });
    expect(screen.queryByTestId(`source-outline-node-${DB_KEY}`)).not.toBeInTheDocument();

    // Clearing the query restores the full tree.
    fireEvent.change(screen.getByTestId('source-outline-search'), { target: { value: '' } });
    expect(
      screen.getByTestId(`source-outline-node-${DB_KEY}::table::orders`)
    ).toBeInTheDocument();
  });

  test('search also filters COLUMNS within an expanded, matching table', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    const tableKey = `${DB_KEY}::table::orders`;
    fireEvent.click(await screen.findByTestId(`source-outline-node-${DB_KEY}-toggle`));
    fireEvent.click(await screen.findByTestId(`source-outline-node-${tableKey}-toggle`));
    await screen.findByTestId(`source-outline-node-${tableKey}::col::id`);

    // 'd' matches the orders table AND its `id` column, but not `amount` (nor
    // the users table) — the visible columns are filtered by the query too.
    fireEvent.change(screen.getByTestId('source-outline-search'), {
      target: { value: 'd' },
    });
    expect(screen.getByTestId(`source-outline-node-${tableKey}`)).toBeInTheDocument();
    expect(
      screen.getByTestId(`source-outline-node-${tableKey}::col::id`)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`source-outline-node-${tableKey}::col::amount`)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`source-outline-node-${DB_KEY}::table::users`)
    ).not.toBeInTheDocument();
  });

  test('a query matching only a LOADED column keeps its table (and ancestors) visible', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    const tableKey = `${DB_KEY}::table::orders`;
    fireEvent.click(await screen.findByTestId(`source-outline-node-${DB_KEY}-toggle`));
    fireEvent.click(await screen.findByTestId(`source-outline-node-${tableKey}-toggle`));
    await screen.findByTestId(`source-outline-node-${tableKey}::col::amount`);

    // 'amount' matches ONLY the orders table's lazily-loaded `amount` column —
    // not the source/db name nor either table name. Loaded columns live in
    // `flatColumns[tableKey]` (not `node.children`), so the match must consult
    // them: the table AND its ancestor db group stay visible.
    fireEvent.change(screen.getByTestId('source-outline-search'), {
      target: { value: 'amount' },
    });
    expect(screen.getByTestId(`source-outline-node-${DB_KEY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`source-outline-node-${tableKey}`)).toBeInTheDocument();
    expect(
      screen.getByTestId(`source-outline-node-${tableKey}::col::amount`)
    ).toBeInTheDocument();
    // Non-matching siblings are still filtered out.
    expect(
      screen.queryByTestId(`source-outline-node-${tableKey}::col::id`)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`source-outline-node-${DB_KEY}::table::users`)
    ).not.toBeInTheDocument();
  });

  test('Enter / Space on a focused node selects it (keyboard parity with click)', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    const dbNode = await screen.findByTestId(`source-outline-node-${DB_KEY}`);

    fireEvent.keyDown(dbNode, { key: 'Enter' });
    expect(useStore.getState().workspaceSourceOutlineSelectedKey).toBe(DB_KEY);

    const root = screen.getByTestId('source-outline-node-root');
    fireEvent.keyDown(root, { key: ' ' });
    expect(useStore.getState().workspaceSourceOutlineSelectedKey).toBe(
      `source-outline::${SRC}`
    );
    // Any other key leaves the selection alone.
    fireEvent.keyDown(dbNode, { key: 'x' });
    expect(useStore.getState().workspaceSourceOutlineSelectedKey).toBe(
      `source-outline::${SRC}`
    );
  });

  test('collapsing the source root hides the tree below it (and re-expands)', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    await screen.findByTestId(`source-outline-node-${DB_KEY}`);

    fireEvent.click(screen.getByTestId('source-outline-node-root-toggle'));
    expect(screen.queryByTestId(`source-outline-node-${DB_KEY}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('source-outline-node-root-toggle'));
    expect(screen.getByTestId(`source-outline-node-${DB_KEY}`)).toBeInTheDocument();
  });

  test('generation progress is surfaced on the cold state while a run is in flight', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([{ source_name: SRC, has_cached_schema: false }]);
    generateSourceSchema.mockResolvedValue({ run_id: 'run-1' });
    // A run that never completes → the panel stays on the progress copy.
    fetchSchemaGenerationStatus.mockImplementation(() => new Promise(() => {}));

    render(<SourceOutlineTreePanel sourceName={SRC} />);
    fireEvent.click(await screen.findByTestId('source-outline-generate'));

    await waitFor(() =>
      expect(screen.getByTestId('source-outline-cold')).toHaveTextContent(/Generating schema…/)
    );
    // The button is disabled + relabelled while the run is in flight.
    expect(screen.getByTestId('source-outline-generate')).toBeDisabled();
    expect(screen.getByTestId('source-outline-generate')).toHaveTextContent('Generating…');
  });
});
