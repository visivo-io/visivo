// The model-schema API module: availability gating, POST body construction,
// 200-body parsing, and the column-names convenience.
//
// The shape changed with the endpoint. `columns` used to be the stored
// artifact's `{name: {type, nullable}}` map; it is now an array of
// `{name, type, nullable}` — the same item shape the source columns feed uses,
// so one column-row renderer serves both.
import { fetchModelSchema, fetchDraftModelSchema, fetchModelColumnNames } from './modelSchema';
import { apiFetch } from './utils';
import { isAvailable } from '../contexts/URLContext';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params) => `/api/${key}${params ? `/${Object.values(params).join('/')}` : ''}`,
  isAvailable: jest.fn(() => true),
}));

const res = (status, data) => ({ status, ok: status < 400, json: async () => data });

const COLUMNS = [
  { name: 'id', type: 'INT', nullable: null },
  { name: 'name', type: 'VARCHAR', nullable: null },
];

/** The parsed JSON body of the Nth apiFetch call. */
const sentBody = (n = 0) => JSON.parse(apiFetch.mock.calls[n][1].body);

beforeEach(() => {
  apiFetch.mockReset();
  isAvailable.mockReturnValue(true);
});

describe('fetchModelSchema', () => {
  it('returns { available: false } without a request when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchModelSchema('orders')).resolves.toEqual({
      available: false,
      columns: [],
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('POSTs and parses the 200 body', async () => {
    apiFetch.mockResolvedValueOnce(
      res(200, { columns: COLUMNS, source_name: 'wh', source_schema_cached: true })
    );

    await expect(fetchModelSchema('orders')).resolves.toEqual({
      available: true,
      columns: COLUMNS,
      source_name: 'wh',
      source_schema_cached: true,
    });
    expect(apiFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('sends an empty body for a saved model, so the server uses its saved SQL', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { columns: [] }));
    await fetchModelSchema('orders');
    expect(sentBody()).toEqual({});
  });

  it('forwards an unsaved SQL buffer and source override', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { columns: COLUMNS }));

    await fetchModelSchema('orders', { sql: 'SELECT 1', sourceName: 'other' });

    expect(sentBody()).toEqual({ sql: 'SELECT 1', source_name: 'other' });
  });

  it('returns { available: false } on a non-200', async () => {
    apiFetch.mockResolvedValueOnce(res(404, { error: 'not found' }));
    await expect(fetchModelSchema('ghost')).resolves.toEqual({
      available: false,
      columns: [],
    });
  });
});

describe('fetchDraftModelSchema', () => {
  it('POSTs sql + source_name for SQL with no saved model', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { columns: COLUMNS }));

    const out = await fetchDraftModelSchema('SELECT * FROM orders', 'wh');

    expect(sentBody()).toEqual({ sql: 'SELECT * FROM orders', source_name: 'wh' });
    expect(out.columns).toEqual(COLUMNS);
  });

  it('gates on its own URL key', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchDraftModelSchema('SELECT 1', 'wh')).resolves.toEqual({
      available: false,
      columns: [],
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('fetchModelColumnNames', () => {
  it('maps the column array to names', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { columns: COLUMNS }));
    await expect(fetchModelColumnNames('orders')).resolves.toEqual(['id', 'name']);
  });

  it('returns [] when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchModelColumnNames('orders')).resolves.toEqual([]);
  });

  it('returns [] when the response carries no columns', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { source_name: 'wh' }));
    await expect(fetchModelColumnNames('orders')).resolves.toEqual([]);
  });
});
