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

  test('degrades to the visivo serve empty state when endpoints are null (dist)', async () => {
    setDistEnv();
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    expect(screen.getByTestId('source-outline-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/visivo serve/i)).toBeInTheDocument();
    // The cached feed is never called when unavailable.
    expect(fetchSourceSchemaJobs).not.toHaveBeenCalled();
    expect(fetchSourceTables).not.toHaveBeenCalled();
  });
});
