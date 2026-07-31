// The model sibling of insightJobs/inputJobs: asks WHERE a model's built data
// is, never for the rows. See the module docstring for why /api/models/<n>/data/
// can't serve cloud at all.
import { fetchModelJobs } from './modelJobs';
import { apiFetch } from './utils';
import { isAvailable } from '../contexts/URLContext';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: key => `/api/${key}/`,
  isAvailable: jest.fn(() => true),
}));

const ok = data => ({ status: 200, json: async () => data });

beforeEach(() => {
  apiFetch.mockReset();
  isAvailable.mockReturnValue(true);
});

it('asks for the named models and returns their file references', async () => {
  apiFetch.mockResolvedValueOnce(
    ok([{ id: 'orders', name: 'orders', signed_data_file_url: '/api/files/orders/main/' }])
  );

  const jobs = await fetchModelJobs(['orders'], { projectId: 'p1' });

  expect(jobs[0].signed_data_file_url).toBe('/api/files/orders/main/');
  const url = apiFetch.mock.calls[0][0];
  expect(url).toContain('model_names=orders');
  expect(url).toContain('project_id=p1');
});

it('sends one model_names param per model', async () => {
  apiFetch.mockResolvedValueOnce(ok([]));
  await fetchModelJobs(['orders', 'users']);
  const url = apiFetch.mock.calls[0][0];
  expect(url).toContain('model_names=orders');
  expect(url).toContain('model_names=users');
});

it('treats 404 as "none of them have data", not an error', async () => {
  // Never run, or run before the model existed — a normal state.
  apiFetch.mockResolvedValueOnce({ status: 404, json: async () => ({}) });
  await expect(fetchModelJobs(['never_run'])).resolves.toEqual([]);
});

it('throws on a real failure', async () => {
  apiFetch.mockResolvedValueOnce({ status: 500, json: async () => ({}) });
  await expect(fetchModelJobs(['orders'])).rejects.toThrow('Failed to fetch model jobs (500)');
});

it('degrades to [] where the endpoint is unavailable', async () => {
  isAvailable.mockReturnValue(false);
  await expect(fetchModelJobs(['orders'])).resolves.toEqual([]);
  expect(apiFetch).not.toHaveBeenCalled();
});

it('makes no request for an empty model list', async () => {
  await expect(fetchModelJobs([])).resolves.toEqual([]);
  await expect(fetchModelJobs(undefined)).resolves.toEqual([]);
  expect(apiFetch).not.toHaveBeenCalled();
});
