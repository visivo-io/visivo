// The rename client's one environment-sensitive detail: cloud serves many
// projects and cannot resolve the draft without `?project_id=`. Omitting it
// 404'd every rename in cloud for every object type —
// `{"detail": "No API endpoint at /api/rename/impact/"}` — which read as
// "rename is broken" rather than "the request was unscoped".
import { fetchRenameImpact, renameResource, renameSupported } from './rename';
import { apiFetch } from './utils';
import { isAvailable } from '../contexts/URLContext';

jest.mock('./utils', () => ({ apiFetch: jest.fn() }));
jest.mock('../contexts/URLContext', () => ({
  getUrl: key => `/api/${key === 'renameImpact' ? 'rename/impact' : 'rename'}/`,
  isAvailable: jest.fn(() => true),
}));

const ok = body => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  jest.clearAllMocks();
  isAvailable.mockReturnValue(true);
});

describe('project scoping', () => {
  test('the impact call carries the project id', async () => {
    apiFetch.mockResolvedValue(ok({ target: {}, references: [] }));

    await fetchRenameImpact('dimensions', 'region', 'area', { projectId: 'p-1' });

    expect(apiFetch).toHaveBeenCalledWith('/api/rename/impact/?project_id=p-1', expect.anything());
  });

  test('the rename call carries the project id', async () => {
    apiFetch.mockResolvedValue(ok({ renamed: true }));

    await renameResource('dimensions', 'region', 'area', { projectId: 'p-1' });

    expect(apiFetch).toHaveBeenCalledWith('/api/rename/?project_id=p-1', expect.anything());
  });

  test('it is encoded, not concatenated raw', async () => {
    apiFetch.mockResolvedValue(ok({ renamed: true }));

    await renameResource('models', 'a', 'b', { projectId: 'p 1/2' });

    expect(apiFetch.mock.calls[0][0]).toBe('/api/rename/?project_id=p%201%2F2');
  });

  test('studio omits it entirely rather than sending an empty param', async () => {
    apiFetch.mockResolvedValue(ok({ renamed: true }));

    await renameResource('models', 'a', 'b');

    expect(apiFetch).toHaveBeenCalledWith('/api/rename/', expect.anything());
  });
});

describe('the request itself', () => {
  test('the body names the type and both ends of the rename', async () => {
    apiFetch.mockResolvedValue(ok({ renamed: true }));

    await renameResource('dimensions', 'region', 'area', { projectId: 'p-1' });

    const [, options] = apiFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      type: 'dimensions',
      old_name: 'region',
      new_name: 'area',
    });
  });

  test('a server error message is preferred over the bare status', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "A resource named 'area' already exists." }),
    });

    await expect(renameResource('dimensions', 'region', 'area')).rejects.toThrow('already exists');
  });

  test('a body with nothing to say falls back to the status, and carries it', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    await expect(renameResource('dimensions', 'region', 'area')).rejects.toMatchObject({
      message: 'Rename failed (404)',
      status: 404,
    });
  });
});

describe('servers without rename', () => {
  test('an unsupporting server answers "not supported" instead of throwing', async () => {
    isAvailable.mockReturnValue(false);

    await expect(renameResource('models', 'a', 'b')).resolves.toEqual({
      supported: false,
      target: null,
      references: [],
    });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('renameSupported reflects the url map', () => {
    isAvailable.mockReturnValue(false);
    expect(renameSupported()).toBe(false);
    isAvailable.mockReturnValue(true);
    expect(renameSupported()).toBe(true);
  });
});
