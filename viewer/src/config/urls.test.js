/**
 * URL configuration system (config/urls.js).
 *
 * Covers the URLConfig class (getUrl/isAvailable/getRoute + host and
 * deploymentRoot normalization), param interpolation with encoding, the
 * server/dist environment split (dist nulls out interactive endpoints), and
 * the createURLConfig factory incl. the window.deploymentRoot fallback.
 */
import { createURLConfig, URLConfig } from './urls';

describe('URLConfig.getUrl — server environment', () => {
  const config = createURLConfig({ environment: 'server' });

  test('returns the raw pattern for a parameterless endpoint', () => {
    expect(config.getUrl('project')).toBe('/api/project/');
    expect(config.getUrl('commit')).toBe('/api/commit/');
  });

  test('interpolates a single named parameter', () => {
    expect(config.getUrl('insightDetail', { name: 'sales' })).toBe('/api/insights/sales/');
  });

  test('URI-encodes parameter values', () => {
    expect(config.getUrl('dashboardQuery', { name: 'My Dash/2024' })).toBe(
      '/api/dashboards/My%20Dash%2F2024/'
    );
  });

  test('the source-schema detail route takes a source name OR a run id', () => {
    // One server route (`<identifier>`), so one key. It used to be two —
    // `sourceSchemaJobDetail` with {name} and `sourceSchemaJobStatus` with
    // {runId} — which read as two endpoints and hid that polling a generation
    // run and reading a cached schema hit the same place.
    expect(config.getUrl('sourceSchemaJobDetail', { identifier: 'pg' })).toBe(
      '/api/source-schema-jobs/pg/'
    );
    expect(config.getUrl('sourceSchemaJobDetail', { identifier: 'preview-pg' })).toBe(
      '/api/source-schema-jobs/preview-pg/'
    );
  });

  test('throws when a required parameter is missing', () => {
    expect(() => config.getUrl('dashboardQuery')).toThrow(
      "Missing parameters for URL 'dashboardQuery': {name}"
    );
  });

  test('throws for an unknown endpoint key', () => {
    expect(() => config.getUrl('nonexistentKey')).toThrow('Unknown URL key: nonexistentKey');
  });
});

describe('URLConfig.getUrl — dist environment', () => {
  const config = createURLConfig({ environment: 'dist' });

  test('serves static data endpoints', () => {
    expect(config.getUrl('project')).toBe('/data/project.json');
    expect(config.getUrl('dashboardQuery', { name: 'overview' })).toBe(
      '/data/dashboards/overview.json'
    );
  });

  // `/api/project/` stopped carrying the dereferenced project ("resource lists
  // come from their own endpoints"), but dist was never given an equivalent for
  // the dashboards LIST — so `dashboardStore` threw "not available in 'dist'"
  // and every static build rendered "No dashboards found".
  test('serves the dashboards LIST, not just per-dashboard detail', () => {
    expect(config.isAvailable('dashboardsList')).toBe(true);
    expect(config.getUrl('dashboardsList')).toBe('/data/dashboards.json');
  });

  test('throws for endpoints that are null in dist', () => {
    expect(() => config.getUrl('commit')).toThrow(
      "URL key 'commit' is not available in 'dist' environment"
    );
  });

  test('every server endpoint is known to dist, so none can be forgotten', () => {
    // dist derives its keys from server rather than listing ~70 explicit
    // nulls. That makes a new server endpoint unavailable-by-default instead
    // of *unknown* in dist — the difference between "not available in 'dist'"
    // and a confusing "Unknown URL key", and one fewer list to keep in sync.
    const serverConfig = createURLConfig({ environment: 'server' });
    const serverKeys = ['projectRun', 'runLogs', 'expressionsTranslate', 'sourcesList'];
    for (const key of serverKeys) {
      expect(serverConfig.isAvailable(key)).toBe(true);
      expect(config.isAvailable(key)).toBe(false);
      expect(() => config.getUrl(key)).toThrow(`not available in 'dist' environment`);
    }
  });
});

describe('URLConfig — unknown environment', () => {
  test('getUrl throws for an unknown environment', () => {
    const config = new URLConfig({ environment: 'bogus' });
    expect(() => config.getUrl('project')).toThrow('Unknown environment: bogus');
  });

  test('isAvailable is falsy for an unknown environment', () => {
    const config = new URLConfig({ environment: 'bogus' });
    expect(config.isAvailable('project')).toBeFalsy();
  });
});

describe('URLConfig.isAvailable', () => {
  test('true for endpoints defined in the current environment', () => {
    const server = createURLConfig({ environment: 'server' });
    expect(server.isAvailable('commit')).toBe(true);
    expect(server.isAvailable('workspaceTelemetry')).toBe(true);
  });

  test('false for endpoints nulled out in dist', () => {
    const dist = createURLConfig({ environment: 'dist' });
    expect(dist.isAvailable('commit')).toBe(false);
    expect(dist.isAvailable('workspaceTelemetry')).toBe(false);
  });

  test('false for unknown keys', () => {
    const server = createURLConfig({ environment: 'server' });
    expect(server.isAvailable('definitelyNotAKey')).toBe(false);
  });
});

describe('URLConfig — host and deploymentRoot normalization', () => {
  test('prefixes URLs with the host, stripping its trailing slash', () => {
    const config = createURLConfig({
      environment: 'server',
      host: 'http://localhost:8000/',
      deploymentRoot: '',
    });
    expect(config.getUrl('project')).toBe('http://localhost:8000/api/project/');
  });

  test('normalizes deploymentRoot to a leading slash and no trailing slash', () => {
    const config = createURLConfig({ environment: 'server', deploymentRoot: 'embedded/' });
    expect(config.getUrl('project')).toBe('/embedded/api/project/');
    expect(config.getRoute()).toBe('/embedded');
  });

  test('keeps an already-normalized deploymentRoot as-is', () => {
    const config = createURLConfig({ environment: 'server', deploymentRoot: '/sub' });
    expect(config.getUrl('commit')).toBe('/sub/api/commit/');
    expect(config.getRoute()).toBe('/sub');
  });

  test('getRoute falls back to "/" with no deploymentRoot', () => {
    const config = createURLConfig({ environment: 'server' });
    expect(config.getRoute()).toBe('/');
  });

  test('combines host + deploymentRoot + pattern', () => {
    const config = createURLConfig({
      environment: 'dist',
      host: 'https://cdn.example.com',
      deploymentRoot: 'proj-1',
    });
    expect(config.getUrl('project')).toBe('https://cdn.example.com/proj-1/data/project.json');
  });
});

describe('createURLConfig factory', () => {
  afterEach(() => {
    delete window.deploymentRoot;
  });

  test('throws when environment is omitted', () => {
    expect(() => createURLConfig({})).toThrow('Environment is required when creating URLConfig');
    expect(() => createURLConfig()).toThrow('Environment is required when creating URLConfig');
  });

  test('falls back to window.deploymentRoot when no explicit deploymentRoot given', () => {
    window.deploymentRoot = 'from-window';
    const config = createURLConfig({ environment: 'server' });
    expect(config.getRoute()).toBe('/from-window');
    expect(config.getUrl('project')).toBe('/from-window/api/project/');
  });

  test('treats a falsy window.deploymentRoot as empty', () => {
    window.deploymentRoot = undefined;
    const config = createURLConfig({ environment: 'server' });
    expect(config.getRoute()).toBe('/');
  });

  test('explicit deploymentRoot option takes precedence over window.deploymentRoot', () => {
    window.deploymentRoot = 'from-window';
    const config = createURLConfig({ environment: 'server', deploymentRoot: '/explicit' });
    expect(config.getRoute()).toBe('/explicit');
  });

  test('explicit empty deploymentRoot overrides window.deploymentRoot', () => {
    window.deploymentRoot = 'from-window';
    const config = createURLConfig({ environment: 'server', deploymentRoot: '' });
    expect(config.getRoute()).toBe('/');
  });
});
