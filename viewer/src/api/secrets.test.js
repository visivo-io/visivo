import { createSecret, secretKeyFor, storeTypedSecrets } from './secrets';
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

describe('secretKeyFor', () => {
  test.each([
    ['warehouse', 'password', 'WAREHOUSE_PASSWORD'],
    ['analytics-db', 'credentials_base64', 'ANALYTICS_DB_CREDENTIALS_BASE64'],
    ['2024 warehouse', 'password', '_2024_WAREHOUSE_PASSWORD'],
    ['', 'password', 'PASSWORD'],
  ])('%s + %s is %s', (source, field, key) => {
    expect(secretKeyFor(source, field)).toBe(key);
  });
});

describe('storeTypedSecrets', () => {
  const DOLLAR = '$';
  const ref = name => DOLLAR + '{env.' + name + '}';
  const typed = { name: 'wh', type: 'postgresql', username: 'analyst', password: 'hunter2' };

  test('stores each typed secret and returns the config with references', async () => {
    apiFetch.mockResolvedValue(respond(201, {}));

    const result = await storeTypedSecrets(
      { ...typed, private_key_passphrase: 'pp' },
      { projectId: 'p1' }
    );

    expect(result).toEqual({
      source: {
        ...typed,
        password: ref('WH_PASSWORD'),
        private_key_passphrase: ref('WH_PRIVATE_KEY_PASSPHRASE'),
      },
      credentials: [
        { field: 'password', reference: ref('WH_PASSWORD') },
        { field: 'private_key_passphrase', reference: ref('WH_PRIVATE_KEY_PASSPHRASE') },
      ],
    });
    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({
      key: 'WH_PASSWORD',
      value: 'hunter2',
    });
  });

  test('skips a taken name, and the next one when the server says it exists', async () => {
    apiFetch
      .mockResolvedValueOnce(respond(409, { errors: 'exists' }))
      .mockResolvedValueOnce(respond(201, {}));

    const { source } = await storeTypedSecrets(typed, { taken: ['WH_PASSWORD'] });

    expect(apiFetch.mock.calls.map(([, init]) => JSON.parse(init.body).key)).toEqual([
      'WH_PASSWORD_2',
      'WH_PASSWORD_3',
    ]);
    expect(source.password).toBe(ref('WH_PASSWORD_3'));
  });

  test.each([[''], ['**********'], [ref('MINE')], [undefined]])(
    'leaves %s alone',
    async password => {
      const { source, credentials } = await storeTypedSecrets({ ...typed, password });

      expect(apiFetch).not.toHaveBeenCalled();
      expect(source.password).toBe(password);
      expect(credentials).toEqual([]);
    }
  );

  test.each([403, 404])('a %s says only an admin can add one', async status => {
    apiFetch.mockResolvedValueOnce(respond(status, {}));

    const error = await storeTypedSecrets(typed).catch(e => e);

    expect(error.status).toBe(status);
    expect(error.message).toBe(
      'Your role cannot add a secret. Choose an existing one instead.'
    );
  });
});
