/**
 * workspaceUrl — the workspace tab ⇄ URL mapping.
 *
 * Pins both the default root mount (`/workspace`, Studio) and a host prefix
 * mount (`/:account/:stage/:project/workspace`, the cloud app) so tab
 * navigation stays inside whatever prefix the viewer is mounted under.
 */
import { WORKSPACE_BASE, workspaceTabUrl, workspaceTabFromUrl } from './workspaceUrl';

const params = search => new URLSearchParams(search);

describe('workspaceTabUrl (default root base)', () => {
  test('project / null tab → the base', () => {
    expect(workspaceTabUrl(null)).toBe(WORKSPACE_BASE);
    expect(workspaceTabUrl({ type: 'project', name: 'p' })).toBe(WORKSPACE_BASE);
  });

  test('object tab → ?edit=<type>:<name> (encoded)', () => {
    expect(workspaceTabUrl({ type: 'chart', name: 'revenue' })).toBe(
      '/workspace?edit=chart%3Arevenue'
    );
  });

  test('dashboard and semantic-layer keep their dedicated paths', () => {
    expect(workspaceTabUrl({ type: 'dashboard', name: 'sales' })).toBe(
      '/workspace/dashboard/sales'
    );
    expect(workspaceTabUrl({ type: 'semantic-layer', name: 'semantic-layer' })).toBe(
      '/workspace/semantic-layer'
    );
  });
});

describe('workspaceTabUrl (host prefix base)', () => {
  const base = '/acme/main/proj/workspace';

  test('every tab kind is prefixed with the mount base', () => {
    expect(workspaceTabUrl({ type: 'project', name: 'p' }, base)).toBe(base);
    expect(workspaceTabUrl({ type: 'chart', name: 'revenue' }, base)).toBe(
      `${base}?edit=chart%3Arevenue`
    );
    expect(workspaceTabUrl({ type: 'dashboard', name: 'sales' }, base)).toBe(
      `${base}/dashboard/sales`
    );
    expect(workspaceTabUrl({ type: 'semantic-layer', name: 'semantic-layer' }, base)).toBe(
      `${base}/semantic-layer`
    );
  });
});

describe('workspaceTabFromUrl', () => {
  test('parses ?edit, dashboard, and semantic-layer at the root base', () => {
    expect(workspaceTabFromUrl('/workspace', params('?edit=chart:revenue'))).toEqual({
      type: 'chart',
      name: 'revenue',
    });
    expect(workspaceTabFromUrl('/workspace/dashboard/sales', params(''))).toEqual({
      type: 'dashboard',
      name: 'sales',
    });
    expect(workspaceTabFromUrl('/workspace/semantic-layer', params(''))).toEqual({
      type: 'semantic-layer',
      name: 'semantic-layer',
    });
    expect(workspaceTabFromUrl('/workspace', params(''))).toBeNull();
  });

  test('parses the same shapes under a host prefix base', () => {
    const base = '/acme/main/proj/workspace';
    expect(workspaceTabFromUrl(base, params('?edit=chart:revenue'), base)).toEqual({
      type: 'chart',
      name: 'revenue',
    });
    expect(workspaceTabFromUrl(`${base}/dashboard/sales`, params(''), base)).toEqual({
      type: 'dashboard',
      name: 'sales',
    });
    expect(workspaceTabFromUrl(`${base}/semantic-layer`, params(''), base)).toEqual({
      type: 'semantic-layer',
      name: 'semantic-layer',
    });
    // A bare dashboard path WITHOUT the prefix must not match under a prefixed base.
    expect(workspaceTabFromUrl('/workspace/dashboard/sales', params(''), base)).toBeNull();
  });

  test('round-trips object tabs through a prefixed base', () => {
    const base = '/acme/main/proj/workspace';
    const tab = { type: 'insight', name: 'weekly:active' };
    const url = workspaceTabUrl(tab, base);
    const [pathname, search] = url.split('?');
    expect(workspaceTabFromUrl(pathname, params(search ? `?${search}` : ''), base)).toEqual(tab);
  });
});
