import { createSecret } from './secrets';
import { apiFetch } from './utils';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({ getUrl: () => '/api/secrets/' }));

const respond = (status, data = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => data,
});

beforeEach(() => apiFetch.mockReset());

it('posts the key and value for the project', async () => {
  apiFetch.mockResolvedValueOnce(respond(201, { key: 'WAREHOUSE_PASSWORD' }));

  const result = await createSecret('WAREHOUSE_PASSWORD', 'typed value', { projectId: 'p1' });

  expect(result).toEqual({ key: 'WAREHOUSE_PASSWORD' });
  expect(apiFetch).toHaveBeenCalledWith('/api/secrets/?project_id=p1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'WAREHOUSE_PASSWORD', value: 'typed value' }),
  });
});

it.each([
  [409, { errors: "'WAREHOUSE_PASSWORD' already exists" }, "'WAREHOUSE_PASSWORD' already exists"],
  [400, { error: 'Bad key.', code: 'invalid_request' }, 'Bad key.'],
  [404, { detail: 'Not found.' }, 'Could not store the secret'],
])('a %s carries the status and a sentence', async (status, body, message) => {
  apiFetch.mockResolvedValueOnce(respond(status, body));

  const error = await createSecret('K', 'v').catch(e => e);

  expect(error.status).toBe(status);
  expect(error.message).toBe(message);
});
