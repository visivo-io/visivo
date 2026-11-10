/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${env.X}` references */
import { prepareSourceCredentials } from './sourceCredentials';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({ getUrl: () => '/api/source-credentials/' }));

const respond = (status, data = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => data,
});

beforeEach(() => apiFetch.mockReset());

it('sends the typed source and returns the referenced one', async () => {
  const typed = { name: 'warehouse', type: 'postgresql', password: 'typed value' };
  const prepared = {
    source: { name: 'warehouse', type: 'postgresql', password: '${env.WAREHOUSE_PASSWORD}' },
    credentials: [
      {
        field: 'password',
        reference: '${env.WAREHOUSE_PASSWORD}',
        storage: 'project_env',
        created: true,
      },
    ],
  };
  apiFetch.mockResolvedValueOnce(respond(200, prepared));

  const result = await prepareSourceCredentials(typed, { projectId: 'p1' });

  expect(result).toEqual(prepared);
  expect(apiFetch).toHaveBeenCalledWith('/api/source-credentials/?project_id=p1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: typed }),
  });
});

it("throws the server's sentence and code", async () => {
  apiFetch.mockResolvedValueOnce(
    respond(403, { error: 'Only editors can add sources.', code: 'forbidden' })
  );

  const error = await prepareSourceCredentials({ name: 'w' }).catch(e => e);

  expect(error.message).toBe('Only editors can add sources.');
  expect(error.code).toBe('forbidden');
});
