import { fetchInsightJobs } from './insightJobs';

jest.mock('../contexts/URLContext', () => ({
  getUrl: () => '/api/insight-jobs/',
}));
jest.mock('./utils', () => ({
  apiFetch: (...args) => global.fetch(...args),
}));

const okJson = payload => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

describe('fetchInsightJobs never-built handling', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    delete global.fetch;
  });

  test('a not_built envelope returns [] after exactly ONE fetch — no retries', async () => {
    global.fetch.mockResolvedValue(
      okJson({ insights: [], missing: ['fresh'], state: 'not_built' })
    );

    const result = await fetchInsightJobs('proj', ['fresh']);
    expect(result).toEqual([]);
    // The retry loop retried a 404 up to 3x at 1s — one render produced up to
    // six server polls for an insight that simply has not been built yet.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('a bare array (cloud / older servers) still parses', async () => {
    const job = {
      id: 'revenue',
      name: 'revenue',
      files: [],
      query: 'select 1',
      props_mapping: {},
    };
    global.fetch.mockResolvedValue(okJson([job]));
    const result = await fetchInsightJobs('proj', ['revenue']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('revenue');
  });

  test('empty names short-circuits with no fetch', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchInsightJobs('proj', [])).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
