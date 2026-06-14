/**
 * SourceOutlineTreePanel tests (VIS-1004 / Canvas Object Surfaces, Track N).
 *
 * The panel renders a source's database → schema → table → column tree from the
 * nested `fetchSourceMetadata` feed (mirroring the Explorer's SourceBrowser),
 * dispatches selection through the DISJOINT `workspaceSourceOutlineSelectedKey`
 * store slice, remembers expand/collapse per source, offers a cold-source
 * "Generate schema" affordance, and degrades to an empty state when the source
 * endpoints are null (dist/cloud).
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import SourceOutlineTreePanel from './SourceOutlineTreePanel';
import useStore from '../../../stores/store';
import {
  setGlobalURLConfig,
  createURLConfig,
} from '../../../contexts/URLContext';

jest.mock('../../../api/explorer', () => ({
  fetchSourceMetadata: jest.fn(),
}));
jest.mock('../../../api/sourceSchemaJobs', () => ({
  generateSourceSchema: jest.fn(),
  fetchSchemaGenerationStatus: jest.fn(),
  fetchSourceTables: jest.fn(),
  fetchTableColumns: jest.fn(),
  fetchSourceSchemaJobs: jest.fn(),
}));

const { fetchSourceMetadata } = require('../../../api/explorer');
const {
  generateSourceSchema,
  fetchSchemaGenerationStatus,
  fetchSourceTables,
  fetchSourceSchemaJobs,
} = require('../../../api/sourceSchemaJobs');

const SRC = 'analytics_db';

// A connected source with a database that has a schema, a table, and columns.
const NESTED_CONNECTED = {
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
    fetchSourceMetadata.mockResolvedValue(NESTED_CONNECTED);
    // The has_cached_schema signal authoritatively decides cold vs warm. Default
    // to a warm (cached) source so connected tests never see the Generate state.
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: SRC, has_cached_schema: true },
    ]);
  });

  afterEach(() => {
    setServerEnv();
  });

  test('renders the nested db → schema → table tree from mocked metadata', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);

    // Source root renders immediately; the tree fills after the metadata load.
    expect(screen.getByTestId('workspace-source-outline')).toBeInTheDocument();
    expect(await screen.findByTestId('source-outline-node-root')).toBeInTheDocument();

    // The database grouping node renders under the (default-expanded) root.
    const dbKey = `source-outline::${SRC}::db::main`;
    expect(await screen.findByTestId(`source-outline-node-${dbKey}`)).toBeInTheDocument();

    // Children are collapsed by default — expanding the db reveals its schema.
    fireEvent.click(screen.getByTestId(`source-outline-node-${dbKey}-toggle`));
    expect(
      await screen.findByTestId(`source-outline-node-${dbKey}::schema::public`)
    ).toBeInTheDocument();
  });

  test('expand/collapse toggles a node and persists per source in the store', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    const dbKey = `source-outline::${SRC}::db::main`;
    const schemaKey = `${dbKey}::schema::public`;

    // The schema node exists (db is expanded by default since the root + db are
    // not in the collapsed-by-default set — expand state defaults to collapsed,
    // so first we expand the root, db, then the schema to reach a table).
    const dbToggle = await screen.findByTestId(`source-outline-node-${dbKey}-toggle`);
    fireEvent.click(dbToggle);
    expect(useStore.getState().workspaceSourceOutlineExpanded[SRC]).toContain(dbKey);

    // The table appears once the schema is expanded.
    const schemaToggle = screen.getByTestId(`source-outline-node-${schemaKey}-toggle`);
    fireEvent.click(schemaToggle);
    expect(useStore.getState().workspaceSourceOutlineExpanded[SRC]).toContain(schemaKey);
    expect(
      await screen.findByTestId(`source-outline-node-${schemaKey}::table::orders`)
    ).toBeInTheDocument();
  });

  test('clicking a node writes the disjoint source-outline selection key', async () => {
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    const dbNode = await screen.findByTestId(
      `source-outline-node-source-outline::${SRC}::db::main`
    );
    fireEvent.click(dbNode);
    expect(useStore.getState().workspaceSourceOutlineSelectedKey).toBe(
      `source-outline::${SRC}::db::main`
    );
    // The dashboard outline key is never touched.
    expect(useStore.getState().workspaceOutlineSelectedKey).not.toContain('source-outline');
  });

  test('cold source offers Generate schema and fills the tree after polling', async () => {
    // Nested feed returns a connection_failed source (zero databases) → cold.
    fetchSourceMetadata.mockResolvedValue({
      sources: [
        { name: SRC, type: 'postgresql', status: 'connection_failed', databases: [] },
      ],
    });
    // The API has no cached schema for this source → authoritatively cold.
    fetchSourceSchemaJobs.mockResolvedValue([
      { source_name: SRC, has_cached_schema: false },
    ]);
    generateSourceSchema.mockResolvedValue({ run_id: 'run-1' });
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'completed', progress: 1 });
    fetchSourceTables.mockResolvedValue([{ name: 'events' }]);

    render(<SourceOutlineTreePanel sourceName={SRC} />);

    const generateBtn = await screen.findByTestId('source-outline-generate');
    expect(screen.getByTestId('source-outline-cold')).toBeInTheDocument();

    fireEvent.click(generateBtn);

    await waitFor(() => expect(generateSourceSchema).toHaveBeenCalledWith(SRC));
    // After generation completes the flat tree (events table) is rendered.
    expect(
      await screen.findByTestId(`source-outline-node-source-outline::${SRC}::db::${SRC}`)
    ).toBeInTheDocument();
  });

  test('degrades to the visivo serve empty state when endpoints are null (dist)', async () => {
    setDistEnv();
    render(<SourceOutlineTreePanel sourceName={SRC} />);
    expect(screen.getByTestId('source-outline-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/visivo serve/i)).toBeInTheDocument();
    // The nested feed is never called when unavailable.
    expect(fetchSourceMetadata).not.toHaveBeenCalled();
  });
});
