// Coverage for the model-schema API module: availability gating (dist mode has
// no server / no static artifact yet), 200-body parsing, and the
// column-names convenience that flattens the schema's `columns` block.
import { fetchModelSchema, fetchModelColumnNames } from './modelSchema';
import { apiFetch } from './utils';
import { isAvailable } from '../contexts/URLContext';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: (key, params) => `/api/${key}${params ? `/${Object.values(params).join('/')}` : ''}`,
  isAvailable: jest.fn(() => true),
}));

const res = (status, data) => ({
  status,
  ok: status < 400,
  json: async () => data,
});

beforeEach(() => {
  apiFetch.mockReset();
  isAvailable.mockReturnValue(true);
});

describe('fetchModelSchema', () => {
  it('returns { available: false } without a request when unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchModelSchema('orders')).resolves.toEqual({ available: false });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('parses the 200 body and marks it available', async () => {
    apiFetch.mockResolvedValueOnce(
      res(200, {
        model_name: 'orders',
        model_type: 'sql',
        columns: { id: { type: 'INT', nullable: true } },
      })
    );

    await expect(fetchModelSchema('orders')).resolves.toEqual({
      available: true,
      model_name: 'orders',
      model_type: 'sql',
      columns: { id: { type: 'INT', nullable: true } },
    });
  });

  it('returns { available: false } on a non-200 response', async () => {
    apiFetch.mockResolvedValueOnce(res(404, { message: 'not found' }));
    await expect(fetchModelSchema('never_run')).resolves.toEqual({ available: false });
  });
});

describe('fetchModelColumnNames', () => {
  it('returns Object.keys(columns) for an available schema', async () => {
    apiFetch.mockResolvedValueOnce(
      res(200, {
        columns: {
          id: { type: 'INT', nullable: true },
          name: { type: 'VARCHAR', nullable: true },
        },
      })
    );

    await expect(fetchModelColumnNames('orders')).resolves.toEqual(['id', 'name']);
  });

  it('returns [] when the schema is unavailable', async () => {
    isAvailable.mockReturnValue(false);
    await expect(fetchModelColumnNames('orders')).resolves.toEqual([]);
  });

  it('returns [] when an available schema carries no columns', async () => {
    apiFetch.mockResolvedValueOnce(res(200, { model_name: 'orders' }));
    await expect(fetchModelColumnNames('orders')).resolves.toEqual([]);
  });
});
